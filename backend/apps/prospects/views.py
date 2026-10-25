from datetime import datetime, time

from django.db import transaction
from django.db.models import Case, F, IntegerField, OuterRef, Prefetch, Subquery, Value, When
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.activities.models import Activity, FollowUp, FollowUpStatus
from apps.activities.serializers import ActivitySerializer
from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.common.csv_utils import csv_response
from apps.common.normalize import normalize_email, normalize_phone
from apps.common.timeutils import user_tz
from apps.opportunities.models import InsuranceOpportunity

from . import services
from .filters import ORDERING_MAP, ProspectFilter
from .models import ProductCategory, Prospect, ProspectNote, ProspectSource
from .serializers import (
    BulkActionSerializer,
    ProductCategorySerializer,
    ProspectDetailSerializer,
    ProspectListSerializer,
    ProspectNoteSerializer,
    ProspectSourceSerializer,
    ProspectWriteSerializer,
    StatusChangeSerializer,
    StatusHistorySerializer,
)
from .statuses import ProspectStatus


def annotate_prospects(queryset):
    next_follow_up = (
        FollowUp.objects.filter(prospect=OuterRef("pk"), status=FollowUpStatus.PENDING)
        .order_by("scheduled_at")
        .values("scheduled_at")[:1]
    )
    return queryset.annotate(
        next_follow_up_at=Subquery(next_follow_up),
        priority_rank=Case(
            When(priority="high", then=Value(1)),
            When(priority="medium", then=Value(2)),
            default=Value(3),
            output_field=IntegerField(),
        ),
    )


def apply_ordering(queryset, ordering: str | None):
    ordering = ordering or "-created_at"
    descending = ordering.startswith("-")
    fields = ORDERING_MAP.get(ordering.lstrip("-"))
    if not fields:
        fields, descending = ["created_at"], True
    expressions = [
        F(field).desc(nulls_last=True) if descending else F(field).asc(nulls_last=True) for field in fields
    ]
    return queryset.order_by(*expressions, "-id")


class ProspectViewSet(viewsets.ModelViewSet):
    """Prospects owned by the authenticated user. Other users' records are never visible."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filterset_class = ProspectFilter
    filter_backends = [DjangoFilterBackend]

    def get_queryset(self):
        queryset = Prospect.objects.filter(owner=self.request.user).select_related("source").prefetch_related(
            "insurance_interests"
        )
        if self.action in {"list", "export"}:
            archived = self.request.query_params.get("archived", "active")
            if archived == "archived":
                queryset = queryset.filter(is_archived=True)
            elif archived != "all":
                queryset = queryset.filter(is_archived=False)
        return annotate_prospects(queryset)

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        if self.action in {"list", "export"}:
            queryset = apply_ordering(queryset, self.request.query_params.get("ordering"))
        return queryset

    def get_serializer_class(self):
        if self.action in {"create", "partial_update"}:
            return ProspectWriteSerializer
        if self.action == "list":
            return ProspectListSerializer
        return ProspectDetailSerializer

    def _detail(self, prospect, status_code=status.HTTP_200_OK):
        prospect = self.get_queryset().get(pk=prospect.pk)
        return Response(ProspectDetailSerializer(prospect, context=self.get_serializer_context()).data,
                        status=status_code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        prospect = serializer.save()
        return self._detail(prospect, status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        prospect = self.get_object()
        serializer = self.get_serializer(prospect, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        prospect = serializer.save()
        return self._detail(prospect)

    def destroy(self, request, *args, **kwargs):
        prospect = self.get_object()
        confirm = (request.data or {}).get("confirm_name", "") if isinstance(request.data, dict) else ""
        if confirm.strip().lower() != prospect.full_name.lower():
            raise ValidationError({"confirm_name": ["Type the prospect's full name to confirm deletion."]})
        services.delete_prospect(user=request.user, prospect=prospect)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        prospect = self.get_object()
        if prospect.is_archived:
            raise ValidationError({"detail": ["Restore this prospect before changing its status."]})
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.change_status(user=request.user, prospect=prospect, new_status=serializer.validated_data["status"],
                               reason=serializer.validated_data["reason"])
        return self._detail(prospect)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        prospect = services.archive_prospect(user=request.user, prospect=self.get_object())
        return self._detail(prospect)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        prospect = services.restore_prospect(user=request.user, prospect=self.get_object())
        return self._detail(prospect)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        prospect = self.get_object()
        statuses = StatusHistorySerializer(prospect.status_history.select_related("changed_by"), many=True).data
        changes = [
            {
                "id": log.id,
                "action": log.action,
                "action_label": log.get_action_display(),
                "summary": log.summary,
                "changes": log.changes,
                "created_at": log.created_at,
            }
            for log in prospect.audit_logs.filter(
                action__in=[AuditAction.PROSPECT_CREATED, AuditAction.PROSPECT_UPDATED,
                            AuditAction.PROSPECT_ARCHIVED, AuditAction.PROSPECT_RESTORED,
                            AuditAction.OPPORTUNITY_CREATED, AuditAction.OPPORTUNITY_UPDATED,
                            AuditAction.OPPORTUNITY_DELETED]
            )[:200]
        ]
        return Response({"status_history": statuses, "changes": changes})

    @action(detail=True, methods=["get"])
    def activities(self, request, pk=None):
        prospect = self.get_object()
        queryset = Activity.objects.filter(owner=request.user, prospect=prospect).select_related("prospect")
        page = self.paginate_queryset(queryset)
        data = ActivitySerializer(page, many=True, context=self.get_serializer_context()).data
        return self.get_paginated_response(data)

    @action(detail=True, methods=["get"])
    def timeline(self, request, pk=None):
        """Merged, newest-first history of everything that happened to a prospect."""
        prospect = self.get_object()
        events = []
        skip = {AuditAction.FOLLOWUP_COMPLETED, AuditAction.ACTIVITY_LOGGED, AuditAction.PROSPECT_UPDATED,
                AuditAction.NOTE_EDITED, AuditAction.FOLLOWUP_UPDATED}
        kind_map = {
            AuditAction.PROSPECT_CREATED: "created",
            AuditAction.PROSPECT_STATUS_CHANGED: "status",
            AuditAction.PROSPECT_ARCHIVED: "archive",
            AuditAction.PROSPECT_RESTORED: "archive",
            AuditAction.NOTE_ADDED: "note",
            AuditAction.FOLLOWUP_CREATED: "follow_up",
            AuditAction.FOLLOWUP_RESCHEDULED: "follow_up",
            AuditAction.FOLLOWUP_CANCELED: "follow_up",
            AuditAction.OPPORTUNITY_CREATED: "opportunity",
            AuditAction.OPPORTUNITY_UPDATED: "opportunity",
        }
        for log in prospect.audit_logs.exclude(action__in=skip)[:300]:
            events.append({
                "id": f"audit-{log.id}",
                "kind": kind_map.get(log.action, "other"),
                "title": log.get_action_display(),
                "description": log.summary,
                "occurred_at": log.created_at,
                "meta": log.changes,
            })
        for activity in prospect.activities.all()[:300]:
            events.append({
                "id": f"activity-{activity.id}",
                "kind": "activity",
                "title": activity.get_activity_type_display(),
                "description": activity.subject,
                "occurred_at": activity.occurred_at,
                "meta": {"outcome": activity.outcome, "activity_type": activity.activity_type,
                         "from_follow_up": activity.follow_up_id is not None},
            })
        tz = user_tz(request.user)
        for opp in prospect.opportunities.all():
            for field, title in (("application_submitted_date", "Application submitted"),
                                 ("policy_issued_date", "Policy issued")):
                value = getattr(opp, field)
                if value:
                    when = datetime.combine(value, time(9, 0), tzinfo=tz)
                    events.append({
                        "id": f"milestone-{opp.id}-{field}",
                        "kind": "milestone",
                        "title": title,
                        "description": opp.name,
                        "occurred_at": when,
                        "meta": {"opportunity_id": opp.id},
                    })
        events.sort(key=lambda event: event["occurred_at"], reverse=True)
        return Response(events)

    @action(detail=False, methods=["get"])
    def duplicates(self, request):
        matches = services.find_duplicates(
            user=request.user,
            mobile=request.query_params.get("mobile", ""),
            email=request.query_params.get("email", ""),
            exclude_id=request.query_params.get("exclude") or None,
        )
        data = []
        for prospect in matches:
            reasons = []
            if request.query_params.get("mobile") and prospect.mobile_normalized == normalize_phone(
                request.query_params["mobile"]
            ):
                reasons.append("mobile")
            if request.query_params.get("email") and prospect.email_normalized == normalize_email(
                request.query_params["email"]
            ):
                reasons.append("email")
            data.append({
                "id": prospect.id,
                "full_name": prospect.full_name,
                "mobile": prospect.mobile,
                "email": prospect.email,
                "status": prospect.status,
                "status_label": prospect.get_status_display(),
                "is_archived": prospect.is_archived,
                "matched_on": reasons,
            })
        return Response({"matches": data})

    @action(detail=False, methods=["get"])
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())[:10000]
        tz = user_tz(request.user)

        def fmt(value):
            return value.astimezone(tz).strftime("%Y-%m-%d %H:%M") if value else ""

        rows = [
            [
                p.first_name, p.last_name, p.preferred_name, p.mobile, p.email, p.occupation, p.company, p.location,
                p.source.name if p.source else "", "; ".join(i.name for i in p.insurance_interests.all()),
                p.get_status_display(), p.get_priority_display(), fmt(p.last_contacted_at), fmt(p.next_follow_up_at),
                fmt(p.created_at), "Yes" if p.is_archived else "No", "Yes" if p.do_not_contact else "No",
                "Demo" if p.is_demo else "",
            ]
            for p in queryset
        ]
        record(user=request.user, action=AuditAction.EXPORT, entity=None,
               summary=f"Exported {len(rows)} prospects to CSV",
               changes={"filters": {k: v for k, v in request.query_params.items()}})
        header = ["First Name", "Last Name", "Preferred Name", "Mobile", "Email", "Occupation", "Company",
                  "Location", "Source", "Insurance Interest", "Status", "Priority", "Last Contact",
                  "Next Follow-up", "Date Added", "Archived", "Do Not Contact", "Data Type"]
        stamp = timezone.now().astimezone(tz).strftime("%Y%m%d-%H%M")
        return csv_response(f"pruspect-prospects-{stamp}.csv", header, rows)

    @action(detail=False, methods=["post"])
    def bulk(self, request):
        serializer = BulkActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        prospects = list(Prospect.objects.filter(owner=request.user, pk__in=data["ids"]))
        updated = skipped = 0
        with transaction.atomic():
            for prospect in prospects:
                if data["action"] == "archive":
                    if prospect.is_archived:
                        skipped += 1
                        continue
                    services.archive_prospect(user=request.user, prospect=prospect)
                elif data["action"] == "restore":
                    if not prospect.is_archived:
                        skipped += 1
                        continue
                    services.restore_prospect(user=request.user, prospect=prospect)
                elif data["action"] == "set_priority":
                    if prospect.priority == data["value"]:
                        skipped += 1
                        continue
                    services.update_prospect(user=request.user, prospect=prospect, data={"priority": data["value"]})
                elif data["action"] == "set_status":
                    if prospect.status == data["value"] or prospect.is_archived:
                        skipped += 1
                        continue
                    services.change_status(user=request.user, prospect=prospect, new_status=data["value"],
                                           reason=data["reason"])
                updated += 1
        # Ids that don't exist or belong to someone else are silently counted as not found.
        return Response({"updated": updated, "skipped": skipped, "not_found": len(set(data["ids"])) - len(prospects)})

    @action(detail=False, methods=["get"], url_path="options")
    def form_options(self, request):
        """Choice lists the prospect form needs."""
        from .models import BudgetRange, ContactMethod, Priority
        from .statuses import stage_kind

        return Response({
            "statuses": [{"value": s.value, "label": s.label, "kind": stage_kind(s)} for s in ProspectStatus],
            "priorities": [{"value": p.value, "label": p.label} for p in Priority],
            "budget_ranges": [{"value": b.value, "label": b.label} for b in BudgetRange],
            "contact_methods": [{"value": c.value, "label": c.label} for c in ContactMethod],
            "sources": ProspectSourceSerializer(
                ProspectSource.objects.filter(owner=request.user), many=True, context={"request": request}
            ).data,
            "product_categories": ProductCategorySerializer(
                ProductCategory.objects.filter(owner=request.user), many=True, context={"request": request}
            ).data,
        })


class ProspectNoteViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                          mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Notes are editable (with revision history) but not deletable."""

    serializer_class = ProspectNoteSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["prospect"]

    def get_queryset(self):
        return ProspectNote.objects.filter(prospect__owner=self.request.user).select_related(
            "author", "prospect").prefetch_related(Prefetch("revisions"))


class _OwnedConfigViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    pagination_class = None
    model = None

    def get_queryset(self):
        return self.model.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        obj = serializer.save(owner=self.request.user)
        record(user=self.request.user, action=AuditAction.SETTINGS_CHANGED, entity=obj,
               summary=f"Added {self.model._meta.verbose_name} “{obj.name}”")

    def perform_update(self, serializer):
        obj = serializer.save()
        record(user=self.request.user, action=AuditAction.SETTINGS_CHANGED, entity=obj,
               summary=f"Updated {self.model._meta.verbose_name} “{obj.name}”")

    def perform_destroy(self, instance):
        # Deleting a choice in use would erase information on prospects; deactivate instead.
        in_use = (
            Prospect.objects.filter(source=instance).exists()
            if self.model is ProspectSource
            else instance.prospects.exists() or InsuranceOpportunity.objects.filter(product_category=instance).exists()
        )
        if in_use:
            raise ValidationError({"detail": ["This option is in use. Deactivate it instead of deleting."]})
        record(user=self.request.user, action=AuditAction.SETTINGS_CHANGED, entity=instance,
               summary=f"Deleted {self.model._meta.verbose_name} “{instance.name}”")
        instance.delete()


class ProspectSourceViewSet(_OwnedConfigViewSet):
    serializer_class = ProspectSourceSerializer
    model = ProspectSource


class ProductCategoryViewSet(_OwnedConfigViewSet):
    serializer_class = ProductCategorySerializer
    model = ProductCategory


class DemoDataView(APIView):
    """Count or permanently remove sample records created by `manage.py seed_demo`."""

    def get(self, request):
        return Response({"demo_prospects": Prospect.objects.filter(owner=request.user, is_demo=True).count()})

    def delete(self, request):
        with transaction.atomic():
            queryset = Prospect.objects.filter(owner=request.user, is_demo=True)
            count = queryset.count()
            queryset.delete()
            record(user=request.user, action=AuditAction.DEMO_DATA_REMOVED, entity=None,
                   summary=f"Removed {count} demo prospects", changes={"count": count})
        return Response({"deleted": count})
