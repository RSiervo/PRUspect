"""Normalization used for duplicate detection."""

import re


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def normalize_phone(value: str | None) -> str:
    """Return digits only, with Philippine mobile numbers in 63XXXXXXXXXX form.

    09171234567, +63 917 123 4567 and 63-917-123-4567 all become 639171234567.
    """
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        return ""
    if digits.startswith("0") and len(digits) == 11:
        return "63" + digits[1:]
    if digits.startswith("9") and len(digits) == 10:
        return "63" + digits
    return digits
