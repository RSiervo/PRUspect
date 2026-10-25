"""Follow-ups are future tasks; Activities are the historical interaction log.

Completing a follow-up creates an Activity so the timeline keeps the record
even if the follow-up is later edited. Rescheduling updates the same
follow-up row (one calendar entry, never a duplicate) and stores the previous
time in FollowUpReschedule.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import TimeStampedModel
from apps.prospects.models import Priority, Prospect


class ActivityType(models.TextChoices):
    CALL = "call", "Phone Call"
    SMS = "sms", "Text Message"
    EMAIL = "email", "Email"
    ONLINE_MEETING = "online_meeting", "Online Meeting"
    IN_PERSON_MEETING = "in_person_meeting", "In-Person Meeting"
    PRESENTATION = "presentation", "Insurance Presentation"
    DOCUMENT = "document", "Document Follow-up"
    OTHER = "other", "Other"


# Completing one of these counts as contacting the prospect (updates last contact).
CONTACT_TYPES = {
    ActivityType.CALL,
    ActivityType.SMS,
    ActivityType.EMAIL,
    ActivityType.ONLINE_MEETING,
    ActivityType.IN_PERSON_MEETING,
    ActivityType.PRESENTATION,
}
# Scheduled items of these types count as appointments.
APPOINTMENT_TYPES = {ActivityType.ONLINE_MEETING, ActivityType.IN_PERSON_MEETING, ActivityType.PRESENTATION}


class FollowUpStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    COMPLETED = "completed", "Completed"
    CANCELED = "canceled", "Canceled"


class FollowUp(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="follow_ups")
    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name="follow_ups")
    activity_type = models.CharField(max_length=24, choices=ActivityType.choices, default=ActivityType.CALL)
    subject = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    priority = models.CharField(max_length=8, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=12, choices=FollowUpStatus.choices, default=FollowUpStatus.PENDING)
    outcome = models.TextField(blank=True)
    next_action = models.CharField(max_length=255, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)
    reminder_minutes = models.PositiveIntegerField(
        null=True, blank=True, help_text="Minutes before the scheduled time to raise an in-app reminder."
    )

    class Meta:
        ordering = ["scheduled_at", "id"]
        indexes = [
            models.Index(fields=["owner", "status", "scheduled_at"]),
            models.Index(fields=["prospect", "status", "scheduled_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="completed") | Q(completed_at__isnull=False),
                name="followup_completed_has_timestamp",
            ),
            models.CheckConstraint(
                condition=Q(status__in=FollowUpStatus.values), name="followup_status_valid"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.subject} ({self.get_status_display()})"

    @property
    def is_pending(self) -> bool:
        return self.status == FollowUpStatus.PENDING


class FollowUpReschedule(models.Model):
    follow_up = models.ForeignKey(FollowUp, on_delete=models.CASCADE, related_name="reschedules")
    previous_scheduled_at = models.DateTimeField()
    new_scheduled_at = models.DateTimeField()
    reason = models.CharField(max_length=255, blank=True)
    rescheduled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class Activity(models.Model):
    """A logged interaction that happened (call made, meeting held, etc.)."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activities")
    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name="activities")
    activity_type = models.CharField(max_length=24, choices=ActivityType.choices)
    subject = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    outcome = models.TextField(blank=True)
    occurred_at = models.DateTimeField(db_index=True)
    follow_up = models.OneToOneField(
        FollowUp, on_delete=models.SET_NULL, null=True, blank=True, related_name="completion_activity"
    )
    counts_as_contact = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        verbose_name_plural = "activities"
        indexes = [models.Index(fields=["owner", "-occurred_at"])]

    def __str__(self) -> str:
        return self.subject
