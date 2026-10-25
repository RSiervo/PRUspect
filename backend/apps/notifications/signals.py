from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification


@receiver(post_save, sender=Notification)
def push_new_notification(sender, instance, created, **kwargs):
    """Every new in-app notification is also pushed to the user's devices (if enabled)."""
    if not created or instance.read_at is not None:
        return
    from .push import send_to_user

    send_to_user(instance.user, instance.title, instance.body, instance.link, tag=f"n{instance.pk}")
