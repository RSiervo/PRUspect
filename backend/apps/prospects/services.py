"""Prospect business logic. Views call these; they own transactions and audit records."""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.models import AuditAction
from apps.audit.services import diff, record
from apps.common.normalize import normalize_email, normalize_phone

from .models import Prospect, ProspectNote, ProspectNoteRevision, ProspectStatusHistory
from .statuses import (
    APPLICATION_SUBMITTED_STATUSES,
    CLOSED_LOST_STATUSES,
    QUALIFIED_STATUSES,
    WON_STATUSES,
    ProspectStatus,
)

# Fields tracked in the change history for edits.
TRACKED_FIELDS = [
    "first_name", "last_name", "preferred_name", "mobile", "email", "birth_date", "occupation",
    "company", "location", "source", "referral_name", "existing_coverage", "budget_range",
    "priority", "notes", "consent_obtained", "consent_date", "consent_source",
    "preferred_contact_method", "do_not_contact", "referred_by",
]


def _stamp_milestones(prospect: Prospect, status: str, when) -> list[str]:
    """Set first-reached milestone timestamps. Returns the fields changed."""
    changed = []
    if status in QUALIFIED_STATUSES and prospect.qualified_at is None:
        prospect.qualified_at = when
        changed.append("qualified_at")
    if status in APPLICATION_SUBMITTED_STATUSES and prospect.application_submitted_at is None:
        prospect.application_submitted_at = when
        changed.append("application_submitted_at")
    if status in WON_STATUSES and prospect.policy_issued_at is None:
        prospect.policy_issued_at = when
        changed.append("policy_issued_at")
    return changed


def _snapshot(prospect: Prospect) -> dict:
    data = {field: getattr(prospect, field) for field in TRACKED_FIELDS}
    data["source"] = prospect.source_id
    data["referred_by"] = prospect.referred_by_id
    return data


@transaction.atomic
def create_prospect(*, user, data: dict, interests=None) -> Prospect:
    now = timezone.now()
    status = data.get("status") or ProspectStatus.NEW_LEAD
    prospect = Prospect(owner=user, **{**data, "status": status})
    prospect.status_changed_at = now
    _stamp_milestones(prospect, status, now)
    prospect.save()
    if interests is not None:
        prospect.insurance_interests.set(interests)
    ProspectStatusHistory.objects.create(prospect=prospect, from_status="", to_status=status, changed_by=user)
    record(
        user=user,
        action=AuditAction.PROSPECT_CREATED,
        entity=prospect,
        prospect=prospect,
        summary=f"Added prospect {prospect.full_name}",
    )
    return prospect


@transaction.atomic
def update_prospect(*, user, prospect: Prospect, data: dict, interests=None) -> Prospect:
    data = {key: value for key, value in data.items() if key != "status"}  # status has its own flow
    before = _snapshot(prospect)
    before_interests = sorted(prospect.insurance_interests.values_list("id", flat=True))
    for field, value in data.items():
        setattr(prospect, field, value)
    prospect.save()
    changes = diff(before, _snapshot(prospect))
    if interests is not None:
        new_ids = sorted(i.pk for i in interests)
        if new_ids != before_interests:
            prospect.insurance_interests.set(interests)
            changes["insurance_interests"] = [before_interests, new_ids]
    if changes:
        record(
            user=user,
            action=AuditAction.PROSPECT_UPDATED,
            entity=prospect,
            prospect=prospect,
            summary=f"Updated {', '.join(sorted(changes))} for {prospect.full_name}",
            changes=changes,
        )
    return prospect


@transaction.atomic
def change_status(*, user, prospect: Prospect, new_status: str, reason: str = "") -> ProspectStatusHistory:
    prospect = Prospect.objects.select_for_update().get(pk=prospect.pk)
    if new_status not in ProspectStatus.values:
        raise ValidationError({"status": ["Unknown status."]})
    old_status = prospect.status
    if new_status == old_status:
        raise ValidationError({"status": ["The prospect is already in this status."]})

    now = timezone.now()
    is_reopen = old_status in CLOSED_LOST_STATUSES and new_status not in CLOSED_LOST_STATUSES
    prospect.status = new_status
    prospect.status_changed_at = now
    changed = _stamp_milestones(prospect, new_status, now)
    prospect.save(update_fields=["status", "status_changed_at", "updated_at", *changed])

    entry = ProspectStatusHistory.objects.create(
        prospect=prospect,
        from_status=old_status,
        to_status=new_status,
        reason=(reason or "")[:500],
        is_reopen=is_reopen,
        changed_by=user,
    )
    old_label = ProspectStatus(old_status).label
    new_label = ProspectStatus(new_status).label
    verb = "Reopened" if is_reopen else "Moved"
    record(
        user=user,
        action=AuditAction.PROSPECT_STATUS_CHANGED,
        entity=prospect,
        prospect=prospect,
        summary=f"{verb} {prospect.full_name}: {old_label} → {new_label}",
        changes={"status": [old_status, new_status], **({"reason": reason} if reason else {})},
    )
    return entry


@transaction.atomic
def archive_prospect(*, user, prospect: Prospect) -> Prospect:
    if prospect.is_archived:
        return prospect
    prospect.is_archived = True
    prospect.archived_at = timezone.now()
    prospect.save(update_fields=["is_archived", "archived_at", "updated_at"])
    record(user=user, action=AuditAction.PROSPECT_ARCHIVED, entity=prospect, prospect=prospect,
           summary=f"Archived {prospect.full_name}")
    return prospect


@transaction.atomic
def restore_prospect(*, user, prospect: Prospect) -> Prospect:
    if not prospect.is_archived:
        return prospect
    prospect.is_archived = False
    prospect.archived_at = None
    prospect.save(update_fields=["is_archived", "archived_at", "updated_at"])
    record(user=user, action=AuditAction.PROSPECT_RESTORED, entity=prospect, prospect=prospect,
           summary=f"Restored {prospect.full_name}")
    return prospect


@transaction.atomic
def delete_prospect(*, user, prospect: Prospect) -> None:
    """Permanent deletion (e.g. a data-subject erasure request). Only archived records.

    The audit entry keeps no personal data: just the record id.
    """
    if not prospect.is_archived:
        raise ValidationError({"detail": ["Archive the prospect before deleting it permanently."]})
    prospect_id = prospect.pk
    prospect.delete()
    record(user=user, action=AuditAction.PROSPECT_DELETED, entity=None,
           summary=f"Permanently deleted prospect #{prospect_id}", changes={"prospect_id": prospect_id})


def find_duplicates(*, user, mobile: str = "", email: str = "", exclude_id=None):
    phone = normalize_phone(mobile)
    mail = normalize_email(email)
    if not phone and not mail:
        return Prospect.objects.none()
    condition = Q()
    if phone:
        condition |= Q(mobile_normalized=phone)
    if mail:
        condition |= Q(email_normalized=mail)
    queryset = Prospect.objects.filter(owner=user).filter(condition)
    if exclude_id:
        queryset = queryset.exclude(pk=exclude_id)
    return queryset.order_by("-created_at")[:10]


@transaction.atomic
def add_note(*, user, prospect: Prospect, body: str) -> ProspectNote:
    note = ProspectNote.objects.create(prospect=prospect, author=user, body=body)
    record(user=user, action=AuditAction.NOTE_ADDED, entity=note, prospect=prospect,
           summary=f"Added a note to {prospect.full_name}")
    return note


@transaction.atomic
def edit_note(*, user, note: ProspectNote, body: str) -> ProspectNote:
    if body == note.body:
        return note
    ProspectNoteRevision.objects.create(note=note, previous_body=note.body, edited_by=user)
    note.body = body
    note.is_edited = True
    note.save(update_fields=["body", "is_edited", "updated_at"])
    record(user=user, action=AuditAction.NOTE_EDITED, entity=note, prospect=note.prospect,
           summary=f"Edited a note on {note.prospect.full_name}")
    return note
