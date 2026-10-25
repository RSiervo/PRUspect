"""Two-step verification with an authenticator app (TOTP, RFC 6238).

- Works with Google Authenticator, Microsoft Authenticator, 1Password, etc.
- Codes can't be reused: the last accepted 30-second step is stored.
- 10 single-use recovery codes are shown once; only their SHA-256 hashes are kept.
- Sign-in with 2FA is two steps: password/Google first returns a short-lived
  signed challenge (5 minutes), then /auth/2fa/verify/ exchanges challenge + code
  for the session.
"""

import hashlib
import hmac
import re
import secrets
import time

import pyotp
import segno
from django.conf import settings
from django.core import signing
from django.utils import timezone

ISSUER = "PRUspect"
CHALLENGE_SALT = "pruspect.two-factor-challenge"
CHALLENGE_MAX_AGE = 300
RECOVERY_CODE_COUNT = 10


def is_required(user) -> bool:
    return bool(user.is_staff and settings.ADMIN_REQUIRE_2FA)


def start_setup(user) -> dict:
    """Create a new (not yet active) secret and return what the authenticator app needs."""
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_enabled_at = None
    user.save(update_fields=["totp_secret", "totp_enabled_at"])
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=ISSUER)
    qr = segno.make(uri, error="m").svg_data_uri(scale=5, border=2, dark="#111827")
    return {"secret": secret, "otpauth_uri": uri, "qr_svg": qr}


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _normalize(code: str) -> str:
    return re.sub(r"[\s-]", "", str(code or "")).lower()


def new_recovery_codes(user) -> list[str]:
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    codes = ["".join(secrets.choice(alphabet) for _ in range(10)) for _ in range(RECOVERY_CODE_COUNT)]
    user.recovery_codes = [_hash(c) for c in codes]
    user.save(update_fields=["recovery_codes"])
    return [f"{c[:5]}-{c[5:]}" for c in codes]


def _check_totp(user, code: str) -> bool:
    if not user.totp_secret or not re.fullmatch(r"\d{6}", code):
        return False
    totp = pyotp.TOTP(user.totp_secret)
    now_step = int(time.time()) // totp.interval
    for step in (now_step, now_step - 1, now_step + 1):  # allow ±30 s clock drift
        if step > user.totp_last_step and hmac.compare_digest(totp.generate_otp(step), code):
            user.totp_last_step = step
            user.save(update_fields=["totp_last_step"])
            return True
    return False


def _check_recovery(user, code: str) -> bool:
    if len(code) != 10:
        return False
    hashed = _hash(code)
    remaining = [h for h in (user.recovery_codes or []) if not hmac.compare_digest(h, hashed)]
    if len(remaining) == len(user.recovery_codes or []):
        return False
    user.recovery_codes = remaining
    user.save(update_fields=["recovery_codes"])
    return True


def verify(user, code: str, allow_recovery: bool = True) -> bool:
    code = _normalize(code)
    return _check_totp(user, code) or (allow_recovery and _check_recovery(user, code))


def confirm_setup(user, code: str) -> list[str] | None:
    """Activate 2FA if the code from the app is right. Returns the recovery codes."""
    if user.totp_enabled_at or not verify(user, code, allow_recovery=False):
        return None
    user.totp_enabled_at = timezone.now()
    user.save(update_fields=["totp_enabled_at"])
    return new_recovery_codes(user)


def disable(user) -> None:
    user.totp_secret = ""
    user.totp_enabled_at = None
    user.totp_last_step = 0
    user.recovery_codes = []
    user.save(update_fields=["totp_secret", "totp_enabled_at", "totp_last_step", "recovery_codes"])


def make_challenge(user) -> str:
    # Bound to the current secret, so resetting 2FA invalidates pending challenges.
    return signing.dumps({"uid": user.pk, "s": _hash(user.totp_secret)[:12]}, salt=CHALLENGE_SALT, compress=True)


def read_challenge(token: str):
    from .models import User

    try:
        data = signing.loads(str(token or ""), salt=CHALLENGE_SALT, max_age=CHALLENGE_MAX_AGE)
    except signing.BadSignature:  # includes SignatureExpired
        return None
    user = User.objects.filter(pk=data.get("uid"), is_active=True).first()
    if user is None or not user.two_factor_enabled or _hash(user.totp_secret)[:12] != data.get("s"):
        return None
    return user
