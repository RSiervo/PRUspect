from django.db import migrations


def seed(apps, schema_editor):
    from apps.prospects.defaults import DEFAULT_MESSAGE_TEMPLATES

    User = apps.get_model("accounts", "User")
    MessageTemplate = apps.get_model("activities", "MessageTemplate")
    for user in User.objects.all():
        for index, (name, channel, subject, body) in enumerate(DEFAULT_MESSAGE_TEMPLATES):
            MessageTemplate.objects.get_or_create(
                owner=user, name=name, defaults={"channel": channel, "subject": subject, "body": body, "sort_order": index}
            )


class Migration(migrations.Migration):
    dependencies = [
        ("activities", "0002_message_templates"),
        ("accounts", "0002_google_sign_in"),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
