"""iCalendar (RFC 5545) feed of a user's follow-ups for calendar apps.

Accessed via a secret, revocable token URL (no login), so Google/Apple/Outlook
can poll it. Only follow-ups are included; cancelled ones are marked CANCELLED
so calendars remove them.
"""

from datetime import timedelta, timezone as dt_timezone

from django.utils import timezone

from .models import FollowUp, FollowUpStatus

PAST_DAYS = 30
FUTURE_DAYS = 180


def _escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def _fold(line: str) -> str:
    """Fold content lines longer than 75 octets (RFC 5545 §3.1)."""
    data = line.encode("utf-8")
    if len(data) <= 75:
        return line
    parts, current = [], b""
    for char in line:
        encoded = char.encode("utf-8")
        if len(current) + len(encoded) > (75 if not parts else 74):
            parts.append(current.decode("utf-8"))
            current = b""
        current += encoded
    parts.append(current.decode("utf-8"))
    return "\r\n ".join(parts)


def _stamp(value) -> str:
    return value.astimezone(dt_timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_feed(user, base_url: str, show_names: bool = True) -> str:
    now = timezone.now()
    follow_ups = (
        FollowUp.objects.filter(
            owner=user,
            prospect__is_archived=False,
            scheduled_at__gte=now - timedelta(days=PAST_DAYS),
            scheduled_at__lte=now + timedelta(days=FUTURE_DAYS),
        )
        .select_related("prospect")
        .order_by("scheduled_at")
    )
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PRUspect//Prospect Management//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:PRUspect",
        "X-WR-CALDESC:Follow-ups and appointments from PRUspect",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for f in follow_ups:
        who = f.prospect.full_name if show_names else "a prospect"
        summary = f"{f.subject} — {who}" if show_names else f"{f.get_activity_type_display()} (PRUspect)"
        if f.status == FollowUpStatus.COMPLETED:
            summary = f"✓ {summary}"
        link = f"{base_url}/prospects/{f.prospect_id}"
        description = f"{f.get_activity_type_display()} with {who}." + (f"\n{f.description}" if show_names and f.description else "")
        lines += [
            "BEGIN:VEVENT",
            f"UID:followup-{f.id}@pruspect",
            f"DTSTAMP:{_stamp(f.updated_at)}",
            f"LAST-MODIFIED:{_stamp(f.updated_at)}",
            f"DTSTART:{_stamp(f.scheduled_at)}",
            f"DTEND:{_stamp(f.scheduled_at + timedelta(minutes=f.duration_minutes))}",
            f"SUMMARY:{_escape(summary)}",
            f"DESCRIPTION:{_escape(description + chr(10) + link)}",
            f"URL:{link}",
            f"STATUS:{'CANCELLED' if f.status == FollowUpStatus.CANCELED else 'CONFIRMED'}",
            "TRANSP:OPAQUE",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
