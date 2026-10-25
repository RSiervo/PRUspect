from unittest import mock

from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditAction, AuditLog

from .helpers import PASSWORD, make_user

CLIENT_ID = "test-client.apps.googleusercontent.com"
VERIFY = "google.oauth2.id_token.verify_oauth2_token"


def claims(**extra):
    data = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "google-sub-1",
            "email": "New.Person@Gmail.com", "email_verified": True, "given_name": "New", "family_name": "Person"}
    data.update(extra)
    return data


@override_settings(GOOGLE_CLIENT_ID=CLIENT_ID, GOOGLE_SIGNUP_ENABLED=True, GOOGLE_ALLOWED_DOMAINS=[])
class GoogleAuthTests(APITestCase):
    def setUp(self):
        self.client = APIClient()

    def google(self, **claim_overrides):
        with mock.patch(VERIFY, return_value=claims(**claim_overrides)) as verify:
            response = self.client.post("/api/v1/auth/google/", {"credential": "header.payload.sig"}, format="json")
        return response, verify

    def test_config_exposes_client_id(self):
        data = self.client.get("/api/v1/auth/config/").data
        self.assertEqual(data["google_client_id"], CLIENT_ID)
        self.assertTrue(data["google_signup_enabled"])

    def test_first_sign_in_creates_an_empty_account_and_session(self):
        response, verify = self.google()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["created"])
        self.assertIn("access", response.data)
        self.assertTrue(response.cookies[settings.AUTH_COOKIE_NAME]["httponly"])
        # Audience must be checked against our client id.
        self.assertEqual(verify.call_args.args[2], CLIENT_ID)
        user = User.objects.get(email="new.person@gmail.com")
        self.assertEqual((user.first_name, user.last_name, user.google_sub), ("New", "Person", "google-sub-1"))
        self.assertFalse(user.has_usable_password())
        self.assertFalse(response.data["user"]["has_password"])
        self.assertTrue(user.prospect_sources.exists())  # defaults seeded like any new user
        self.assertTrue(AuditLog.objects.filter(user=user, action=AuditAction.SIGNED_UP_GOOGLE).exists())

    def test_second_sign_in_reuses_the_account(self):
        self.google()
        response, _ = self.google()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["created"])
        self.assertEqual(User.objects.filter(email="new.person@gmail.com").count(), 1)

    def test_sign_in_follows_google_id_even_if_email_changes(self):
        self.google()
        response, _ = self.google(email="renamed@gmail.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.count(), 1)

    def test_existing_email_account_is_linked_not_duplicated(self):
        existing = make_user("new.person@gmail.com")
        response, _ = self.google()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["id"], existing.pk)
        existing.refresh_from_db()
        self.assertEqual(existing.google_sub, "google-sub-1")
        self.assertTrue(existing.check_password(PASSWORD))  # password login still works
        self.assertTrue(AuditLog.objects.filter(user=existing, action=AuditAction.GOOGLE_LINKED).exists())

    def test_email_linked_to_another_google_account_is_refused(self):
        user = make_user("new.person@gmail.com")
        User.objects.filter(pk=user.pk).update(google_sub="someone-else")
        response, _ = self.google()
        self.assertEqual(response.status_code, 403)

    def test_unverified_email_is_refused(self):
        response, _ = self.google(email_verified=False)
        self.assertEqual(response.status_code, 401)
        self.assertFalse(User.objects.exists())

    def test_wrong_issuer_is_refused(self):
        response, _ = self.google(iss="https://evil.example.com")
        self.assertEqual(response.status_code, 401)

    def test_invalid_token_is_refused(self):
        with mock.patch(VERIFY, side_effect=ValueError("Token expired")):
            response = self.client.post("/api/v1/auth/google/", {"credential": "bad"}, format="json")
        self.assertEqual(response.status_code, 401)
        self.assertNotIn(settings.AUTH_COOKIE_NAME, response.cookies)

    def test_inactive_account_is_refused(self):
        make_user("new.person@gmail.com", is_active=False)
        response, _ = self.google()
        self.assertEqual(response.status_code, 403)

    @override_settings(GOOGLE_SIGNUP_ENABLED=False)
    def test_sign_up_can_be_closed_while_existing_users_still_sign_in(self):
        response, _ = self.google()
        self.assertEqual(response.status_code, 403)
        make_user("new.person@gmail.com")
        response, _ = self.google()
        self.assertEqual(response.status_code, 200)

    @override_settings(GOOGLE_ALLOWED_DOMAINS=["mycompany.com"])
    def test_sign_up_limited_to_allowed_domains(self):
        response, _ = self.google()
        self.assertEqual(response.status_code, 403)
        response, _ = self.google(email="agent@mycompany.com", sub="sub-2")
        self.assertEqual(response.status_code, 201)

    def test_google_only_user_can_set_a_first_password(self):
        response, _ = self.google()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        r = self.client.post("/api/v1/auth/change-password/", {"new_password": "A-brand-new-pass-1"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(User.objects.get(email="new.person@gmail.com").check_password("A-brand-new-pass-1"))

    def test_password_users_still_need_their_current_password(self):
        make_user("pw@example.com")
        self.client.post("/api/v1/auth/login/", {"email": "pw@example.com", "password": PASSWORD}, format="json")
        token = self.client.post("/api/v1/auth/login/", {"email": "pw@example.com", "password": PASSWORD},
                                 format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        r = self.client.post("/api/v1/auth/change-password/", {"new_password": "A-brand-new-pass-1"}, format="json")
        self.assertEqual(r.status_code, 400)


@override_settings(GOOGLE_CLIENT_ID="")
class GoogleDisabledTests(APITestCase):
    def test_endpoint_reports_disabled_without_client_id(self):
        response = self.client.post("/api/v1/auth/google/", {"credential": "x"}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "google_disabled")
        self.assertIsNone(self.client.get("/api/v1/auth/config/").data["google_client_id"])
