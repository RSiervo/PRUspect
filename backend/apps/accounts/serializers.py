from zoneinfo import available_timezones

from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import User, UserSettings


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    time_zone = serializers.CharField(source="settings.time_zone", read_only=True)
    has_password = serializers.SerializerMethodField()
    google_linked = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "full_name", "job_title", "time_zone", "date_joined",
                  "is_staff", "has_password", "google_linked"]
        read_only_fields = ["id", "email", "date_joined", "is_staff"]

    def get_has_password(self, obj) -> bool:
        return obj.has_usable_password()

    def get_google_linked(self, obj) -> bool:
        return bool(obj.google_sub)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)


class GoogleLoginSerializer(serializers.Serializer):
    credential = serializers.CharField(max_length=4096, trim_whitespace=True)


class ChangePasswordSerializer(serializers.Serializer):
    """Google-only accounts (no usable password yet) may set one without a current password."""

    current_password = serializers.CharField(trim_whitespace=False, required=False, allow_blank=True, default="")
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if user.has_usable_password() and not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


_TIMEZONES = None


def _timezones():
    global _TIMEZONES
    if _TIMEZONES is None:
        _TIMEZONES = available_timezones()
    return _TIMEZONES


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ["time_zone", "currency", "default_reminder_minutes", "archive_retention_days", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_time_zone(self, value):
        if value not in _timezones():
            raise serializers.ValidationError("Choose a valid IANA timezone, e.g. Asia/Manila.")
        return value

    def validate_currency(self, value):
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use a 3-letter currency code such as PHP.")
        return value

    def validate_default_reminder_minutes(self, value):
        if value > 7 * 24 * 60:
            raise serializers.ValidationError("Reminder lead time cannot exceed 7 days.")
        return value
