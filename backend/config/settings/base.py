"""Shared Django settings for PRUspect. Environment-specific files extend this."""

from datetime import timedelta
from pathlib import Path
import os

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


def env(name: str, default: str | None = None, required: bool = False) -> str:
    value = os.environ.get(name, default)
    if required and not value:
        raise ImproperlyConfigured(f"Environment variable {name} is required.")
    return value or ""


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", required=True)
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    # Local
    "apps.common",
    "apps.accounts",
    "apps.audit",
    "apps.prospects",
    "apps.activities",
    "apps.opportunities",
    "apps.notifications",
    "apps.dashboard",
    "apps.reports",
    "apps.monitoring",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": dj_database_url.parse(
        env("DATABASE_URL", required=True), conn_max_age=60, conn_health_checks=True
    )
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
# Datetimes are stored in UTC. TIME_ZONE is the server default; each user can
# choose a display timezone in Settings (defaults to Philippine time).
TIME_ZONE = env("DEFAULT_TIME_ZONE", "Asia/Manila")
DEFAULT_USER_TIME_ZONE = TIME_ZONE
USE_I18N = True
USE_TZ = True

STATIC_URL = "/django-static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": "2000/hour",
        "auth_login": env("THROTTLE_LOGIN", "10/min"),
        "auth_refresh": env("THROTTLE_REFRESH", "60/min"),
        "calendar_feed": env("THROTTLE_CALENDAR_FEED", "60/hour"),
        "client_errors": env("THROTTLE_CLIENT_ERRORS", "30/hour"),
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(env("JWT_ACCESS_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(env("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "SIGNING_KEY": env("JWT_SIGNING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Refresh token lives in an HttpOnly cookie scoped to the auth endpoints.
AUTH_COOKIE_NAME = "pruspect_refresh"
AUTH_COOKIE_PATH = "/api/v1/auth/"
AUTH_COOKIE_SECURE = env_bool("AUTH_COOKIE_SECURE", True)
AUTH_COOKIE_SAMESITE = env("AUTH_COOKIE_SAMESITE", "Strict")

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

# Email/password accounts are created by an administrator (`createsuperuser`).
# Google sign-in: set GOOGLE_CLIENT_ID (OAuth "Web application" client) to show the
# "Continue with Google" button. New Google users get their own empty account unless
# GOOGLE_SIGNUP_ENABLED=False; GOOGLE_ALLOWED_DOMAINS limits sign-up to listed email
# domains (e.g. "gmail.com,yourcompany.com"; empty = any verified Google account).
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_SIGNUP_ENABLED = env_bool("GOOGLE_SIGNUP_ENABLED", True)
GOOGLE_ALLOWED_DOMAINS = [d.lower().lstrip("@") for d in env_list("GOOGLE_ALLOWED_DOMAINS")]

# Web Push (phone/desktop notifications). Generate a VAPID key pair once; see README.
VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = env("VAPID_SUBJECT", "mailto:admin@example.com").strip()
# Outgoing email (error alerts to admins). Any SMTP service works, e.g. Gmail with an
# app password: EMAIL_HOST=smtp.gmail.com, EMAIL_PORT=587, EMAIL_HOST_USER=you@gmail.com,
# EMAIL_HOST_PASSWORD=<16-character app password>. Empty EMAIL_HOST = no emails.
EMAIL_HOST = env("EMAIL_HOST", "").strip()
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "").strip()
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "").strip()
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", EMAIL_PORT == 587)
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", EMAIL_PORT == 465)
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "").strip() or (f"PRUspect <{EMAIL_HOST_USER}>" if EMAIL_HOST_USER else "PRUspect <noreply@localhost>")
# Error alert emails go to every active admin, plus these extra addresses (comma list).
ERROR_ALERT_EMAILS = [e.strip().lower() for e in env_list("ERROR_ALERT_EMAILS")]
ERROR_ALERT_EMAIL_ENABLED = env_bool("ERROR_ALERT_EMAIL_ENABLED", True)
# Public address of the app, used for links in emails.
SITE_URL = env("SITE_URL", "https://pruspect.vercel.app").strip().rstrip("/")

# Admins must turn on two-step verification before using admin pages.
ADMIN_REQUIRE_2FA = env_bool("ADMIN_REQUIRE_2FA", True)
# Shared secret for the scheduler endpoint (/api/v1/cron/run/).
CRON_SECRET = env("CRON_SECRET", "").strip()

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}
