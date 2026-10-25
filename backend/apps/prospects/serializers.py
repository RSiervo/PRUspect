from datetime import date

from django.db import transaction
from rest_framework import serializers

from apps.activities.serializers import FollowUpInputSerializer
from apps.common.fields import OwnedPrimaryKeyRelatedField
from apps.common.normalize import normalize_phone

from . import services
from .models import (
    ProductCategory,
    Prospect,
    ProspectNote,
    ProspectNoteRevision,
    ProspectSource,
    ProspectStatusHistory,
)
from .statuses import ProspectStatus, stage_kind


class ProspectSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProspectSource
        fields = ["id", "name", "is_active", "sort_order"]

    def validate_name(self, value):
        value = value.strip()
        owner = self.context["request"].user
        clash = ProspectSource.objects.filter(owner=owner, name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A source with this name already exists.")
        return value


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "name", "description", "is_active", "sort_order"]

    def validate_name(self, value):
        value = value.strip()
        owner = self.context["request"].user
        clash = ProductCategory.objects.filter(owner=owner, name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return value


class _NamedSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class ProspectListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    source = _NamedSerializer(read_only=True)
    insurance_interests = _NamedSerializer(many=True, read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    stage_kind = serializers.SerializerMethodField()
    next_follow_up_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = Prospect
        fields = [
            "id", "first_name", "last_name", "preferred_name", "full_name", "mobile", "email", "occupation",
            "company", "location", "source", "insurance_interests", "status", "status_label", "stage_kind",
            "priority", "last_contacted_at", "next_follow_up_at", "created_at", "is_archived", "is_demo",
            "do_not_contact",
        ]
        read_only_fields = fields

    def get_stage_kind(self, obj) -> str:
        return stage_kind(obj.status)


class ProspectDetailSerializer(ProspectListSerializer):
    source_id = serializers.IntegerField(read_only=True, allow_null=True)
    budget_range_label = serializers.CharField(source="get_budget_range_display", read_only=True)
    preferred_contact_method_label = serializers.CharField(
        source="get_preferred_contact_method_display", read_only=True
    )

    class Meta(ProspectListSerializer.Meta):
        fields = ProspectListSerializer.Meta.fields + [
            "source_id", "birth_date", "referral_name", "existing_coverage", "budget_range", "budget_range_label",
            "notes", "consent_obtained", "consent_date", "consent_source", "preferred_contact_method",
            "preferred_contact_method_label", "status_changed_at", "qualified_at", "application_submitted_at",
            "policy_issued_at", "archived_at", "updated_at",
        ]
        read_only_fields = fields


class ProspectWriteSerializer(serializers.ModelSerializer):
    source = OwnedPrimaryKeyRelatedField(queryset=ProspectSource.objects.all(), allow_null=True, required=False)
    insurance_interests = OwnedPrimaryKeyRelatedField(
        queryset=ProductCategory.objects.all(), many=True, required=False
    )
    status = serializers.ChoiceField(choices=ProspectStatus.choices, required=False)
    initial_follow_up = FollowUpInputSerializer(required=False, allow_null=True, write_only=True)

    class Meta:
        model = Prospect
        fields = [
            "first_name", "last_name", "preferred_name", "mobile", "email", "birth_date", "occupation", "company",
            "location", "source", "referral_name", "insurance_interests", "existing_coverage", "budget_range",
            "priority", "status", "notes", "consent_obtained", "consent_date", "consent_source",
            "preferred_contact_method", "do_not_contact", "initial_follow_up",
        ]

    def validate_first_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("First name is required.")
        return value

    def validate_last_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Last name is required.")
        return value

    def validate_mobile(self, value):
        value = (value or "").strip()
        if value:
            digits = normalize_phone(value)
            if not 7 <= len(digits) <= 15:
                raise serializers.ValidationError("Enter a valid phone number, e.g. 0917 123 4567.")
        return value

    def validate_birth_date(self, value):
        if value and value > date.today():
            raise serializers.ValidationError("Birth date cannot be in the future.")
        if value and value.year < 1900:
            raise serializers.ValidationError("Enter a valid birth date.")
        return value

    def validate_consent_date(self, value):
        if value and value > date.today():
            raise serializers.ValidationError("Consent date cannot be in the future.")
        return value

    def validate(self, attrs):
        mobile = attrs.get("mobile", getattr(self.instance, "mobile", ""))
        email = attrs.get("email", getattr(self.instance, "email", ""))
        if not mobile and not email:
            raise serializers.ValidationError({"mobile": ["Provide a mobile number or an email address."]})
        if self.instance is not None and "status" in attrs:
            raise serializers.ValidationError({"status": ["Use the change-status action to update status."]})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from apps.activities.services import create_follow_up

        user = self.context["request"].user
        interests = validated_data.pop("insurance_interests", None)
        follow_up = validated_data.pop("initial_follow_up", None)
        prospect = services.create_prospect(user=user, data=validated_data, interests=interests)
        if follow_up:
            create_follow_up(user=user, prospect=prospect, data=dict(follow_up))
        return prospect

    def update(self, instance, validated_data):
        validated_data.pop("initial_follow_up", None)
        interests = validated_data.pop("insurance_interests", None)
        return services.update_prospect(
            user=self.context["request"].user, prospect=instance, data=validated_data, interests=interests
        )


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ProspectStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=500)


class StatusHistorySerializer(serializers.ModelSerializer):
    from_status_label = serializers.SerializerMethodField()
    to_status_label = serializers.CharField(source="get_to_status_display", read_only=True)
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProspectStatusHistory
        fields = ["id", "from_status", "from_status_label", "to_status", "to_status_label", "reason",
                  "is_reopen", "changed_by_name", "changed_at"]

    def get_from_status_label(self, obj) -> str:
        return obj.get_from_status_display() if obj.from_status else ""

    def get_changed_by_name(self, obj) -> str:
        return obj.changed_by.full_name if obj.changed_by else "Deleted user"


class NoteRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProspectNoteRevision
        fields = ["id", "previous_body", "edited_at"]


class ProspectNoteSerializer(serializers.ModelSerializer):
    prospect = OwnedPrimaryKeyRelatedField(queryset=Prospect.objects.all())
    author_name = serializers.SerializerMethodField()
    revisions = NoteRevisionSerializer(many=True, read_only=True)

    class Meta:
        model = ProspectNote
        fields = ["id", "prospect", "body", "author_name", "is_edited", "revisions", "created_at", "updated_at"]
        read_only_fields = ["is_edited"]

    def get_author_name(self, obj) -> str:
        return obj.author.full_name if obj.author else "Deleted user"

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Note cannot be empty.")
        return value

    def validate_prospect(self, prospect):
        if self.instance is not None and prospect != self.instance.prospect:
            raise serializers.ValidationError("Notes cannot be moved to another prospect.")
        return prospect

    def create(self, validated_data):
        return services.add_note(user=self.context["request"].user, prospect=validated_data["prospect"],
                                 body=validated_data["body"])

    def update(self, instance, validated_data):
        return services.edit_note(user=self.context["request"].user, note=instance,
                                  body=validated_data.get("body", instance.body))


class BulkActionSerializer(serializers.Serializer):
    ACTIONS = ["archive", "restore", "set_priority", "set_status"]
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1, max_length=200)
    action = serializers.ChoiceField(choices=ACTIONS)
    value = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=500)

    def validate(self, attrs):
        if attrs["action"] == "set_priority" and attrs["value"] not in {"high", "medium", "low"}:
            raise serializers.ValidationError({"value": ["Choose high, medium or low."]})
        if attrs["action"] == "set_status" and attrs["value"] not in ProspectStatus.values:
            raise serializers.ValidationError({"value": ["Choose a valid status."]})
        return attrs
