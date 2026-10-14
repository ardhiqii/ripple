from decimal import Decimal

import pytest
from app.domain.enums import Confidence, RiskTag
from app.domain.errors import ForbiddenActionError, PolicyConfigError
from app.domain.jobs import Job
from app.domain.policy import OFFSHORE_PACK, load_domain_pack


def test_offshore_pack_loads_with_policy_and_profiles() -> None:
    assert OFFSHORE_PACK.domain == "offshore_well_intervention"
    assert OFFSHORE_PACK.action_registry.get("move_cargo").allowed is True
    assert OFFSHORE_PACK.weight_profile().name == "production_first"
    assert OFFSHORE_PACK.risk_rule(RiskTag.QUALITY_FINDING).effect.confidence is Confidence.LOW


def test_forbidden_lever_cannot_be_opened() -> None:
    with pytest.raises(ForbiddenActionError):
        OFFSHORE_PACK.action_registry.require_allowed("move_locked_job")


def test_invalid_allowed_lever_fails_pack_validation(tmp_path) -> None:
    config = tmp_path / "invalid.yaml"
    config.write_text(
        '{"domain":"bad","resource_types":[{"type":"barge","capacity":1,"unit":"job"}],'
        '"readiness_templates":{"test":[{"name":"step","lead_days":1}]},'
        '"constraints":{"weather":{"metric":"wave_height_m","max":2,"applies_to":["barge"]}},'
        '"priority_metric":"shortfall_bopd","stale_after_hours":48,'
        '"levers":{"unsafe":{"allowed":true}},'
        '"weight_profiles":{"production_first":{"delay_weight":1,"lever_cost_weight":1,'
        '"movement_weight":1,"risk_weight":1}},'
        '"default_weight_profile":"production_first"}',
        encoding="utf-8",
    )

    with pytest.raises(PolicyConfigError):
        load_domain_pack(config)


def test_domain_entity_rejects_invalid_state() -> None:
    with pytest.raises(ValueError, match="duration_days"):
        Job(
            id="A-12",
            scenario_id="demo",
            site="North Delta",
            job_type="intervention",
            start_day=1,
            duration_days=0,
            shortfall_bopd=Decimal("10"),
        )
