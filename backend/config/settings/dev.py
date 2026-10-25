from .base import *  # noqa: F401,F403
from .base import env_bool

DEBUG = env_bool("DJANGO_DEBUG", True)
AUTH_COOKIE_SECURE = env_bool("AUTH_COOKIE_SECURE", False)
