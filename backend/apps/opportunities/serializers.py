from datetime import date

from rest_framework import serializers

from apps.common.fields import OwnedPrimaryKeyRelatedField
from apps.prospects.brief import ProspectBriefSerializer
from apps.prospects.models import ProductCategory, Prospect

from .models import SUBMITTED_STAGES, InsuranceOpportunity, OpportunityStage


class OpportunitySerializer(serializers.ModelSerializer):
    prospect = OwnedPrimaryKeyRelatedField(queryset=Prospect.objects.all())
    prospect_detail = ProspectBriefSerializer(source="prospect", read_only=True)
    product_category = OwnedPrimaryKeyRelatedField(
        queryset=ProductCategory.objects.all(), allow_null=True, required=False
    )
    product_category_name = serializers.CharField(source="product_category.name", read_only=True, default="")
    stage_label = serializers.CharField(source="get_stage_display", read_only=True)
    estimated_monthly_premium = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = InsuranceOpportunity
        fields = [
            "id", "prospect", "prospect_detail", "name", "product_category", "product_category_name",
            "estimated_annual_premium", "estimated_monthly_premium", "currency", "estimated_close_date", "stage",
            "stage_label", "application_reference", "application_submitted_date", "policy_issued_date",
            "actual_annualized_premium", "notes", "created_at", "updated_at",
        ]

    def validate_prospect(self, prospect):
        if self.instance is not None and prospect != self.instance.prospect:
            raise serializers.ValidationError("An opportunity cannot be moved to another prospect.")
        return prospect

    def validate_currency(self, value):
        value = (value or "PHP").upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use a 3-letter currency code such as PHP.")
        return value

    def validate(self, attrs):
        def current(field):
            return attrs.get(field, getattr(self.instance, field, None) if self.instance else None)

        stage = current("stage") or OpportunityStage.IDENTIFIED
        submitted = current("application_submitted_date")
        issued = current("policy_issued_date")
        errors = {}
        today = date.today()

        if stage in SUBMITTED_STAGES and not submitted:
            errors["application_submitted_date"] = ["Enter the application submission date for this stage."]
        if submitted and submitted > today:
            errors["application_submitted_date"] = ["Submission date cannot be in the future."]
        if stage == OpportunityStage.ISSUED:
            if not issued:
                errors["policy_issued_date"] = ["Enter the policy issuance date."]
            elif issued > today:
                errors["policy_issued_date"] = ["Issuance date cannot be in the future."]
            elif submitted and issued < submitted:
                errors["policy_issued_date"] = ["Issuance date cannot be before the submission date."]
        else:
            # Verified figures only exist for issued policies.
            if attrs.get("actual_annualized_premium") is not None:
                errors["actual_annualized_premium"] = ["Actual premium can only be recorded once the policy is issued."]
            attrs["actual_annualized_premium"] = None
            attrs["policy_issued_date"] = None
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
