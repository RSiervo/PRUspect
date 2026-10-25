from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.notifications.services import generate_for_user


class Command(BaseCommand):
    help = "Create in-app reminder/overdue notifications for all active users (safe to run repeatedly)."

    def handle(self, *args, **options):
        total = 0
        for user in get_user_model().objects.filter(is_active=True):
            total += generate_for_user(user)
        self.stdout.write(self.style.SUCCESS(f"Created {total} notification(s)."))
