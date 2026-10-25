import hashlib
import logging
import os
import re
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import ErrorEvent, ErrorSource

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
DIGITS_RE = re.compile(r"\+?\d[\d \-]{6,}\d")
ID_RE = re.compile(r"/\d+(?=/|$)")
HEX_RE = re.compile(r"\b[0-9a-f]{16,}\b", re.I)
MAX_ALERTS_PER_HOUR = 10


def scrub(text: str, limit: int) -> str:
    """Mask personal details that can end up inside error messages."""
    text = EMAIL_RE.sub("[email]", str(text or ""))
    text = DIGITS_RE.sub("[number]", text)
    return text[:limit]


def normalize_location(location: str) -> str:
    path = str(location or "").split("?")[0].split("#")[0]
    return ID_RE.sub("/:id", path)[:255]


def _fingerprint(source: str, error_type: str, message: str, location: str, stack: str) -> str:
    # Group by type + where it happened + the failing code line, ignoring ids and numbers.
    lines = [line.strip() for line in stack.splitlines()]
    if source == ErrorSource.SERVER:
        frames = [line for line in lines if line.startswith("File ")]
        top = frames[-1] if frames else ""  # Python: innermost frame is last
    else:
        top = next((line for line in lines if line.startswith("at ") or "@" in line), "")  # JS: first frame
    parts = [source, error_type, HEX_RE.sub("x", re.sub(r"\d+", "0", message))[:200], location, re.sub(r":\d+", "", top)[:200]]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def capture(*, source: str, error_type: str, message: str, location: str = "", stack: str = "", user=None) -> ErrorEvent | None:
    """Record an error. Never raises: error tracking must not cause new errors."""
    try:
        error_type = scrub(error_type, 120)
        message = scrub(message, 500) or "(no message)"
        location = normalize_location(location)
        stack = scrub(stack, 8000)
        fingerprint = _fingerprint(source, error_type, message, location, stack)
        user = user if getattr(user, "is_authenticated", False) else None
        now = timezone.now()
        with transaction.atomic():
            event, created = ErrorEvent.objects.select_for_update().get_or_create(
                fingerprint=fingerprint,
                defaults={"source": source, "error_type": error_type, "message": message, "location": location,
                          "stack": stack, "release": os.environ.get("VERCEL_GIT_COMMIT_SHA", "")[:12],
                          "last_seen": now, "last_user": user, "users_affected": 1 if user else 0},
            )
            reopened = False
            if not created:
                reopened = event.resolved_at is not None
                updates = {"count": F("count") + 1, "last_seen": now, "resolved_at": None, "stack": stack or event.stack}
                if user and event.last_user_id != user.pk:
                    updates.update(last_user=user, users_affected=F("users_affected") + 1)
                ErrorEvent.objects.filter(pk=event.pk).update(**updates)
                event.refresh_from_db()
        if created or reopened:
            alert_admins(event, reopened=reopened)
        return event
    except Exception:  # pragma: no cover - last-resort safety
        logger.exception("Could not record error event")
        return None


def email_enabled() -> bool:
    return bool(settings.EMAIL_HOST and settings.ERROR_ALERT_EMAIL_ENABLED)


def _storm(since) -> bool:
    return ErrorEvent.objects.filter(first_seen__gte=since).count() > MAX_ALERTS_PER_HOUR


def email_alert(event: ErrorEvent, title: str, recipients: list[str]) -> int:
    """Email the alert. Only the scrubbed message and place are included, never the stack trace."""
    if not email_enabled():
        return 0
    from django.core.mail import EmailMessage, get_connection

    where = "Server" if event.source == ErrorSource.SERVER else "Browser"
    link = f"{settings.SITE_URL}/admin/system?error={event.pk}" if settings.SITE_URL else f"/admin/system?error={event.pk}"
    body = (
        f"{title}\n\n"
        f"Where: {where} · {event.location or 'unknown'}\n"
        f"Message: {event.message}\n"
        f"Seen: {event.count} time(s), {event.users_affected} user(s)\n"
        f"First seen: {timezone.localtime(event.first_seen):%Y-%m-%d %H:%M} ({settings.TIME_ZONE})\n\n"
        f"Details and stack trace (admins only): {link}\n\n"
        "You get this email because you are a PRUspect admin. At most 10 alerts per hour are sent.\n"
    )
    unique = list(dict.fromkeys(r for r in recipients if r))
    try:
        connection = get_connection(fail_silently=False)
        messages = [EmailMessage(subject=f"[PRUspect] {title}"[:200], body=body, to=[r], connection=connection) for r in unique]
        return connection.send_messages(messages) or 0
    except Exception:
        logger.exception("Could not email error alert %s", event.pk)
        return 0


def alert_admins(event: ErrorEvent, reopened: bool = False) -> int:
    """In-app notification (and phone push, if enabled) to every active admin."""
    from apps.notifications.models import Notification, NotificationKind

    try:
        since = timezone.now() - timedelta(hours=1)
        where = "Server" if event.source == ErrorSource.SERVER else "Browser"
        title = f"{'Error is back' if reopened else 'New error'}: {event.error_type or where + ' error'}"[:160]
        body = f"{where} · {event.location or 'unknown place'} · {event.message}"[:255]
        sent = 0
        recipients = []
        for admin in get_user_model().objects.filter(is_active=True, is_staff=True):
            recent = Notification.objects.filter(user=admin, kind=NotificationKind.SYSTEM, link__startswith="/admin/system", created_at__gte=since)
            if recent.count() >= MAX_ALERTS_PER_HOUR:
                continue  # an error storm: this admin already knows something is wrong
            Notification.objects.create(user=admin, kind=NotificationKind.SYSTEM, title=title, body=body, link=f"/admin/system?error={event.pk}")
            recipients.append(admin.email)
            sent += 1
        if recipients or (settings.ERROR_ALERT_EMAILS and not _storm(since)):
            email_alert(event, title, recipients + settings.ERROR_ALERT_EMAILS)
        return sent
    except Exception:  # pragma: no cover
        logger.exception("Could not alert admins about error %s", event.pk)
        return 0
