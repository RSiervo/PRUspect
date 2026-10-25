"""Clients = prospects with an issued policy (status Won or an issued opportunity).

Upcoming servicing events are computed from dates already on the records:
birthdays (Prospect.birth_date), policy anniversaries (policy_issued_date),
premium due dates (next_premium_due_date) and a referral ask 30 days after the
first policy is issued (until referral_asked_at is set).
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Count, DecimalField, Min, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.common.timeutils import local_today
from apps.prospects.models import Prospect
from apps.prospects.statuses import ProspectStatus

from .models import PREMIUM_MODE_MONTHS, InsuranceOpportunity, OpportunityStage

REFERRAL_ASK_AFTER_DAYS = 30
REFERRAL_ASK_AGAIN_DAYS = 180


def _safe_date(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def next_yearly(original: date, today: date) -> date:
    """Next occurrence (today or later) of a yearly date; Feb 29 falls on Feb 28 in other years."""
    candidate = _safe_date(today.year, original.month, original.day)
    return candidate if candidate >= today else _safe_date(today.year + 1, original.month, original.day)


def add_months(day: date, months: int) -> date:
    index = day.month - 1 + months
    return _safe_date(day.year + index // 12, index % 12 + 1, day.day)


def clients_queryset(user):
    """Active (not archived) prospects that are Won or have at least one issued policy."""
    return Prospect.objects.filter(owner=user, is_archived=False).filter(
        Q(status=ProspectStatus.WON) | Q(opportunities__stage=OpportunityStage.ISSUED)
    ).distinct()


def _person(p: Prospect) -> dict:
    return {"id": p.id, "full_name": p.full_name, "first_name": p.first_name, "last_name": p.last_name,
            "preferred_name": p.preferred_name, "mobile": p.mobile, "email": p.email}


def upcoming_events(user, days: int = 30) -> list[dict]:
    today = local_today(user)
    horizon = today + timedelta(days=days)
    events: list[dict] = []
    clients = list(clients_queryset(user))
    client_ids = {c.id for c in clients}

    for c in clients:
        if c.birth_date:
            when = next_yearly(c.birth_date, today)
            if when <= horizon:
                events.append({"type": "birthday", "date": when, "prospect": _person(c),
                               "detail": f"Turns {when.year - c.birth_date.year}"})

    issued = InsuranceOpportunity.objects.filter(
        owner=user, prospect_id__in=client_ids, stage=OpportunityStage.ISSUED
    ).select_related("prospect")
    first_issue: dict[int, date] = {}
    for opp in issued:
        p = opp.prospect
        if opp.policy_issued_date:
            first_issue[p.id] = min(first_issue.get(p.id, opp.policy_issued_date), opp.policy_issued_date)
            when = next_yearly(opp.policy_issued_date, today)
            if when > opp.policy_issued_date and when <= horizon:
                years = when.year - opp.policy_issued_date.year
                events.append({"type": "anniversary", "date": when, "prospect": _person(p),
                               "opportunity": {"id": opp.id, "name": opp.name},
                               "detail": f"{years} year{'s' if years != 1 else ''} · {opp.name}"})
        if opp.next_premium_due_date and opp.next_premium_due_date <= horizon:
            events.append({"type": "premium_due", "date": opp.next_premium_due_date, "prospect": _person(p),
                           "opportunity": {"id": opp.id, "name": opp.name},
                           "detail": f"{opp.get_premium_mode_display() or 'Premium'} · {opp.name}",
                           "overdue": opp.next_premium_due_date < today})

    now = timezone.now()
    for c in clients:
        issued_on = first_issue.get(c.id) or (c.policy_issued_at.date() if c.policy_issued_at else None)
        if not issued_on:
            continue
        due = issued_on + timedelta(days=REFERRAL_ASK_AFTER_DAYS)
        asked_recently = c.referral_asked_at and (now - c.referral_asked_at).days < REFERRAL_ASK_AGAIN_DAYS
        if due <= horizon and not asked_recently:
            events.append({"type": "referral_ask", "date": max(due, today), "prospect": _person(c),
                           "detail": f"Client since {issued_on:%b %d, %Y}"})

    events.sort(key=lambda e: (e["date"], e["type"]))
    for e in events:
        e["days_until"] = (e["date"] - today).days
    return events


def clients_list(user, search: str = "") -> list[dict]:
    money = DecimalField(max_digits=16, decimal_places=2)
    queryset = clients_queryset(user)
    if search:
        cond = Q()
        for term in search.split():
            cond &= Q(first_name__icontains=term) | Q(last_name__icontains=term) | Q(email__icontains=term)
        queryset = queryset.filter(cond)
    queryset = queryset.annotate(
        policies=Count("opportunities", filter=Q(opportunities__stage=OpportunityStage.ISSUED), distinct=True),
        premium=Coalesce(Sum("opportunities__actual_annualized_premium",
                             filter=Q(opportunities__stage=OpportunityStage.ISSUED)), Value(0, output_field=money)),
        next_due=Min("opportunities__next_premium_due_date", filter=Q(opportunities__stage=OpportunityStage.ISSUED)),
        first_issued=Min("opportunities__policy_issued_date", filter=Q(opportunities__stage=OpportunityStage.ISSUED)),
    ).order_by("last_name", "first_name")
    today = local_today(user)
    rows = []
    for c in queryset:
        rows.append({
            **_person(c),
            "policies": c.policies,
            "annualized_premium": str((c.premium or Decimal("0")).quantize(Decimal("0.01"))),
            "next_premium_due_date": c.next_due,
            "client_since": c.first_issued or (c.policy_issued_at.date() if c.policy_issued_at else None),
            "next_birthday": next_yearly(c.birth_date, today) if c.birth_date else None,
            "referral_asked_at": c.referral_asked_at,
        })
    return rows


@transaction.atomic
def mark_premium_paid(opp: InsuranceOpportunity) -> InsuranceOpportunity:
    months = PREMIUM_MODE_MONTHS.get(opp.premium_mode)
    if not months or not opp.next_premium_due_date:
        raise ValidationError({"detail": ["Set the premium mode and next due date first."]})
    opp.next_premium_due_date = add_months(opp.next_premium_due_date, months)
    opp.save(update_fields=["next_premium_due_date", "updated_at"])
    return opp


# ----------------------------------------------------------- notifications

NOTIFY_WITHIN = {"birthday": 1, "anniversary": 7, "premium_due": 7, "referral_ask": 0}
TITLES = {
    "birthday": "Birthday: {name}",
    "anniversary": "Policy anniversary: {name}",
    "premium_due": "Premium due: {name}",
    "referral_ask": "Ask {name} for referrals",
}


def generate_client_notifications(user) -> int:
    from apps.notifications.models import Notification, NotificationKind

    created = 0
    for event in upcoming_events(user, days=7):
        if event["days_until"] > NOTIFY_WITHIN[event["type"]]:
            continue
        ref = event.get("opportunity", {}).get("id") or event["prospect"]["id"]
        key = f"{event['type']}:{ref}:{event['date'].isoformat()}"
        when = "today" if event["days_until"] == 0 else ("overdue" if event["days_until"] < 0 else f"in {event['days_until']} days")
        try:
            with transaction.atomic():
                Notification.objects.create(
                    user=user, kind=NotificationKind.CLIENT, dedupe_key=key[:80],
                    title=TITLES[event["type"]].format(name=event["prospect"]["full_name"])[:160],
                    body=f"{event['detail']} · {when}"[:255],
                    link=f"/clients?focus={event['prospect']['id']}",
                )
            created += 1
        except IntegrityError:
            continue
    return created
