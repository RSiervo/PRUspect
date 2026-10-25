from django.db import transaction
from django.db.models import Count, DecimalField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditAction
from apps.audit.services import diff, record
from apps.prospects.filters import ProspectFilter
from apps.prospects.models import Prospect
from apps.prospects.statuses import STAGE_ORDER, stage_kind
from apps.prospects.views import annotate_prospects

from .models import OPEN_STAGES, InsuranceOpportunity, OpportunityStage
from .serializers import OpportunitySerializer

TRACKED = ["name", "product_category", "estimated_annual_premium", "currency", "estimated_close_date", "stage",
           "application_reference", "application_submitted_date", "policy_issued_date",
           "actual_annualized_premium", "notes"]


class OpportunityViewSet(viewsets.ModelViewSet):
    serializer_class = OpportunitySerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filterset_fields = ["prospect", "stage"]

    def get_queryset(self):
        return (
            InsuranceOpportunity.objects.filter(owner=self.request.user, prospect__owner=self.request.user)
            .select_related("prospect", "product_category")
            .order_by("-created_at")
        )

    @transaction.atomic
    def perform_create(self, serializer):
        opp = serializer.save(owner=self.request.user)
        record(user=self.request.user, action=AuditAction.OPPORTUNITY_CREATED, entity=opp, prospect=opp.prospect,
               summary=f"Added opportunity “{opp.name}” ({opp.get_stage_display()})")

    @transaction.atomic
    def perform_update(self, serializer):
        before = {field: getattr(serializer.instance, field) for field in TRACKED}
        opp = serializer.save()
        changes = diff(before, {field: getattr(opp, field) for field in TRACKED})
        if changes:
            record(user=self.request.user, action=AuditAction.OPPORTUNITY_UPDATED, entity=opp,
                   prospect=opp.prospect, summary=f"Updated opportunity “{opp.name}”", changes=changes)

    @action(detail=True, methods=["post"], url_path="premium-paid")
    def premium_paid(self, request, pk=None):
        """Advance the next premium due date by one premium period."""
        from .clients import mark_premium_paid

        opp = self.get_object()
        if opp.stage != OpportunityStage.ISSUED:
            raise ValidationError({"detail": ["Only issued policies have premiums."]})
        previous = opp.next_premium_due_date
        opp = mark_premium_paid(opp)
        record(user=request.user, action=AuditAction.OPPORTUNITY_UPDATED, entity=opp, prospect=opp.prospect,
               summary=f"Marked premium paid for “{opp.name}”",
               changes={"next_premium_due_date": [str(previous), str(opp.next_premium_due_date)]})
        return Response(self.get_serializer(opp).data)

    @transaction.atomic
    def perform_destroy(self, instance):
        record(user=self.request.user, action=AuditAction.OPPORTUNITY_DELETED, entity=instance,
               prospect=instance.prospect, summary=f"Deleted opportunity “{instance.name}”")
        instance.delete()


def opportunity_totals(user) -> dict:
    """Pipeline money, keeping estimates and verified issued premiums apart."""
    money = DecimalField(max_digits=16, decimal_places=2)
    zero = Value(0, output_field=money)
    base = InsuranceOpportunity.objects.filter(owner=user, prospect__is_archived=False)
    totals = base.aggregate(
        open_estimated=Coalesce(Sum("estimated_annual_premium", filter=Q(stage__in=OPEN_STAGES)), zero),
        open_count=Count("id", filter=Q(stage__in=OPEN_STAGES)),
        submitted_estimated=Coalesce(Sum("estimated_annual_premium", filter=Q(
            stage__in=[OpportunityStage.APPLICATION_SUBMITTED, OpportunityStage.UNDERWRITING])), zero),
        issued_actual=Coalesce(Sum("actual_annualized_premium", filter=Q(stage=OpportunityStage.ISSUED)), zero),
        issued_count=Count("id", filter=Q(stage=OpportunityStage.ISSUED)),
        issued_missing_actual=Count("id", filter=Q(stage=OpportunityStage.ISSUED,
                                                   actual_annualized_premium__isnull=True)),
    )
    return {key: (str(value) if not isinstance(value, int) else value) for key, value in totals.items()}


class PipelineView(APIView):
    """Kanban board: active prospects grouped by current status."""

    PER_STAGE = 100

    def get(self, request):
        money = DecimalField(max_digits=16, decimal_places=2)
        open_estimate = (
            InsuranceOpportunity.objects.filter(prospect=OuterRef("pk"), stage__in=OPEN_STAGES)
            .values("prospect")
            .annotate(total=Sum("estimated_annual_premium"))
            .values("total")[:1]
        )
        queryset = annotate_prospects(
            Prospect.objects.filter(owner=request.user, is_archived=False).prefetch_related("insurance_interests")
        ).annotate(estimated_annual_premium=Subquery(open_estimate, output_field=money))
        queryset = ProspectFilter(request.query_params, queryset=queryset, request=request).qs
        queryset = queryset.order_by("priority_rank", "-status_changed_at", "-id")

        grouped: dict[str, list] = {stage.value: [] for stage in STAGE_ORDER}
        counts = {stage.value: 0 for stage in STAGE_ORDER}
        for prospect in queryset:
            counts[prospect.status] += 1
            if len(grouped[prospect.status]) < self.PER_STAGE:
                grouped[prospect.status].append({
                    "id": prospect.id,
                    "full_name": prospect.full_name,
                    "preferred_name": prospect.preferred_name,
                    "status": prospect.status,
                    "priority": prospect.priority,
                    "insurance_interests": [i.name for i in prospect.insurance_interests.all()],
                    "last_contacted_at": prospect.last_contacted_at,
                    "next_follow_up_at": prospect.next_follow_up_at,
                    "estimated_annual_premium": (
                        str(prospect.estimated_annual_premium) if prospect.estimated_annual_premium is not None else None
                    ),
                    "is_demo": prospect.is_demo,
                })
        stages = [
            {"value": stage.value, "label": stage.label, "kind": stage_kind(stage), "count": counts[stage.value],
             "prospects": grouped[stage.value]}
            for stage in STAGE_ORDER
        ]
        return Response({
            "stages": stages,
            "totals": opportunity_totals(request.user),
            "notes": {
                "open_estimated": "Sum of estimated annual premium for opportunities in Identified, Proposal, "
                                  "Application In Progress, Application Submitted and Underwriting stages. "
                                  "Estimates are not confirmed revenue.",
                "issued_actual": "Sum of verified actual annualized premium for issued policies only.",
            },
        })


class ClientsView(APIView):
    """Clients (prospects with an issued policy) with servicing dates."""

    def get(self, request):
        from .clients import clients_list

        return Response({"results": clients_list(request.user, request.query_params.get("search", "").strip())})


class ClientsUpcomingView(APIView):
    """Birthdays, anniversaries, premium due dates and referral asks in the next N days."""

    def get(self, request):
        from .clients import upcoming_events

        try:
            days = max(1, min(int(request.query_params.get("days", 30)), 120))
        except ValueError:
            days = 30
        return Response({"days": days, "events": upcoming_events(request.user, days)})


class ReferralAskedView(APIView):
    def post(self, request, prospect_id):
        from django.utils import timezone

        prospect = get_object_or_404(Prospect, owner=request.user, pk=prospect_id)
        prospect.referral_asked_at = timezone.now()
        prospect.save(update_fields=["referral_asked_at", "updated_at"])
        record(user=request.user, action=AuditAction.PROSPECT_UPDATED, entity=prospect, prospect=prospect,
               summary=f"Asked {prospect.full_name} for referrals")
        return Response({"referral_asked_at": prospect.referral_asked_at})
