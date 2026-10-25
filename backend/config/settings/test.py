from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
AUTH_COOKIE_SECURE = False
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "user": "100000/hour",
        "auth_login": "1000/min",
        "auth_refresh": "1000/min",
        "calendar_feed": "1000/min",
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"null": {"class": "logging.NullHandler"}},
    "loggers": {"django.request": {"handlers": ["null"], "propagate": False}},
}
