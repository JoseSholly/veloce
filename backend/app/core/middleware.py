import logging
import re
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import request_id_var

REQUEST_ID_HEADER = "X-Request-ID"
# Accept a caller's ID only if it is short and harmless to echo into logs.
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

logger = logging.getLogger("app.access")


class RequestIdMiddleware:
    """Give every request an ID, log one access line, and echo the ID back.

    A plain ASGI middleware (not BaseHTTPMiddleware), so the context variable
    is set in the same task that runs the endpoint and the error handlers.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, REQUEST_ID_HEADER)
        request_id = (
            incoming if incoming and _SAFE_ID.match(incoming) else uuid.uuid4().hex
        )
        request_id_var.set(request_id)
        # Error handlers outside this middleware read it from request.state.
        scope.setdefault("state", {})["request_id"] = request_id

        status_code = 500
        started = time.perf_counter()

        async def send_with_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = list(message.get("headers", []))
                # Error responses already carry it (they are also built outside
                # this middleware, for 500s), so add it only when missing.
                name = REQUEST_ID_HEADER.lower().encode()
                if not any(key.lower() == name for key, _ in headers):
                    headers.append((name, request_id.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            logger.info(
                "%s %s %s",
                scope["method"],
                scope["path"],
                status_code,
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )


def _header(scope: Scope, name: str) -> str | None:
    target = name.lower().encode()
    for key, value in scope.get("headers", []):
        if key == target:
            return value.decode("latin-1")
    return None
