from apps.activities.models import Activity, FollowUp
from apps.activities.services import create_follow_up

from .helpers import ApiTestCase, in_days, make_prospect


class FollowUpTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.prospect = make_prospect(self.user)

    def schedule(self, days=1, kind="call", **extra):
        return create_follow_up(user=self.user, prospect=self.prospect, data={
            "activity_type": kind, "subject": "Check in", "scheduled_at": in_days(days), **extra})

    def test_create_via_api_uses_default_reminder(self):
        response = self.client.post("/api/v1/follow-ups/", {
            "prospect": self.prospect.pk, "activity_type": "call", "subject": "Intro",
            "scheduled_at": in_days(1).isoformat()}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["reminder_minutes"], 30)
        self.assertEqual(response.data["bucket"], "upcoming")

    def test_complete_updates_last_contact_and_creates_activity(self):
        follow_up = self.schedule(days=-1)
        response = self.client.post(f"/api/v1/follow-ups/{follow_up.pk}/complete/",
                                    {"outcome": "Interested in health cover"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "completed")
        self.prospect.refresh_from_db()
        self.assertIsNotNone(self.prospect.last_contacted_at)
        activity = Activity.objects.get(follow_up=follow_up)
        self.assertEqual(activity.outcome, "Interested in health cover")

    def test_non_contact_type_does_not_update_last_contact(self):
        follow_up = self.schedule(days=-1, kind="document")
        self.client.post(f"/api/v1/follow-ups/{follow_up.pk}/complete/", {}, format="json")
        self.prospect.refresh_from_db()
        self.assertIsNone(self.prospect.last_contacted_at)

    def test_cannot_complete_twice(self):
        follow_up = self.schedule()
        self.client.post(f"/api/v1/follow-ups/{follow_up.pk}/complete/", {}, format="json")
        response = self.client.post(f"/api/v1/follow-ups/{follow_up.pk}/complete/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_complete_can_schedule_next_follow_up(self):
        follow_up = self.schedule()
        response = self.client.post(f"/api/v1/follow-ups/{follow_up.pk}/complete/", {
            "outcome": "Done", "next_follow_up": {"activity_type": "presentation", "subject": "Present plan",
                                                  "scheduled_at": in_days(5).isoformat()}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(FollowUp.objects.filter(pk=response.data["next_follow_up_id"], status="pending").exists())

    def test_reschedule_moves_same_record_and_keeps_history(self):
        follow_up = self.schedule(days=1)
        original = follow_up.scheduled_at
        new_time = in_days(4)
        response = self.client.post(f"/api/v1/follow-ups/{follow_up.pk}/reschedule/",
                                    {"scheduled_at": new_time.isoformat(), "reason": "Client asked"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(FollowUp.objects.filter(prospect=self.prospect).count(), 1)
        self.assertEqual(response.data["reschedules"][0]["reason"], "Client asked")
        follow_up.refresh_from_db()
        self.assertNotEqual(follow_up.scheduled_at, original)
        events = self.client.get("/api/v1/calendar/events/", {
            "start": in_days(-1).date().isoformat(), "end": in_days(10).date().isoformat()}).data["events"]
        self.assertEqual(len(events), 1)

    def test_scheduled_at_cannot_be_patched_directly(self):
        follow_up = self.schedule()
        response = self.client.patch(f"/api/v1/follow-ups/{follow_up.pk}/",
                                     {"scheduled_at": in_days(3).isoformat()}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(f"/api/v1/follow-ups/{follow_up.pk}/", {"subject": "New subject"},
                                     format="json")
        self.assertEqual(response.data["subject"], "New subject")

    def test_buckets_and_canceled_items_never_overdue(self):
        overdue = self.schedule(days=-3)
        canceled = self.schedule(days=-3)
        self.schedule(days=5)
        self.client.post(f"/api/v1/follow-ups/{canceled.pk}/cancel/", {"reason": "No longer needed"}, format="json")
        ids = [f["id"] for f in self.client.get("/api/v1/follow-ups/", {"bucket": "overdue"}).data["results"]]
        self.assertEqual(ids, [overdue.pk])
        summary = self.client.get("/api/v1/follow-ups/summary/").data
        self.assertEqual((summary["overdue"], summary["upcoming"], summary["canceled"]), (1, 1, 1))

    def test_cannot_log_future_activity(self):
        response = self.client.post("/api/v1/activities/", {
            "prospect": self.prospect.pk, "activity_type": "call", "subject": "x",
            "occurred_at": in_days(2).isoformat()}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_logging_activity_updates_last_contact_forward_only(self):
        self.client.post("/api/v1/activities/", {"prospect": self.prospect.pk, "activity_type": "call",
                                                  "subject": "Recent", "occurred_at": in_days(-1).isoformat()},
                         format="json")
        self.client.post("/api/v1/activities/", {"prospect": self.prospect.pk, "activity_type": "call",
                                                  "subject": "Old", "occurred_at": in_days(-10).isoformat()},
                         format="json")
        self.prospect.refresh_from_db()
        self.assertGreater(self.prospect.last_contacted_at, in_days(-2))

    def test_calendar_range_validation(self):
        self.assertEqual(self.client.get("/api/v1/calendar/events/", {"start": "2026-01-01",
                                                                       "end": "2026-12-31"}).status_code, 400)

    def test_reminder_notifications_generated_once(self):
        follow_up = create_follow_up(user=self.user, prospect=self.prospect, data={
            "activity_type": "call", "subject": "Soon", "scheduled_at": in_days(0, hours=0.5),
            "reminder_minutes": 60})
        first = self.client.get("/api/v1/notifications/").data
        second = self.client.get("/api/v1/notifications/").data
        self.assertEqual(first["unread_count"], 1)
        self.assertEqual(second["count"], 1)
        self.client.post(f"/api/v1/follow-ups/{follow_up.pk}/complete/", {}, format="json")
        self.assertEqual(self.client.get("/api/v1/notifications/").data["unread_count"], 0)
