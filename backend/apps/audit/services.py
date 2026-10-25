from decimal import Decimal
from datetime import date, datetime

from .models import AuditLog

# Fields that must never be written into the audit trail.
_REDACTED_FIELDS = {"password", "token", "access", "refresh"}


def _jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "pk"):
        return value.pk
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    return value


def diff(before: dict, after: dict) -> dict:
    """Return {field: [old, new]} for fields whose value changed."""
    changes = {}
    for key, new in after.items():
        if key in _REDACTED_FIELDS:
            continue
        old = before.get(key)
        if _jsonable(old) != _jsonable(new):
            changes[key] = [_jsonable(old), _jsonable(new)]
    return changes


def record(*, user, action, entity, summary, prospect=None, changes=None) -> AuditLog:
    return AuditLog.objects.create(
        user=user,
        action=action,
        entity_type=entity.__class__.__name__ if entity is not None else "",
        entity_id=getattr(entity, "pk", None),
        prospect=prospect,
        summary=summary[:255],
        changes={k: v for k, v in (changes or {}).items() if k not in _REDACTED_FIELDS},
    )
