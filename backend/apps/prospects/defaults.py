"""Default configurable choices seeded for every new user.

Categories are generic interest areas, not specific product names. Confirm
actual product availability through authorized company sources.
"""

DEFAULT_SOURCES = [
    "Referral",
    "Personal Network",
    "Social Media",
    "Event / Seminar",
    "Workplace",
    "Walk-in / Inquiry",
    "Cold Outreach",
    "Other",
]

DEFAULT_PRODUCT_CATEGORIES = [
    ("Life Protection", "Income replacement and family protection"),
    ("Health", "Hospitalization and medical cost coverage"),
    ("Critical Illness", "Lump-sum benefit on diagnosis of covered illness"),
    ("Education", "Funding for children's education"),
    ("Retirement", "Long-term retirement savings"),
    ("Savings & Investment", "Investment-linked or savings-oriented plans"),
    ("Estate Planning", "Wealth transfer and estate concerns"),
    ("Group / Employee Benefits", "Coverage for a company's employees"),
]


def seed_user_choices(user) -> None:
    from .models import ProductCategory, ProspectSource

    for index, name in enumerate(DEFAULT_SOURCES):
        ProspectSource.objects.get_or_create(owner=user, name=name, defaults={"sort_order": index})
    for index, (name, description) in enumerate(DEFAULT_PRODUCT_CATEGORIES):
        ProductCategory.objects.get_or_create(
            owner=user, name=name, defaults={"sort_order": index, "description": description}
        )


DEFAULT_MESSAGE_TEMPLATES = [
    ("First contact", "sms", "",
     "Hi {preferred_name}, this is {advisor_name}. Thank you for your time! I'd love to share a few options that fit "
     "your goals. When would be a good time for a quick call?"),
    ("Meeting reminder", "sms", "",
     "Hi {preferred_name}! Just a friendly reminder of our meeting on {next_follow_up}. See you then. — {advisor_name}"),
    ("After the presentation", "email", "Thank you for your time, {first_name}",
     "Hi {preferred_name},\n\nThank you for meeting with me. As promised, here is a summary of what we discussed. "
     "Feel free to reply with any questions — I'm happy to help.\n\nBest regards,\n{advisor_name}"),
    ("Checking in", "any", "",
     "Hi {preferred_name}, hope you're well! Just checking in — let me know if you'd like to continue our "
     "conversation about your plans. — {advisor_name}"),
    ("Referral thank-you", "any", "",
     "Hi {preferred_name}, thank you for trusting me. If you know anyone who might benefit from a quick review of "
     "their protection, I'd be grateful for an introduction. — {advisor_name}"),
]


def seed_message_templates(user) -> None:
    from apps.activities.models import MessageTemplate

    for index, (name, channel, subject, body) in enumerate(DEFAULT_MESSAGE_TEMPLATES):
        MessageTemplate.objects.get_or_create(
            owner=user, name=name, defaults={"channel": channel, "subject": subject, "body": body, "sort_order": index}
        )
