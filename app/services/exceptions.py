class ServiceError(Exception):
    """Base exception for application service errors."""


class ResourceNotFoundError(ServiceError):
    pass


class BusinessRuleViolationError(ServiceError):
    pass
