from datetime import timedelta

from django.utils import timezone

from apps.activities.models import MessageTemplate
from apps.activities.services import create_follow_up
from apps.prospects.models import Prospect
from apps.prospects.services import change_status

from .helpers import ApiTestCase, in_days, make_prospect


class MessageTemplateTests(ApiTestCase):
    def test_new_users_get_default_templates(self):
        names = [t["name"] for t in self.client.get("/api/v1/settings/message-templates/").data]
        self.assertIn("First contact", names)
        self.assertGreaterEqual(len(names), 5)

    def test_crud_and_isolation(self):
        created = self.client.post("/api/v1/settings/message-templates/",
                                   {"name": "Promo", "channel": "sms", "body": "Hi {first_name}!"}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        duplicate = self.client.post("/api/v1/settings/message-templates/", {"name": "promo", "body": "x"}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(self.other_client.get(f"/api/v1/settings/message-templates/{created.data['id']}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/v1/settings/message-templates/{created.data['id']}/").status_code, 204)
        self.assertFalse(MessageTemplate.objects.filter(name="Promo").exists())


class TodayTests(ApiTestCase):
    def test_today_lists_agenda_overdue_stale_and_no_next_step(self):
        fresh = make_prospect(self.user, first_name="Fresh")
        cold = make_prospect(self.user, first_name="Cold", mobile="0917 111 0001")
        Prospect.objects.filter(pk=cold.pk).update(created_at=timezone.now() - timedelta(days=60))
        lost = make_prospect(self.user, first_name="Lost", mobile="0917 111 0002")
        change_status(user=self.user, prospect=lost, new_status="lost")
        create_follow_up(user=self.user, prospect=fresh, data={"activity_type": "call", "subject": "Today",
                                                                "scheduled_at": timezone.now()})
        create_follow_up(user=self.user, prospect=fresh, data={"activity_type": "call", "subject": "Late",
                                                                "scheduled_at": in_days(-3)})
        data = self.client.get("/api/v1/dashboard/today/").data
        self.assertEqual([f["subject"] for f in data["agenda"]], ["Today"])
        self.assertEqual(data["overdue_count"], 1)
        self.assertEqual([p["full_name"] for p in data["stale"]], ["Cold Santos"])
        # Cold has no follow-up; Lost is closed so it's not "slipping".
        self.assertEqual([p["full_name"] for p in data["no_next_step"]], ["Cold Santos"])
