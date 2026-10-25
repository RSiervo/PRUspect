"""In-app notifications only. No email or SMS is sent by this system."""

from django.conf import settings
from django.db import models
from django.db.models import Q


class NotificationKind(models.TextChoices):
    REMINDER = "reminder", "Follow-up reminder"
    OVERDUE = "overdue", "Follow-up overdue"
    SYSTEM = "system", "System"


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=16, choices=NotificationKind.choices)
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=255, blank=True)
    link = models.CharField(max_length=255, blank=True, help_text="Frontend route, e.g. /prospects/12")
    follow_up = models.ForeignKey(
        "activities.FollowUp", on_delete=models.CASCADE, null=True, blank=True, related_name="notifications"
    )
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "read_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["follow_up", "kind"],
                condition=Q(follow_up__isnull=False),
                name="uniq_notification_per_followup_kind",
            )
        ]

    def __str__(self) -> str:
        return self.title
