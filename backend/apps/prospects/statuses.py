"""Prospect sales stages and the rules attached to them.

Stage codes are fixed because metrics depend on their meaning. Labels can be
changed here without a migration (choices are not enforced in the database
beyond the CHECK constraint generated from this list).
"""

from django.db import models


class ProspectStatus(models.TextChoices):
    NEW_LEAD = "new_lead", "New Lead"
    CONTACT_ATTEMPTED = "contact_attempted", "Contact Attempted"
    CONTACTED = "contacted", "Contacted"
    NEEDS_ANALYSIS = "needs_analysis", "Needs Analysis"
    PRESENTATION_SCHEDULED = "presentation_scheduled", "Presentation Scheduled"
    PRESENTATION_COMPLETED = "presentation_completed", "Presentation Completed"
    NURTURING = "nurturing", "Follow-up / Nurturing"
    APPLICATION_IN_PROGRESS = "application_in_progress", "Application In Progress"
    APPLICATION_SUBMITTED = "application_submitted", "Application Submitted"
    UNDERWRITING = "underwriting", "Underwriting"
    WON = "won", "Policy Issued — Won"
    LOST = "lost", "Not Interested — Lost"
    NOT_QUALIFIED = "not_qualified", "Not Qualified"
    ON_HOLD = "on_hold", "On Hold"


S = ProspectStatus

# Order used for funnels and the pipeline board.
STAGE_ORDER = [choice for choice in S]

# Closed stages. A prospect in LOST/NOT_QUALIFIED can be reopened (audited).
TERMINAL_STATUSES = {S.WON, S.LOST, S.NOT_QUALIFIED}
CLOSED_LOST_STATUSES = {S.LOST, S.NOT_QUALIFIED}
ACTIVE_STATUSES = [s for s in STAGE_ORDER if s not in TERMINAL_STATUSES and s != S.ON_HOLD]

# Milestones. Entering any of these stages stamps the milestone timestamp the
# first time, which drives the cohort conversion metrics.
QUALIFIED_STATUSES = {
    S.NEEDS_ANALYSIS,
    S.PRESENTATION_SCHEDULED,
    S.PRESENTATION_COMPLETED,
    S.APPLICATION_IN_PROGRESS,
    S.APPLICATION_SUBMITTED,
    S.UNDERWRITING,
    S.WON,
}
APPLICATION_SUBMITTED_STATUSES = {S.APPLICATION_SUBMITTED, S.UNDERWRITING, S.WON}
WON_STATUSES = {S.WON}


def stage_kind(status: str) -> str:
    if status == S.WON:
        return "won"
    if status in CLOSED_LOST_STATUSES:
        return "lost"
    if status == S.ON_HOLD:
        return "paused"
    return "active"
