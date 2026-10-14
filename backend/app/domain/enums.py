from enum import StrEnum


class EventNature(StrEnum):
    REQUEST = "request"
    DISRUPTION = "disruption"
    OPPORTUNITY = "opportunity"


class EventOrigin(StrEnum):
    MANUAL = "manual"
    READINESS = "readiness"
    ALERT = "alert"
    DEMO = "demo"
    API = "api"


class EventState(StrEnum):
    RECEIVED = "received"
    EXTRACTED = "extracted"
    CLARIFICATION_NEEDED = "clarification_needed"
    PLANNING = "planning"
    CLOSED = "closed"


class JobStatus(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETE = "complete"
    CANCELLED = "cancelled"


class ResourceType(StrEnum):
    BARGE = "barge"
    SUPPLY_BOAT = "supply_boat"
    CRANE = "crane"
    TEST_BAY = "test_bay"
    LIFT_CREW = "lift_crew"


class BookingStatus(StrEnum):
    PLANNED = "planned"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class ReadinessStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    BLOCKED = "blocked"
    WAIVED = "waived"


class Confidence(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class PlanVerdict(StrEnum):
    FEASIBLE = "feasible"
    FEASIBLE_WITH_CONDITIONS = "feasible_with_conditions"
    INFEASIBLE = "infeasible"


class PlanStatus(StrEnum):
    PROPOSED = "proposed"
    STALE = "stale"
    REJECTED = "rejected"
    APPROVED = "approved"
    SUPERSEDED = "superseded"


class SolverStatus(StrEnum):
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"


class DecisionAction(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    REPLY = "reply"


class ApprovalRole(StrEnum):
    PLANNER = "planner"


class AlertSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertState(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    DISMISSED = "dismissed"
    RESOLVED = "resolved"


class RiskTag(StrEnum):
    QUALITY_FINDING = "quality_finding"
    VENDOR_HISTORY_LATE = "vendor_history_late"
    CLIENT_COMMITMENT = "client_commitment"
    OTHER = "other"
