import json
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import MappingProxyType
from typing import Any

from app.domain.enums import ApprovalRole, Confidence, ResourceType, RiskTag
from app.domain.errors import ForbiddenActionError, PolicyConfigError, UnknownActionError


@dataclass(frozen=True, slots=True)
class ResourceTypeDefinition:
    type: ResourceType
    capacity: Decimal
    unit: str


@dataclass(frozen=True, slots=True)
class ReadinessStep:
    name: str
    lead_days: int


@dataclass(frozen=True, slots=True)
class WeatherConstraint:
    metric: str
    maximum: Decimal
    applies_to: tuple[ResourceType, ...]


@dataclass(frozen=True, slots=True)
class Lever:
    name: str
    allowed: bool
    approval: ApprovalRole | None = None
    cost_weight: Decimal = Decimal("0")


@dataclass(frozen=True, slots=True)
class ActionRegistry:
    levers: Mapping[str, Lever]

    def __post_init__(self) -> None:
        object.__setattr__(self, "levers", MappingProxyType(dict(self.levers)))

    def get(self, name: str) -> Lever:
        try:
            return self.levers[name]
        except KeyError as exc:
            raise UnknownActionError(f"unknown action lever: {name}") from exc

    def require_allowed(self, name: str) -> Lever:
        lever = self.get(name)
        if not lever.allowed:
            raise ForbiddenActionError(f"action lever is forbidden by policy: {name}")
        return lever

    @property
    def allowed(self) -> tuple[Lever, ...]:
        return tuple(lever for lever in self.levers.values() if lever.allowed)


@dataclass(frozen=True, slots=True)
class RiskEffect:
    buffer_days: int = 0
    confidence: Confidence | None = None
    plan_on_latest: bool = False
    requires_vendor_expedite: bool = False
    locks_job: bool = False


@dataclass(frozen=True, slots=True)
class RiskRule:
    tag: RiskTag
    effect: RiskEffect


@dataclass(frozen=True, slots=True)
class WeightProfile:
    name: str
    delay_weight: Decimal
    lever_cost_weight: Decimal
    movement_weight: Decimal
    risk_weight: Decimal


@dataclass(frozen=True, slots=True)
class DomainPack:
    domain: str
    resource_types: tuple[ResourceTypeDefinition, ...]
    readiness_templates: Mapping[str, tuple[ReadinessStep, ...]]
    weather: WeatherConstraint
    priority_metric: str
    stale_after_hours: int
    action_registry: ActionRegistry
    weight_profiles: Mapping[str, WeightProfile]
    default_weight_profile: str
    risk_rules: Mapping[RiskTag, RiskRule]

    def __post_init__(self) -> None:
        object.__setattr__(self, "resource_types", tuple(self.resource_types))
        object.__setattr__(
            self,
            "readiness_templates",
            MappingProxyType(dict(self.readiness_templates)),
        )
        object.__setattr__(self, "weight_profiles", MappingProxyType(dict(self.weight_profiles)))
        object.__setattr__(self, "risk_rules", MappingProxyType(dict(self.risk_rules)))
        _validate_pack(self)

    def weight_profile(self, name: str | None = None) -> WeightProfile:
        selected = name or self.default_weight_profile
        try:
            return self.weight_profiles[selected]
        except KeyError as exc:
            raise PolicyConfigError(f"unknown weight profile: {selected}") from exc

    def risk_rule(self, tag: RiskTag) -> RiskRule:
        return self.risk_rules[tag]


def _as_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise PolicyConfigError(f"{label} must be an object")
    return value


def _as_decimal(value: Any, label: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise PolicyConfigError(f"{label} must be numeric") from exc
    if not result.is_finite():
        raise PolicyConfigError(f"{label} must be finite")
    return result


def _as_non_empty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PolicyConfigError(f"{label} must be a non-empty string")
    return value.strip()


def _parse_resource_types(raw: Any) -> tuple[ResourceTypeDefinition, ...]:
    if not isinstance(raw, list) or not raw:
        raise PolicyConfigError("resource_types must be a non-empty list")
    result: list[ResourceTypeDefinition] = []
    seen: set[ResourceType] = set()
    for index, item in enumerate(raw):
        value = _as_mapping(item, f"resource_types[{index}]")
        try:
            resource_type = ResourceType(_as_non_empty_string(value.get("type"), "resource type"))
        except ValueError as exc:
            raise PolicyConfigError(f"resource_types[{index}] has an unsupported type") from exc
        if resource_type in seen:
            raise PolicyConfigError(f"duplicate resource type: {resource_type.value}")
        capacity = _as_decimal(value.get("capacity"), f"resource_types[{index}].capacity")
        unit = _as_non_empty_string(value.get("unit"), f"resource_types[{index}].unit")
        if capacity <= 0:
            raise PolicyConfigError(f"resource_types[{index}].capacity must be positive")
        seen.add(resource_type)
        result.append(ResourceTypeDefinition(resource_type, capacity, unit))
    return tuple(result)


def _parse_readiness_templates(raw: Any) -> Mapping[str, tuple[ReadinessStep, ...]]:
    templates = _as_mapping(raw, "readiness_templates")
    result: dict[str, tuple[ReadinessStep, ...]] = {}
    for template_name, raw_steps in templates.items():
        name = _as_non_empty_string(template_name, "readiness template name")
        if not isinstance(raw_steps, list) or not raw_steps:
            raise PolicyConfigError(f"readiness template {name} must have steps")
        steps: list[ReadinessStep] = []
        seen_steps: set[str] = set()
        for index, item in enumerate(raw_steps):
            value = _as_mapping(item, f"{name}[{index}]")
            step_name = _as_non_empty_string(value.get("name"), f"{name}[{index}].name")
            lead_days = value.get("lead_days")
            if not isinstance(lead_days, int) or isinstance(lead_days, bool) or lead_days < 0:
                raise PolicyConfigError(f"{name}[{index}].lead_days must be a non-negative integer")
            if step_name in seen_steps:
                raise PolicyConfigError(f"duplicate readiness step in {name}: {step_name}")
            seen_steps.add(step_name)
            steps.append(ReadinessStep(step_name, lead_days))
        result[name] = tuple(steps)
    if not result:
        raise PolicyConfigError("readiness_templates must not be empty")
    return result


def _parse_weather(raw: Any) -> WeatherConstraint:
    value = _as_mapping(raw, "constraints")
    weather = _as_mapping(value.get("weather"), "constraints.weather")
    metric = _as_non_empty_string(weather.get("metric"), "weather.metric")
    maximum = _as_decimal(weather.get("max"), "weather.max")
    raw_applies_to = weather.get("applies_to")
    if not isinstance(raw_applies_to, list) or not raw_applies_to:
        raise PolicyConfigError("weather.applies_to must be a non-empty list")
    try:
        applies_to = tuple(
            ResourceType(_as_non_empty_string(item, "weather.applies_to"))
            for item in raw_applies_to
        )
    except ValueError as exc:
        raise PolicyConfigError("weather.applies_to contains an unsupported resource type") from exc
    if maximum <= 0:
        raise PolicyConfigError("weather.max must be positive")
    return WeatherConstraint(metric, maximum, applies_to)


def _parse_registry(raw: Any) -> ActionRegistry:
    values = _as_mapping(raw, "levers")
    if not values:
        raise PolicyConfigError("levers must not be empty")
    levers: dict[str, Lever] = {}
    for name, item in values.items():
        lever_name = _as_non_empty_string(name, "lever name")
        value = _as_mapping(item, f"levers.{lever_name}")
        allowed = value.get("allowed")
        if not isinstance(allowed, bool):
            raise PolicyConfigError(f"levers.{lever_name}.allowed must be boolean")
        approval_value = value.get("approval")
        approval: ApprovalRole | None = None
        if approval_value is not None:
            try:
                approval = ApprovalRole(
                    _as_non_empty_string(approval_value, f"levers.{lever_name}.approval")
                )
            except ValueError as exc:
                raise PolicyConfigError(f"levers.{lever_name}.approval is unsupported") from exc
        cost_weight = _as_decimal(value.get("cost_weight", 0), f"levers.{lever_name}.cost_weight")
        if cost_weight < 0:
            raise PolicyConfigError(f"levers.{lever_name}.cost_weight cannot be negative")
        if allowed and approval is None:
            raise PolicyConfigError(f"allowed lever requires approval: {lever_name}")
        if not allowed and (approval is not None or cost_weight != 0):
            raise PolicyConfigError(f"forbidden lever cannot carry approval or cost: {lever_name}")
        levers[lever_name] = Lever(lever_name, allowed, approval, cost_weight)
    return ActionRegistry(levers)


def _parse_profiles(raw: Any) -> Mapping[str, WeightProfile]:
    values = _as_mapping(raw, "weight_profiles")
    if not values:
        raise PolicyConfigError("weight_profiles must not be empty")
    profiles: dict[str, WeightProfile] = {}
    for name, item in values.items():
        profile_name = _as_non_empty_string(name, "weight profile name")
        value = _as_mapping(item, f"weight_profiles.{profile_name}")
        weights = {
            field: _as_decimal(value.get(field), f"weight_profiles.{profile_name}.{field}")
            for field in ("delay_weight", "lever_cost_weight", "movement_weight", "risk_weight")
        }
        if any(weight < 0 for weight in weights.values()) or all(
            weight == 0 for weight in weights.values()
        ):
            raise PolicyConfigError(
                f"weight profile must contain a positive weight: {profile_name}"
            )
        profiles[profile_name] = WeightProfile(profile_name, **weights)
    return profiles


def _default_risk_rules() -> Mapping[RiskTag, RiskRule]:
    return {
        RiskTag.QUALITY_FINDING: RiskRule(
            RiskTag.QUALITY_FINDING,
            RiskEffect(buffer_days=1, confidence=Confidence.LOW),
        ),
        RiskTag.VENDOR_HISTORY_LATE: RiskRule(
            RiskTag.VENDOR_HISTORY_LATE,
            RiskEffect(plan_on_latest=True, requires_vendor_expedite=True),
        ),
        RiskTag.CLIENT_COMMITMENT: RiskRule(
            RiskTag.CLIENT_COMMITMENT,
            RiskEffect(locks_job=True),
        ),
        RiskTag.OTHER: RiskRule(RiskTag.OTHER, RiskEffect()),
    }


def _validate_pack(pack: DomainPack) -> None:
    if not pack.domain.strip() or not pack.priority_metric.strip():
        raise PolicyConfigError("domain and priority_metric are required")
    if pack.stale_after_hours <= 0:
        raise PolicyConfigError("stale_after_hours must be positive")
    profile_names = set(pack.weight_profiles)
    if pack.default_weight_profile not in profile_names:
        raise PolicyConfigError("default_weight_profile must reference a configured profile")
    resource_names = {item.type for item in pack.resource_types}
    if not set(pack.weather.applies_to).issubset(resource_names):
        raise PolicyConfigError("weather constraint references an unconfigured resource type")
    if set(pack.risk_rules) != set(RiskTag):
        raise PolicyConfigError("risk rules must cover every supported risk tag")


def load_domain_pack(path: Path) -> DomainPack:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PolicyConfigError(f"could not load domain pack: {path}") from exc
    value = _as_mapping(raw, "domain pack")
    raw_profiles = value.get("weight_profiles")
    stale_after_hours = value.get("stale_after_hours")
    if not isinstance(stale_after_hours, int) or isinstance(stale_after_hours, bool):
        raise PolicyConfigError("stale_after_hours must be an integer")
    pack = DomainPack(
        domain=_as_non_empty_string(value.get("domain"), "domain"),
        resource_types=_parse_resource_types(value.get("resource_types")),
        readiness_templates=_parse_readiness_templates(value.get("readiness_templates")),
        weather=_parse_weather(value.get("constraints")),
        priority_metric=_as_non_empty_string(value.get("priority_metric"), "priority_metric"),
        stale_after_hours=stale_after_hours,
        action_registry=_parse_registry(value.get("levers")),
        weight_profiles=_parse_profiles(raw_profiles),
        default_weight_profile=_as_non_empty_string(
            value.get("default_weight_profile"), "default_weight_profile"
        ),
        risk_rules=_default_risk_rules(),
    )
    return pack


def load_offshore_pack() -> DomainPack:
    return load_domain_pack(Path(__file__).with_name("config") / "offshore.yaml")


OFFSHORE_PACK = load_offshore_pack()
