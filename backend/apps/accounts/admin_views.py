"""Admin-only user management (is_staff accounts).

Admins see who has an account and how much they use it — counts only, never the
content of anyone's prospects — and can deactivate or reactivate accounts.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count, F, Q
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.audit.models import AuditAction
from apps.audit.services import record

from .models import User


class AdminUserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    sign_in_methods = serializers.SerializerMethodField()
    prospect_count = serializers.IntegerField(read_only=True)
    open_follow_up_count = serializers.IntegerField(read_only=True)
    is_self = serializers.SerializerMethodField()
    manager = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "first_name", "last_name", "is_active", "is_staff", "is_superuser",
                  "date_joined", "last_login", "sign_in_methods", "prospect_count", "open_follow_up_count", "is_self", "manager"]
        read_only_fields = fields

    def get_sign_in_methods(self, obj) -> list[str]:
        methods = []
        if obj.google_sub:
            methods.append("google")
        if obj.has_usable_password():
            methods.append("password")
        return methods

    def get_manager(self, obj):
        return {"id": obj.manager_id, "full_name": obj.manager.full_name} if obj.manager_id else None

    def get_is_self(self, obj) -> bool:
        return obj.pk == self.context["request"].user.pk


class AdminUserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminUser]
    filter_backends = []

    ORDERING = {
        "joined": "-date_joined", "-joined": "date_joined",
        "last_login": "-last_login", "-last_login": "last_login",
        "email": "email", "-email": "-email",
        "prospects": "-prospect_count", "-prospects": "prospect_count",
    }

    def get_queryset(self):
        queryset = User.objects.select_related("manager").annotate(
            prospect_count=Count("prospects", filter=Q(prospects__is_archived=False), distinct=True),
            open_follow_up_count=Count("follow_ups", filter=Q(follow_ups__status="pending"), distinct=True),
        )
        params = self.request.query_params
        search = params.get("search", "").strip()
        if search:
            condition = Q()
            for term in search.split():
                condition &= Q(email__icontains=term) | Q(first_name__icontains=term) | Q(last_name__icontains=term)
            queryset = queryset.filter(condition)
        status_filter = params.get("status")
        if status_filter == "active":
            queryset = queryset.filter(is_active=True)
        elif status_filter == "inactive":
            queryset = queryset.filter(is_active=False)
        method = params.get("method")
        if method == "google":
            queryset = queryset.filter(google_sub__isnull=False)
        elif method == "password":
            queryset = queryset.filter(google_sub__isnull=True)
        order = self.ORDERING.get(params.get("ordering", "joined"), "-date_joined")
        field = F(order.lstrip("-"))
        sort = field.desc(nulls_last=True) if order.startswith("-") else field.asc(nulls_last=True)
        return queryset.order_by(sort, "-id")

    @action(detail=False, methods=["get"])
    def summary(self, request):
        now = timezone.now()
        week_ago = now - timedelta(days=7)
        data = User.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
            google=Count("id", filter=Q(google_sub__isnull=False)),
            new_this_week=Count("id", filter=Q(date_joined__gte=week_ago)),
            signed_in_this_week=Count("id", filter=Q(last_login__gte=week_ago)),
        )
        return Response(data)

    def _set_active(self, request, active: bool):
        target = self.get_object()
        if target.pk == request.user.pk:
            raise ValidationError({"detail": ["You can't deactivate your own account."]})
        if target.is_superuser and not request.user.is_superuser:
            raise PermissionDenied("Only a superuser can change another superuser.")
        if target.is_active == active:
            return Response(self.get_serializer(self.get_queryset().get(pk=target.pk)).data)
        with transaction.atomic():
            target.is_active = active
            target.save(update_fields=["is_active"])
            if not active:
                # End their sessions now: refresh tokens stop working immediately, and
                # access tokens are rejected for inactive users on the next request.
                for token in OutstandingToken.objects.filter(user=target):
                    BlacklistedToken.objects.get_or_create(token=token)
            record(
                user=request.user,
                action=AuditAction.USER_REACTIVATED if active else AuditAction.USER_DEACTIVATED,
                entity=target,
                summary=f"{'Reactivated' if active else 'Deactivated'} account {target.email}",
            )
        return Response(self.get_serializer(self.get_queryset().get(pk=target.pk)).data)

    @action(detail=True, methods=["post"], url_path="manager")
    def set_manager(self, request, pk=None):
        """Assign (or clear) this user's manager. Prevents self-management and loops."""
        target = self.get_object()
        manager_id = request.data.get("manager_id")
        manager = None
        if manager_id not in (None, ""):
            manager = User.objects.filter(pk=manager_id, is_active=True).first()
            if manager is None:
                raise ValidationError({"manager_id": ["Choose an active user."]})
            if manager.pk == target.pk:
                raise ValidationError({"manager_id": ["A user cannot be their own manager."]})
            cursor, seen = manager, set()
            while cursor is not None and cursor.pk not in seen:
                if cursor.pk == target.pk:
                    raise ValidationError({"manager_id": ["That would create a loop: this user already manages them."]})
                seen.add(cursor.pk)
                cursor = cursor.manager
        previous = target.manager
        target.manager = manager
        target.save(update_fields=["manager"])
        record(user=request.user, action=AuditAction.SETTINGS_CHANGED, entity=target,
               summary=f"Set manager of {target.email} to {manager.email if manager else 'nobody'}",
               changes={"manager": [previous.email if previous else None, manager.email if manager else None]})
        return Response(self.get_serializer(self.get_queryset().get(pk=target.pk)).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        return self._set_active(request, False)

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        return self._set_active(request, True)
