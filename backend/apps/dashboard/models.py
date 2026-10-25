from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class MonthlyGoal(models.Model):
    """The user's targets for one calendar month (month = first day of that month)."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="monthly_goals")
    month = models.DateField()
    new_prospects = models.PositiveIntegerField(null=True, blank=True)
    appointments = models.PositiveIntegerField(null=True, blank=True)
    policies = models.PositiveIntegerField(null=True, blank=True)
    issued_premium = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True,
                                         validators=[MinValueValidator(Decimal("0"))])
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-month"]
        constraints = [models.UniqueConstraint(fields=["owner", "month"], name="uniq_goal_per_owner_month")]

    def __str__(self) -> str:
        return f"Goals {self.month:%Y-%m} for {self.owner}"
