#!/usr/bin/env python
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def main() -> None:
    # Vercel sets VERCEL=1 during builds and at runtime; always use its settings there.
    if os.environ.get("VERCEL"):
        os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.vercel"
    load_dotenv(Path(__file__).resolve().parent / ".env")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
