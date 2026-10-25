from zoneinfo import available_timezones

from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import User, UserSettings


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    time_zone = serializers.CharField(source="settings.time_zone", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "full_name", "job_title", "time_zone", "date_joined",
                  "is_staff"]
        read_only_fields = ["id", "email", "date_joined", "is_staff"]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
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
