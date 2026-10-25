from rest_framework.response import Response
from rest_framework.views import APIView

from apps.activities.models import FollowUp, FollowUpStatus
from apps.activities.serializers import FollowUpSerializer
from apps.activities.views import today_bounds
from apps.audit.models import AuditAction, AuditLog

from . import metrics

FEED_ACTIONS = [
    AuditAction.PROSPECT_CREATED, AuditAction.PROSPECT_STATUS_CHANGED, AuditAction.FOLLOWUP_COMPLETED,
    AuditAction.FOLLOWUP_CREATED, AuditAction.FOLLOWUP_RESCHEDULED, AuditAction.ACTIVITY_LOGGED,
    AuditAction.OPPORTUNITY_CREATED, AuditAction.OPPORTUNITY_UPDATED, AuditAction.PROSPECT_ARCHIVED,
    AuditAction.PROSPECT_RESTORED, AuditAction.NOTE_ADDED,
]


class SummaryView(APIView):
    def get(self, request):
        data = metrics.summary(request.user)
        data["conversion"] = metrics.conversion(request.user)
        return Response(data)


class PipelineSummaryView(APIView):
    def get(self, request):
        return Response({"stages": metrics.pipeline_counts(request.user)})


class PerformanceView(APIView):
    def get(self, request):
        period = "quarterly" if request.query_params.get("period") == "quarterly" else "monthly"
        return Response(metrics.performance(request.user, period))


class ActivityFeedView(APIView):
    """Recent activity plus the follow-up worklist (overdue first, then upcoming)."""

    def get(self, request):
        logs = (
            AuditLog.objects.filter(user=request.user, action__in=FEED_ACTIONS)
            .select_related("prospect")
            .order_by("-created_at")[:12]
        )
        recent = [
            {
                "id": log.id,
                "action": log.action,
                "action_label": log.get_action_display(),
                "summary": log.summary,
                "created_at": log.created_at,
                "prospect": (
                    {"id": log.prospect_id, "full_name": log.prospect.full_name}
                    if log.prospect and not log.prospect.is_archived else None
                ),
            }
            for log in logs
        ]
        start, _ = today_bounds(request.user)
        base = FollowUp.objects.filter(
            owner=request.user, status=FollowUpStatus.PENDING, prospect__is_archived=False
        ).select_related("prospect")
        context = {"request": request, "today_range": today_bounds(request.user)}
        overdue = FollowUpSerializer(base.filter(scheduled_at__lt=start).order_by("scheduled_at")[:5], many=True,
                                     context=context).data
        upcoming = FollowUpSerializer(base.filter(scheduled_at__gte=start).order_by("scheduled_at")[:6], many=True,
                                      context=context).data
        return Response({"recent": recent, "overdue": overdue, "upcoming": upcoming})
