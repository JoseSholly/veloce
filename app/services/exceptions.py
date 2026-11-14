class ServiceError(Exception):
    """Base exception for application service errors."""


class ResourceNotFoundError(ServiceError):
    pass


class BusinessRuleViolationError(ServiceError):
    pass


class AuthenticationError(ServiceError):
    """The caller could not be authenticated (for example a bad refresh token)."""
