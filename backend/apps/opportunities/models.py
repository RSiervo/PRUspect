"""Insurance opportunities. Estimated values are never treated as issued business.

- estimated_annual_premium: the advisor's estimate while the deal is open.
- actual_annualized_premium: verified figure, allowed only once the policy is issued.
"""

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from apps.common.models import TimeStampedModel
from apps.prospects.models import ProductCategory, Prospect


class OpportunityStage(models.TextChoices):
    IDENTIFIED = "identified", "Identified"
    PROPOSAL = "proposal", "Proposal / Presentation"
    APPLICATION_IN_PROGRESS = "application_in_progress", "Application In Progress"
    APPLICATION_SUBMITTED = "application_submitted", "Application Submitted"
    UNDERWRITING = "underwriting", "Underwriting"
    ISSUED = "issued", "Policy Issued"
    LOST = "lost", "Lost / Declined"


# Stages counted in the estimated pipeline value.
OPEN_STAGES = [
    OpportunityStage.IDENTIFIED,
    OpportunityStage.PROPOSAL,
    OpportunityStage.APPLICATION_IN_PROGRESS,
    OpportunityStage.APPLICATION_SUBMITTED,
    OpportunityStage.UNDERWRITING,
]
SUBMITTED_STAGES = [OpportunityStage.APPLICATION_SUBMITTED, OpportunityStage.UNDERWRITING, OpportunityStage.ISSUED]

class PremiumMode(models.TextChoices):
    ANNUAL = "annual", "Annual"
    SEMI_ANNUAL = "semi_annual", "Semi-annual"
    QUARTERLY = "quarterly", "Quarterly"
    MONTHLY = "monthly", "Monthly"


PREMIUM_MODE_MONTHS = {PremiumMode.ANNUAL: 12, PremiumMode.SEMI_ANNUAL: 6, PremiumMode.QUARTERLY: 3, PremiumMode.MONTHLY: 1}

_money = {"max_digits": 14, "decimal_places": 2, "validators": [MinValueValidator(Decimal("0"))]}


class InsuranceOpportunity(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="opportunities")
    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name="opportunities")
    name = models.CharField(max_length=160)
    product_category = models.ForeignKey(
        ProductCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="opportunities"
    )
    estimated_annual_premium = models.DecimalField(null=True, blank=True, **_money)
    currency = models.CharField(max_length=3, default="PHP")
    estimated_close_date = models.DateField(null=True, blank=True)
    stage = models.CharField(max_length=32, choices=OpportunityStage.choices, default=OpportunityStage.IDENTIFIED)
    application_reference = models.CharField(
        max_length=64, blank=True, help_text="Only if authorized and necessary."
    )
    application_submitted_date = models.DateField(null=True, blank=True)
    policy_issued_date = models.DateField(null=True, blank=True)
    actual_annualized_premium = models.DecimalField(null=True, blank=True, **_money)
    # Client servicing (issued policies only).
    premium_mode = models.CharField(max_length=16, choices=PremiumMode.choices, blank=True)
    next_premium_due_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "insurance opportunities"
        indexes = [
            models.Index(fields=["owner", "stage"]),
            models.Index(fields=["owner", "policy_issued_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(actual_annualized_premium__isnull=True) | Q(stage="issued"),
                name="opp_actual_premium_only_when_issued",
            ),
            models.CheckConstraint(
                condition=~Q(stage="issued") | Q(policy_issued_date__isnull=False),
                name="opp_issued_requires_date",
            ),
            models.CheckConstraint(condition=Q(stage__in=OpportunityStage.values), name="opp_stage_valid"),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def estimated_monthly_premium(self):
        if self.estimated_annual_premium is None:
            return None
        return (self.estimated_annual_premium / 12).quantize(Decimal("0.01"))
