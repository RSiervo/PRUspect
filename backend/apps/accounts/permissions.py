from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from .two_factor import is_required


class TwoFactorRequired(PermissionDenied):
    default_detail = "Turn on two-step verification in Settings → Profile & security to use admin pages."
    default_code = "two_factor_required"


class IsVerifiedAdmin(BasePermission):
    """Admin (is_staff) who has two-step verification on (when ADMIN_REQUIRE_2FA is set)."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_staff):
            return False
        if is_required(user) and not user.two_factor_enabled:
            raise TwoFactorRequired()
        return True
