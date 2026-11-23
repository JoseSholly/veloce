class ServiceError(Exception):
    """Base exception for application service errors.

    `code` is the stable error code clients switch on; None means the
    generic code for the HTTP status.
    """

    code: str | None = None


class ResourceNotFoundError(ServiceError):
    pass


class BusinessRuleViolationError(ServiceError):
    pass


class AuthenticationError(ServiceError):
    """The caller could not be authenticated (for example a bad refresh token)."""


class InvalidInputError(ServiceError):
    """The request is well-formed but its values are not acceptable (400)."""


class PasswordChangeRequiredError(ServiceError):
    """The account has a temporary password that must be replaced first (403)."""

    code = "password_change_required"


class ConflictError(ServiceError):
    """The request conflicts with existing data, e.g. a taken email (409)."""
