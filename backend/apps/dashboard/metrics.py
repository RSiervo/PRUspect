"""Metric calculations shared by the dashboard and reports.

Conventions (also returned to the UI as `definitions`):
- Archived prospects, and their follow-ups/opportunities, are excluded from all metrics.
- Date boundaries are computed in the user's display timezone (default Asia/Manila).
- Weeks run Monday to Sunday.
- Conversion rates are cohort-based: the cohort is the prospects *created* in the
  selected range (all time by default), and the numerator counts members of that
  same cohort that later reached the milestone. Milestones are stamped the first
  time a prospect enters a stage (see apps/prospects/statuses.py).
"""

from collections import OrderedDict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth

from apps.activities.models import APPOINTMENT_TYPES, FollowUp, FollowUpStatus
from apps.common.timeutils import (
    add_months,
    day_range,
    day_start,
    local_today,
    month_range,
    quarter_start,
    user_tz,
    week_range,
)
from apps.opportunities.models import InsuranceOpportunity, OpportunityStage
from apps.prospects.models import Prospect, ProspectSource
from apps.prospects.statuses import STAGE_ORDER, stage_kind

DEFINITIONS = {
    "total_prospects": "All prospects that are not archived.",
    "new_this_month": "Prospects added since the 1st of the current month.",
    "follow_ups_today": "Pending follow-ups scheduled for today (any time today).",
    "overdue_follow_ups": "Pending follow-ups scheduled before today. Completed and canceled items never count.",
    "appointments_this_week": "Online meetings, in-person meetings and presentations scheduled Monday–Sunday "
                              "this week, excluding canceled ones.",
    "qualified_prospects": "Prospects that have reached Needs Analysis or a later qualified stage at least once.",
    "policies_issued": "Insurance opportunities marked Policy Issued (with an issuance date).",
    "conversion_rate": "Prospect → Policy: prospects that reached Policy Issued — Won ÷ all prospects.",
    "qualified_to_application": "Of prospects that became qualified, the share that reached Application Submitted.",
    "application_to_policy": "Of prospects that reached Application Submitted, the share that reached Policy Issued.",
    "prospect_to_policy": "Of all prospects in the cohort, the share that reached Policy Issued.",
    "follow_up_completion_rate": "Of follow-ups scheduled in the range (excluding canceled), the share completed.",
    "estimated_pipeline": "Estimated annual premium of open opportunities (Identified through Underwriting). "
                          "An estimate, not confirmed or guaranteed business.",
    "issued_premium": "Verified actual annualized premium of issued policies, by issuance date.",
}

MONEY = DecimalField(max_digits=16, decimal_places=2)


def _rate(numerator: int, denominator: int) -> float | None:
    if not denominator:
        return None
    return round(numerator * 100 / denominator, 1)


def _money(value) -> str:
    return str((value or Decimal("0")).quantize(Decimal("0.01")))


def active_prospects(user):
    return Prospect.objects.filter(owner=user, is_archived=False)


def active_follow_ups(user):
    return FollowUp.objects.filter(owner=user, prospect__is_archived=False)


def active_opportunities(user):
    return InsuranceOpportunity.objects.filter(owner=user, prospect__is_archived=False)


# ---------------------------------------------------------------- dashboard


def summary(user) -> dict:
    tz = user_tz(user)
    today = local_today(user)
    today_start, today_end = day_range(today, tz)
    week_start, week_end = week_range(today, tz)
    month_start, month_end = month_range(today, tz)
    prev_month_start, _ = month_range(add_months(today, -1), tz)

    prospects = active_prospects(user).aggregate(
        total=Count("id"),
        new_this_month=Count("id", filter=Q(created_at__gte=month_start, created_at__lt=month_end)),
        new_last_month=Count("id", filter=Q(created_at__gte=prev_month_start, created_at__lt=month_start)),
        qualified=Count("id", filter=Q(qualified_at__isnull=False)),
        won=Count("id", filter=Q(policy_issued_at__isnull=False)),
    )
    follow_ups = active_follow_ups(user).aggregate(
        today=Count("id", filter=Q(status=FollowUpStatus.PENDING, scheduled_at__gte=today_start,
                                   scheduled_at__lt=today_end)),
        overdue=Count("id", filter=Q(status=FollowUpStatus.PENDING, scheduled_at__lt=today_start)),
        appointments_week=Count("id", filter=Q(activity_type__in=APPOINTMENT_TYPES, scheduled_at__gte=week_start,
                                               scheduled_at__lt=week_end) & ~Q(status=FollowUpStatus.CANCELED)),
        completed_today=Count("id", filter=Q(status=FollowUpStatus.COMPLETED, completed_at__gte=today_start,
                                             completed_at__lt=today_end)),
    )
    first_of_month = today.replace(day=1)
    policies = active_opportunities(user).aggregate(
        issued=Count("id", filter=Q(stage=OpportunityStage.ISSUED)),
        issued_this_month=Count("id", filter=Q(stage=OpportunityStage.ISSUED, policy_issued_date__gte=first_of_month,
                                               policy_issued_date__lte=today)),
    )

    return {
        "as_of": today,
        "time_zone": str(tz),
        "kpis": {
            "total_prospects": {"value": prospects["total"]},
            "new_this_month": {"value": prospects["new_this_month"], "previous": prospects["new_last_month"]},
            "follow_ups_today": {"value": follow_ups["today"], "completed_today": follow_ups["completed_today"]},
            "overdue_follow_ups": {"value": follow_ups["overdue"]},
            "appointments_this_week": {"value": follow_ups["appointments_week"]},
            "qualified_prospects": {"value": prospects["qualified"]},
            "policies_issued": {"value": policies["issued"], "this_month": policies["issued_this_month"]},
            "conversion_rate": {"value": _rate(prospects["won"], prospects["total"]),
                                "numerator": prospects["won"], "denominator": prospects["total"]},
        },
        "definitions": {key: DEFINITIONS[key] for key in [
            "total_prospects", "new_this_month", "follow_ups_today", "overdue_follow_ups",
            "appointments_this_week", "qualified_prospects", "policies_issued", "conversion_rate"]},
    }


def pipeline_counts(user) -> list[dict]:
    counts = dict(active_prospects(user).values_list("status").annotate(n=Count("id")))
    total = sum(counts.values())
    return [
        {"value": stage.value, "label": stage.label, "kind": stage_kind(stage), "count": counts.get(stage.value, 0),
         "share": _rate(counts.get(stage.value, 0), total)}
        for stage in STAGE_ORDER
    ]


def _month_keys(start: date, months: int) -> list[date]:
    return [add_months(start, i) for i in range(months)]


def _monthly_counts(queryset, field: str, start, end, tz) -> dict[date, int]:
    rows = (
        queryset.filter(**{f"{field}__gte": start, f"{field}__lt": end})
        .annotate(bucket=TruncMonth(field, tzinfo=tz))
        .values("bucket")
        .annotate(n=Count("id"))
    )
    return {row["bucket"].date() if hasattr(row["bucket"], "date") else row["bucket"]: row["n"] for row in rows}


def performance(user, period: str = "monthly") -> dict:
    """New prospects, appointments, qualified prospects and policies issued per month or quarter."""
    tz = user_tz(user)
    today = local_today(user)
    if period == "quarterly":
        buckets = 4
        first = add_months(quarter_start(today), -3 * (buckets - 1))
        months = buckets * 3
    else:
        buckets = 6
        first = add_months(today.replace(day=1), -(buckets - 1))
        months = buckets
    start = day_start(first, tz)
    end = day_start(add_months(first, months), tz)

    new = _monthly_counts(active_prospects(user), "created_at", start, end, tz)
    qualified = _monthly_counts(active_prospects(user), "qualified_at", start, end, tz)
    appointments = _monthly_counts(
        active_follow_ups(user).filter(activity_type__in=APPOINTMENT_TYPES).exclude(status=FollowUpStatus.CANCELED),
        "scheduled_at", start, end, tz,
    )
    issued_rows = (
        active_opportunities(user)
        .filter(stage=OpportunityStage.ISSUED, policy_issued_date__gte=first,
                policy_issued_date__lt=add_months(first, months))
        .values_list("policy_issued_date", flat=True)
    )
    issued: dict[date, int] = {}
    for issued_on in issued_rows:
        key = issued_on.replace(day=1)
        issued[key] = issued.get(key, 0) + 1

    series = OrderedDict()
    for month in _month_keys(first, months):
        if period == "quarterly":
            key = quarter_start(month)
            label = f"Q{(key.month - 1) // 3 + 1} {key.year}"
        else:
            key = month
            label = month.strftime("%b %Y")
        point = series.setdefault(key, {"period": key.isoformat(), "label": label, "new_prospects": 0,
                                        "appointments": 0, "qualified": 0, "policies_issued": 0})
        point["new_prospects"] += new.get(month, 0)
        point["appointments"] += appointments.get(month, 0)
        point["qualified"] += qualified.get(month, 0)
        point["policies_issued"] += issued.get(month, 0)
    return {"period": period, "series": list(series.values()), "definitions": {
        "new_prospects": "Prospects added in the period.",
        "appointments": "Meeting and presentation follow-ups scheduled in the period (not canceled).",
        "qualified": "Prospects that first reached a qualified stage in the period.",
        "policies_issued": "Opportunities with a policy issuance date in the period.",
    }}


# ------------------------------------------------------------- conversions


def _cohort(user, date_from: date | None, date_to: date | None):
    tz = user_tz(user)
    queryset = active_prospects(user)
    if date_from:
        queryset = queryset.filter(created_at__gte=day_start(date_from, tz))
    if date_to:
        queryset = queryset.filter(created_at__lt=day_start(date_to + timedelta(days=1), tz))
    return queryset


def conversion(user, date_from: date | None = None, date_to: date | None = None) -> dict:
    counts = _cohort(user, date_from, date_to).aggregate(
        cohort=Count("id"),
        qualified=Count("id", filter=Q(qualified_at__isnull=False)),
        applications=Count("id", filter=Q(application_submitted_at__isnull=False)),
        qualified_and_applied=Count("id", filter=Q(qualified_at__isnull=False,
                                                   application_submitted_at__isnull=False)),
        issued=Count("id", filter=Q(policy_issued_at__isnull=False)),
        applied_and_issued=Count("id", filter=Q(application_submitted_at__isnull=False,
                                                policy_issued_at__isnull=False)),
    )
    return {
        "cohort": {"date_from": date_from, "date_to": date_to, "size": counts["cohort"],
                   "description": "Prospects added in the selected range" if (date_from or date_to)
                   else "All prospects (all time)"},
        "counts": {"qualified": counts["qualified"], "applications": counts["applications"],
                   "issued": counts["issued"]},
        "rates": [
            {"key": "qualified_to_application", "label": "Qualified → Application",
             "rate": _rate(counts["qualified_and_applied"], counts["qualified"]),
             "numerator": counts["qualified_and_applied"], "denominator": counts["qualified"],
             "definition": DEFINITIONS["qualified_to_application"]},
            {"key": "application_to_policy", "label": "Application → Policy",
             "rate": _rate(counts["applied_and_issued"], counts["applications"]),
             "numerator": counts["applied_and_issued"], "denominator": counts["applications"],
             "definition": DEFINITIONS["application_to_policy"]},
            {"key": "prospect_to_policy", "label": "Prospect → Policy",
             "rate": _rate(counts["issued"], counts["cohort"]),
             "numerator": counts["issued"], "denominator": counts["cohort"],
             "definition": DEFINITIONS["prospect_to_policy"]},
        ],
    }


# ----------------------------------------------------------------- reports


def _month_span(user, date_from, date_to) -> tuple[date, date]:
    today = local_today(user)
    end = date_to or today
    start = date_from or add_months(end.replace(day=1), -11)
    return start, end


def prospects_report(user, date_from=None, date_to=None) -> dict:
    tz = user_tz(user)
    start, end = _month_span(user, date_from, date_to)
    cohort = _cohort(user, start, end)
    acquisition = _monthly_counts(cohort, "created_at", day_start(start, tz),
                                  day_start(end + timedelta(days=1), tz), tz)
    months = []
    cursor = start.replace(day=1)
    while cursor <= end:
        months.append({"period": cursor.isoformat(), "label": cursor.strftime("%b %Y"),
                       "count": acquisition.get(cursor, 0)})
        cursor = add_months(cursor, 1)

    sources = []
    source_rows = (
        cohort.values("source_id")
        .annotate(total=Count("id"), qualified=Count("id", filter=Q(qualified_at__isnull=False)),
                  won=Count("id", filter=Q(policy_issued_at__isnull=False)))
        .order_by("-total")
    )
    names = dict(ProspectSource.objects.filter(owner=user).values_list("id", "name"))
    for row in source_rows:
        sources.append({"source_id": row["source_id"], "source": names.get(row["source_id"], "Not specified"),
                        "prospects": row["total"], "qualified": row["qualified"], "won": row["won"],
                        "conversion_rate": _rate(row["won"], row["total"])})

    status_counts = dict(cohort.values_list("status").annotate(n=Count("id")))
    by_status = [{"value": s.value, "label": s.label, "kind": stage_kind(s), "count": status_counts.get(s.value, 0)}
                 for s in STAGE_ORDER]
    return {"date_from": start, "date_to": end, "total": cohort.count(), "acquisition": months,
            "sources": sources, "by_status": by_status,
            "definitions": {"cohort": "Prospects added between the selected dates (not archived).",
                            "won": "Prospects that reached Policy Issued — Won."}}


def activity_report(user, date_from=None, date_to=None) -> dict:
    tz = user_tz(user)
    start, end = _month_span(user, date_from, date_to)
    range_start, range_end = day_start(start, tz), day_start(end + timedelta(days=1), tz)
    today_start, _ = day_range(local_today(user), tz)
    in_range = active_follow_ups(user).filter(scheduled_at__gte=range_start, scheduled_at__lt=range_end)
    counts = in_range.aggregate(
        scheduled=Count("id", filter=~Q(status=FollowUpStatus.CANCELED)),
        completed=Count("id", filter=Q(status=FollowUpStatus.COMPLETED)),
        canceled=Count("id", filter=Q(status=FollowUpStatus.CANCELED)),
        missed=Count("id", filter=Q(status=FollowUpStatus.PENDING, scheduled_at__lt=today_start)),
    )
    overdue_now = active_follow_ups(user).filter(status=FollowUpStatus.PENDING, scheduled_at__lt=today_start).count()
    appointments = in_range.filter(activity_type__in=APPOINTMENT_TYPES)
    appt_scheduled = _monthly_counts(appointments.exclude(status=FollowUpStatus.CANCELED), "scheduled_at",
                                     range_start, range_end, tz)
    appt_completed = _monthly_counts(appointments.filter(status=FollowUpStatus.COMPLETED), "scheduled_at",
                                     range_start, range_end, tz)
    months = []
    cursor = start.replace(day=1)
    while cursor <= end:
        months.append({"period": cursor.isoformat(), "label": cursor.strftime("%b %Y"),
                       "scheduled": appt_scheduled.get(cursor, 0), "completed": appt_completed.get(cursor, 0)})
        cursor = add_months(cursor, 1)
    by_type = list(
        in_range.exclude(status=FollowUpStatus.CANCELED).values("activity_type")
        .annotate(total=Count("id"), completed=Count("id", filter=Q(status=FollowUpStatus.COMPLETED)))
        .order_by("-total")
    )
    labels = dict(FollowUp._meta.get_field("activity_type").choices)
    for row in by_type:
        row["label"] = labels.get(row["activity_type"], row["activity_type"])
    return {
        "date_from": start, "date_to": end,
        "follow_ups": {**counts, "completion_rate": _rate(counts["completed"], counts["scheduled"]),
                       "overdue_now": overdue_now},
        "appointments_by_month": months,
        "by_type": by_type,
        "definitions": {"completion_rate": DEFINITIONS["follow_up_completion_rate"],
                        "missed": "Follow-ups in the range still pending after their scheduled day.",
                        "overdue_now": DEFINITIONS["overdue_follow_ups"]},
    }


def pipeline_report(user, date_from=None, date_to=None) -> dict:
    start, end = _month_span(user, date_from, date_to)
    zero = Value(0, output_field=MONEY)
    opps = active_opportunities(user)
    by_stage = []
    stage_rows = {row["stage"]: row for row in opps.values("stage").annotate(
        count=Count("id"), estimated=Coalesce(Sum("estimated_annual_premium"), zero),
        actual=Coalesce(Sum("actual_annualized_premium"), zero))}
    for stage in OpportunityStage:
        row = stage_rows.get(stage.value, {"count": 0, "estimated": 0, "actual": 0})
        by_stage.append({"value": stage.value, "label": stage.label, "count": row["count"],
                         "estimated_annual_premium": _money(row["estimated"]),
                         "actual_annualized_premium": _money(row["actual"]) if stage == OpportunityStage.ISSUED else None})
    from apps.opportunities.models import OPEN_STAGES

    open_total = opps.filter(stage__in=OPEN_STAGES).aggregate(
        total=Coalesce(Sum("estimated_annual_premium"), zero), count=Count("id"),
        missing=Count("id", filter=Q(estimated_annual_premium__isnull=True)))
    issued = opps.filter(stage=OpportunityStage.ISSUED, policy_issued_date__gte=start, policy_issued_date__lte=end)
    issued_total = issued.aggregate(total=Coalesce(Sum("actual_annualized_premium"), zero), count=Count("id"),
                                    unverified=Count("id", filter=Q(actual_annualized_premium__isnull=True)))
    issued_by_month = {}
    for issued_on, amount in issued.values_list("policy_issued_date", "actual_annualized_premium"):
        key = issued_on.replace(day=1)
        bucket = issued_by_month.setdefault(key, {"count": 0, "amount": Decimal("0")})
        bucket["count"] += 1
        bucket["amount"] += amount or Decimal("0")
    months = []
    cursor = start.replace(day=1)
    while cursor <= end:
        bucket = issued_by_month.get(cursor, {"count": 0, "amount": Decimal("0")})
        months.append({"period": cursor.isoformat(), "label": cursor.strftime("%b %Y"), "count": bucket["count"],
                       "actual_annualized_premium": _money(bucket["amount"])})
        cursor = add_months(cursor, 1)
    return {
        "date_from": start, "date_to": end, "currency": "PHP",
        "estimated_pipeline": {"total": _money(open_total["total"]), "opportunities": open_total["count"],
                               "without_estimate": open_total["missing"]},
        "issued": {"total": _money(issued_total["total"]), "policies": issued_total["count"],
                   "without_verified_premium": issued_total["unverified"]},
        "by_stage": by_stage,
        "issued_by_month": months,
        "definitions": {"estimated_pipeline": DEFINITIONS["estimated_pipeline"],
                        "issued": DEFINITIONS["issued_premium"],
                        "note": "Estimated and issued figures are never added together. Neither represents "
                                "commission or guaranteed earnings."},
    }


# ------------------------------------------------------------------- today

STALE_DAYS = 30


def today(user) -> dict:
    """Daily worklist: agenda, overdue, prospects going cold, prospects with no next step."""
    from django.db.models import Exists, OuterRef
    from django.utils import timezone

    from apps.prospects.statuses import ACTIVE_STATUSES

    tz = user_tz(user)
    day = local_today(user)
    start, end = day_range(day, tz)
    follow_ups = active_follow_ups(user).select_related("prospect")
    agenda = follow_ups.filter(scheduled_at__gte=start, scheduled_at__lt=end).exclude(status=FollowUpStatus.CANCELED)
    overdue = follow_ups.filter(status=FollowUpStatus.PENDING, scheduled_at__lt=start)

    cutoff = timezone.now() - timedelta(days=STALE_DAYS)
    working = active_prospects(user).filter(status__in=ACTIVE_STATUSES, do_not_contact=False)
    stale = working.filter(Q(last_contacted_at__lt=cutoff) | Q(last_contacted_at__isnull=True, created_at__lt=cutoff))
    pending = FollowUp.objects.filter(prospect=OuterRef("pk"), status=FollowUpStatus.PENDING)
    no_next_step = working.annotate(has_next=Exists(pending)).filter(has_next=False)

    def brief(p):
        return {"id": p.id, "full_name": p.full_name, "status": p.status, "priority": p.priority,
                "mobile": p.mobile, "email": p.email, "last_contacted_at": p.last_contacted_at}

    return {
        "date": day,
        "agenda": list(agenda.order_by("scheduled_at")),
        "overdue": list(overdue.order_by("scheduled_at")[:10]),
        "overdue_count": overdue.count(),
        "stale": [brief(p) for p in stale.order_by(F("last_contacted_at").asc(nulls_first=True))[:8]],
        "stale_count": stale.count(),
        "no_next_step": [brief(p) for p in no_next_step.order_by("-priority", "-created_at")[:8]],
        "no_next_step_count": no_next_step.count(),
        "definitions": {
            "stale": f"Active prospects not contacted in the last {STALE_DAYS} days (excludes Do not contact).",
            "no_next_step": "Active prospects without any pending follow-up.",
        },
    }
