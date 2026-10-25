"""Follow-up workflow: schedule, complete, cancel, reschedule, log activity."""

from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditAction
from apps.audit.services import diff, record
from apps.common.exceptions import Conflict
from apps.prospects.models import Prospect

from .models import CONTACT_TYPES, Activity, ActivityType, FollowUp, FollowUpReschedule, FollowUpStatus

EDITABLE_FIELDS = ["activity_type", "subject", "description", "priority", "duration_minutes", "reminder_minutes"]


def _touch_last_contact(prospect: Prospect, when) -> None:
    """Move last_contacted_at forward only (logging an old call never moves it back)."""
    if prospect.last_contacted_at is None or when > prospect.last_contacted_at:
        prospect.last_contacted_at = when
        prospect.save(update_fields=["last_contacted_at", "updated_at"])


def _require_pending(follow_up: FollowUp) -> None:
    if follow_up.status != FollowUpStatus.PENDING:
        raise Conflict(f"This follow-up is already {follow_up.get_status_display().lower()}.")


@transaction.atomic
def create_follow_up(*, user, prospect: Prospect, data: dict) -> FollowUp:
    if prospect.owner_id != user.pk:
        raise PermissionError("Prospect does not belong to user")
    if "reminder_minutes" not in data:
        data["reminder_minutes"] = getattr(getattr(user, "settings", None), "default_reminder_minutes", None)
    follow_up = FollowUp.objects.create(owner=user, prospect=prospect, **data)
    record(
        user=user,
        action=AuditAction.FOLLOWUP_CREATED,
        entity=follow_up,
        prospect=prospect,
        summary=f"Scheduled {follow_up.get_activity_type_display().lower()} with {prospect.full_name}",
        changes={"scheduled_at": [None, follow_up.scheduled_at.isoformat()]},
    )
    return follow_up


@transaction.atomic
def update_follow_up(*, user, follow_up: FollowUp, data: dict) -> FollowUp:
    _require_pending(follow_up)
    data = {k: v for k, v in data.items() if k in EDITABLE_FIELDS}
    before = {field: getattr(follow_up, field) for field in data}
    for field, value in data.items():
        setattr(follow_up, field, value)
    follow_up.save()
    changes = diff(before, data)
    if changes:
        record(user=user, action=AuditAction.FOLLOWUP_UPDATED, entity=follow_up, prospect=follow_up.prospect,
               summary=f"Updated follow-up “{follow_up.subject}”", changes=changes)
    return follow_up


@transaction.atomic
def complete_follow_up(*, user, follow_up: FollowUp, outcome: str = "", next_action: str = "",
                       completed_at=None, next_follow_up: dict | None = None) -> tuple[FollowUp, FollowUp | None]:
    follow_up = FollowUp.objects.select_for_update().select_related("prospect").get(pk=follow_up.pk)
    _require_pending(follow_up)
    when = completed_at or timezone.now()
    follow_up.status = FollowUpStatus.COMPLETED
    follow_up.completed_at = when
    follow_up.outcome = outcome
    follow_up.next_action = next_action
    follow_up.save()

    counts = follow_up.activity_type in CONTACT_TYPES
    Activity.objects.create(
        owner=user,
        prospect=follow_up.prospect,
        activity_type=follow_up.activity_type,
        subject=follow_up.subject,
        description=follow_up.description,
        outcome=outcome,
        occurred_at=when,
        follow_up=follow_up,
        counts_as_contact=counts,
    )
    if counts:
        _touch_last_contact(follow_up.prospect, when)
    # Any unread reminder for this item is no longer relevant.
    follow_up.notifications.filter(read_at__isnull=True).update(read_at=timezone.now())
    record(user=user, action=AuditAction.FOLLOWUP_COMPLETED, entity=follow_up, prospect=follow_up.prospect,
           summary=f"Completed “{follow_up.subject}” with {follow_up.prospect.full_name}")

    created = None
    if next_follow_up:
        created = create_follow_up(user=user, prospect=follow_up.prospect, data=next_follow_up)
    return follow_up, created


@transaction.atomic
def cancel_follow_up(*, user, follow_up: FollowUp, reason: str = "") -> FollowUp:
    follow_up = FollowUp.objects.select_for_update().select_related("prospect").get(pk=follow_up.pk)
    _require_pending(follow_up)
    follow_up.status = FollowUpStatus.CANCELED
    follow_up.canceled_at = timezone.now()
    follow_up.cancel_reason = reason[:255]
    follow_up.save()
    follow_up.notifications.filter(read_at__isnull=True).update(read_at=timezone.now())
    record(user=user, action=AuditAction.FOLLOWUP_CANCELED, entity=follow_up, prospect=follow_up.prospect,
           summary=f"Canceled “{follow_up.subject}”", changes={"reason": reason} if reason else {})
    return follow_up


@transaction.atomic
def reschedule_follow_up(*, user, follow_up: FollowUp, new_scheduled_at, reason: str = "") -> FollowUp:
    """Move the same follow-up to a new time. No new calendar entry is created."""
    follow_up = FollowUp.objects.select_for_update().select_related("prospect").get(pk=follow_up.pk)
    _require_pending(follow_up)
    previous = follow_up.scheduled_at
    if previous == new_scheduled_at:
        return follow_up
    FollowUpReschedule.objects.create(
        follow_up=follow_up,
        previous_scheduled_at=previous,
        new_scheduled_at=new_scheduled_at,
        reason=reason[:255],
        rescheduled_by=user,
    )
    follow_up.scheduled_at = new_scheduled_at
    follow_up.save(update_fields=["scheduled_at", "updated_at"])
    # Let reminders fire again for the new time.
    follow_up.notifications.all().delete()
    record(
        user=user,
        action=AuditAction.FOLLOWUP_RESCHEDULED,
        entity=follow_up,
        prospect=follow_up.prospect,
        summary=f"Rescheduled “{follow_up.subject}”",
        changes={"scheduled_at": [previous.isoformat(), new_scheduled_at.isoformat()],
                 **({"reason": reason} if reason else {})},
    )
    return follow_up


@transaction.atomic
def log_activity(*, user, prospect: Prospect, data: dict) -> Activity:
    if prospect.owner_id != user.pk:
        raise PermissionError("Prospect does not belong to user")
    activity_type = data.get("activity_type", ActivityType.OTHER)
    counts = activity_type in CONTACT_TYPES
    activity = Activity.objects.create(owner=user, prospect=prospect, counts_as_contact=counts, **data)
    if counts:
        _touch_last_contact(prospect, activity.occurred_at)
    record(user=user, action=AuditAction.ACTIVITY_LOGGED, entity=activity, prospect=prospect,
           summary=f"Logged {activity.get_activity_type_display().lower()} with {prospect.full_name}")
    return activity
