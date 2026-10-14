import asyncio
import os
from typing import Any
from uuid import UUID

import pytest
from app.application.event_service import EventService
from app.application.plan_service import PlanDraft, PlanOptionDraft, PlanService
from app.application.schemas import (
    ChangeEventExtraction,
    EtaUpdateExtraction,
    RiskTagExtraction,
)
from app.config import Settings
from app.domain.enums import EventNature
from app.domain.policy import OFFSHORE_PACK
from app.main import create_app
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import Event
from fastapi.testclient import TestClient
from sqlalchemy import select

SCENARIO_ID = "A-12-base"
SOURCE_TEXT = (
    "Vendor email: D-07 pump test slips three days; ETA is D+9 to D+10 with "
    "medium confidence, and the vendor reports a seal finding."
)
ETA_SOURCE = "ETA is D+9 to D+10 with medium confidence"
SEAL_SOURCE = "the vendor reports a seal finding"
D07_READINESS_ID = "D-07-function-test"


def _settings() -> Settings:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures")
    return Settings(environment="test", database_url=database_url)


def _persist_vendor_extraction(event_id: UUID) -> None:
    async def persist() -> None:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        extraction = ChangeEventExtraction(
            nature=EventNature.DISRUPTION,
            cause="vendor delay and seal finding",
            job_ids=("D-07",),
            objective="Replan D-07 around the vendor delay",
            requested_start=11,
            eta_updates=(
                EtaUpdateExtraction(
                    job_id="D-07",
                    stage="function_test",
                    eta_earliest=9,
                    eta_latest=10,
                    source_excerpt=ETA_SOURCE,
                ),
            ),
            risk_tags=(
                RiskTagExtraction(
                    tag="quality_finding",
                    source_excerpt=SEAL_SOURCE,
                    object_id=D07_READINESS_ID,
                ),
            ),
            source_excerpt=SOURCE_TEXT,
        )
        try:
            async with factory() as session:
                await EventService(session, OFFSHORE_PACK).persist_model_extraction(
                    SCENARIO_ID,
                    event_id,
                    extraction,
                    model_name="test-vendor-extractor",
                    prompt_version="int05-v1",
                    confidence_summary={
                        "overall": "medium",
                        "basis": "vendor supplied an ETA range",
                    },
                )
        finally:
            await engine.dispose()

    asyncio.run(persist())


def _create_plan(
    event_id: UUID,
    run_id: UUID,
    *,
    label: str,
    supersedes_plan_id: UUID | None = None,
) -> dict[str, Any]:
    async def create() -> dict[str, Any]:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        try:
            async with factory() as session:
                created = await PlanService(session).create(
                    SCENARIO_ID,
                    PlanDraft(
                        event_id=event_id,
                        run_id=run_id,
                        verdict="feasible_with_conditions",
                        base_schedule_version=1,
                        explanation={"summary": label},
                        supersedes_plan_id=supersedes_plan_id,
                        options=(
                            PlanOptionDraft(
                                label=label,
                                weight_profile="risk-aware",
                                solver_status="feasible",
                                changes=(
                                    {
                                        "kind": "move_job",
                                        "target": "D-07",
                                        "value": 14,
                                    },
                                ),
                                conditions=(
                                    {
                                        "id": "vendor-confirmation",
                                        "text": "Vendor confirms the revised D-07 ETA.",
                                    },
                                ),
                                kpi={"estimated_recovered_bbl": 180},
                                recommended=True,
                            ),
                        ),
                    ),
                )
                return created.model_dump(mode="json")
        finally:
            await engine.dispose()

    return asyncio.run(create())


def _event_links(event_ids: tuple[UUID, ...]) -> dict[UUID, tuple[UUID | None, UUID | None]]:
    async def read() -> dict[UUID, tuple[UUID | None, UUID | None]]:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        try:
            async with factory() as session:
                rows = await session.scalars(select(Event).where(Event.id.in_(event_ids)))
                return {
                    row.id: (row.parent_event_id, row.parent_plan_id)
                    for row in rows
                }
        finally:
            await engine.dispose()

    return asyncio.run(read())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_d07_disruption_reject_preserves_source_and_reply_links_lineage() -> None:
    settings = _settings()
    with TestClient(create_app(settings)) as client:
        reset = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
        assert reset.status_code == 200

        try:
            created = client.post(
                "/api/v1/events",
                json={
                    "raw_text": SOURCE_TEXT,
                    "nature": "disruption",
                    "cause": "vendor delay and seal finding",
                },
            )
            assert created.status_code == 201
            event_id = UUID(created.json()["id"])
            _persist_vendor_extraction(event_id)

            event_detail = client.get(f"/api/v1/events/{event_id}")
            assert event_detail.status_code == 200
            extraction = event_detail.json()["extractions"][0]
            extracted_json = extraction["extracted_json"]
            assert extraction["confidence_summary"]["overall"] == "medium"
            assert extracted_json["eta_updates"] == [
                {
                    "job_id": "D-07",
                    "stage": "function_test",
                    "eta_earliest": 9,
                    "eta_latest": 10,
                    "source_excerpt": ETA_SOURCE,
                }
            ]
            assert extracted_json["risk_tags"] == [
                {
                    "tag": "quality_finding",
                    "source_excerpt": SEAL_SOURCE,
                    "object_id": D07_READINESS_ID,
                }
            ]

            readiness_before = client.get(f"/api/v1/readiness/{D07_READINESS_ID}")
            assert readiness_before.status_code == 200
            before_item = readiness_before.json()["item"]
            assert before_item["stale"] is True
            assert before_item["confidence"] == "low"
            assert before_item["source_reference"] == "vendor email 9 Oct"

            run = client.post(
                f"/api/v1/events/{event_id}/runs",
                headers={"Idempotency-Key": "int05-d07-run"},
            )
            assert run.status_code == 201
            run_id = UUID(run.json()["run_id"])

            first_plan = _create_plan(
                event_id,
                run_id,
                label="Swap D-07 with E-02 after the vendor delay.",
            )
            first_plan_id = UUID(first_plan["id"])
            schedule_before = client.get("/api/v1/schedule")
            assert schedule_before.status_code == 200

            rejection = client.post(
                f"/api/v1/plans/{first_plan_id}/reject",
                headers={
                    "Idempotency-Key": "int05-d07-reject",
                },
                json={
                    "reason": "Do not swap E-02 into the D-07 slot.",
                    "category": "operations",
                    "replan": True,
                },
            )
            assert rejection.status_code == 200
            rejection_body = rejection.json()
            rejection_event_id = UUID(rejection_body["event_id"])
            assert rejection_body["action"] == "reject"
            assert rejection_body["plan_id"] == str(first_plan_id)
            assert rejection_body["replan_requested"] is True
            assert rejection_body["event_id"]

            rejected_plan = client.get(f"/api/v1/plans/{first_plan_id}")
            assert rejected_plan.status_code == 200
            assert rejected_plan.json()["status"] == "rejected"

            event_after_rejection = client.get(f"/api/v1/events/{event_id}")
            readiness_after_rejection = client.get(
                f"/api/v1/readiness/{D07_READINESS_ID}"
            )
            schedule_after_rejection = client.get("/api/v1/schedule")
            assert event_after_rejection.status_code == 200
            assert len(event_after_rejection.json()["extractions"]) == 1
            assert (
                event_after_rejection.json()["extractions"][0]["extracted_json"]
                == extracted_json
            )
            assert readiness_after_rejection.status_code == 200
            after_item = readiness_after_rejection.json()["item"]
            assert after_item["stale"] is True
            assert after_item["id"] == D07_READINESS_ID
            assert schedule_after_rejection.status_code == 200
            assert schedule_after_rejection.json()["version"] == schedule_before.json()["version"]

            second_plan = _create_plan(
                event_id,
                run_id,
                label="Push D-07 back and retain the seal risk.",
            )
            second_plan_id = UUID(second_plan["id"])
            reply = client.post(
                f"/api/v1/plans/{second_plan_id}/reply",
                headers={"Idempotency-Key": "int05-d07-reply"},
                json={"context": "Keep E-02 unchanged; replan D-07 around the seal risk."},
            )
            assert reply.status_code == 200
            reply_body = reply.json()
            reply_event_id = UUID(reply_body["event_id"])
            assert reply_body["action"] == "reply"
            assert reply_body["plan_id"] == str(second_plan_id)
            assert reply_body["event_id"]

            # The current reply API creates the linked event. PlanService is the
            # existing immutable-version seam for materializing the follow-up plan.
            replacement = _create_plan(
                event_id,
                run_id,
                label="Replan D-07 after planner reply.",
                supersedes_plan_id=second_plan_id,
            )
            replacement_id = UUID(replacement["id"])
            replacement_detail = client.get(f"/api/v1/plans/{replacement_id}")
            assert replacement_detail.status_code == 200
            lineage = {
                UUID(item["id"]): item for item in replacement_detail.json()["lineage"]
            }
            assert lineage[replacement_id]["version"] == 3
            assert lineage[replacement_id]["supersedes_plan_id"] == str(second_plan_id)
            assert lineage[second_plan_id]["status"] == "superseded"

            links = _event_links((rejection_event_id, reply_event_id))
            assert links[rejection_event_id] == (event_id, first_plan_id)
            assert links[reply_event_id] == (event_id, second_plan_id)
        finally:
            restored = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
            assert restored.status_code == 200
