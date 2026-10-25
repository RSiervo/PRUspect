from django.conf import settings
from rest_framework.test import APIClient, APITestCase

from .helpers import PASSWORD, make_user

AJAX = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


class AuthTests(APITestCase):
    def setUp(self):
        self.user = make_user("advisor@example.com")
        self.client = APIClient()

    def login(self, password=PASSWORD, email="advisor@example.com"):
        return self.client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")

    def test_login_returns_access_and_sets_httponly_refresh_cookie(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        cookie = response.cookies[settings.AUTH_COOKIE_NAME]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/v1/auth/")
        self.assertEqual(response.data["user"]["email"], "advisor@example.com")

    def test_login_is_case_insensitive_for_email(self):
        self.assertEqual(self.login(email="ADVISOR@example.com").status_code, 200)

    def test_wrong_password_rejected(self):
        response = self.login(password="nope")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "invalid_credentials")

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.login().status_code, 401)

    def test_api_requires_authentication(self):
        self.assertEqual(self.client.get("/api/v1/prospects/").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_access_token_grants_access(self):
        access = self.login().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)

    def test_refresh_requires_custom_header(self):
        self.login()
        self.assertEqual(self.client.post("/api/v1/auth/refresh/").status_code, 403)

    def test_refresh_rotates_and_blacklists_old_token(self):
        self.login()
        old = self.client.cookies[settings.AUTH_COOKIE_NAME].value
        response = self.client.post("/api/v1/auth/refresh/", **AJAX)
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        new = response.cookies[settings.AUTH_COOKIE_NAME].value
        self.assertNotEqual(old, new)
        # Replaying the old refresh token fails.
        self.client.cookies[settings.AUTH_COOKIE_NAME] = old
        self.assertEqual(self.client.post("/api/v1/auth/refresh/", **AJAX).status_code, 401)

    def test_refresh_without_cookie(self):
        self.assertEqual(self.client.post("/api/v1/auth/refresh/", **AJAX).status_code, 401)

    def test_logout_blacklists_refresh_and_clears_cookie(self):
        self.login()
        token = self.client.cookies[settings.AUTH_COOKIE_NAME].value
        response = self.client.post("/api/v1/auth/logout/", **AJAX)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.cookies[settings.AUTH_COOKIE_NAME].value, "")
        self.client.cookies[settings.AUTH_COOKIE_NAME] = token
        self.assertEqual(self.client.post("/api/v1/auth/refresh/", **AJAX).status_code, 401)

    def test_change_password_requires_current_password(self):
        access = self.login().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        bad = self.client.post("/api/v1/auth/change-password/",
                               {"current_password": "wrong", "new_password": "An0ther-Strong-Pass"}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post("/api/v1/auth/change-password/",
                              {"current_password": PASSWORD, "new_password": "An0ther-Strong-Pass"}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("An0ther-Strong-Pass"))

    def test_settings_default_to_manila_and_validate_timezone(self):
        access = self.login().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.client.get("/api/v1/settings/").data["time_zone"], "Asia/Manila")
        self.assertEqual(self.client.patch("/api/v1/settings/", {"time_zone": "Mars/Base"}, format="json").status_code,
                         400)
        self.assertEqual(self.client.patch("/api/v1/settings/", {"time_zone": "Asia/Singapore"},
                                           format="json").status_code, 200)

    def test_new_user_gets_default_sources_and_categories(self):
        self.assertTrue(self.user.prospect_sources.exists())
        self.assertTrue(self.user.product_categories.exists())
