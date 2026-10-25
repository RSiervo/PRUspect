"""Timezone helpers. Stored datetimes are UTC; date ranges are computed in the user's zone."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone


def user_tz(user) -> ZoneInfo:
    prefs = getattr(user, "settings", None)
    name = getattr(prefs, "time_zone", None) or settings.DEFAULT_USER_TIME_ZONE
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo(settings.DEFAULT_USER_TIME_ZONE)


def local_today(user) -> date:
    return timezone.now().astimezone(user_tz(user)).date()


def day_start(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz)


def day_range(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    return day_start(day, tz), day_start(day + timedelta(days=1), tz)


def week_range(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Monday 00:00 up to the next Monday 00:00 in the user's zone."""
    monday = day - timedelta(days=day.weekday())
    return day_start(monday, tz), day_start(monday + timedelta(days=7), tz)


def add_months(day: date, months: int) -> date:
    """First day of the month `months` away from `day`'s month."""
    index = day.month - 1 + months
    return date(day.year + index // 12, index % 12 + 1, 1)


def month_range(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    first = day.replace(day=1)
    return day_start(first, tz), day_start(add_months(first, 1), tz)


def quarter_start(day: date) -> date:
    return date(day.year, 3 * ((day.month - 1) // 3) + 1, 1)


def parse_date_param(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None
