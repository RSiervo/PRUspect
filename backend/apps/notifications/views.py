from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .services import generate_for_user


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "is_read", "read_at", "created_at"]

    def get_is_read(self, obj) -> bool:
        return obj.read_at is not None


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        queryset = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread") == "true":
            queryset = queryset.filter(read_at__isnull=True)
        return queryset.order_by("-created_at", "-id")

    def list(self, request, *args, **kwargs):
        generate_for_user(request.user)
        response = super().list(request, *args, **kwargs)
        response.data["unread_count"] = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
        return response

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        updated = Notification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"updated": updated})


class PushConfigView(APIView):
    def get(self, request):
        from django.conf import settings

        from .models import PushSubscription
        from .push import push_enabled

        return Response({
            "enabled": push_enabled(),
            "public_key": settings.VAPID_PUBLIC_KEY or None,
            "devices": PushSubscription.objects.filter(user=request.user).count(),
        })


class PushSubscribeView(APIView):
    def post(self, request):
        from rest_framework.exceptions import ValidationError

        from .models import PushSubscription

        data = request.data.get("subscription") or {}
        endpoint = str(data.get("endpoint") or "")
        keys = data.get("keys") or {}
        if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
            raise ValidationError({"subscription": ["Invalid push subscription."]})
        PushSubscription.objects.update_or_create(
            endpoint=endpoint[:1000],
            defaults={"user": request.user, "p256dh": str(keys["p256dh"])[:200], "auth": str(keys["auth"])[:100],
                      "user_agent": request.headers.get("User-Agent", "")[:255], "failures": 0},
        )
        return Response({"subscribed": True}, status=201)

    def delete(self, request):
        from .models import PushSubscription

        endpoint = str(request.data.get("endpoint") or "")
        deleted, _ = PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response({"deleted": deleted})


class PushTestView(APIView):
    def post(self, request):
        from .push import push_enabled, send_to_user

        if not push_enabled():
            return Response({"detail": "Push isn't configured on the server yet.", "code": "push_disabled", "errors": {}}, status=503)
        sent = send_to_user(request.user, "PRUspect notifications are on", "You'll get reminders for follow-ups and clients here.", "/")
        return Response({"delivered": sent})
