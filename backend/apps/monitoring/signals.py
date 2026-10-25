import sys
import traceback

from .models import ErrorSource
from .services import capture


def on_request_exception(sender, request=None, **kwargs):
    """Unhandled exception in any view (500). Handled API errors (400/403/404) are not captured."""
    exc_type, exc, tb = sys.exc_info()
    if exc is None:
        return
    capture(
        source=ErrorSource.SERVER,
        error_type=exc_type.__name__,
        message=str(exc),
        location=f"{request.method} {request.path}" if request is not None else "",
        stack="".join(traceback.format_exception(exc_type, exc, tb)[-12:]),
        user=getattr(request, "user", None),
    )
