"""Every endpoint must hide other users' records."""

from apps.activities.services import create_follow_up
from apps.opportunities.models import InsuranceOpportunity

from .helpers import ApiTestCase, in_days, make_prospect


class DataIsolationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.mine = make_prospect(self.user, first_name="Mine")
        self.theirs = make_prospect(self.other, first_name="Theirs", email="theirs@example.com",
                                    mobile="0918 000 0000")
        self.their_follow_up = create_follow_up(user=self.other, prospect=self.theirs, data={
            "activity_type": "call", "subject": "Their call", "scheduled_at": in_days(1)})
        self.their_opp = InsuranceOpportunity.objects.create(owner=self.other, prospect=self.theirs, name="Theirs")

    def test_list_only_shows_own_prospects(self):
        names = [p["first_name"] for p in self.client.get("/api/v1/prospects/").data["results"]]
        self.assertEqual(names, ["Mine"])

    def test_detail_and_actions_on_other_users_prospect_return_404(self):
        base = f"/api/v1/prospects/{self.theirs.pk}/"
        self.assertEqual(self.client.get(base).status_code, 404)
        self.assertEqual(self.client.patch(base, {"first_name": "Hacked"}, format="json").status_code, 404)
        self.assertEqual(self.client.post(base + "archive/").status_code, 404)
        self.assertEqual(self.client.post(base + "change-status/", {"status": "contacted"}).status_code, 404)
        self.assertEqual(self.client.get(base + "history/").status_code, 404)
        self.assertEqual(self.client.get(base + "timeline/").status_code, 404)
        self.theirs.refresh_from_db()
        self.assertEqual(self.theirs.first_name, "Theirs")

    def test_cannot_attach_records_to_other_users_prospect(self):
        follow_up = self.client.post("/api/v1/follow-ups/", {
            "prospect": self.theirs.pk, "activity_type": "call", "subject": "x",
            "scheduled_at": in_days(1).isoformat()}, format="json")
        self.assertEqual(follow_up.status_code, 400)
        note = self.client.post("/api/v1/notes/", {"prospect": self.theirs.pk, "body": "x"}, format="json")
        self.assertEqual(note.status_code, 400)
        opp = self.client.post("/api/v1/opportunities/", {"prospect": self.theirs.pk, "name": "x"}, format="json")
        self.assertEqual(opp.status_code, 400)
        activity = self.client.post("/api/v1/activities/", {
            "prospect": self.theirs.pk, "activity_type": "call", "subject": "x",
            "occurred_at": in_days(-1).isoformat()}, format="json")
        self.assertEqual(activity.status_code, 400)

    def test_cannot_use_other_users_source_or_category(self):
        their_source = self.other.prospect_sources.first()
        response = self.client.post("/api/v1/prospects/", {
            "first_name": "A", "last_name": "B", "mobile": "09171112222", "source": their_source.pk}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("source", response.data["errors"])

    def test_follow_ups_opportunities_and_calendar_are_scoped(self):
        self.assertEqual(self.client.get(f"/api/v1/follow-ups/{self.their_follow_up.pk}/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/v1/follow-ups/{self.their_follow_up.pk}/complete/").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/follow-ups/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/v1/opportunities/{self.their_opp.pk}/").status_code, 404)
        events = self.client.get("/api/v1/calendar/events/").data["events"]
        self.assertEqual(events, [])

    def test_duplicates_search_and_export_are_scoped(self):
        dupes = self.client.get("/api/v1/prospects/duplicates/", {"email": "theirs@example.com"}).data["matches"]
        self.assertEqual(dupes, [])
        search = self.client.get("/api/v1/prospects/", {"search": "Theirs"}).data["count"]
        self.assertEqual(search, 0)
        export = self.client.get("/api/v1/prospects/export/").content.decode("utf-8-sig")
        self.assertIn("Mine", export)
        self.assertNotIn("Theirs", export)

    def test_dashboard_counts_only_own_records(self):
        summary = self.client.get("/api/v1/dashboard/summary/").data
        self.assertEqual(summary["kpis"]["total_prospects"]["value"], 1)
        feed = self.client.get("/api/v1/dashboard/activity/").data
        self.assertEqual(feed["upcoming"], [])

    def test_bulk_ignores_other_users_ids(self):
        response = self.client.post("/api/v1/prospects/bulk/", {"ids": [self.theirs.pk], "action": "archive"},
                                    format="json")
        self.assertEqual(response.data["updated"], 0)
        self.theirs.refresh_from_db()
        self.assertFalse(self.theirs.is_archived)
