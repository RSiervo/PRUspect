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
