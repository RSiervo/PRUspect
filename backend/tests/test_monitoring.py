from unittest import mock

from django.core import mail
from django.test import override_settings
from rest_framework.test import APIClient

from apps.monitoring.models import ErrorEvent
from apps.monitoring.services import MAX_ALERTS_PER_HOUR, capture
from apps.notifications.models import Notification, NotificationKind

from .helpers import ApiTestCase, make_user, make_admin


class ErrorCaptureTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_admin("admin@example.com")
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def crash(self, path="/api/v1/dashboard/today/"):
        self.client.raise_request_exception = False
        with mock.patch("apps.dashboard.views.TodayView.get", side_effect=RuntimeError("boom for maria@example.com 09171234567")):
            return self.client.get(path)

    def test_server_crash_is_recorded_and_admins_alerted(self):
        self.assertEqual(self.crash().status_code, 500)
        event = ErrorEvent.objects.get()
        self.assertEqual((event.source, event.error_type, event.count), ("server", "RuntimeError", 1))
        self.assertEqual(event.location, "GET /api/v1/dashboard/today/")
        self.assertNotIn("maria@example.com", event.message)
        self.assertNotIn("09171234567", event.message)
        self.assertIn("[email]", event.message)
        alerts = Notification.objects.filter(kind=NotificationKind.SYSTEM)
        self.assertEqual(list(alerts.values_list("user__email", flat=True)), ["admin@example.com"])

    def test_repeats_are_grouped_and_alert_once(self):
        self.crash()
        self.crash()
        self.assertEqual(ErrorEvent.objects.get().count, 2)
        self.assertEqual(Notification.objects.filter(user=self.admin).count(), 1)

    def test_resolved_errors_alert_again_when_they_come_back(self):
        self.crash()
        event = ErrorEvent.objects.get()
        self.admin_client.post(f"/api/v1/admin/errors/{event.pk}/resolve/")
        self.crash()
        event.refresh_from_db()
        self.assertIsNone(event.resolved_at)
        self.assertEqual(Notification.objects.filter(user=self.admin).count(), 2)
        self.assertTrue(Notification.objects.filter(user=self.admin, title__startswith="Error is back").exists())

    def test_handled_errors_are_not_recorded(self):
        self.assertEqual(self.client.get("/api/v1/prospects/999999/").status_code, 404)
        self.assertFalse(ErrorEvent.objects.exists())

    def test_alert_storms_are_capped(self):
        for i in range(MAX_ALERTS_PER_HOUR + 5):
            capture(source="server", error_type=f"Type{chr(65 + i)}", message="x", location=f"/p{chr(65 + i)}")
        self.assertEqual(Notification.objects.filter(user=self.admin).count(), MAX_ALERTS_PER_HOUR)

    def test_browser_reports(self):
        anon = APIClient()
        body = {"error_type": "TypeError", "message": "x is undefined", "stack": "at render (index.js:1:2)", "path": "/prospects/42?tab=notes"}
        self.assertEqual(anon.post("/api/v1/errors/report/", body, format="json").status_code, 204)
        self.assertEqual(self.client.post("/api/v1/errors/report/", body, format="json").status_code, 204)
        event = ErrorEvent.objects.get()
        self.assertEqual((event.source, event.location, event.count, event.users_affected), ("browser", "/prospects/:id", 2, 1))
        self.assertEqual(anon.post("/api/v1/errors/report/", {}, format="json").status_code, 400)

    def test_admin_only_list_and_actions(self):
        self.crash()
        self.assertEqual(self.client.get("/api/v1/admin/errors/").status_code, 403)
        self.assertEqual(self.admin_client.get("/api/v1/admin/errors/").data["count"], 1)
        summary = self.admin_client.get("/api/v1/admin/errors/summary/").data
        self.assertEqual((summary["open"], summary["occurrences_open"]), (1, 1))
        self.assertEqual(self.admin_client.post("/api/v1/admin/errors/resolve-all/").data["resolved"], 1)
        self.assertEqual(self.admin_client.get("/api/v1/admin/errors/").data["count"], 0)
        self.assertEqual(self.admin_client.get("/api/v1/admin/errors/?status=resolved").data["count"], 1)

    def test_test_alert(self):
        for _ in range(2):
            self.assertEqual(self.admin_client.post("/api/v1/admin/errors/test-alert/").status_code, 201)
        self.assertEqual(ErrorEvent.objects.filter(error_type="TestAlert").count(), 1)
        self.assertEqual(Notification.objects.filter(user=self.admin).count(), 2)
        self.assertEqual(self.client.post("/api/v1/admin/errors/test-alert/").status_code, 403)


@override_settings(EMAIL_HOST="smtp.example.com", ERROR_ALERT_EMAILS=["ops@example.com"], SITE_URL="https://crm.example.com")
class ErrorEmailTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_admin("admin@example.com")
        mail.outbox = []

    def test_new_error_emails_admins_and_extra_addresses(self):
        capture(source="server", error_type="RuntimeError", message="boom for maria@example.com", location="GET /api/v1/x/")
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ["admin@example.com", "ops@example.com"])
        msg = mail.outbox[0]
        self.assertIn("New error: RuntimeError", msg.subject)
        self.assertIn("https://crm.example.com/admin/system?error=", msg.body)
        self.assertNotIn("maria@example.com", msg.body)

    def test_repeats_do_not_email_again(self):
        for _ in range(3):
            capture(source="server", error_type="RuntimeError", message="same", location="/x")
        self.assertEqual(len(mail.outbox), 2)

    @override_settings(EMAIL_HOST="")
    def test_no_email_without_smtp(self):
        capture(source="server", error_type="RuntimeError", message="x", location="/x")
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(Notification.objects.filter(user=self.admin).count(), 1)

    def test_email_failure_does_not_break_alerts(self):
        with mock.patch("django.core.mail.backends.locmem.EmailBackend.send_messages", side_effect=OSError("smtp down")):
            capture(source="server", error_type="RuntimeError", message="x", location="/x")
        self.assertEqual(Notification.objects.filter(user=self.admin).count(), 1)
