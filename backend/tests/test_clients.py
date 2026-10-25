from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.common.timeutils import local_today
from apps.notifications.models import Notification, NotificationKind
from apps.opportunities.clients import add_months, next_yearly
from apps.opportunities.models import InsuranceOpportunity
from apps.prospects.models import Prospect
from apps.prospects.services import change_status

from .helpers import ApiTestCase, make_prospect


class DateMathTests(ApiTestCase):
    def test_next_yearly_handles_feb_29_and_rollover(self):
        self.assertEqual(next_yearly(date(1992, 2, 29), date(2026, 1, 10)), date(2026, 2, 28))
        self.assertEqual(next_yearly(date(1990, 3, 1), date(2026, 3, 2)), date(2027, 3, 1))
        self.assertEqual(next_yearly(date(1990, 3, 2), date(2026, 3, 2)), date(2026, 3, 2))

    def test_add_months_clamps_month_end(self):
        self.assertEqual(add_months(date(2026, 1, 31), 1), date(2026, 2, 28))
        self.assertEqual(add_months(date(2026, 11, 15), 3), date(2027, 2, 15))


class ClientTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.today = local_today(self.user)
        self.client_p = make_prospect(self.user, first_name="Carla", birth_date=self.today - timedelta(days=365 * 30) + timedelta(days=3))
        change_status(user=self.user, prospect=self.client_p, new_status="won")
        issued = self.today - timedelta(days=365) + timedelta(days=5)
        self.policy = InsuranceOpportunity.objects.create(
            owner=self.user, prospect=self.client_p, name="Family plan", stage="issued",
            application_submitted_date=issued - timedelta(days=10), policy_issued_date=issued,
            actual_annualized_premium=Decimal("36000"), premium_mode="quarterly",
            next_premium_due_date=self.today + timedelta(days=4),
        )
        make_prospect(self.user, first_name="Still", last_name="Prospect", mobile="0917 333 4444")

    def test_clients_list_only_includes_won_or_issued(self):
        rows = self.client.get("/api/v1/clients/").data["results"]
        self.assertEqual([r["first_name"] for r in rows], ["Carla"])
        self.assertEqual((rows[0]["policies"], rows[0]["annualized_premium"]), (1, "36000.00"))
        self.assertEqual(self.other_client.get("/api/v1/clients/").data["results"], [])

    def test_upcoming_events(self):
        events = self.client.get("/api/v1/clients/upcoming/", {"days": 30}).data["events"]
        types = {e["type"]: e for e in events}
        self.assertEqual(types["premium_due"]["days_until"], 4)
        self.assertEqual(types["anniversary"]["days_until"], 5)
        self.assertIn("birthday", types)
        self.assertIn("referral_ask", types)  # issued about a year ago, never asked

    def test_referral_asked_hides_the_ask(self):
        self.client.post(f"/api/v1/clients/{self.client_p.pk}/referral-asked/")
        events = self.client.get("/api/v1/clients/upcoming/").data["events"]
        self.assertNotIn("referral_ask", {e["type"] for e in events})
        self.assertEqual(self.other_client.post(f"/api/v1/clients/{self.client_p.pk}/referral-asked/").status_code, 404)

    def test_premium_paid_advances_by_mode(self):
        response = self.client.post(f"/api/v1/opportunities/{self.policy.pk}/premium-paid/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["next_premium_due_date"], add_months(self.today + timedelta(days=4), 3).isoformat())

    def test_premium_schedule_cleared_when_not_issued(self):
        response = self.client.patch(f"/api/v1/opportunities/{self.policy.pk}/", {"stage": "underwriting"}, format="json")
        self.assertEqual((response.data["premium_mode"], response.data["next_premium_due_date"]), ("", None))

    def test_client_notifications_are_created_once(self):
        self.client.get("/api/v1/notifications/")
        self.client.get("/api/v1/notifications/")
        client_notes = Notification.objects.filter(user=self.user, kind=NotificationKind.CLIENT)
        titles = sorted(n.title for n in client_notes)
        self.assertIn("Premium due: Carla Santos", titles)
        self.assertIn("Policy anniversary: Carla Santos", titles)
        self.assertEqual(len(titles), len(set(titles)))

    def test_archived_clients_are_hidden(self):
        Prospect.objects.filter(pk=self.client_p.pk).update(is_archived=True, archived_at=timezone.now())
        self.assertEqual(self.client.get("/api/v1/clients/").data["results"], [])
