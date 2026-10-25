from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.activities.services import cancel_follow_up, create_follow_up
from apps.opportunities.models import InsuranceOpportunity
from apps.prospects.models import Prospect
from apps.prospects.services import change_status

from .helpers import ApiTestCase, in_days, make_prospect


class DashboardMetricTests(ApiTestCase):
    def test_summary_kpis_come_from_records(self):
        a = make_prospect(self.user, first_name="A")
        b = make_prospect(self.user, first_name="B", mobile="0917 555 0000")
        make_prospect(self.user, first_name="C", mobile="0917 555 0001")
        change_status(user=self.user, prospect=a, new_status="needs_analysis")
        change_status(user=self.user, prospect=b, new_status="won")
        create_follow_up(user=self.user, prospect=a, data={"activity_type": "call", "subject": "o",
                                                            "scheduled_at": in_days(-2)})
        create_follow_up(user=self.user, prospect=a, data={"activity_type": "presentation", "subject": "p",
                                                            "scheduled_at": timezone.now()})
        canceled = create_follow_up(user=self.user, prospect=a, data={"activity_type": "call", "subject": "c",
                                                                       "scheduled_at": in_days(-3)})
        cancel_follow_up(user=self.user, follow_up=canceled)
        InsuranceOpportunity.objects.create(owner=self.user, prospect=b, name="Issued", stage="issued",
                                            application_submitted_date=date.today(),
                                            policy_issued_date=date.today(),
                                            actual_annualized_premium=Decimal("36000"))

        kpis = self.client.get("/api/v1/dashboard/summary/").data["kpis"]
        self.assertEqual(kpis["total_prospects"]["value"], 3)
        self.assertEqual(kpis["new_this_month"]["value"], 3)
        self.assertEqual(kpis["overdue_follow_ups"]["value"], 1)
        self.assertEqual(kpis["follow_ups_today"]["value"], 1)
        self.assertEqual(kpis["appointments_this_week"]["value"], 1)
        self.assertEqual(kpis["qualified_prospects"]["value"], 2)
        self.assertEqual(kpis["policies_issued"]["value"], 1)
        self.assertEqual(kpis["conversion_rate"]["value"], 33.3)
        self.assertEqual((kpis["conversion_rate"]["numerator"], kpis["conversion_rate"]["denominator"]), (1, 3))

    def test_pipeline_counts_per_status(self):
        p = make_prospect(self.user)
        change_status(user=self.user, prospect=p, new_status="contacted")
        stages = {s["value"]: s["count"] for s in self.client.get("/api/v1/dashboard/pipeline/").data["stages"]}
        self.assertEqual(stages["contacted"], 1)
        self.assertEqual(stages["new_lead"], 0)
        self.assertEqual(len(stages), 14)

    def test_performance_series_lengths(self):
        make_prospect(self.user)
        monthly = self.client.get("/api/v1/dashboard/performance/").data["series"]
        quarterly = self.client.get("/api/v1/dashboard/performance/", {"period": "quarterly"}).data["series"]
        self.assertEqual(len(monthly), 6)
        self.assertEqual(len(quarterly), 4)
        self.assertEqual(monthly[-1]["new_prospects"], 1)
        self.assertEqual(quarterly[-1]["new_prospects"], 1)


class ConversionTests(ApiTestCase):
    def test_cohort_rates_use_matching_denominators(self):
        prospects = [make_prospect(self.user, first_name=str(i), mobile=f"0917 000 00{i:02d}") for i in range(4)]
        change_status(user=self.user, prospect=prospects[0], new_status="needs_analysis")
        change_status(user=self.user, prospect=prospects[1], new_status="application_submitted")
        change_status(user=self.user, prospect=prospects[2], new_status="application_submitted")
        change_status(user=self.user, prospect=prospects[2], new_status="won")
        rates = {r["key"]: r for r in self.client.get("/api/v1/reports/conversion/").data["rates"]}
        self.assertEqual((rates["qualified_to_application"]["numerator"],
                          rates["qualified_to_application"]["denominator"]), (2, 3))
        self.assertEqual((rates["application_to_policy"]["numerator"],
                          rates["application_to_policy"]["denominator"]), (1, 2))
        self.assertEqual((rates["prospect_to_policy"]["numerator"], rates["prospect_to_policy"]["denominator"]),
                         (1, 4))
        self.assertEqual(rates["prospect_to_policy"]["rate"], 25.0)

    def test_cohort_date_filter_excludes_older_prospects(self):
        old = make_prospect(self.user, first_name="Old")
        Prospect.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=90))
        make_prospect(self.user, first_name="New", mobile="0917 999 0000")
        start = (timezone.now() - timedelta(days=10)).date().isoformat()
        data = self.client.get("/api/v1/reports/conversion/", {"date_from": start}).data
        self.assertEqual(data["cohort"]["size"], 1)

    def test_empty_cohort_returns_null_rate(self):
        rates = self.client.get("/api/v1/reports/conversion/").data["rates"]
        self.assertTrue(all(r["rate"] is None for r in rates))


class OpportunityTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.prospect = make_prospect(self.user)

    def create(self, **data):
        payload = {"prospect": self.prospect.pk, "name": "Family protection", **data}
        return self.client.post("/api/v1/opportunities/", payload, format="json")

    def test_actual_premium_only_allowed_when_issued(self):
        response = self.create(stage="proposal", actual_annualized_premium="1000")
        self.assertEqual(response.status_code, 400)
        self.assertIn("actual_annualized_premium", response.data["errors"])

    def test_issued_requires_dates(self):
        response = self.create(stage="issued")
        self.assertEqual(response.status_code, 400)
        self.assertIn("policy_issued_date", response.data["errors"])
        self.assertIn("application_submitted_date", response.data["errors"])

    def test_monthly_equivalent_and_decimal_handling(self):
        response = self.create(estimated_annual_premium="36000.00")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["estimated_monthly_premium"], "3000.00")
        self.assertEqual(response.data["currency"], "PHP")

    def test_totals_keep_estimates_and_issued_separate(self):
        today = date.today().isoformat()
        self.create(name="Open 1", stage="proposal", estimated_annual_premium="10000")
        self.create(name="Open 2", stage="underwriting", estimated_annual_premium="20000",
                    application_submitted_date=today)
        self.create(name="Lost", stage="lost", estimated_annual_premium="99999")
        self.create(name="Issued", stage="issued", estimated_annual_premium="50000", actual_annualized_premium="48000",
                    application_submitted_date=today, policy_issued_date=today)
        totals = self.client.get("/api/v1/pipeline/").data["totals"]
        self.assertEqual(Decimal(totals["open_estimated"]), Decimal("30000"))
        self.assertEqual(Decimal(totals["issued_actual"]), Decimal("48000"))
        self.assertEqual(totals["issued_count"], 1)
        report = self.client.get("/api/v1/reports/pipeline/").data
        self.assertEqual(Decimal(report["estimated_pipeline"]["total"]), Decimal("30000"))
        self.assertEqual(Decimal(report["issued"]["total"]), Decimal("48000"))

    def test_leaving_issued_clears_verified_values(self):
        today = date.today().isoformat()
        opp = self.create(stage="issued", actual_annualized_premium="1000", application_submitted_date=today,
                          policy_issued_date=today).data
        response = self.client.patch(f"/api/v1/opportunities/{opp['id']}/", {"stage": "underwriting"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data["actual_annualized_premium"])
        self.assertIsNone(response.data["policy_issued_date"])

    def test_pipeline_board_groups_by_status(self):
        change_status(user=self.user, prospect=self.prospect, new_status="presentation_scheduled")
        self.create(stage="proposal", estimated_annual_premium="12000")
        stages = {s["value"]: s for s in self.client.get("/api/v1/pipeline/").data["stages"]}
        card = stages["presentation_scheduled"]["prospects"][0]
        self.assertEqual(card["id"], self.prospect.pk)
        self.assertEqual(Decimal(card["estimated_annual_premium"]), Decimal("12000"))


class ReportExportTests(ApiTestCase):
    def test_each_report_exports_csv(self):
        make_prospect(self.user)
        for report in ["acquisition", "sources", "status", "conversion", "activity", "pipeline"]:
            response = self.client.get("/api/v1/reports/export/", {"report": report})
            self.assertEqual(response.status_code, 200, report)
            self.assertTrue(response["Content-Disposition"].startswith("attachment"))

    def test_invalid_dates_rejected(self):
        self.assertEqual(self.client.get("/api/v1/reports/prospects/", {"date_from": "nope"}).status_code, 400)
        self.assertEqual(self.client.get("/api/v1/reports/prospects/", {
            "date_from": "2026-05-01", "date_to": "2026-01-01"}).status_code, 400)

    def test_reports_return_definitions(self):
        for path in ["prospects", "activity", "pipeline"]:
            data = self.client.get(f"/api/v1/reports/{path}/").data
            self.assertIn("definitions", data)
