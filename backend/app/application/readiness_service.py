from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.application.errors import ApplicationError
from app.application.schemas import (
    ReadinessDetailResponse,
    ReadinessItemResponse,
    ReadinessListResponse,
    ReadinessPatchFields,
    ReadinessPatchRequest,
    ReadinessSourceResponse,
    ReadinessSuggestionResponse,
    ReadinessSummary,
    ReadinessWriteResponse,
    SuggestionReviewRequest,
    SuggestionReviewResponse,
)
from app.domain.enums import Confidence, ReadinessStatus
from app.domain.policy import DomainPack
from app.domain.readiness import ReadinessItem
from app.engine.readiness import ReadinessResult, check_readiness
from app.persistence.models import ReadinessSuggestion
from app.persistence.repositories import ReadinessRepository, ScheduleRepository
from sqlalchemy.ext.asyncio import AsyncSession

_CONFIDENCE_SCORE = {
    Confidence.HIGH: Decimal("0.90"),
    Confidence.MEDIUM: Decimal("0.60"),
    Confidence.LOW: Decimal("0.30"),
}


class ReadinessService:
    def __init__(self, session: AsyncSession, pack: DomainPack) -> None:
        self._session = session
        self._pack = pack

    async def list(
        self,
        scenario_id: str,
        *,
        job_id: str | None,
        status: ReadinessStatus | None,
        confidence: Confidence | None,
        risk: str | None,
        item_id: str | None,
        source_type: str | None,
        search: str | None,
        as_of: datetime | None = None,
    ) -> ReadinessListResponse:
        as_of = as_of or datetime.now(UTC)
        try:
            snapshot = await ScheduleRepository(self._session).load_snapshot(scenario_id)
        except LookupError as exc:
            raise self._scenario_not_found(scenario_id) from exc
        items = await ReadinessRepository(self._session).list_for_scenario(scenario_id)
        all_responses = self._derived_items(snapshot.jobs, items, as_of)
        summary = ReadinessSummary(
            total=len(all_responses),
            at_risk=sum(
                1
                for item in all_responses
                if not item.feasible_for_target or (item.effective_slack or 0) < 0
            ),
            stale=sum(1 for item in all_responses if item.stale),
            low_confidence=sum(
                1 for item in all_responses if item.confidence is Confidence.LOW
            ),
            blocked=sum(1 for item in all_responses if item.status is ReadinessStatus.BLOCKED),
        )
        responses = all_responses
        if job_id is not None and job_id.strip():
            responses = tuple(item for item in responses if item.job_id == job_id.strip())
        if status is not None:
            responses = tuple(item for item in responses if item.status is status)
        if confidence is not None:
            responses = tuple(item for item in responses if item.confidence is confidence)
        if item_id is not None:
            responses = tuple(item for item in responses if item.id == item_id)
        if source_type is not None and source_type.strip():
            normalized_source_type = source_type.strip().lower()
            responses = tuple(
                item for item in responses if item.source_type.lower() == normalized_source_type
            )
        normalized_search = search.strip().lower() if search and search.strip() else None
        if normalized_search is not None:
            responses = tuple(
                item
                for item in responses
                if any(
                    normalized_search in value.lower()
                    for value in (
                        item.id,
                        item.job_id,
                        item.stage,
                        item.source_type,
                        item.source_reference or "",
                    )
                )
            )
        if risk:
            normalized = risk.strip().lower()
            if normalized == "at_risk":
                responses = tuple(
                    item
                    for item in responses
                    if not item.feasible_for_target or (item.effective_slack or 0) < 0
                )
            elif normalized == "stale":
                responses = tuple(item for item in responses if item.stale)
            else:
                raise ApplicationError(
                    422,
                    "validation_error",
                    "Unsupported readiness risk filter.",
                    details={"risk": risk, "allowed": ["at_risk", "stale"]},
                )
        version = snapshot.schedule_version
        return ReadinessListResponse(
            scenario_id=scenario_id,
            schedule_version=version,
            items=responses,
            summary=summary,
            total_count=len(responses),
        )

    async def detail(
        self, scenario_id: str, item_id: str, *, as_of: datetime | None = None
    ) -> ReadinessDetailResponse:
        as_of = as_of or datetime.now(UTC)
        readiness_repo = ReadinessRepository(self._session)
        item = await readiness_repo.get(item_id, scenario_id)
        if item is None:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested readiness item does not exist in this scenario.",
                details={"item_id": item_id},
            )
        try:
            snapshot = await ScheduleRepository(self._session).load_snapshot(scenario_id)
        except LookupError as exc:
            raise self._scenario_not_found(scenario_id) from exc
        all_items = await readiness_repo.list_for_scenario(scenario_id, item.job_id)
        derived = next(
            response
            for response in self._derived_items(snapshot.jobs, all_items, as_of)
            if response.id == item.id
        )
        history = tuple(
            self._suggestion_response(row)
            for row in await readiness_repo.list_suggestions(item_id, scenario_id)
        )
        current = next(
            (suggestion for suggestion in history if suggestion.state == "pending"), None
        )
        return ReadinessDetailResponse(
            scenario_id=scenario_id,
            schedule_version=snapshot.schedule_version,
            item=derived,
            source=ReadinessSourceResponse(
                source_type=derived.source_type,
                source_reference=derived.source_reference,
                last_updated=derived.last_updated,
                confidence=derived.confidence,
                stale=derived.stale,
                freshness_hours=derived.freshness_hours,
            ),
            suggestion=current,
            history=history,
        )

    async def update_manual(
        self,
        scenario_id: str,
        item_id: str,
        patch: ReadinessPatchRequest,
        *,
        actor: str,
    ) -> ReadinessWriteResponse:
        async with self._session.begin():
            repo = ReadinessRepository(self._session)
            item = await repo.get(item_id, scenario_id)
            if item is None:
                raise self._not_found(item_id)
            self._ensure_row_version(item, patch.expected_row_version)
            values, candidate = self._normalized_patch(
                item,
                patch,
                source_type="manual",
                source_reference=patch.source_reference
                if "source_reference" in patch.model_fields_set
                else f"manual:{actor}",
            )
            return await self._persist_patch(repo, scenario_id, item, values, candidate)

    async def accept_suggestion(
        self,
        scenario_id: str,
        suggestion_id: UUID,
        *,
        actor: str,
    ) -> ReadinessWriteResponse:
        async with self._session.begin():
            repo = ReadinessRepository(self._session)
            suggestion = await repo.get_suggestion(suggestion_id, scenario_id, for_update=True)
            if suggestion is None:
                raise self._suggestion_not_found(suggestion_id)
            if suggestion.state != "pending":
                raise ApplicationError(
                    409,
                    "suggestion_not_pending",
                    "The readiness suggestion has already been reviewed.",
                    details={"suggestion_id": str(suggestion_id), "state": suggestion.state},
                )
            item = await repo.get(suggestion.readiness_item_id, scenario_id)
            if item is None:
                raise self._not_found(suggestion.readiness_item_id)
            self._ensure_row_version(item, suggestion.base_row_version)
            try:
                patch = ReadinessPatchFields.model_validate(suggestion.proposed_patch)
                if not patch.model_fields_set:
                    raise ValueError("suggestion proposed_patch cannot be empty")
            except ValueError as exc:
                raise ApplicationError(
                    422,
                    "validation_error",
                    "The readiness suggestion contains an invalid patch.",
                    details={"suggestion_id": str(suggestion_id), "reason": str(exc)},
                ) from exc
            values, candidate = self._normalized_patch(
                item,
                patch,
                source_type="readiness",
                source_reference=f"event:{suggestion.event_id}",
            )
            result = await self._persist_patch(repo, scenario_id, item, values, candidate)
            reviewed = await repo.review_suggestion(
                suggestion_id,
                scenario_id,
                state="accepted",
                actor=actor,
                note=None,
                reviewed_at=datetime.now(UTC),
            )
            if reviewed is None:
                raise ApplicationError(
                    409,
                    "suggestion_not_pending",
                    "The readiness suggestion changed during review.",
                )
            return result

    async def reject_suggestion(
        self,
        scenario_id: str,
        suggestion_id: UUID,
        review: SuggestionReviewRequest,
        *,
        actor: str,
    ) -> SuggestionReviewResponse:
        async with self._session.begin():
            repo = ReadinessRepository(self._session)
            suggestion = await repo.get_suggestion(suggestion_id, scenario_id, for_update=True)
            if suggestion is None:
                raise self._suggestion_not_found(suggestion_id)
            if suggestion.state != "pending":
                raise ApplicationError(
                    409,
                    "suggestion_not_pending",
                    "The readiness suggestion has already been reviewed.",
                    details={"suggestion_id": str(suggestion_id), "state": suggestion.state},
                )
            reviewed = await repo.review_suggestion(
                suggestion_id,
                scenario_id,
                state="rejected",
                actor=actor,
                note=review.note,
                reviewed_at=datetime.now(UTC),
            )
            if reviewed is None:
                raise ApplicationError(
                    409,
                    "suggestion_not_pending",
                    "The readiness suggestion changed during review.",
                )
            version = await ScheduleRepository(self._session).get_schedule_version(scenario_id)
            if version is None:
                raise self._scenario_not_found(scenario_id)
            return SuggestionReviewResponse(
                suggestion=self._suggestion_response(reviewed),
                schedule_version=version,
            )

    def _derived_items(
        self, jobs: tuple[Any, ...], items: tuple[ReadinessItem, ...], as_of: datetime
    ) -> tuple[ReadinessItemResponse, ...]:
        jobs_by_id = {job.id: job for job in jobs}
        grouped: dict[str, list[ReadinessItem]] = {}
        for item in items:
            grouped.setdefault(item.job_id, []).append(item)
        responses: list[ReadinessItemResponse] = []
        for item in items:
            job = jobs_by_id.get(item.job_id)
            if job is None:
                raise ApplicationError(
                    500,
                    "invalid_readiness_data",
                    "A readiness item references a job outside its scenario.",
                    details={"item_id": item.id, "job_id": item.job_id},
                )
            report = check_readiness(
                job,
                tuple(grouped[item.job_id]),
                self._pack,
                target_start=job.start_day,
                as_of=as_of,
            )
            derived = next(result for result in report.items if result.item_id == item.id)
            responses.append(self._item_response(item, derived))
        return tuple(responses)

    @staticmethod
    def _item_response(item: ReadinessItem, result: ReadinessResult) -> ReadinessItemResponse:
        return ReadinessItemResponse(
            id=item.id,
            job_id=item.job_id,
            stage=item.stage,
            step_order=item.step_order,
            lead_time_days=item.lead_time_days,
            planned_day=item.planned_day,
            eta_earliest=result.eta_earliest,
            eta_latest=result.eta_latest,
            confidence=result.confidence,
            status=item.status,
            source_type=item.source_type,
            source_reference=item.source_reference,
            last_updated=item.last_updated,
            not_before_day=item.not_before_day,
            risk_buffer_days=result.risk_buffer_days,
            row_version=item.row_version,
            required_by=result.required_by,
            effective_eta=result.effective_eta,
            slack=result.slack,
            effective_slack=result.effective_slack,
            stale=result.stale,
            freshness_hours=result.freshness_hours,
            feasible_for_target=result.feasible_for_target,
            earliest_feasible_start=result.earliest_feasible_start,
            plan_on_latest=result.plan_on_latest,
            vendor_expedite_required=result.vendor_expedite_required,
            notes=result.notes,
        )

    @staticmethod
    def _suggestion_response(row: ReadinessSuggestion) -> ReadinessSuggestionResponse:
        proposed = row.proposed_patch if isinstance(row.proposed_patch, dict) else {}
        return ReadinessSuggestionResponse(
            id=row.id,
            event_id=row.event_id,
            readiness_item_id=row.readiness_item_id,
            proposed_patch=dict(proposed),
            source_excerpt=row.source_excerpt,
            confidence=Decimal(str(row.confidence)) if row.confidence is not None else None,
            base_row_version=row.base_row_version,
            state=row.state,
            review_actor=row.review_actor,
            review_note=row.review_note,
            created_at=row.created_at,
            reviewed_at=row.reviewed_at,
        )

    def _normalized_patch(
        self,
        item: ReadinessItem,
        patch: ReadinessPatchFields,
        *,
        source_type: str,
        source_reference: str | None,
    ) -> tuple[dict[str, Any], ReadinessItem]:
        values: dict[str, Any] = {}
        candidate_values: dict[str, Any] = {}
        if "status" in patch.model_fields_set and patch.status is not None:
            values["status"] = patch.status.value
            candidate_values["status"] = patch.status
        if "planned_day" in patch.model_fields_set:
            values["planned_day"] = patch.planned_day
            candidate_values["planned_day"] = patch.planned_day
        if "eta_earliest" in patch.model_fields_set:
            values["eta_earliest_day"] = patch.eta_earliest
            candidate_values["eta_earliest"] = patch.eta_earliest
        if "eta_latest" in patch.model_fields_set:
            values["eta_latest_day"] = patch.eta_latest
            candidate_values["eta_latest"] = patch.eta_latest
        if "confidence" in patch.model_fields_set and patch.confidence is not None:
            values["confidence"] = _CONFIDENCE_SCORE[patch.confidence]
            candidate_values["confidence"] = patch.confidence
        if "risk_buffer_days" in patch.model_fields_set and patch.risk_buffer_days is not None:
            values["risk_buffer_days"] = patch.risk_buffer_days
            candidate_values["risk_buffer_days"] = patch.risk_buffer_days
        if "source_reference" in patch.model_fields_set:
            values["source_reference"] = patch.source_reference
            candidate_values["source_reference"] = patch.source_reference
        values["source_type"] = source_type
        values["source_reference"] = source_reference
        candidate_values["source_reference"] = source_reference
        try:
            candidate = replace(item, **candidate_values)
        except ValueError as exc:
            raise ApplicationError(
                422,
                "validation_error",
                "The readiness patch is not valid for this item.",
                details={"item_id": item.id, "reason": str(exc)},
            ) from exc
        if candidate.eta_earliest is not None and candidate.eta_latest is not None:
            if candidate.eta_latest < candidate.eta_earliest:
                raise ApplicationError(
                    422,
                    "validation_error",
                    "ETA latest cannot be before ETA earliest.",
                    details={"item_id": item.id},
                )
        return values, candidate

    async def _persist_patch(
        self,
        repo: ReadinessRepository,
        scenario_id: str,
        item: ReadinessItem,
        values: dict[str, Any],
        candidate: ReadinessItem,
    ) -> ReadinessWriteResponse:
        updated = await repo.update_item(
            item.id,
            scenario_id,
            item.row_version,
            values,
            updated_at=datetime.now(UTC),
        )
        if updated is None:
            current = await repo.get(item.id, scenario_id)
            raise self._version_conflict(
                item.id,
                item.row_version,
                current.row_version if current else None,
            )
        planning_fields = (
            "status",
            "planned_day",
            "eta_earliest",
            "eta_latest",
            "confidence",
            "risk_buffer_days",
        )
        planning_changed = any(
            getattr(item, field) != getattr(candidate, field) for field in planning_fields
        )
        version = (
            await repo.bump_schedule_version(scenario_id, updated_at=datetime.now(UTC))
            if planning_changed
            else await ScheduleRepository(self._session).get_schedule_version(scenario_id)
        )
        if version is None:
            raise self._scenario_not_found(scenario_id)
        return ReadinessWriteResponse(
            item=(await self._derived_items_for_item(scenario_id, updated))[0],
            schedule_version=version,
        )

    async def _derived_items_for_item(
        self, scenario_id: str, item: ReadinessItem
    ) -> tuple[ReadinessItemResponse, ...]:
        snapshot = await ScheduleRepository(self._session).load_snapshot(scenario_id)
        items = await ReadinessRepository(self._session).list_for_scenario(
            scenario_id, item.job_id
        )
        updated_items = tuple(
            updated if updated.id != item.id else item for updated in items
        )
        return tuple(
            response
            for response in self._derived_items(snapshot.jobs, updated_items, datetime.now(UTC))
            if response.id == item.id
        )

    @staticmethod
    def _ensure_row_version(item: ReadinessItem, expected: int) -> None:
        if item.row_version != expected:
            raise ReadinessService._version_conflict(item.id, expected, item.row_version)

    @staticmethod
    def _version_conflict(item_id: str, expected: int, current: int | None) -> ApplicationError:
        return ApplicationError(
            409,
            "version_conflict",
            "The readiness item changed before this update was applied.",
            details={
                "item_id": item_id,
                "expected_row_version": expected,
                "current_row_version": current,
            },
        )

    @staticmethod
    def _not_found(item_id: str) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            "The requested readiness item does not exist in this scenario.",
            details={"item_id": item_id},
        )

    @staticmethod
    def _suggestion_not_found(suggestion_id: UUID) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            "The requested readiness suggestion does not exist in this scenario.",
            details={"suggestion_id": str(suggestion_id)},
        )

    @staticmethod
    def _scenario_not_found(scenario_id: str) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            "The requested scenario does not exist.",
            details={"scenario_id": scenario_id},
        )
