"""Sign in / sign up with Google.

The browser gets an ID token (a JWT signed by Google) from Google Identity
Services and posts it here. We verify it server-side — signature against
Google's public keys, issuer, audience (our client id) and expiry — and only
trust verified email addresses. We never see the user's Google password.

Matching order:
1. A user already linked to this Google account (`google_sub`).
2. An existing user with the same verified email: link it (one account per person).
3. Otherwise create a new, empty account (if sign-up is enabled and allowed).
"""

from dataclasses import dataclass

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from apps.audit.models import AuditAction
from apps.audit.services import record

from .models import User

GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleNotConfigured(Exception):
    pass


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    first_name: str
    last_name: str


def verify_credential(credential: str) -> GoogleIdentity:
    """Verify a Google ID token and return the identity it asserts."""
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleNotConfigured()
    # Imported lazily so the rest of the app doesn't depend on google-auth at import time.
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID, clock_skew_in_seconds=10
        )
    except ValueError as exc:  # bad signature, wrong audience, expired, malformed
        raise AuthenticationFailed("Google sign-in could not be verified. Please try again.") from exc

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise AuthenticationFailed("Google sign-in could not be verified. Please try again.")
    email = (claims.get("email") or "").strip().lower()
    if not email or claims.get("email_verified") is not True:
        raise AuthenticationFailed("Your Google account email isn't verified.")
    return GoogleIdentity(
        sub=str(claims["sub"]),
        email=email,
        first_name=(claims.get("given_name") or "")[:80],
        last_name=(claims.get("family_name") or "")[:80],
    )


def _domain_allowed(email: str) -> bool:
    allowed = settings.GOOGLE_ALLOWED_DOMAINS
    return not allowed or email.rsplit("@", 1)[-1] in allowed


@transaction.atomic
def sign_in_with_google(identity: GoogleIdentity) -> tuple[User, bool]:
    """Return (user, created). Raises PermissionDenied when sign-in isn't allowed."""
    user = User.objects.select_for_update().filter(google_sub=identity.sub).first()
    if user is None:
        user = User.objects.select_for_update().filter(email__iexact=identity.email).first()
        if user is not None:
            if user.google_sub and user.google_sub != identity.sub:
                raise PermissionDenied("This email is already linked to a different Google account.")
            user.google_sub = identity.sub
            user.save(update_fields=["google_sub"])
            record(user=user, action=AuditAction.GOOGLE_LINKED, entity=user,
                   summary="Linked a Google account for sign-in")

    if user is not None:
        if not user.is_active:
            raise PermissionDenied("This account is disabled. Contact the administrator.")
        return user, False

    if not settings.GOOGLE_SIGNUP_ENABLED:
        raise PermissionDenied("New sign-ups are closed. Ask the administrator for an account.")
    if not _domain_allowed(identity.email):
        raise PermissionDenied("Sign-up isn't available for this email domain.")

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                email=identity.email,
                password=None,  # Google-only account: no usable password until the user sets one
                first_name=identity.first_name,
                last_name=identity.last_name,
                google_sub=identity.sub,
            )
    except IntegrityError:
        # Two simultaneous first sign-ins: the other request created the account.
        return User.objects.get(google_sub=identity.sub), False
    record(user=user, action=AuditAction.SIGNED_UP_GOOGLE, entity=user, summary="Created an account with Google")
    return user, True
