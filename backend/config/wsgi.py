import os

from django.core.wsgi import get_wsgi_application

# Vercel sets VERCEL=1 at runtime; Gunicorn/Nginx servers use the prod settings.
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    "config.settings.vercel" if os.environ.get("VERCEL") else "config.settings.prod",
)
application = get_wsgi_application()
