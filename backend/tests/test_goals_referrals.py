from datetime import date
from decimal import Decimal

from apps.common.timeutils import add_months, local_today
from apps.dashboard.models import MonthlyGoal
from apps.opportunities.models import InsuranceOpportunity
from apps.prospects.services import change_status

from .helpers import ApiTestCase, make_prospect


class GoalTests(ApiTestCase):
    def test_set_goals_and_track_progress(self):
        a = make_prospect(self.user)
        make_prospect(self.user, first_name="B", mobile="0917 222 0000")
        today = local_today(self.user)
        InsuranceOpportunity.objects.create(owner=self.user, prospect=a, name="P", stage="issued",
                                            application_submitted_date=today, policy_issued_date=today,
                                            actual_annualized_premium=Decimal("24000"))
        response = self.client.put("/api/v1/goals/current/", {"new_prospects": 10, "appointments": 8, "policies": 2,
                                                               "issued_premium": "100000"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertTrue(data["has_goals"])
        self.assertEqual(data["targets"]["new_prospects"], 10)
        self.assertEqual(data["actual"]["new_prospects"], 2)
        self.assertEqual(data["actual"]["policies"], 1)
        self.assertEqual(data["actual"]["issued_premium"], "24000.00")
        self.assertTrue(0 < data["pace"] <= 1)

    def test_last_months_goals_are_suggested(self):
        last_month = add_months(local_today(self.user).replace(day=1), -1)
        MonthlyGoal.objects.create(owner=self.user, month=last_month, new_prospects=12)
        data = self.client.get("/api/v1/goals/current/").data
        self.assertFalse(data["has_goals"])
        self.assertEqual(data["suggested"]["new_prospects"], 12)

    def test_validation_and_isolation(self):
        self.assertEqual(self.client.put("/api/v1/goals/current/", {"policies": -1}, format="json").status_code, 400)
        self.assertEqual(self.client.put("/api/v1/goals/current/", {"policies": "lots"}, format="json").status_code, 400)
        self.client.put("/api/v1/goals/current/", {"policies": 3}, format="json")
        self.assertFalse(self.other_client.get("/api/v1/goals/current/").data["has_goals"])


class ReferralTests(ApiTestCase):
    def test_link_referrer_and_list_referrals(self):
        referrer = make_prospect(self.user, first_name="Rita", mobile="0917 999 0000")
        response = self.client.post("/api/v1/prospects/", {"first_name": "New", "last_name": "Friend", "mobile": "0918 123 4567",
                                                            "referred_by": referrer.pk}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["referred_by"]["id"], referrer.pk)
        detail = self.client.get(f"/api/v1/prospects/{referrer.pk}/").data
        self.assertEqual([r["full_name"] for r in detail["referrals"]], ["New Friend"])

    def test_cannot_refer_self_or_use_other_users_prospect(self):
        p = make_prospect(self.user)
        self.assertEqual(self.client.patch(f"/api/v1/prospects/{p.pk}/", {"referred_by": p.pk}, format="json").status_code, 400)
        theirs = make_prospect(self.other, email="x@example.com")
        self.assertEqual(self.client.patch(f"/api/v1/prospects/{p.pk}/", {"referred_by": theirs.pk}, format="json").status_code, 400)

    def test_top_referrers_report(self):
        rita = make_prospect(self.user, first_name="Rita", mobile="0917 999 0000")
        for i in range(3):
            friend = make_prospect(self.user, first_name=f"F{i}", mobile=f"0918 000 000{i}", referred_by=rita)
            if i == 0:
                change_status(user=self.user, prospect=friend, new_status="won")
        start = date(2000, 1, 1).isoformat()
        rows = self.client.get("/api/v1/reports/prospects/", {"date_from": start}).data["top_referrers"]
        self.assertEqual(rows, [{"prospect_id": rita.pk, "name": "Rita Santos", "referrals": 3, "won": 1}])
