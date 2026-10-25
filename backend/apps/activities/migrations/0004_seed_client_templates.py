from django.db import migrations


def seed(apps, schema_editor):
    # Adds templates introduced later (e.g. Birthday greeting); existing ones are left untouched.
    from apps.prospects.defaults import DEFAULT_MESSAGE_TEMPLATES

    User = apps.get_model("accounts", "User")
    MessageTemplate = apps.get_model("activities", "MessageTemplate")
    for user in User.objects.all():
        for index, (name, channel, subject, body) in enumerate(DEFAULT_MESSAGE_TEMPLATES):
            MessageTemplate.objects.get_or_create(
                owner=user, name=name, defaults={"channel": channel, "subject": subject, "body": body, "sort_order": index}
            )


class Migration(migrations.Migration):
    dependencies = [("activities", "0003_seed_message_templates")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
