from rest_framework.test import APIClient

from apps.activities.ics import _fold
from apps.activities.services import cancel_follow_up, create_follow_up

from .helpers import ApiTestCase, in_days, make_prospect


class CalendarFeedTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.prospect = make_prospect(self.user, first_name="Maria")
        self.meeting = create_follow_up(user=self.user, prospect=self.prospect, data={
            "activity_type": "presentation", "subject": "Insurance presentation, part 1", "scheduled_at": in_days(2)})
        their = make_prospect(self.other, first_name="Secret", email="s@example.com", mobile="0918 000 1111")
        create_follow_up(user=self.other, prospect=their, data={"activity_type": "call", "subject": "Their call",
                                                                 "scheduled_at": in_days(1)})

    def enable(self, **data):
        return self.client.post("/api/v1/settings/calendar-feed/", data, format="json").data

    def fetch(self, url):
        path = url.split("://", 1)[1].split("/", 1)[1]
        return APIClient().get("/" + path)

    def test_feed_contains_only_own_follow_ups(self):
        info = self.enable()
        self.assertTrue(info["enabled"])
        self.assertTrue(info["webcal_url"].startswith("webcal://"))
        response = self.fetch(info["url"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/calendar; charset=utf-8")
        body = response.content.decode()
        self.assertIn("BEGIN:VCALENDAR", body)
        self.assertIn(f"UID:followup-{self.meeting.pk}@pruspect", body)
        self.assertIn("SUMMARY:Insurance presentation\\, part 1 — Maria Santos", body)
        self.assertNotIn("Secret", body)
        self.assertNotIn("Their call", body)

    def test_names_can_be_hidden(self):
        info = self.enable(show_names=False)
        body = self.fetch(info["url"]).content.decode()
        self.assertNotIn("Maria", body)
        self.assertIn("Insurance Presentation (PRUspect)", body)

    def test_canceled_events_are_marked(self):
        cancel_follow_up(user=self.user, follow_up=self.meeting)
        body = self.fetch(self.enable()["url"]).content.decode()
        self.assertIn("STATUS:CANCELLED", body)

    def test_replace_and_disable_revoke_old_links(self):
        old = self.enable()["url"]
        new = self.enable()["url"]
        self.assertNotEqual(old, new)
        self.assertEqual(self.fetch(old).status_code, 404)
        self.assertEqual(self.fetch(new).status_code, 200)
        self.client.delete("/api/v1/settings/calendar-feed/")
        self.assertEqual(self.fetch(new).status_code, 404)

    def test_unknown_token_is_404(self):
        self.assertEqual(APIClient().get("/api/v1/calendar/feed/not-a-real-token-at-all-xxxxxxxxxxxxxx.ics").status_code, 404)

    def test_long_lines_are_folded(self):
        folded = _fold("SUMMARY:" + "x" * 200)
        self.assertTrue(all(len(part.encode()) <= 75 for part in folded.split("\r\n")))
