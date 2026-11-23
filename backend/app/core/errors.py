"""One error shape for every failure.

    {"error": {"code": "not_found", "message": "Delivery not found",
               "request_id": "3f2a…"}}

Validation errors add `"details": [{"field": "pickup.city", "message": "…"}]`.
Clients switch on `code` (stable) and show `message` (human readable).
"""

import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.middleware import REQUEST_ID_HEADER
from app.services.exceptions import (
    AuthenticationError,
    BusinessRuleViolationError,
    ConflictError,
    InvalidInputError,
    PasswordChangeRequiredError,
    ResourceNotFoundError,
    ServiceError,
)

logger = logging.getLogger(__name__)

STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
}

SERVICE_ERRORS: dict[type[ServiceError], int] = {
    ResourceNotFoundError: 404,
    AuthenticationError: 401,
    PasswordChangeRequiredError: 403,
    InvalidInputError: 400,
    BusinessRuleViolationError: 409,
    ConflictError: 409,
}


def error_response(
    request: Request,
    status_code: int,
    message: str,
    *,
    code: str | None = None,
    details: list[dict] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    body: dict = {
        "code": code or STATUS_CODES.get(status_code, f"http_{status_code}"),
        "message": message,
        "request_id": request_id,
    }
    if details is not None:
        body["details"] = details

    headers = dict(headers or {})
    if request_id:
        headers[REQUEST_ID_HEADER] = request_id
    return JSONResponse({"error": body}, status_code=status_code, headers=headers)


async def handle_http_exception(request: Request, exc: StarletteHTTPException):
    message = (
        exc.detail
        if isinstance(exc.detail, str)
        else HTTPStatus(exc.status_code).phrase
    )
    return error_response(request, exc.status_code, message, headers=exc.headers)


async def handle_validation_error(request: Request, exc: RequestValidationError):
    details = [
        {
            "field": ".".join(str(part) for part in err["loc"] if part != "body"),
            "message": err["msg"],
        }
        for err in exc.errors()
    ]
    return error_response(request, 422, "The request is not valid", details=details)


async def handle_service_error(request: Request, exc: ServiceError):
    status_code = next(
        (code for cls, code in SERVICE_ERRORS.items() if isinstance(exc, cls)), 400
    )
    headers = {"WWW-Authenticate": "Bearer"} if status_code == 401 else None
    return error_response(
        request, status_code, str(exc), code=exc.code, headers=headers
    )


async def handle_unexpected_error(request: Request, exc: Exception):
    # Never leak internals to the client; the request ID links to the full log.
    logger.exception("Unhandled error")
    return error_response(request, 500, "Something went wrong on our side")


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, handle_http_exception)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(ServiceError, handle_service_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
