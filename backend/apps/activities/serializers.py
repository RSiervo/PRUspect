from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.common.fields import OwnedPrimaryKeyRelatedField
from apps.prospects.brief import ProspectBriefSerializer
from apps.prospects.models import Prospect

from .models import APPOINTMENT_TYPES, Activity, FollowUp, FollowUpReschedule, FollowUpStatus


class FollowUpInputSerializer(serializers.Serializer):
    """Fields needed to schedule a follow-up (used inline and for 'next follow-up')."""

    activity_type = serializers.ChoiceField(choices=FollowUp._meta.get_field("activity_type").choices)
    subject = serializers.CharField(max_length=160)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    scheduled_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(required=False, min_value=5, max_value=24 * 60, default=30)
    priority = serializers.ChoiceField(choices=FollowUp._meta.get_field("priority").choices, required=False,
                                       default="medium")
    reminder_minutes = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=7 * 24 * 60)


class FollowUpRescheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowUpReschedule
        fields = ["id", "previous_scheduled_at", "new_scheduled_at", "reason", "created_at"]


class FollowUpSerializer(serializers.ModelSerializer):
    prospect = OwnedPrimaryKeyRelatedField(queryset=Prospect.objects.all())
    prospect_detail = ProspectBriefSerializer(source="prospect", read_only=True)
    activity_type_label = serializers.CharField(source="get_activity_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    bucket = serializers.SerializerMethodField()
    is_appointment = serializers.SerializerMethodField()
    reschedules = FollowUpRescheduleSerializer(many=True, read_only=True)

    class Meta:
        model = FollowUp
        fields = [
            "id", "prospect", "prospect_detail", "activity_type", "activity_type_label", "subject",
            "description", "scheduled_at", "duration_minutes", "priority", "status", "status_label",
            "outcome", "next_action", "completed_at", "canceled_at", "cancel_reason", "reminder_minutes",
            "bucket", "is_appointment", "reschedules", "created_at", "updated_at",
        ]
        read_only_fields = ["status", "outcome", "next_action", "completed_at", "canceled_at", "cancel_reason"]

    def get_bucket(self, obj) -> str:
        """overdue | today | upcoming | completed | canceled (in the user's timezone)."""
        if obj.status != FollowUpStatus.PENDING:
            return obj.status
        today_start, today_end = self.context["today_range"]
        if obj.scheduled_at < today_start:
            return "overdue"
        if obj.scheduled_at < today_end:
            return "today"
        return "upcoming"

    def get_is_appointment(self, obj) -> bool:
        return obj.activity_type in APPOINTMENT_TYPES

    def validate_prospect(self, prospect):
        if self.instance is not None and prospect != self.instance.prospect:
            raise serializers.ValidationError("A follow-up cannot be moved to another prospect.")
        if prospect.is_archived:
            raise serializers.ValidationError("Restore this prospect before scheduling follow-ups.")
        return prospect

    def validate(self, attrs):
        if self.instance is not None and "scheduled_at" in attrs and attrs["scheduled_at"] != self.instance.scheduled_at:
            raise serializers.ValidationError({"scheduled_at": ["Use reschedule to change the date or time."]})
        return attrs


class CompleteFollowUpSerializer(serializers.Serializer):
    outcome = serializers.CharField(required=False, allow_blank=True, default="", max_length=5000)
    next_action = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    completed_at = serializers.DateTimeField(required=False)
    next_follow_up = FollowUpInputSerializer(required=False, allow_null=True)

    def validate_completed_at(self, value):
        if value > timezone.now() + timedelta(minutes=5):
            raise serializers.ValidationError("Completion time cannot be in the future.")
        return value


class RescheduleSerializer(serializers.Serializer):
    scheduled_at = serializers.DateTimeField()
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)


class ActivitySerializer(serializers.ModelSerializer):
    prospect = OwnedPrimaryKeyRelatedField(queryset=Prospect.objects.all())
    prospect_detail = ProspectBriefSerializer(source="prospect", read_only=True)
    activity_type_label = serializers.CharField(source="get_activity_type_display", read_only=True)

    class Meta:
        model = Activity
        fields = [
            "id", "prospect", "prospect_detail", "activity_type", "activity_type_label", "subject",
            "description", "outcome", "occurred_at", "follow_up", "counts_as_contact", "created_at",
        ]
        read_only_fields = ["follow_up", "counts_as_contact"]

    def validate_occurred_at(self, value):
        if value > timezone.now() + timedelta(minutes=5):
            raise serializers.ValidationError("Logged activities must have already happened. Schedule a follow-up instead.")
        return value
