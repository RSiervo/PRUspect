"""Consistent error responses: {"detail": str, "code": str, "errors": {field: [msg]}}."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.views import exception_handler


def _flatten(detail):
    if isinstance(detail, dict):
        return {key: _flatten(value) for key, value in detail.items()}
    if isinstance(detail, list):
        flat = []
        for item in detail:
            value = _flatten(item)
            if isinstance(value, list):
                flat.extend(value)
            else:
                flat.append(value)
        return flat
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        )
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()

    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    body = {"detail": "", "code": "error", "errors": {}}
    if isinstance(exc, exceptions.ValidationError):
        body["code"] = "validation_error"
        body["detail"] = "Please correct the highlighted fields."
        if isinstance(data, dict):
            errors = _flatten(data)
            non_field = errors.pop("non_field_errors", None) or errors.pop("detail", None)
            if non_field:
                body["detail"] = non_field[0] if isinstance(non_field, list) else non_field
            body["errors"] = errors
        else:
            messages = _flatten(data)
            if messages:
                body["detail"] = messages[0]
    else:
        detail = data.get("detail", "") if isinstance(data, dict) else data
        body["detail"] = str(detail)
        body["code"] = "throttled" if isinstance(exc, exceptions.Throttled) else getattr(
            exc, "default_code", "error"
        )
    response.data = body
    return response


class Conflict(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This action conflicts with the current state of the record."
    default_code = "conflict"
