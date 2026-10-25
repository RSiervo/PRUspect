from django.conf import settings
from django.db import models


class AuditAction(models.TextChoices):
    PROSPECT_CREATED = "prospect.created", "Prospect created"
    PROSPECT_UPDATED = "prospect.updated", "Prospect updated"
    PROSPECT_STATUS_CHANGED = "prospect.status_changed", "Status changed"
    PROSPECT_ARCHIVED = "prospect.archived", "Prospect archived"
    PROSPECT_RESTORED = "prospect.restored", "Prospect restored"
    PROSPECT_DELETED = "prospect.deleted", "Prospect permanently deleted"
    NOTE_ADDED = "note.added", "Note added"
    NOTE_EDITED = "note.edited", "Note edited"
    FOLLOWUP_CREATED = "followup.created", "Follow-up scheduled"
    FOLLOWUP_UPDATED = "followup.updated", "Follow-up updated"
    FOLLOWUP_COMPLETED = "followup.completed", "Follow-up completed"
    FOLLOWUP_CANCELED = "followup.canceled", "Follow-up canceled"
    FOLLOWUP_RESCHEDULED = "followup.rescheduled", "Follow-up rescheduled"
    ACTIVITY_LOGGED = "activity.logged", "Activity logged"
    OPPORTUNITY_CREATED = "opportunity.created", "Opportunity created"
    OPPORTUNITY_UPDATED = "opportunity.updated", "Opportunity updated"
    OPPORTUNITY_DELETED = "opportunity.deleted", "Opportunity deleted"
    EXPORT = "data.exported", "Data exported"
    SETTINGS_CHANGED = "settings.changed", "Settings changed"
    PASSWORD_CHANGED = "auth.password_changed", "Password changed"
    SIGNED_UP_GOOGLE = "auth.signup_google", "Signed up with Google"
    GOOGLE_LINKED = "auth.google_linked", "Google account linked"
    USER_DEACTIVATED = "admin.user_deactivated", "Account deactivated"
    USER_REACTIVATED = "admin.user_reactivated", "Account reactivated"
    DEMO_DATA_REMOVED = "data.demo_removed", "Demo data removed"


class AuditLog(models.Model):
    """Append-only record of important actions.

    Never store passwords, tokens, or full sensitive payloads in `changes`.
    `prospect` is kept nullable (SET_NULL) so entries survive a permanent delete.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="audit_logs"
    )
    action = models.CharField(max_length=40, choices=AuditAction.choices, db_index=True)
    entity_type = models.CharField(max_length=40)
    entity_id = models.PositiveBigIntegerField(null=True, blank=True)
    prospect = models.ForeignKey(
        "prospects.Prospect", on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    summary = models.CharField(max_length=255)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["prospect", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.action}: {self.summary}"
