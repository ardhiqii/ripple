class DomainError(ValueError):
    """Base error for invalid domain state or policy."""


class InvalidEntityError(DomainError):
    pass


class PolicyConfigError(DomainError):
    pass


class UnknownActionError(PolicyConfigError):
    pass


class ForbiddenActionError(DomainError):
    pass
