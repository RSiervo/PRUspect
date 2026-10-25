"""Generate in-app reminder notifications from pending follow-ups.

Runs when the notification list is fetched (the frontend polls every minute)
and can also be run on a schedule with `manage.py generate_reminders`.
No email or SMS is sent.
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.activities.models import FollowUp, FollowUpStatus
from apps.common.timeutils import day_range, local_today, user_tz

from .models import Notification, NotificationKind


def _create(**kwargs) -> bool:
    try:
        with transaction.atomic():
            Notification.objects.create(**kwargs)
        return True
    except IntegrityError:  # already exists (unique per follow-up + kind)
        return False


def generate_for_user(user) -> int:
    now = timezone.now()
    tz = user_tz(user)
    today_start, _ = day_range(local_today(user), tz)
    created = 0
    pending = FollowUp.objects.filter(
        owner=user, status=FollowUpStatus.PENDING, prospect__is_archived=False
    ).select_related("prospect")

    # Reminders: within the lead time window, not yet more than a day late.
    for follow_up in pending.filter(reminder_minutes__isnull=False, scheduled_at__gte=now - timedelta(days=1),
                                    scheduled_at__lte=now + timedelta(days=7)):
        if follow_up.scheduled_at - timedelta(minutes=follow_up.reminder_minutes) > now:
            continue
        when = follow_up.scheduled_at.astimezone(tz).strftime("%b %d, %I:%M %p")
        created += _create(
            user=user, kind=NotificationKind.REMINDER, follow_up=follow_up,
            title=f"Upcoming: {follow_up.subject}",
            body=f"{follow_up.get_activity_type_display()} with {follow_up.prospect.full_name} · {when}",
            link=f"/prospects/{follow_up.prospect_id}?tab=follow-ups",
        )

    # Overdue: scheduled before today and still pending.
    for follow_up in pending.filter(scheduled_at__lt=today_start).exclude(
        notifications__kind=NotificationKind.OVERDUE
    )[:50]:
        created += _create(
            user=user, kind=NotificationKind.OVERDUE, follow_up=follow_up,
            title=f"Overdue: {follow_up.subject}",
            body=f"{follow_up.get_activity_type_display()} with {follow_up.prospect.full_name} is past due.",
            link="/follow-ups?bucket=overdue",
        )

    from apps.opportunities.clients import generate_client_notifications

    created += generate_client_notifications(user)
    return created
