"""Typed solver inputs, outputs, and diagnostics."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum

from app.domain.policy import DomainPack
from app.engine.simulate import ScheduleSnapshot, SimulationViolation


class SolverRunStatus(StrEnum):
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    MODEL_INVALID = "model_invalid"
    UNKNOWN = "unknown"


class CounterfactualStatus(StrEnum):
    FEASIBLE = "feasible"
    IMPOSSIBLE = "impossible"


@dataclass(frozen=True, slots=True)
class CargoRequirement:
    """Cargo input required by the solver but not present in the engine snapshot."""

    id: str
    deck_units: Decimal
    needed_by_day: int
    sailing_day: int | None = None
    resource_id: str | None = None
    assign_if_open: bool = True


@dataclass(frozen=True, slots=True)
class SolverDiagnostics:
    status: SolverRunStatus
    wall_time_ms: int
    objective_value: int | None
    best_bound: int | None
    model_fingerprint: str
    profile_name: str
    weights: Mapping[str, Decimal]
    random_seed: int
    num_workers: int
    branches: int = 0
    conflicts: int = 0
    error: str | None = None


@dataclass(frozen=True, slots=True)
class SolveRequest:
    snapshot: ScheduleSnapshot
    pack: DomainPack
    cargo_items: tuple[CargoRequirement, ...] = ()
    focus_job_id: str | None = None
    target_start: int | None = None
    open_levers: frozenset[str] = frozenset()
    horizon_start: int = 0
    horizon_end: int = 14
    profile_name: str | None = None
    as_of: datetime | None = None
    time_limit_seconds: float = 2.0
    random_seed: int = 7
    num_workers: int = 1

    @property
    def resolved_as_of(self) -> datetime:
        if self.as_of is not None:
            return self.as_of
        timestamps = [item.last_updated for item in self.snapshot.readiness_items]
        known = [value for value in timestamps if value is not None]
        if known:
            latest = max(known)
            return latest if latest.tzinfo is not None else latest.replace(tzinfo=UTC)
        return datetime(1970, 1, 1, tzinfo=UTC)

    @property
    def profile(self):
        return self.pack.weight_profile(self.profile_name)


@dataclass(frozen=True, slots=True)
class SolveResult:
    status: SolverRunStatus
    feasible: bool
    snapshot: ScheduleSnapshot | None
    changes: tuple[Mapping[str, object], ...]
    violations: tuple[SimulationViolation, ...]
    diagnostics: SolverDiagnostics


@dataclass(frozen=True, slots=True)
class CounterfactualResult:
    status: CounterfactualStatus
    job_id: str
    target_start: int
    levers: tuple[str, ...]
    total_lever_cost: Decimal
    changes: tuple[Mapping[str, object], ...]
    blockers: tuple[str, ...]
    diagnostics: tuple[SolverDiagnostics, ...] = field(default_factory=tuple)
