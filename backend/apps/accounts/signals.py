from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserSettings


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_defaults(sender, instance, created, raw=False, **kwargs):
    # raw=True during `loaddata`: the fixture already contains the user's settings and choices.
    if not created or raw:
        return
    UserSettings.objects.get_or_create(user=instance)
    # Seed the user's configurable sources and product categories.
    from apps.prospects.defaults import seed_user_choices

    seed_user_choices(instance)
