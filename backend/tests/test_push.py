import json
from unittest import mock

from django.test import override_settings
from rest_framework.test import APIClient

from apps.activities.services import create_follow_up
from apps.notifications.models import Notification, NotificationKind, PushSubscription

from .helpers import ApiTestCase, in_days, make_prospect

SUB = {"endpoint": "https://push.example.com/send/abc", "keys": {"p256dh": "BPublicKey", "auth": "authSecret"}}
KEYS = {"VAPID_PUBLIC_KEY": "BPub", "VAPID_PRIVATE_KEY": "priv", "VAPID_SUBJECT": "mailto:test@example.com"}


@override_settings(**KEYS)
class PushTests(ApiTestCase):
    def test_subscribe_config_and_unsubscribe(self):
        self.assertEqual(self.client.post("/api/v1/push/subscribe/", {"subscription": SUB}, format="json").status_code, 201)
        config = self.client.get("/api/v1/push/config/").data
        self.assertEqual((config["enabled"], config["public_key"], config["devices"]), (True, "BPub", 1))
        self.assertEqual(self.client.delete("/api/v1/push/subscribe/", {"endpoint": SUB["endpoint"]}, format="json").data["deleted"], 1)

    def test_rejects_invalid_subscriptions(self):
        bad = {"endpoint": "http://insecure.example.com", "keys": {}}
        self.assertEqual(self.client.post("/api/v1/push/subscribe/", {"subscription": bad}, format="json").status_code, 400)

    def test_new_notifications_are_pushed(self):
        self.client.post("/api/v1/push/subscribe/", {"subscription": SUB}, format="json")
        with mock.patch("pywebpush.webpush") as webpush:
            Notification.objects.create(user=self.user, kind=NotificationKind.SYSTEM, title="Hello", body="World", link="/x")
        payload = json.loads(webpush.call_args.kwargs["data"])
        self.assertEqual((payload["title"], payload["url"]), ("Hello", "/x"))
        self.assertEqual(webpush.call_args.kwargs["subscription_info"]["endpoint"], SUB["endpoint"])

    def test_expired_subscriptions_are_removed(self):
        from pywebpush import WebPushException

        self.client.post("/api/v1/push/subscribe/", {"subscription": SUB}, format="json")
        gone = WebPushException("gone", response=mock.Mock(status_code=410))
        with mock.patch("pywebpush.webpush", side_effect=gone):
            Notification.objects.create(user=self.user, kind=NotificationKind.SYSTEM, title="Hello")
        self.assertFalse(PushSubscription.objects.exists())

    def test_push_is_per_user(self):
        self.other_client.post("/api/v1/push/subscribe/", {"subscription": SUB}, format="json")
        with mock.patch("pywebpush.webpush") as webpush:
            Notification.objects.create(user=self.user, kind=NotificationKind.SYSTEM, title="Mine")
        webpush.assert_not_called()


@override_settings(CRON_SECRET="s3cret-value")
class CronTests(ApiTestCase):
    def test_requires_the_secret(self):
        anon = APIClient()
        self.assertEqual(anon.post("/api/v1/cron/run/").status_code, 403)
        self.assertEqual(anon.post("/api/v1/cron/run/", HTTP_AUTHORIZATION="Bearer wrong").status_code, 403)

    def test_generates_reminders_for_all_users(self):
        prospect = make_prospect(self.user)
        create_follow_up(user=self.user, prospect=prospect, data={"activity_type": "call", "subject": "Late",
                                                                   "scheduled_at": in_days(-2)})
        response = APIClient().post("/api/v1/cron/run/", HTTP_AUTHORIZATION="Bearer s3cret-value")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["ok"])
        self.assertGreaterEqual(response.data["notifications_created"], 1)
        self.assertTrue(Notification.objects.filter(user=self.user, kind=NotificationKind.OVERDUE).exists())

    @override_settings(CRON_SECRET="")
    def test_disabled_without_secret(self):
        self.assertEqual(APIClient().post("/api/v1/cron/run/", HTTP_AUTHORIZATION="Bearer ").status_code, 403)
