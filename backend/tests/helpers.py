from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.prospects.models import Prospect
from apps.prospects.services import create_prospect

PASSWORD = "Str0ng-Test-Pass!"


def make_user(email="owner@example.com", **extra):
    return get_user_model().objects.create_user(email=email, password=PASSWORD, first_name="Test",
                                                last_name="User", **extra)


def make_prospect(user, **data) -> Prospect:
    payload = {"first_name": "Maria", "last_name": "Santos", "mobile": "0917 123 4567",
               "email": "maria@example.com"}
    payload.update(data)
    interests = payload.pop("interests", None)
    return create_prospect(user=user, data=payload, interests=interests)


def in_days(days: float, hours: float = 0):
    return timezone.now() + timedelta(days=days, hours=hours)


class ApiTestCase(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.other = make_user("other@example.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.other_client = APIClient()
        self.other_client.force_authenticate(self.other)
