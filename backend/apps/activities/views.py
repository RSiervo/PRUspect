from datetime import timedelta

import django_filters
from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.prospects.filters import CharInFilter
from apps.common.timeutils import day_range, day_start, local_today, parse_date_param, user_tz

from . import services
from .models import APPOINTMENT_TYPES, Activity, FollowUp, FollowUpStatus, MessageTemplate
from .serializers import (
    ActivitySerializer,
    CancelSerializer,
    CompleteFollowUpSerializer,
    FollowUpSerializer,
    MessageTemplateSerializer,
    RescheduleSerializer,
)


def today_bounds(user):
    return day_range(local_today(user), user_tz(user))


class FollowUpFilter(django_filters.FilterSet):
    bucket = django_filters.ChoiceFilter(
        method="filter_bucket",
        choices=[(c, c) for c in ["overdue", "today", "upcoming", "active", "completed", "canceled"]],
    )
    prospect = django_filters.NumberFilter(field_name="prospect_id")
    activity_type = CharInFilter(field_name="activity_type", lookup_expr="in")
    priority = CharInFilter(field_name="priority", lookup_expr="in")
    date_from = django_filters.DateFilter(method="filter_date_from")
    date_to = django_filters.DateFilter(method="filter_date_to")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = FollowUp
        fields = ["prospect", "status"]

    def filter_bucket(self, queryset, name, value):
        start, end = today_bounds(self.request.user)
        pending = queryset.filter(status=FollowUpStatus.PENDING)
        if value == "overdue":
            return pending.filter(scheduled_at__lt=start)
        if value == "today":
            return pending.filter(scheduled_at__gte=start, scheduled_at__lt=end)
        if value == "upcoming":
            return pending.filter(scheduled_at__gte=end)
        if value == "active":
            return pending
        return queryset.filter(status=value)

    def filter_date_from(self, queryset, name, value):
        return queryset.filter(scheduled_at__gte=day_start(value, user_tz(self.request.user)))

    def filter_date_to(self, queryset, name, value):
        return queryset.filter(scheduled_at__lt=day_start(value + timedelta(days=1), user_tz(self.request.user)))

    def filter_search(self, queryset, name, value):
        condition = Q()
        for term in value.split():
            condition &= (Q(subject__icontains=term) | Q(prospect__first_name__icontains=term)
                          | Q(prospect__last_name__icontains=term))
        return queryset.filter(condition)


class FollowUpViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                      mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Follow-ups are canceled, not deleted, so the history stays intact."""

    serializer_class = FollowUpSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = FollowUpFilter
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = (
            FollowUp.objects.filter(owner=self.request.user, prospect__owner=self.request.user)
            .select_related("prospect")
            .prefetch_related("reschedules")
        )
        if self.request.query_params.get("include_archived") != "true":
            queryset = queryset.filter(prospect__is_archived=False)
        bucket = self.request.query_params.get("bucket")
        if bucket in {"completed", "canceled"}:
            return queryset.order_by("-completed_at", "-canceled_at", "-scheduled_at")
        return queryset.order_by("scheduled_at", "id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["today_range"] = today_bounds(self.request.user)
        return context

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        prospect = data.pop("prospect")
        serializer.instance = services.create_follow_up(user=self.request.user, prospect=prospect, data=data)

    def perform_update(self, serializer):
        data = dict(serializer.validated_data)
        data.pop("prospect", None)
        serializer.instance = services.update_follow_up(user=self.request.user, follow_up=serializer.instance,
                                                        data=data)

    def _respond(self, follow_up, extra=None):
        follow_up = FollowUp.objects.select_related("prospect").get(pk=follow_up.pk)
        data = self.get_serializer(follow_up).data
        if extra:
            data = {**data, **extra}
        return Response(data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        follow_up = self.get_object()
        serializer = CompleteFollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        next_data = data.get("next_follow_up")
        if next_data and next_data["scheduled_at"] <= timezone.now():
            raise ValidationError({"next_follow_up": ["The next follow-up must be scheduled in the future."]})
        completed, created = services.complete_follow_up(
            user=request.user,
            follow_up=follow_up,
            outcome=data["outcome"],
            next_action=data["next_action"],
            completed_at=data.get("completed_at"),
            next_follow_up=dict(next_data) if next_data else None,
        )
        return self._respond(completed, {"next_follow_up_id": created.pk if created else None})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        follow_up = services.cancel_follow_up(user=request.user, follow_up=self.get_object(),
                                              reason=serializer.validated_data["reason"])
        return self._respond(follow_up)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        serializer = RescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        follow_up = services.reschedule_follow_up(
            user=request.user,
            follow_up=self.get_object(),
            new_scheduled_at=serializer.validated_data["scheduled_at"],
            reason=serializer.validated_data["reason"],
        )
        return self._respond(follow_up)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        start, end = today_bounds(request.user)
        base = FollowUp.objects.filter(owner=request.user, prospect__is_archived=False)
        counts = base.aggregate(
            overdue=Count("id", filter=Q(status=FollowUpStatus.PENDING, scheduled_at__lt=start)),
            today=Count("id", filter=Q(status=FollowUpStatus.PENDING, scheduled_at__gte=start, scheduled_at__lt=end)),
            upcoming=Count("id", filter=Q(status=FollowUpStatus.PENDING, scheduled_at__gte=end)),
            completed=Count("id", filter=Q(status=FollowUpStatus.COMPLETED)),
            canceled=Count("id", filter=Q(status=FollowUpStatus.CANCELED)),
        )
        return Response(counts)


class ActivityViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                      viewsets.GenericViewSet):
    """Historical interaction log. Entries are immutable once logged."""

    serializer_class = ActivitySerializer
    filterset_fields = ["prospect", "activity_type"]

    def get_queryset(self):
        queryset = Activity.objects.filter(owner=self.request.user, prospect__owner=self.request.user).select_related(
            "prospect"
        )
        tz = user_tz(self.request.user)
        date_from = parse_date_param(self.request.query_params.get("date_from"))
        date_to = parse_date_param(self.request.query_params.get("date_to"))
        if date_from:
            queryset = queryset.filter(occurred_at__gte=day_start(date_from, tz))
        if date_to:
            queryset = queryset.filter(occurred_at__lt=day_start(date_to + timedelta(days=1), tz))
        search = self.request.query_params.get("search", "").strip()
        if search:
            condition = Q()
            for term in search.split():
                condition &= (Q(subject__icontains=term) | Q(prospect__first_name__icontains=term)
                              | Q(prospect__last_name__icontains=term))
            queryset = queryset.filter(condition)
        return queryset.order_by("-occurred_at", "-id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        prospect = data.pop("prospect")
        activity = services.log_activity(user=request.user, prospect=prospect, data=data)
        return Response(self.get_serializer(activity).data, status=status.HTTP_201_CREATED)


class CalendarEventsView(APIView):
    """Follow-ups between `start` and `end` (inclusive dates, user timezone).

    Each follow-up is exactly one event, so rescheduling moves it rather than
    creating a second entry.
    """

    MAX_DAYS = 100

    def get(self, request):
        tz = user_tz(request.user)
        today = local_today(request.user)
        start = parse_date_param(request.query_params.get("start")) or today.replace(day=1)
        end = parse_date_param(request.query_params.get("end")) or (start + timedelta(days=41))
        if end < start:
            raise ValidationError({"end": ["End date must be on or after the start date."]})
        if (end - start).days > self.MAX_DAYS:
            raise ValidationError({"end": [f"Range cannot exceed {self.MAX_DAYS} days."]})
        queryset = FollowUp.objects.filter(
            owner=request.user,
            prospect__is_archived=False,
            scheduled_at__gte=day_start(start, tz),
            scheduled_at__lt=day_start(end + timedelta(days=1), tz),
        ).select_related("prospect")
        if request.query_params.get("include_canceled") != "true":
            queryset = queryset.exclude(status=FollowUpStatus.CANCELED)
        today_start, _ = day_range(today, tz)
        events = [
            {
                "id": f.id,
                "title": f.subject,
                "start": f.scheduled_at,
                "end": f.scheduled_at + timedelta(minutes=f.duration_minutes),
                "activity_type": f.activity_type,
                "activity_type_label": f.get_activity_type_display(),
                "status": f.status,
                "priority": f.priority,
                "is_appointment": f.activity_type in APPOINTMENT_TYPES,
                "is_overdue": f.status == FollowUpStatus.PENDING and f.scheduled_at < today_start,
                "description": f.description,
                "prospect": {"id": f.prospect_id, "full_name": f.prospect.full_name},
            }
            for f in queryset.order_by("scheduled_at")
        ]
        return Response({"start": start, "end": end, "time_zone": str(tz), "events": events})


class MessageTemplateViewSet(viewsets.ModelViewSet):
    """The user's reusable message templates (placeholders are filled in on the device)."""

    serializer_class = MessageTemplateSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    pagination_class = None
    filter_backends = []

    def get_queryset(self):
        return MessageTemplate.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
