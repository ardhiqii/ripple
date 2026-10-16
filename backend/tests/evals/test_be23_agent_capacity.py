from decimal import Decimal
from types import SimpleNamespace
from typing import cast

from app.agent.tools import WorkflowToolbox
from app.application.schemas import ChangeEventExtraction
from app.domain.enums import BookingStatus, ResourceType
from app.domain.policy import OFFSHORE_PACK
from app.domain.resources import Booking, Resource, ResourceUnavailability
from app.engine.simulate import ScheduleSnapshot


def test_agent_capacity_read_includes_unavailability_without_mutating_schedule() -> None:
    booking = Booking(
        id="cargo-1",
        scenario_id="demo",
        resource_id="SB-1",
        start_day=5,
        end_day=5,
        load=Decimal("10"),
        status=BookingStatus.PLANNED,
        cargo_id="cargo-1",
    )
    snapshot = ScheduleSnapshot(
        scenario_id="demo",
        jobs=(),
        resources=(
            Resource(
                id="SB-1",
                scenario_id="demo",
                type=ResourceType.SUPPLY_BOAT,
                name="Supply boat",
                capacity=Decimal("100"),
                unit="deck_units",
            ),
        ),
        bookings=(booking,),
        unavailability=(
            ResourceUnavailability(
                id="inspection-1",
                scenario_id="demo",
                resource_id="SB-1",
                start_day=5,
                end_day=5,
                kind="unavailable",
                reason="inspection",
            ),
        ),
    )
    toolbox = WorkflowToolbox(
        snapshot,
        OFFSHORE_PACK,
        cast(
            ChangeEventExtraction,
            SimpleNamespace(job_ids=(), risk_tags=(), levers_ruled_out=()),
        ),
    )
    try:
        result = toolbox.check_capacity(resource_id="SB-1")
    finally:
        toolbox.close()

    assert result["resources"] == (
        {
            "resource_id": "SB-1",
            "unit": "deck_units",
            "max_overflow": "10",
            "feasible": False,
        },
    )
    assert snapshot.bookings == (booking,)
