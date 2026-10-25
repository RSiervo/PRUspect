from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import IsVerifiedAdmin

from .models import ErrorEvent, ErrorSource
from .services import capture


class ClientErrorSerializer(serializers.Serializer):
    error_type = serializers.CharField(max_length=200, required=False, allow_blank=True)
    message = serializers.CharField(max_length=2000)
    stack = serializers.CharField(max_length=20000, required=False, allow_blank=True)
    path = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ClientErrorReportView(APIView):
    """Browsers report JavaScript crashes here. Works signed in or out; rate limited."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "client_errors"

    def post(self, request):
        serializer = ClientErrorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        capture(source=ErrorSource.BROWSER, error_type=data.get("error_type") or "Error", message=data["message"],
                location=data.get("path", ""), stack=data.get("stack", ""), user=request.user)
        return Response(status=204)


class ErrorEventSerializer(serializers.ModelSerializer):
    last_user_email = serializers.EmailField(source="last_user.email", read_only=True, default=None)
    is_resolved = serializers.SerializerMethodField()

    class Meta:
        model = ErrorEvent
        fields = ["id", "source", "error_type", "message", "location", "stack", "release", "count", "users_affected",
                  "last_user_email", "first_seen", "last_seen", "resolved_at", "is_resolved"]
        read_only_fields = fields

    def get_is_resolved(self, obj) -> bool:
        return obj.resolved_at is not None


class ErrorEventViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsVerifiedAdmin]
    serializer_class = ErrorEventSerializer

    def get_queryset(self):
        queryset = ErrorEvent.objects.select_related("last_user")
        status = self.request.query_params.get("status", "open")
        if status == "open":
            queryset = queryset.filter(resolved_at__isnull=True)
        elif status == "resolved":
            queryset = queryset.filter(resolved_at__isnull=False)
        source = self.request.query_params.get("source")
        if source in ErrorSource.values:
            queryset = queryset.filter(source=source)
        return queryset

    @action(detail=False, methods=["get"])
    def summary(self, request):
        day_ago = timezone.now() - timedelta(hours=24)
        open_errors = ErrorEvent.objects.filter(resolved_at__isnull=True)
        return Response({
            "open": open_errors.count(),
            "seen_last_24h": ErrorEvent.objects.filter(last_seen__gte=day_ago).count(),
            "occurrences_open": open_errors.aggregate(total=Sum("count"))["total"] or 0,
            "last_error_at": ErrorEvent.objects.order_by("-last_seen").values_list("last_seen", flat=True).first(),
        })

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        event = self.get_object()
        event.resolved_at = timezone.now()
        event.save(update_fields=["resolved_at"])
        return Response(self.get_serializer(event).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        event = self.get_object()
        event.resolved_at = None
        event.save(update_fields=["resolved_at"])
        return Response(self.get_serializer(event).data)

    @action(detail=False, methods=["post"], url_path="resolve-all")
    def resolve_all(self, request):
        updated = ErrorEvent.objects.filter(resolved_at__isnull=True).update(resolved_at=timezone.now())
        return Response({"resolved": updated})

    @action(detail=False, methods=["post"], url_path="test-alert")
    def test_alert(self, request):
        """Checks the whole alert path (notification + phone push) without a real crash."""
        ErrorEvent.objects.filter(error_type="TestAlert").delete()  # a fresh event always alerts
        event = capture(source=ErrorSource.SERVER, error_type="TestAlert", message="This is a test alert. You can resolve it.",
                        location="POST /api/v1/admin/errors/test-alert/", user=request.user)
        from .services import email_enabled

        return Response({"id": event.pk if event else None, "email_enabled": email_enabled()}, status=201)
