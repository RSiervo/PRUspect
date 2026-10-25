from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import TimeStampedModel
from apps.common.normalize import normalize_email, normalize_phone

from .statuses import ProspectStatus


class Priority(models.TextChoices):
    HIGH = "high", "High"
    MEDIUM = "medium", "Medium"
    LOW = "low", "Low"


PRIORITY_RANK = {Priority.HIGH: 1, Priority.MEDIUM: 2, Priority.LOW: 3}


class BudgetRange(models.TextChoices):
    """Affordable premium per month in PHP, as told by the prospect."""

    UNDER_1K = "under_1k", "Below ₱1,000 / month"
    R1K_3K = "1k_3k", "₱1,000 – ₱2,999 / month"
    R3K_5K = "3k_5k", "₱3,000 – ₱4,999 / month"
    R5K_10K = "5k_10k", "₱5,000 – ₱9,999 / month"
    OVER_10K = "10k_plus", "₱10,000+ / month"


class ContactMethod(models.TextChoices):
    ANY = "any", "No preference"
    CALL = "call", "Phone call"
    SMS = "sms", "Text message"
    EMAIL = "email", "Email"
    MESSENGER = "messenger", "Chat / messaging app"


class ProspectSource(models.Model):
    """User-configurable list of where prospects come from."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="prospect_sources")
    name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [models.UniqueConstraint(fields=["owner", "name"], name="uniq_source_name_per_owner")]

    def __str__(self) -> str:
        return self.name


class ProductCategory(models.Model):
    """User-configurable insurance interest categories (not specific products).

    Verify actual product availability through authorized company sources.
    """

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="product_categories")
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "product categories"
        constraints = [models.UniqueConstraint(fields=["owner", "name"], name="uniq_category_name_per_owner")]

    def __str__(self) -> str:
        return self.name


class Prospect(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="prospects")

    # Personal information (kept to what prospecting needs).
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    preferred_name = models.CharField(max_length=80, blank=True)
    mobile = models.CharField(max_length=32, blank=True)
    mobile_normalized = models.CharField(max_length=32, blank=True, editable=False)
    email = models.EmailField(blank=True)
    email_normalized = models.EmailField(blank=True, editable=False)
    birth_date = models.DateField(null=True, blank=True)
    occupation = models.CharField(max_length=120, blank=True)
    company = models.CharField(max_length=120, blank=True)
    location = models.CharField(max_length=120, blank=True, help_text="City or general area only.")

    # Qualification.
    source = models.ForeignKey(ProspectSource, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    referral_name = models.CharField(max_length=120, blank=True)
    insurance_interests = models.ManyToManyField(ProductCategory, blank=True, related_name="prospects")
    existing_coverage = models.CharField(max_length=255, blank=True)
    budget_range = models.CharField(max_length=16, choices=BudgetRange.choices, blank=True)
    priority = models.CharField(max_length=8, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=32, choices=ProspectStatus.choices, default=ProspectStatus.NEW_LEAD)
    status_changed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, help_text="Short summary. Detailed notes live in ProspectNote.")

    # Consent and communication preferences (Data Privacy Act considerations).
    consent_obtained = models.BooleanField(default=False)
    consent_date = models.DateField(null=True, blank=True)
    consent_source = models.CharField(max_length=120, blank=True, help_text="How consent was given.")
    preferred_contact_method = models.CharField(
        max_length=16, choices=ContactMethod.choices, default=ContactMethod.ANY
    )
    do_not_contact = models.BooleanField(default=False)

    # Activity and milestones (milestones stamp the first time a stage is reached).
    last_contacted_at = models.DateTimeField(null=True, blank=True)
    qualified_at = models.DateTimeField(null=True, blank=True)
    application_submitted_at = models.DateTimeField(null=True, blank=True)
    policy_issued_at = models.DateTimeField(null=True, blank=True)

    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    is_demo = models.BooleanField(default=False, help_text="Sample data created by the seed_demo command.")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "is_archived", "status"]),
            models.Index(fields=["owner", "is_archived", "-created_at"]),
            models.Index(fields=["owner", "mobile_normalized"]),
            models.Index(fields=["owner", "email_normalized"]),
            models.Index(fields=["owner", "last_contacted_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=ProspectStatus.values), name="prospect_status_valid"
            ),
            models.CheckConstraint(condition=Q(priority__in=Priority.values), name="prospect_priority_valid"),
        ]

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def save(self, *args, **kwargs):
        self.email = (self.email or "").strip()
        self.email_normalized = normalize_email(self.email)
        self.mobile = (self.mobile or "").strip()
        self.mobile_normalized = normalize_phone(self.mobile)
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            fields = set(update_fields)
            if "email" in fields:
                fields.add("email_normalized")
            if "mobile" in fields:
                fields.add("mobile_normalized")
            kwargs["update_fields"] = fields
        super().save(*args, **kwargs)


class ProspectStatusHistory(models.Model):
    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=32, choices=ProspectStatus.choices, blank=True)
    to_status = models.CharField(max_length=32, choices=ProspectStatus.choices)
    reason = models.CharField(max_length=500, blank=True)
    is_reopen = models.BooleanField(default=False)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    changed_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-changed_at", "-id"]
        verbose_name_plural = "prospect status history"

    def __str__(self) -> str:
        return f"{self.prospect_id}: {self.from_status or '—'} → {self.to_status}"


class ProspectNote(TimeStampedModel):
    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name="note_entries")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    body = models.TextField()
    is_edited = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at", "-id"]


class ProspectNoteRevision(models.Model):
    """Previous version of a note, saved each time it is edited."""

    note = models.ForeignKey(ProspectNote, on_delete=models.CASCADE, related_name="revisions")
    previous_body = models.TextField()
    edited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    edited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-edited_at", "-id"]
