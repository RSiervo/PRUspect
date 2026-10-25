"""Authentication.

- Access token (15 min) is returned in the response body and kept in memory by the SPA.
- Refresh token is set as an HttpOnly, SameSite cookie scoped to /api/v1/auth/.
- Refresh and logout also require the `X-Requested-With: XMLHttpRequest` header so a
  cross-site form cannot trigger them (a custom header forces a CORS preflight).
- Refresh tokens rotate on every use; the old one is blacklisted. Logout blacklists the
  current refresh token and clears the cookie.
"""

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.audit.models import AuditAction
from apps.audit.services import diff, record

from .models import User, UserSettings
from .serializers import ChangePasswordSerializer, LoginSerializer, UserSerializer, UserSettingsSerializer


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path=settings.AUTH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.AUTH_COOKIE_NAME, path=settings.AUTH_COOKIE_PATH,
                           samesite=settings.AUTH_COOKIE_SAMESITE)


def _has_ajax_header(request) -> bool:
    return request.headers.get("X-Requested-With") == "XMLHttpRequest"


def _error(message: str, code: str, http_status: int) -> Response:
    return Response({"detail": message, "code": code, "errors": {}}, status=http_status)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            email=serializer.validated_data["email"].strip().lower(),
            password=serializer.validated_data["password"],
        )
        if user is None or not user.is_active:
            return _error("Incorrect email or password.", "invalid_credentials", status.HTTP_401_UNAUTHORIZED)
        refresh = RefreshToken.for_user(user)
        update_last_login(None, user)
        response = Response({"access": str(refresh.access_token), "user": UserSerializer(user).data})
        _set_refresh_cookie(response, str(refresh))
        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_refresh"

    def post(self, request):
        if not _has_ajax_header(request):
            return _error("Missing required header.", "csrf_failed", status.HTTP_403_FORBIDDEN)
        token = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if not token:
            return _error("Not signed in.", "not_authenticated", status.HTTP_401_UNAUTHORIZED)
        serializer = TokenRefreshSerializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError, ValidationError):
            response = _error("Your session has expired. Please sign in again.", "token_invalid",
                              status.HTTP_401_UNAUTHORIZED)
            _clear_refresh_cookie(response)
            return response
        access = serializer.validated_data["access"]
        user = User.objects.filter(pk=AccessToken(access)["user_id"], is_active=True).first()
        if user is None:
            response = _error("Account unavailable.", "token_invalid", status.HTTP_401_UNAUTHORIZED)
            _clear_refresh_cookie(response)
            return response
        response = Response({"access": access, "user": UserSerializer(user).data})
        if "refresh" in serializer.validated_data:
            _set_refresh_cookie(response, serializer.validated_data["refresh"])
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not _has_ajax_header(request):
            return _error("Missing required header.", "csrf_failed", status.HTTP_403_FORBIDDEN)
        token = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass  # already expired or blacklisted
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            request.user.set_password(serializer.validated_data["new_password"])
            request.user.save(update_fields=["password"])
            # Sign out other sessions by blacklisting every outstanding refresh token.
            for outstanding in OutstandingToken.objects.filter(user=request.user):
                BlacklistedToken.objects.get_or_create(token=outstanding)
            record(user=request.user, action=AuditAction.PASSWORD_CHANGED, entity=request.user,
                   summary="Changed account password")
        refresh = RefreshToken.for_user(request.user)
        response = Response({"access": str(refresh.access_token)})
        _set_refresh_cookie(response, str(refresh))
        return response


class SettingsView(APIView):
    def _settings(self, user):
        obj, _ = UserSettings.objects.get_or_create(user=user)
        return obj

    def get(self, request):
        return Response(UserSettingsSerializer(self._settings(request.user)).data)

    def patch(self, request):
        obj = self._settings(request.user)
        before = UserSettingsSerializer(obj).data
        serializer = UserSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        after = dict(serializer.data)
        before.pop("updated_at", None)
        after.pop("updated_at", None)
        changes = diff(dict(before), after)
        if changes:
            record(user=request.user, action=AuditAction.SETTINGS_CHANGED, entity=obj,
                   summary=f"Changed settings: {', '.join(sorted(changes))}", changes=changes)
        return Response(serializer.data)
