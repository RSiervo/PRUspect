from django.conf import settings
from rest_framework.test import APIClient, APITestCase

from apps.audit.models import AuditAction, AuditLog

from .helpers import PASSWORD, make_prospect, make_user

AJAX = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


class AdminUsersTests(APITestCase):
    def setUp(self):
        self.admin = make_user("admin@example.com", is_staff=True)
        self.member = make_user("member@example.com")
        make_prospect(self.member, first_name="Secret", last_name="Client")
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def test_non_admins_are_forbidden(self):
        client = APIClient()
        client.force_authenticate(self.member)
        self.assertEqual(client.get("/api/v1/admin/users/").status_code, 403)
        self.assertEqual(client.post(f"/api/v1/admin/users/{self.admin.pk}/deactivate/").status_code, 403)
        self.assertEqual(APIClient().get("/api/v1/admin/users/").status_code, 401)

    def test_list_shows_counts_but_not_prospect_content(self):
        response = self.admin_client.get("/api/v1/admin/users/", {"search": "member"})
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual((row["email"], row["prospect_count"], row["sign_in_methods"]), ("member@example.com", 1, ["password"]))
        self.assertNotIn("Secret", str(response.data))

    def test_summary(self):
        data = self.admin_client.get("/api/v1/admin/users/summary/").data
        self.assertEqual((data["total"], data["active"], data["new_this_week"]), (2, 2, 2))

    def test_filters(self):
        self.member.google_sub = "g-1"
        self.member.save()
        emails = [u["email"] for u in self.admin_client.get("/api/v1/admin/users/", {"method": "google"}).data["results"]]
        self.assertEqual(emails, ["member@example.com"])

    def test_deactivation_ends_sessions_immediately_and_is_audited(self):
        member_client = APIClient()
        login = member_client.post("/api/v1/auth/login/", {"email": "member@example.com", "password": PASSWORD}, format="json")
        access = login.data["access"]
        refresh_cookie = member_client.cookies[settings.AUTH_COOKIE_NAME].value

        response = self.admin_client.post(f"/api/v1/admin/users/{self.member.pk}/deactivate/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])

        # Existing access token is rejected, the refresh cookie no longer works, and login fails.
        member_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(member_client.get("/api/v1/prospects/").status_code, 401)
        member_client.credentials()
        member_client.cookies[settings.AUTH_COOKIE_NAME] = refresh_cookie
        self.assertEqual(member_client.post("/api/v1/auth/refresh/", **AJAX).status_code, 401)
        self.assertEqual(member_client.post("/api/v1/auth/login/", {"email": "member@example.com", "password": PASSWORD},
                                            format="json").status_code, 401)
        self.assertTrue(AuditLog.objects.filter(user=self.admin, action=AuditAction.USER_DEACTIVATED).exists())

        self.admin_client.post(f"/api/v1/admin/users/{self.member.pk}/reactivate/")
        self.assertEqual(member_client.post("/api/v1/auth/login/", {"email": "member@example.com", "password": PASSWORD},
                                            format="json").status_code, 200)

    def test_cannot_deactivate_yourself(self):
        response = self.admin_client.post(f"/api/v1/admin/users/{self.admin.pk}/deactivate/")
        self.assertEqual(response.status_code, 400)

    def test_only_superusers_can_change_superusers(self):
        boss = make_user("boss@example.com", is_staff=True, is_superuser=True)
        self.assertEqual(self.admin_client.post(f"/api/v1/admin/users/{boss.pk}/deactivate/").status_code, 403)

    def test_me_reports_admin_flag(self):
        self.assertTrue(self.admin_client.get("/api/v1/auth/me/").data["is_staff"])
