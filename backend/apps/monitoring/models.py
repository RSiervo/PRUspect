"""Error tracking: server crashes and browser errors, grouped by fingerprint.

Repeats of the same error bump `count` instead of adding rows. Only technical
details are kept (type, short message, page path, stack); request bodies and
form values are never stored, and emails/phone numbers are masked.
"""

from django.conf import settings
from django.db import models


class ErrorSource(models.TextChoices):
    SERVER = "server", "Server"
    BROWSER = "browser", "Browser"


class ErrorEvent(models.Model):
    fingerprint = models.CharField(max_length=64, unique=True)
    source = models.CharField(max_length=10, choices=ErrorSource.choices)
    error_type = models.CharField(max_length=120, blank=True)
    message = models.CharField(max_length=500)
    location = models.CharField(max_length=255, blank=True, help_text="API path or page path")
    stack = models.TextField(blank=True)
    release = models.CharField(max_length=40, blank=True)
    count = models.PositiveIntegerField(default=1)
    users_affected = models.PositiveIntegerField(default=0)
    last_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_seen", "-id"]

    def __str__(self) -> str:
        return f"{self.get_source_display()}: {self.error_type or 'Error'} {self.message[:60]}"
