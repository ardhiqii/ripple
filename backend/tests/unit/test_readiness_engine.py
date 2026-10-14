from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from app.domain.changes import RiskEvidence
from app.domain.enums import Confidence, RiskTag
from app.domain.jobs import Job
from app.domain.policy import OFFSHORE_PACK
from app.domain.readiness import ReadinessItem
from app.engine.readiness import check_readiness, earliest_feasible_start


def _job(start_day: int = 10) -> Job:
    return Job(
        id="A-12",
        scenario_id="demo",
        site="North Delta",
        job_type="esp_replacement",
        start_day=start_day,
        duration_days=2,
        shortfall_bopd=Decimal("100"),
    )


def _items(test_day: int = 4, *, last_updated: datetime | None = None) -> list[ReadinessItem]:
    return [
        ReadinessItem(
            id="A-12-test",
            scenario_id="demo",
            job_id="A-12",
            stage="function_test",
            step_order=1,
            lead_time_days=1,
            eta_earliest=test_day,
            eta_latest=test_day,
            last_updated=last_updated,
        ),
        ReadinessItem(
            id="A-12-paperwork",
            scenario_id="demo",
            job_id="A-12",
            stage="paperwork",
            step_order=2,
            lead_time_days=1,
            planned_day=test_day + 1,
            last_updated=last_updated,
        ),
        ReadinessItem(
            id="A-12-shorebase",
            scenario_id="demo",
            job_id="A-12",
            stage="shorebase_staging",
            step_order=3,
            lead_time_days=1,
            planned_day=test_day + 2,
            last_updated=last_updated,
        ),
        ReadinessItem(
            id="A-12-sail",
            scenario_id="demo",
            job_id="A-12",
            stage="load_and_sail",
            step_order=4,
            lead_time_days=1,
            planned_day=test_day + 3,
            last_updated=last_updated,
        ),
    ]


def test_a12_test_d4_starts_on_d7() -> None:
    result = earliest_feasible_start(
        _job(),
        _items(last_updated=datetime.now(UTC)),
        OFFSHORE_PACK,
    )

    assert result == 7


@pytest.mark.parametrize("target_start", [5, 10, 20])
def test_required_by_and_ordering_follow_template(target_start: int) -> None:
    report = check_readiness(
        _job(start_day=target_start),
        _items(last_updated=datetime.now(UTC)),
        OFFSHORE_PACK,
    )

    assert [item.stage for item in report.items] == [
        "function_test",
        "paperwork",
        "shorebase_staging",
        "load_and_sail",
    ]
    assert [item.required_by for item in report.items] == [
        target_start - 3,
        target_start - 2,
        target_start - 1,
        target_start,
    ]


@pytest.mark.parametrize("base_buffer", [0, 1, 3])
def test_effective_eta_buffer_is_monotonic(base_buffer: int) -> None:
    items = _items(last_updated=datetime.now(UTC))
    items[0] = replace(items[0], risk_buffer_days=base_buffer)

    report = check_readiness(_job(), items, OFFSHORE_PACK)
    test_item = report.items[0]

    assert test_item.eta_latest is not None
    assert test_item.effective_eta is not None
    assert test_item.effective_slack is not None
    assert test_item.effective_eta == test_item.eta_latest + base_buffer
    assert test_item.effective_slack == test_item.required_by - test_item.effective_eta


def test_quality_finding_adds_risk_and_low_confidence_buffers() -> None:
    report = check_readiness(
        _job(),
        _items(last_updated=datetime.now(UTC)),
        OFFSHORE_PACK,
        risk_tags=[
            RiskEvidence(
                tag=RiskTag.QUALITY_FINDING,
                source_sentence="seal finding during test",
                object_id="A-12-test",
            )
        ],
    )

    test_item = report.items[0]
    assert test_item.confidence is Confidence.LOW
    assert test_item.risk_buffer_days == 2
    assert test_item.effective_eta == 6
    assert test_item.effective_slack == 1


def test_stale_source_is_low_confidence_and_marks_report_stale() -> None:
    as_of = datetime(2026, 10, 13, 12, tzinfo=UTC)
    stale_update = as_of - timedelta(hours=49)

    report = check_readiness(_job(), _items(last_updated=stale_update), OFFSHORE_PACK, as_of=as_of)

    assert report.stale is True
    assert all(item.stale for item in report.items)
    assert all(item.confidence is Confidence.LOW for item in report.items)
    assert report.items[0].risk_buffer_days == 1


def test_unknown_risk_tag_is_a_note_without_schedule_effect() -> None:
    report = check_readiness(
        _job(),
        _items(last_updated=datetime.now(UTC)),
        OFFSHORE_PACK,
        risk_tags=["unknown_tag"],
    )

    assert report.items[0].risk_buffer_days == 0
    assert any("Unknown risk tag" in note for note in report.notes)
