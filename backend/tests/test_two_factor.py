import time
from unittest import mock

import pyotp
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User

from .helpers import PASSWORD, ApiTestCase, make_user


def code_for(user, offset_steps=0):
    user.refresh_from_db()
    totp = pyotp.TOTP(user.totp_secret)
    return totp.generate_otp(int(time.time()) // totp.interval + offset_steps)


def enable_2fa(client, user):
    client.post("/api/v1/auth/2fa/setup/")
    response = client.post("/api/v1/auth/2fa/confirm/", {"code": code_for(user)})
    assert response.status_code == 200, response.data
    return response.data["recovery_codes"]


class TwoFactorSetupTests(ApiTestCase):
    def test_setup_confirm_and_status(self):
        setup = self.client.post("/api/v1/auth/2fa/setup/").data
        self.assertTrue(setup["otpauth_uri"].startswith("otpauth://totp/PRUspect"))
        self.assertTrue(setup["qr_svg"].startswith("data:image/svg+xml"))
        self.assertEqual(self.client.post("/api/v1/auth/2fa/confirm/", {"code": "000000"}).status_code, 400)
        codes = self.client.post("/api/v1/auth/2fa/confirm/", {"code": code_for(self.user)}).data["recovery_codes"]
        self.assertEqual(len(codes), 10)
        status = self.client.get("/api/v1/auth/2fa/").data
        self.assertEqual((status["enabled"], status["recovery_codes_left"]), (True, 10))
        self.assertTrue(self.client.get("/api/v1/auth/me/").data["two_factor_enabled"])
        self.assertEqual(self.client.post("/api/v1/auth/2fa/setup/").status_code, 409)
        self.user.refresh_from_db()
        self.assertNotIn(codes[0].replace("-", ""), str(self.user.recovery_codes))  # only hashes are stored

    def test_disable_needs_a_valid_code(self):
        enable_2fa(self.client, self.user)
        self.assertEqual(self.client.post("/api/v1/auth/2fa/disable/", {"code": "123456"}).status_code, 400)
        with mock.patch("time.time", return_value=time.time() + 60):
            response = self.client.post("/api/v1/auth/2fa/disable/", {"code": code_for(self.user)})
        self.assertEqual(response.data["enabled"], False)
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)


class TwoFactorLoginTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.codes = enable_2fa(self.client, self.user)
        self.anon = APIClient()

    def login(self):
        return self.anon.post("/api/v1/auth/login/", {"email": self.user.email, "password": PASSWORD})

    def test_password_login_stops_at_challenge(self):
        response = self.login()
        self.assertTrue(response.data["two_factor_required"])
        self.assertNotIn("access", response.data)
        self.assertNotIn("pruspect_refresh", response.cookies)

    def test_verify_with_app_code(self):
        challenge = self.login().data["challenge"]
        with mock.patch("time.time", return_value=time.time() + 60):
            response = self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": challenge, "code": code_for(self.user)})
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("pruspect_refresh", response.cookies)

    def test_codes_cannot_be_reused(self):
        with mock.patch("time.time", return_value=time.time() + 60):
            code = code_for(self.user)
            first = self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": self.login().data["challenge"], "code": code})
            second = self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": self.login().data["challenge"], "code": code})
        self.assertEqual((first.status_code, second.status_code), (200, 400))

    def test_recovery_code_works_once(self):
        challenge = self.login().data["challenge"]
        response = self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": challenge, "code": self.codes[0].upper()})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data["recovery_code_used"], response.data["recovery_codes_left"]), (True, 9))
        again = self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": self.login().data["challenge"], "code": self.codes[0]})
        self.assertEqual(again.status_code, 400)

    def test_bad_or_expired_challenge(self):
        self.assertEqual(self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": "forged", "code": "123456"}).status_code, 401)
        challenge = self.login().data["challenge"]
        with mock.patch("time.time", return_value=time.time() + 600):
            response = self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": challenge, "code": code_for(self.user, 20)})
        self.assertEqual(response.status_code, 401)

    def test_challenge_dies_when_2fa_is_reset(self):
        challenge = self.login().data["challenge"]
        from django.core.management import call_command

        call_command("reset_2fa", self.user.email, stdout=mock.Mock())
        self.assertEqual(self.anon.post("/api/v1/auth/2fa/verify/", {"challenge": challenge, "code": self.codes[1]}).status_code, 401)
        self.assertIn("access", self.login().data)  # now a normal login again

    def test_google_login_also_requires_code(self):
        self.user.google_sub = "g-123"
        self.user.save(update_fields=["google_sub"])
        from apps.accounts.google import GoogleIdentity

        identity = GoogleIdentity(sub="g-123", email=self.user.email, first_name="", last_name="")
        with override_settings(GOOGLE_CLIENT_ID="cid"), mock.patch("apps.accounts.views.verify_credential", return_value=identity):
            response = self.anon.post("/api/v1/auth/google/", {"credential": "x"})
        self.assertTrue(response.data["two_factor_required"])
        self.assertNotIn("access", response.data)

    def test_recovery_codes_can_be_replaced(self):
        with mock.patch("time.time", return_value=time.time() + 60):
            response = self.client.post("/api/v1/auth/2fa/recovery-codes/", {"code": code_for(self.user)})
        self.assertEqual(len(response.data["recovery_codes"]), 10)
        self.assertNotEqual(response.data["recovery_codes"], self.codes)


class AdminRequires2FATests(ApiTestCase):
    def test_admin_pages_need_2fa(self):
        admin = make_user("admin@example.com", is_staff=True)
        client = APIClient()
        client.force_authenticate(admin)
        response = client.get("/api/v1/admin/users/")
        self.assertEqual((response.status_code, response.data["code"]), (403, "two_factor_required"))
        self.assertTrue(client.get("/api/v1/auth/me/").data["two_factor_required"])
        enable_2fa(client, admin)
        self.assertEqual(client.get("/api/v1/admin/users/").status_code, 200)
        self.assertEqual(client.get("/api/v1/admin/errors/").status_code, 200)

    @override_settings(ADMIN_REQUIRE_2FA=False)
    def test_requirement_can_be_turned_off(self):
        admin = make_user("admin@example.com", is_staff=True)
        client = APIClient()
        client.force_authenticate(admin)
        self.assertEqual(client.get("/api/v1/admin/users/").status_code, 200)

    def test_regular_users_are_not_asked(self):
        self.assertFalse(self.client.get("/api/v1/auth/me/").data["two_factor_required"])
        self.assertEqual(self.client.get("/api/v1/admin/users/").status_code, 403)
        self.assertIn("access", APIClient().post("/api/v1/auth/login/", {"email": self.user.email, "password": PASSWORD}).data)
        self.assertFalse(User.objects.get(pk=self.user.pk).two_factor_enabled)
