from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from app.application.errors import ApplicationError
from app.application.schemas import ApiModel, ChangedObjectResponse
from app.domain.enums import PlanStatus, SolverStatus
from app.domain.policy import DomainPack
from app.engine.simulate import Change, ChangeKind, SimulationResult, simulate
from app.persistence.models import Event, PlanOption, ScheduleState
from app.persistence.repositories import (
    DecisionRepository,
    EventRepository,
    PlanReadBundle,
    PlanRepository,
    RunRepository,
    ScheduleRepository,
)
from pydantic import Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession


class ApprovePlanRequest(ApiModel):
    option_id: UUID
    expected_schedule_version: int = Field(ge=0)
    acknowledged_condition_ids: tuple[str, ...] = ()

    @field_validator("acknowledged_condition_ids")
    @classmethod
    def normalize_condition_ids(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        normalized = tuple(item.strip() for item in value)
        if any(not item for item in normalized):
            raise ValueError("acknowledged condition IDs cannot be empty")
        if len(set(normalized)) != len(normalized):
            raise ValueError("acknowledged condition IDs must be unique")
        return normalized


class RejectPlanRequest(ApiModel):
    reason: str = Field(min_length=1, max_length=4000)
    category: str | None = Field(default=None, max_length=64)
    replan: bool = False

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return value.strip()

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str | None) -> str | None:
        return value.strip() if value is not None and value.strip() else None


class ReplyPlanRequest(ApiModel):
    context: str = Field(min_length=1, max_length=100_000)

    @field_validator("context")
    @classmethod
    def normalize_context(cls, value: str) -> str:
        return value.strip()


class ApprovalResponse(ApiModel):
    decision_id: UUID
    plan_id: UUID
    schedule_version_before: int
    schedule_version_after: int
    changed_objects: tuple[ChangedObjectResponse, ...]
    notification_draft_ids: tuple[UUID, ...]


class DecisionMutationResponse(ApiModel):
    decision_id: UUID
    plan_id: UUID
    action: str
    replan_requested: bool = False
    event_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class ApprovalOutcome:
    response: ApprovalResponse
    replayed: bool


@dataclass(frozen=True, slots=True)
class DecisionMutationOutcome:
    response: DecisionMutationResponse
    replayed: bool


class DecisionService:
    """Own approval, rejection, and reply transactions for plan decisions."""

    def __init__(self, session: AsyncSession, pack: DomainPack) -> None:
        self._session = session
        self._pack = pack

    async def approve(
        self,
        scenario_id: str,
        plan_id: UUID,
        request: ApprovePlanRequest,
        *,
        actor: str,
        idempotency_key: str | None,
    ) -> ApprovalOutcome:
        key = self._require_idempotency_key(idempotency_key)
        request_hash = self._request_hash(
            "approve",
            plan_id,
            request.model_dump(mode="json"),
        )
        async with self._session.begin():
            state = await self._lock_schedule_state(scenario_id)
            route_scope = self._route_scope(plan_id, "approve")
            cached = await self._cached_response(actor, route_scope, key, request_hash)
            if cached is not None:
                return ApprovalOutcome(ApprovalResponse.model_validate(cached), True)
            if state.version != request.expected_schedule_version:
                raise self._schedule_conflict(
                    request.expected_schedule_version,
                    int(state.version),
                )

            bundle = await self._locked_plan(scenario_id, plan_id)
            self._require_proposed(bundle, plan_id)
            plan = bundle.plan
            if plan.base_schedule_version != state.version:
                raise self._schedule_conflict(plan.base_schedule_version, int(state.version))
            option = self._option(bundle, request.option_id, plan_id)
            self._validate_option(option, request.acknowledged_condition_ids)
            changes = self._parse_changes(option.changes, plan_id)

            snapshot = await self._load_snapshot(scenario_id)
            simulation = self._simulate(snapshot, changes, plan_id)
            if simulation.violations:
                raise ApplicationError(
                    409,
                    "plan_no_longer_feasible",
                    "The selected option is no longer feasible against the current schedule.",
                    details={
                        "plan_id": str(plan_id),
                        "violations": [
                            {
                                "kind": finding.kind.value,
                                "object_id": finding.object_id,
                                "day": finding.day,
                                "evidence": finding.evidence,
                            }
                            for finding in simulation.violations
                        ],
                    },
                )

            now = datetime.now(UTC)
            schedule_version_before = int(state.version)
            changed_objects = tuple(
                self._changed_object_response(item) for item in simulation.changed_objects
            )
            audit_changes = self._audit_changes(simulation)
            try:
                await ScheduleRepository(self._session).apply_changes(
                    scenario_id,
                    changes,
                    updated_at=now,
                )
            except (LookupError, ValueError) as exc:
                raise ApplicationError(
                    409,
                    "plan_apply_failed",
                    "The selected option could not be applied to the current schedule.",
                    details={"plan_id": str(plan_id)},
                ) from exc
            schedule_version_after = await ScheduleRepository(self._session).set_locked_version(
                state,
                schedule_version_before + 1,
                updated_at=now,
            )
            decision_repository = DecisionRepository(self._session)
            decision = await decision_repository.create(
                decision_id=uuid4(),
                plan_id=plan_id,
                selected_option_id=option.id,
                action="approve",
                actor=actor,
                reason=None,
                category=None,
                acknowledged_condition_ids=request.acknowledged_condition_ids,
                schedule_version_before=schedule_version_before,
                schedule_version_after=schedule_version_after,
                created_at=now,
            )
            await decision_repository.add_changes(decision.id, audit_changes)
            draft = await decision_repository.create_notification_draft(
                decision_id=decision.id,
                payload={
                    "plan_id": str(plan_id),
                    "decision_id": str(decision.id),
                    "changed_objects": [item.model_dump(mode="json") for item in changed_objects],
                },
            )
            marked = await PlanRepository(self._session).mark_status(
                plan_id, scenario_id, PlanStatus.APPROVED
            )
            if marked is None:
                raise self._not_found("plan", plan_id)
            approved_event = await EventRepository(self._session).mark_approved(
                plan.event_id, scenario_id
            )
            if approved_event is None:
                raise self._not_found("event", plan.event_id)
            response = ApprovalResponse(
                decision_id=decision.id,
                plan_id=plan_id,
                schedule_version_before=schedule_version_before,
                schedule_version_after=schedule_version_after,
                changed_objects=changed_objects,
                notification_draft_ids=(draft.id,),
            )
            await self._save_idempotency(
                actor,
                route_scope,
                key,
                request_hash,
                response.model_dump(mode="json"),
                now,
            )
        return ApprovalOutcome(response, False)

    async def reject(
        self,
        scenario_id: str,
        plan_id: UUID,
        request: RejectPlanRequest,
        *,
        actor: str,
        idempotency_key: str | None,
    ) -> DecisionMutationOutcome:
        key = self._require_idempotency_key(idempotency_key)
        request_hash = self._request_hash("reject", plan_id, request.model_dump(mode="json"))
        async with self._session.begin():
            state = await self._lock_schedule_state(scenario_id)
            route_scope = self._route_scope(plan_id, "reject")
            cached = await self._cached_response(actor, route_scope, key, request_hash)
            if cached is not None:
                return DecisionMutationOutcome(
                    DecisionMutationResponse.model_validate(cached), True
                )
            bundle = await self._locked_plan(scenario_id, plan_id)
            self._require_proposed(bundle, plan_id)
            now = datetime.now(UTC)
            event_id = None
            if request.replan:
                event = await self._create_linked_event(
                    scenario_id,
                    bundle.plan.event_id,
                    plan_id,
                    request.reason,
                    actor,
                )
                event_id = event.id
            decision = await DecisionRepository(self._session).create(
                decision_id=uuid4(),
                plan_id=plan_id,
                selected_option_id=None,
                action="reject",
                actor=actor,
                reason=request.reason,
                category=request.category,
                acknowledged_condition_ids=(),
                schedule_version_before=int(state.version),
                schedule_version_after=None,
                created_at=now,
            )
            marked = await PlanRepository(self._session).mark_status(
                plan_id, scenario_id, PlanStatus.REJECTED
            )
            if marked is None:
                raise self._not_found("plan", plan_id)
            response = DecisionMutationResponse(
                decision_id=decision.id,
                plan_id=plan_id,
                action="reject",
                replan_requested=request.replan,
                event_id=event_id,
            )
            await self._save_idempotency(
                actor,
                route_scope,
                key,
                request_hash,
                response.model_dump(mode="json"),
                now,
            )
        return DecisionMutationOutcome(response, False)

    async def reply(
        self,
        scenario_id: str,
        plan_id: UUID,
        request: ReplyPlanRequest,
        *,
        actor: str,
        idempotency_key: str | None,
    ) -> DecisionMutationOutcome:
        key = self._require_idempotency_key(idempotency_key)
        request_hash = self._request_hash("reply", plan_id, request.model_dump(mode="json"))
        async with self._session.begin():
            state = await self._lock_schedule_state(scenario_id)
            route_scope = self._route_scope(plan_id, "reply")
            cached = await self._cached_response(actor, route_scope, key, request_hash)
            if cached is not None:
                return DecisionMutationOutcome(
                    DecisionMutationResponse.model_validate(cached), True
                )
            bundle = await self._locked_plan(scenario_id, plan_id)
            self._require_proposed(bundle, plan_id)
            now = datetime.now(UTC)
            event = await self._create_linked_event(
                scenario_id,
                bundle.plan.event_id,
                plan_id,
                request.context,
                actor,
            )
            decision = await DecisionRepository(self._session).create(
                decision_id=uuid4(),
                plan_id=plan_id,
                selected_option_id=None,
                action="reply",
                actor=actor,
                reason=request.context,
                category=None,
                acknowledged_condition_ids=(),
                schedule_version_before=int(state.version),
                schedule_version_after=None,
                created_at=now,
            )
            response = DecisionMutationResponse(
                decision_id=decision.id,
                plan_id=plan_id,
                action="reply",
                event_id=event.id,
            )
            await self._save_idempotency(
                actor,
                route_scope,
                key,
                request_hash,
                response.model_dump(mode="json"),
                now,
            )
        return DecisionMutationOutcome(response, False)

    async def _locked_plan(self, scenario_id: str, plan_id: UUID) -> PlanReadBundle:
        bundle = await PlanRepository(self._session).get_full(
            plan_id, scenario_id, for_update=True
        )
        if bundle is None:
            raise self._not_found("plan", plan_id)
        return bundle

    async def _lock_schedule_state(self, scenario_id: str) -> ScheduleState:
        state = await ScheduleRepository(self._session).lock_state_for_update(scenario_id)
        if state is None:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested scenario does not exist.",
                details={"scenario_id": scenario_id},
            )
        return state

    async def _load_snapshot(self, scenario_id: str):
        try:
            return await ScheduleRepository(self._session).load_snapshot(scenario_id)
        except LookupError as exc:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested scenario does not exist.",
                details={"scenario_id": scenario_id},
            ) from exc

    async def _create_linked_event(
        self,
        scenario_id: str,
        parent_event_id: UUID,
        parent_plan_id: UUID,
        context: str,
        actor: str,
    ) -> Event:
        parent = await EventRepository(self._session).get(parent_event_id, scenario_id)
        if parent is None:
            raise self._not_found("event", parent_event_id)
        return await EventRepository(self._session).create_event(
            event_id=uuid4(),
            scenario_id=scenario_id,
            raw_text=context,
            actor=actor,
            nature=parent.nature,
            cause="planner_reply" if parent_plan_id else parent.cause,
            parent_event_id=parent_event_id,
            parent_plan_id=parent_plan_id,
            origin_type="api",
        )

    @staticmethod
    def _require_proposed(bundle: PlanReadBundle, plan_id: UUID) -> None:
        if bundle.plan.status != PlanStatus.PROPOSED.value:
            raise ApplicationError(
                409,
                "plan_not_proposed",
                "Only a proposed plan can receive this decision.",
                details={"plan_id": str(plan_id), "status": bundle.plan.status},
            )

    @staticmethod
    def _option(bundle: PlanReadBundle, option_id: UUID, plan_id: UUID) -> PlanOption:
        option = next((item for item in bundle.options if item.id == option_id), None)
        if option is None:
            raise ApplicationError(
                422,
                "invalid_option",
                "The selected option does not belong to this plan.",
                details={"plan_id": str(plan_id), "option_id": str(option_id)},
            )
        return option

    @classmethod
    def _validate_option(cls, option: PlanOption, acknowledged: tuple[str, ...]) -> None:
        if option.solver_status not in {
            SolverStatus.OPTIMAL.value,
            SolverStatus.FEASIBLE.value,
        }:
            raise ApplicationError(
                409,
                "plan_no_longer_feasible",
                "The selected option is not feasible.",
            )
        if isinstance(option.violations, list) and option.violations:
            raise ApplicationError(
                409,
                "plan_no_longer_feasible",
                "The selected option contains violations.",
                details={"violations": option.violations},
            )
        required = cls._condition_ids(option.conditions)
        missing = sorted(required - set(acknowledged))
        if missing:
            raise ApplicationError(
                422,
                "conditions_not_acknowledged",
                "All required option conditions must be acknowledged.",
                details={"missing_condition_ids": missing},
            )

    @staticmethod
    def _condition_ids(value: object) -> set[str]:
        if not isinstance(value, list):
            return set()
        result: set[str] = set()
        for condition in value:
            if isinstance(condition, Mapping):
                condition_id = condition.get("id", condition.get("condition_id"))
                if isinstance(condition_id, str) and condition_id.strip():
                    result.add(condition_id.strip())
            elif str(condition).strip():
                result.add(str(condition).strip())
        return result

    @staticmethod
    def _parse_changes(
        value: object, plan_id: UUID
    ) -> tuple[Mapping[str, object], ...]:
        if not isinstance(value, list):
            raise ApplicationError(
                409,
                "plan_no_longer_feasible",
                "The selected option has an invalid change payload.",
                details={"plan_id": str(plan_id)},
            )
        parsed: list[Mapping[str, object]] = []
        for change in value:
            if not isinstance(change, Mapping):
                raise ApplicationError(
                    409,
                    "plan_no_longer_feasible",
                    "The selected option has an invalid change payload.",
                    details={"plan_id": str(plan_id)},
                )
            try:
                ChangeKind(str(change["kind"]))
                target = str(change["target"])
                change_value = change["value"]
            except (KeyError, ValueError, TypeError) as exc:
                raise ApplicationError(
                    409,
                    "plan_no_longer_feasible",
                    "The selected option has an invalid change payload.",
                    details={"plan_id": str(plan_id)},
                ) from exc
            if (
                not target.strip()
                or not isinstance(change_value, (int, str))
                or isinstance(change_value, bool)
            ):
                raise ApplicationError(
                    409,
                    "plan_no_longer_feasible",
                    "The selected option has an invalid change payload.",
                    details={"plan_id": str(plan_id)},
                )
            parsed.append(dict(change))
        return tuple(parsed)

    def _simulate(
        self,
        snapshot: Any,
        raw_changes: tuple[Mapping[str, object], ...],
        plan_id: UUID,
    ) -> SimulationResult:
        try:
            changes = tuple(
                self._engine_change(change, plan_id)
                for change in raw_changes
            )
            return simulate(snapshot, changes, self._pack)
        except (KeyError, TypeError, ValueError) as exc:
            raise ApplicationError(
                409,
                "plan_no_longer_feasible",
                "The selected option could not be revalidated.",
                details={"plan_id": str(plan_id)},
            ) from exc

    @staticmethod
    def _engine_change(change: Mapping[str, object], plan_id: UUID) -> Change:
        value = change.get("value")
        if not isinstance(value, (int, str)) or isinstance(value, bool):
            raise ApplicationError(
                409,
                "plan_no_longer_feasible",
                "The selected option has an invalid change payload.",
                details={"plan_id": str(plan_id)},
            )
        return Change(
            kind=ChangeKind(str(change["kind"])),
            target=str(change["target"]),
            value=value,
        )

    @staticmethod
    def _changed_object_response(item: Any) -> ChangedObjectResponse:
        return ChangedObjectResponse(
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            change_kind="updated",
            before=dict(item.before),
            after=dict(item.after),
        )

    @staticmethod
    def _audit_changes(simulation: SimulationResult) -> tuple[Mapping[str, object], ...]:
        rows: list[Mapping[str, object]] = []
        for item in simulation.changed_objects:
            fields = sorted(set(item.before) | set(item.after))
            for field in fields:
                before = item.before.get(field)
                after = item.after.get(field)
                if before == after:
                    continue
                rows.append(
                    {
                        "entity_type": item.entity_type,
                        "entity_id": item.entity_id,
                        "field": field,
                        "change_kind": "updated",
                        "before": {field: before},
                        "after": {field: after},
                    }
                )
        return tuple(rows)

    async def _cached_response(
        self,
        actor: str,
        route_scope: str,
        key: str,
        request_hash: str,
    ) -> dict[str, object] | None:
        row = await RunRepository(self._session).get_idempotency_key(
            actor,
            route_scope,
            key,
            now=datetime.now(UTC),
            for_update=True,
        )
        if row is None:
            return None
        if row.request_hash != request_hash:
            raise ApplicationError(
                409,
                "idempotency_key_reused",
                "The idempotency key was already used with a different request.",
            )
        if not isinstance(row.response_body, dict):
            raise ApplicationError(
                409,
                "decision_in_progress",
                "The original decision has not produced a response yet.",
                retryable=True,
            )
        return dict(row.response_body)

    async def _save_idempotency(
        self,
        actor: str,
        route_scope: str,
        key: str,
        request_hash: str,
        response_body: Mapping[str, object],
        now: datetime,
    ) -> None:
        await RunRepository(self._session).save_idempotency_key(
            actor_id=actor,
            route_scope=route_scope,
            key=key,
            request_hash=request_hash,
            response_status=200,
            response_body=response_body,
            expires_at=now + timedelta(hours=24),
        )

    @staticmethod
    def _require_idempotency_key(value: str | None) -> str:
        key = (value or "").strip()
        if not key:
            raise ApplicationError(422, "validation_error", "Idempotency-Key is required.")
        return key

    @staticmethod
    def _request_hash(action: str, plan_id: UUID, payload: Mapping[str, object]) -> str:
        encoded = json.dumps(
            {"action": action, "plan_id": str(plan_id), "payload": payload},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(encoded).hexdigest()

    @staticmethod
    def _route_scope(plan_id: UUID, action: str) -> str:
        return f"plans/{plan_id}/{action}"

    @staticmethod
    def _schedule_conflict(expected: int, current: int) -> ApplicationError:
        return ApplicationError(
            409,
            "schedule_version_conflict",
            "The schedule changed after this plan was created.",
            details={"expected_version": expected, "current_version": current},
        )

    @staticmethod
    def _not_found(entity: str, entity_id: UUID) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            f"The requested {entity} does not exist in this scenario.",
            details={f"{entity}_id": str(entity_id)},
        )


__all__ = [
    "ApprovalOutcome",
    "ApprovalResponse",
    "ApprovePlanRequest",
    "DecisionMutationOutcome",
    "DecisionMutationResponse",
    "DecisionService",
    "RejectPlanRequest",
    "ReplyPlanRequest",
]
