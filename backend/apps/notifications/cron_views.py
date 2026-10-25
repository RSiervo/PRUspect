"""Scheduler entry point: generate reminders (and pushes) for every active user.

Called every 30 minutes by .github/workflows/scheduler.yml (or any cron
service) with `Authorization: Bearer <CRON_SECRET>`. Also reports health.
"""

import hmac

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import generate_for_user


class CronRunView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        expected = settings.CRON_SECRET
        supplied = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not expected or not hmac.compare_digest(supplied, expected):
            return Response({"detail": "Not allowed.", "code": "forbidden", "errors": {}}, status=403)
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        created = 0
        users = get_user_model().objects.filter(is_active=True)
        for user in users:
            created += generate_for_user(user)
        return Response({"ok": True, "users": users.count(), "notifications_created": created})
