"""Web Push delivery (works with the installed app / service worker).

Requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in the
environment. Without them, push is simply disabled; in-app notifications
still work.
"""

import json
import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def push_enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def send_to_user(user, title: str, body: str = "", url: str = "/", tag: str | None = None) -> int:
    """Send a push to every device the user subscribed. Returns successful deliveries."""
    if not push_enabled():
        return 0
    from pywebpush import WebPushException, webpush

    from .models import PushSubscription

    payload = json.dumps({"title": title, "body": body, "url": url or "/", "tag": tag})
    delivered = 0
    for sub in PushSubscription.objects.filter(user=user):
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
                ttl=6 * 3600,
                timeout=8,
            )
            delivered += 1
            PushSubscription.objects.filter(pk=sub.pk).update(last_used_at=timezone.now(), failures=0)
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):  # unsubscribed / expired on the device
                sub.delete()
            else:
                PushSubscription.objects.filter(pk=sub.pk).update(failures=sub.failures + 1)
                logger.warning("Push failed (%s) for subscription %s", status, sub.pk)
        except Exception:  # network errors must never break the request that created the notification
            logger.exception("Push delivery error for subscription %s", sub.pk)
    return delivered
