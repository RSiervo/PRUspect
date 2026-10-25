"""Settings for running the API as a Vercel Python function with Supabase Postgres.

Vercel terminates HTTPS and forwards to the function; the SPA and API share one
domain, so the refresh cookie stays SameSite=Strict. All values come from the
Vercel project's environment variables (never from a committed file).
"""

from .prod import *  # noqa: F401,F403
from .prod import DATABASES, REST_FRAMEWORK, env, env_list

# Vercel already redirects HTTP to HTTPS at the edge; redirecting again here can loop.
SECURE_SSL_REDIRECT = False

# Accept the project's *.vercel.app URLs plus any custom domain you add.
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ".vercel.app")

# Serverless functions are short-lived: don't keep connections open between requests.
# Supabase's transaction pooler (port 6543) doesn't support prepared statements or
# server-side cursors, so turn both off.
DATABASES["default"]["CONN_MAX_AGE"] = 0
DATABASES["default"]["CONN_HEALTH_CHECKS"] = False
DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
DATABASES["default"].setdefault("OPTIONS", {})
DATABASES["default"]["OPTIONS"]["prepare_threshold"] = None
if "sslmode" not in env("DATABASE_URL"):
    DATABASES["default"]["OPTIONS"]["sslmode"] = "require"

# Vercel adds one proxy hop; use X-Forwarded-For so rate limits apply per client.
REST_FRAMEWORK = {**REST_FRAMEWORK, "NUM_PROXIES": 1}

# Logs go to Vercel's function logs.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "WARNING")},
}
