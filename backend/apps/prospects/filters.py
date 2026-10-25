import django_filters
from django.db.models import Q

from apps.common.normalize import normalize_phone
from apps.common.timeutils import day_start, user_tz

from .models import Priority, Prospect
from .statuses import ProspectStatus


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass


class NumberInFilter(django_filters.BaseInFilter, django_filters.NumberFilter):
    pass


class ProspectFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method="filter_search")
    status = CharInFilter(field_name="status", lookup_expr="in")
    priority = CharInFilter(field_name="priority", lookup_expr="in")
    source = NumberInFilter(field_name="source_id", lookup_expr="in")
    interest = NumberInFilter(method="filter_interest")
    created_from = django_filters.DateFilter(method="filter_created_from")
    created_to = django_filters.DateFilter(method="filter_created_to")
    is_demo = django_filters.BooleanFilter()
    stage_kind = django_filters.ChoiceFilter(
        choices=[("active", "active"), ("won", "won"), ("lost", "lost"), ("paused", "paused")],
        method="filter_stage_kind",
    )

    milestone = django_filters.ChoiceFilter(
        choices=[("qualified", "qualified"), ("application", "application"), ("won", "won")],
        method="filter_milestone",
    )

    class Meta:
        model = Prospect
        fields = ["status", "priority", "source", "is_demo"]

    def filter_search(self, queryset, name, value):
        value = value.strip()
        if not value:
            return queryset
        condition = Q()
        for term in value.split():
            term_q = (
                Q(first_name__icontains=term)
                | Q(last_name__icontains=term)
                | Q(preferred_name__icontains=term)
                | Q(email_normalized__icontains=term.lower())
                | Q(company__icontains=term)
                | Q(mobile__icontains=term)
            )
            condition &= term_q
        digits = normalize_phone(value)
        if len(digits) >= 4:
            # "0917 123" style input matches the normalized number too.
            condition |= Q(mobile_normalized__contains=digits) | Q(mobile_normalized__contains=digits.lstrip("0"))
        return queryset.filter(condition)

    def filter_milestone(self, queryset, name, value):
        field = {"qualified": "qualified_at", "application": "application_submitted_at", "won": "policy_issued_at"}[value]
        return queryset.filter(**{f"{field}__isnull": False})

    def filter_interest(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(insurance_interests__id__in=value).distinct()

    def _tz(self):
        return user_tz(self.request.user)

    def filter_created_from(self, queryset, name, value):
        return queryset.filter(created_at__gte=day_start(value, self._tz()))

    def filter_created_to(self, queryset, name, value):
        from datetime import timedelta

        return queryset.filter(created_at__lt=day_start(value + timedelta(days=1), self._tz()))

    def filter_stage_kind(self, queryset, name, value):
        from .statuses import CLOSED_LOST_STATUSES, TERMINAL_STATUSES

        if value == "won":
            return queryset.filter(status=ProspectStatus.WON)
        if value == "lost":
            return queryset.filter(status__in=CLOSED_LOST_STATUSES)
        if value == "paused":
            return queryset.filter(status=ProspectStatus.ON_HOLD)
        return queryset.exclude(status__in=[*TERMINAL_STATUSES, ProspectStatus.ON_HOLD])


ORDERING_MAP = {
    "name": ["last_name", "first_name"],
    "created_at": ["created_at"],
    "last_contacted_at": ["last_contacted_at"],
    "priority": ["priority_rank"],
    "next_follow_up_at": ["next_follow_up_at"],
    "status": ["status"],
}
PRIORITY_VALUES = Priority.values
