"""Create clearly-marked sample data for development and demos.

    python manage.py seed_demo --email demo@pruspect.local --password "..."

Every prospect created here has is_demo=True, an @example.com email and a
+63 900 phone prefix, and shows a "Demo" badge in the UI. Remove it any time
from Settings → Data & Privacy, or with --reset.
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.activities import services as activity_services
from apps.activities.models import Activity, FollowUp
from apps.audit.models import AuditAction, AuditLog
from apps.opportunities.models import InsuranceOpportunity, OpportunityStage
from apps.prospects import services
from apps.prospects.models import ProductCategory, Prospect, ProspectSource, ProspectStatusHistory
from apps.prospects.statuses import (
    APPLICATION_SUBMITTED_STATUSES,
    QUALIFIED_STATUSES,
    WON_STATUSES,
    ProspectStatus as S,
)

FIRST = ["Maria", "James", "Anna", "Carlos", "Princess", "Michael", "Angela", "Mark", "Kristine", "Paolo",
         "Bea", "Joshua", "Camille", "Rafael", "Nicole", "Gabriel", "Patricia", "Miguel", "Andrea", "Luis",
         "Jasmine", "Daniel", "Katrina", "Enrico", "Sofia", "Ramon", "Bianca", "Vincent", "Isabel", "Adrian"]
LAST = ["Santos", "Rivera", "Cruz", "De Leon", "Garcia", "Tan", "Reyes", "Bautista", "Villanueva", "Mendoza",
        "Aquino", "Ramos", "Flores", "Castillo", "Navarro", "Lim", "Torres", "Domingo", "Morales", "Gonzales"]
JOBS = [("IT Professional", "Tech Solutions Inc."), ("Nurse", "Metro Medical Center"), ("Teacher", "Sunrise School"),
        ("Business Owner", "Self-employed"), ("Accountant", "Ledger & Co."), ("Engineer", "BuildRight Corp."),
        ("Sales Manager", "Retail Hub"), ("Call Center Team Lead", "Global Support BPO"),
        ("Architect", "Studio Forma"), ("Seafarer", "Pacific Lines")]
CITIES = ["Makati City", "Quezon City", "Taguig City", "Pasig City", "Mandaluyong", "Cebu City", "Davao City",
          "Parañaque", "Antipolo", "Las Piñas"]

PATH = [S.NEW_LEAD, S.CONTACT_ATTEMPTED, S.CONTACTED, S.NEEDS_ANALYSIS, S.PRESENTATION_SCHEDULED,
        S.PRESENTATION_COMPLETED, S.APPLICATION_IN_PROGRESS, S.APPLICATION_SUBMITTED, S.UNDERWRITING, S.WON]
TARGETS = ([S.NEW_LEAD] * 4 + [S.CONTACT_ATTEMPTED] * 2 + [S.CONTACTED] * 4 + [S.NEEDS_ANALYSIS] * 4
           + [S.PRESENTATION_SCHEDULED] * 3 + [S.PRESENTATION_COMPLETED] * 2 + [S.NURTURING] * 2
           + [S.APPLICATION_IN_PROGRESS] * 2 + [S.APPLICATION_SUBMITTED] * 2 + [S.UNDERWRITING]
           + [S.WON] * 4 + [S.LOST] * 2 + [S.NOT_QUALIFIED, S.ON_HOLD])


def path_to(target):
    if target in PATH:
        return PATH[: PATH.index(target) + 1]
    if target == S.NURTURING:
        return PATH[:6] + [S.NURTURING]
    if target == S.LOST:
        return PATH[:5] + [S.LOST]
    if target == S.NOT_QUALIFIED:
        return PATH[:3] + [S.NOT_QUALIFIED]
    return PATH[:4] + [S.ON_HOLD]


class Command(BaseCommand):
    help = "Create sample (demo) prospects, follow-ups and opportunities for a user."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="demo@pruspect.local")
        parser.add_argument("--password", help="Required when the user does not exist yet.")
        parser.add_argument("--first-name", default="John")
        parser.add_argument("--last-name", default="Mendoza")
        parser.add_argument("--reset", action="store_true", help="Delete this user's existing demo prospects first.")
        parser.add_argument("--seed", type=int, default=7)

    @transaction.atomic
    def handle(self, *args, **opts):
        User = get_user_model()
        user = User.objects.filter(email=opts["email"].lower()).first()
        if user is None:
            if not opts["password"]:
                raise CommandError("User does not exist. Pass --password to create it.")
            user = User.objects.create_user(email=opts["email"], password=opts["password"],
                                            first_name=opts["first_name"], last_name=opts["last_name"])
            self.stdout.write(f"Created user {user.email}")
        if opts["reset"]:
            deleted = Prospect.objects.filter(owner=user, is_demo=True).count()
            Prospect.objects.filter(owner=user, is_demo=True).delete()
            self.stdout.write(f"Removed {deleted} existing demo prospects")

        rng = random.Random(opts["seed"])
        now = timezone.now()
        sources = list(ProspectSource.objects.filter(owner=user))
        categories = list(ProductCategory.objects.filter(owner=user))
        targets = TARGETS[:]
        rng.shuffle(targets)

        for index, target in enumerate(targets):
            first, last = FIRST[index % len(FIRST)], LAST[(index * 7) % len(LAST)]
            job, company = rng.choice(JOBS)
            source = rng.choice(sources) if sources else None
            path = path_to(target)
            # Newer leads are created recently; advanced stages longer ago.
            age_days = rng.randint(2, 25) + len(path) * rng.randint(6, 16)
            created = now - timedelta(days=min(age_days, 235), hours=rng.randint(0, 9))
            data = {
                "first_name": first, "last_name": last,
                "mobile": f"+63 900 {index // 100:03d} {1000 + index:04d}",
                "email": f"{first}.{last}".lower().replace(" ", "") + f"{index}@example.com",
                "occupation": job, "company": company, "location": rng.choice(CITIES), "source": source,
                "referral_name": "Demo Referrer" if source and source.name == "Referral" else "",
                "priority": rng.choice(["high", "medium", "medium", "low"]),
                "budget_range": rng.choice(["1k_3k", "3k_5k", "5k_10k", ""]),
                "notes": "Sample record for demonstration only.",
                "consent_obtained": True, "consent_date": created.date(), "consent_source": "Verbal (demo)",
                "is_demo": True,
            }
            prospect = services.create_prospect(user=user, data=data, interests=rng.sample(categories, k=min(2, len(categories))))
            for status in path[1:]:
                reason = "Prospect decided to postpone (demo)" if status in {S.LOST, S.NOT_QUALIFIED} else ""
                services.change_status(user=user, prospect=prospect, new_status=status, reason=reason)

            # Backdate creation, status changes and milestones along the path.
            span = max(now - created - timedelta(days=1), timedelta(hours=1))
            stamps = [created + span * (i / max(len(path), 1)) for i in range(len(path))]
            history = list(ProspectStatusHistory.objects.filter(prospect=prospect).order_by("id"))
            for entry, when in zip(history, stamps):
                ProspectStatusHistory.objects.filter(pk=entry.pk).update(changed_at=when)
            logs = list(AuditLog.objects.filter(prospect=prospect).order_by("id"))
            for log, when in zip(logs, stamps):
                AuditLog.objects.filter(pk=log.pk).update(created_at=when)

            def first_reached(statuses):
                for status, when in zip(path, stamps):
                    if status in statuses:
                        return when
                return None

            Prospect.objects.filter(pk=prospect.pk).update(
                created_at=created, status_changed_at=stamps[-1],
                qualified_at=first_reached(QUALIFIED_STATUSES),
                application_submitted_at=first_reached(APPLICATION_SUBMITTED_STATUSES),
                policy_issued_at=first_reached(WON_STATUSES),
            )
            prospect.refresh_from_db()

            self._follow_ups(user, prospect, rng, now, created, target)
            self._opportunity(user, prospect, rng, now, stamps, path, categories)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(targets)} demo prospects for {user.email}. Sign in at the frontend with this account."
        ))

    def _follow_ups(self, user, prospect, rng, now, created, target):
        kinds = ["call", "sms", "email", "online_meeting", "in_person_meeting", "presentation", "document"]
        subjects = {
            "call": "Follow-up call", "sms": "Check-in message", "email": "Send proposal summary",
            "online_meeting": "Needs analysis (online)", "in_person_meeting": "Coffee meeting",
            "presentation": "Insurance presentation", "document": "Collect application requirements",
        }
        # Completed history.
        for _ in range(rng.randint(1, 3)):
            kind = rng.choice(kinds)
            when = created + (now - created) * rng.uniform(0.2, 0.9)
            follow_up = activity_services.create_follow_up(user=user, prospect=prospect, data={
                "activity_type": kind, "subject": subjects[kind], "scheduled_at": when,
                "priority": prospect.priority, "reminder_minutes": None})
            activity_services.complete_follow_up(user=user, follow_up=follow_up,
                                                 outcome="Discussed goals and next steps (demo).")
            FollowUp.objects.filter(pk=follow_up.pk).update(completed_at=when, created_at=when - timedelta(days=2))
            Activity.objects.filter(follow_up=follow_up).update(occurred_at=when)
            AuditLog.objects.filter(entity_type="FollowUp", entity_id=follow_up.pk).update(created_at=when)
        last = Activity.objects.filter(prospect=prospect, counts_as_contact=True).order_by("-occurred_at").first()
        Prospect.objects.filter(pk=prospect.pk).update(last_contacted_at=last.occurred_at if last else None)

        if target in {S.WON, S.LOST, S.NOT_QUALIFIED}:
            return
        # Open work: some overdue, some today, most upcoming.
        roll = rng.random()
        local_now = timezone.localtime(now)
        if roll < 0.25:
            when = now - timedelta(days=rng.randint(1, 6), hours=rng.randint(0, 5))
        elif roll < 0.5:
            when = local_now.replace(hour=rng.choice([9, 11, 14, 16]), minute=rng.choice([0, 30]), second=0,
                                     microsecond=0)
        else:
            when = now + timedelta(days=rng.randint(1, 20), hours=rng.randint(0, 6))
        kind = rng.choice(kinds)
        activity_services.create_follow_up(user=user, prospect=prospect, data={
            "activity_type": kind, "subject": subjects[kind], "scheduled_at": when,
            "priority": prospect.priority, "description": "Demo follow-up."})

    def _opportunity(self, user, prospect, rng, now, stamps, path, categories):
        if path.index(path[-1]) < 4 and path[-1] not in {S.LOST}:
            return
        stage_by_status = {
            S.PRESENTATION_SCHEDULED: OpportunityStage.PROPOSAL, S.PRESENTATION_COMPLETED: OpportunityStage.PROPOSAL,
            S.NURTURING: OpportunityStage.PROPOSAL, S.APPLICATION_IN_PROGRESS: OpportunityStage.APPLICATION_IN_PROGRESS,
            S.APPLICATION_SUBMITTED: OpportunityStage.APPLICATION_SUBMITTED,
            S.UNDERWRITING: OpportunityStage.UNDERWRITING, S.WON: OpportunityStage.ISSUED, S.LOST: OpportunityStage.LOST,
            S.ON_HOLD: OpportunityStage.IDENTIFIED, S.NEEDS_ANALYSIS: OpportunityStage.IDENTIFIED,
        }
        stage = stage_by_status.get(path[-1])
        if stage is None:
            return
        category = rng.choice(categories) if categories else None
        estimate = Decimal(rng.choice([18000, 24000, 36000, 48000, 60000, 90000, 120000]))
        submitted = issued = actual = None
        if stage in {OpportunityStage.APPLICATION_SUBMITTED, OpportunityStage.UNDERWRITING, OpportunityStage.ISSUED}:
            submitted = stamps[path.index(S.APPLICATION_SUBMITTED)].date()
        if stage == OpportunityStage.ISSUED:
            issued = stamps[-1].date()
            actual = (estimate * Decimal(rng.choice(["0.9", "1", "1.1"]))).quantize(Decimal("1"))
        opp = InsuranceOpportunity.objects.create(
            owner=user, prospect=prospect, name=f"{category.name if category else 'Insurance'} plan — {prospect.first_name}",
            product_category=category, estimated_annual_premium=estimate, stage=stage,
            estimated_close_date=(now + timedelta(days=rng.randint(10, 60))).date(),
            application_submitted_date=submitted, policy_issued_date=issued, actual_annualized_premium=actual,
            notes="Demo opportunity. Figures are illustrative only.",
        )
        AuditLog.objects.create(user=user, action=AuditAction.OPPORTUNITY_CREATED, entity_type="InsuranceOpportunity",
                                entity_id=opp.pk, prospect=prospect, summary=f"Added opportunity “{opp.name}”")
