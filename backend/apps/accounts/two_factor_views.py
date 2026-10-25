from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.models import AuditAction
from apps.audit.services import record

from . import two_factor


class CodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


class VerifySerializer(CodeSerializer):
    challenge = serializers.CharField(max_length=500)


def _wrong_code() -> Response:
    return Response({"detail": "That code isn’t right. Check the time on your phone and try again.", "code": "invalid_code",
                     "errors": {"code": ["That code isn’t right."]}}, status=status.HTTP_400_BAD_REQUEST)


class _Throttled(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"


class TwoFactorStatusView(APIView):
    def get(self, request):
        user = request.user
        return Response({
            "enabled": user.two_factor_enabled,
            "required": two_factor.is_required(user),
            "recovery_codes_left": len(user.recovery_codes or []) if user.two_factor_enabled else 0,
        })


class TwoFactorSetupView(_Throttled):
    def post(self, request):
        if request.user.two_factor_enabled:
            return Response({"detail": "Two-step verification is already on.", "code": "already_enabled", "errors": {}},
                            status=status.HTTP_409_CONFLICT)
        return Response(two_factor.start_setup(request.user))


class TwoFactorConfirmView(_Throttled):
    def post(self, request):
        serializer = CodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = two_factor.confirm_setup(request.user, serializer.validated_data["code"])
        if codes is None:
            return _wrong_code()
        record(user=request.user, action=AuditAction.TWO_FACTOR_ENABLED, entity=request.user,
               summary="Turned on two-step verification")
        return Response({"enabled": True, "recovery_codes": codes})


class TwoFactorDisableView(_Throttled):
    def post(self, request):
        serializer = CodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.two_factor_enabled:
            return Response({"enabled": False})
        if not two_factor.verify(request.user, serializer.validated_data["code"]):
            return _wrong_code()
        two_factor.disable(request.user)
        record(user=request.user, action=AuditAction.TWO_FACTOR_DISABLED, entity=request.user,
               summary="Turned off two-step verification")
        return Response({"enabled": False})


class RecoveryCodesView(_Throttled):
    def post(self, request):
        serializer = CodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.two_factor_enabled or not two_factor.verify(request.user, serializer.validated_data["code"], allow_recovery=False):
            return _wrong_code()
        codes = two_factor.new_recovery_codes(request.user)
        record(user=request.user, action=AuditAction.RECOVERY_CODES_RENEWED, entity=request.user,
               summary="Replaced two-step verification recovery codes")
        return Response({"recovery_codes": codes})


class TwoFactorVerifyView(_Throttled):
    """Second sign-in step: challenge (from login) + code from the app or a recovery code."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from .views import _error, _signed_in_response

        serializer = VerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = two_factor.read_challenge(serializer.validated_data["challenge"])
        if user is None:
            return _error("This sign-in expired. Please sign in again.", "challenge_expired", status.HTTP_401_UNAUTHORIZED)
        before = len(user.recovery_codes or [])
        if not two_factor.verify(user, serializer.validated_data["code"]):
            return _wrong_code()
        left = len(user.recovery_codes or [])
        return _signed_in_response(user, recovery_code_used=left < before, recovery_codes_left=left)
