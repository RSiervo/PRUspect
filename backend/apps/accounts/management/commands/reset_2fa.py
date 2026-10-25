from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.accounts.two_factor import disable


class Command(BaseCommand):
    help = "Turn off two-step verification for an account that lost its phone and recovery codes."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, email, **options):
        user = User.objects.filter(email__iexact=email.strip()).first()
        if user is None:
            raise CommandError(f"No account with email {email}")
        disable(user)
        self.stdout.write(self.style.SUCCESS(f"Two-step verification turned off for {user.email}. They can set it up again in Settings."))
