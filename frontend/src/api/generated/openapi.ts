// GENERATED FILE - DO NOT EDIT.
// Source: backend/app FastAPI OpenAPI schema.
// Regenerate with: npm run api:generate

export interface components {
  schemas: {
    "ApprovalResponse": ApprovalResponse;
    "ApprovePlanRequest": ApprovePlanRequest;
    "AskContext": AskContext;
    "AskEvidence": AskEvidence;
    "AskRequest": AskRequest;
    "AskResponse": AskResponse;
    "BookingResponse": BookingResponse;
    "BookingStatus": BookingStatus;
    "CapacityPointResponse": CapacityPointResponse;
    "CapacityResponse": CapacityResponse;
    "ChangeEventExtraction": ChangeEventExtraction;
    "ChangedObjectResponse": ChangedObjectResponse;
    "Confidence": Confidence;
    "CreateEventRequest": CreateEventRequest;
    "DecisionAction": DecisionAction;
    "DecisionChangeResponse": DecisionChangeResponse;
    "DecisionDetailResponse": DecisionDetailResponse;
    "DecisionListResponse": DecisionListResponse;
    "DecisionMutationResponse": DecisionMutationResponse;
    "DecisionSummaryResponse": DecisionSummaryResponse;
    "DemoResetRequest": DemoResetRequest;
    "DemoResetResponse": DemoResetResponse;
    "DemoScenarioResponse": DemoScenarioResponse;
    "DemoScenariosResponse": DemoScenariosResponse;
    "DiagnosticsResponse": DiagnosticsResponse;
    "ErrorEnvelope": ErrorEnvelope;
    "ErrorPayload": ErrorPayload;
    "EtaUpdateExtraction": EtaUpdateExtraction;
    "EventDetailResponse": EventDetailResponse;
    "EventListResponse": EventListResponse;
    "EventNature": EventNature;
    "EventResponse": EventResponse;
    "EventState": EventState;
    "EventSummaryResponse": EventSummaryResponse;
    "ExtractionCorrectionRequest": ExtractionCorrectionRequest;
    "ExtractionStartResponse": ExtractionStartResponse;
    "ExtractionVersionResponse": ExtractionVersionResponse;
    "HTTPValidationError": HTTPValidationError;
    "HardConstraintExtraction": HardConstraintExtraction;
    "HealthResponse": HealthResponse;
    "JobResponse": JobResponse;
    "JobStatus": JobStatus;
    "LeverResponse": LeverResponse;
    "LinkedPlanResponse": LinkedPlanResponse;
    "LinkedRunResponse": LinkedRunResponse;
    "PlanDetailResponse": PlanDetailResponse;
    "PlanEvidenceResponse": PlanEvidenceResponse;
    "PlanLineageResponse": PlanLineageResponse;
    "PlanOptionResponse": PlanOptionResponse;
    "PolicyDataHealthResponse": PolicyDataHealthResponse;
    "PolicyLeversResponse": PolicyLeversResponse;
    "PolicyProfilesResponse": PolicyProfilesResponse;
    "PublicRunEventResponse": PublicRunEventResponse;
    "ReadinessDetailResponse": ReadinessDetailResponse;
    "ReadinessItemResponse": ReadinessItemResponse;
    "ReadinessListResponse": ReadinessListResponse;
    "ReadinessPatchRequest": ReadinessPatchRequest;
    "ReadinessSourceResponse": ReadinessSourceResponse;
    "ReadinessStatus": ReadinessStatus;
    "ReadinessSuggestionResponse": ReadinessSuggestionResponse;
    "ReadinessSummary": ReadinessSummary;
    "ReadinessWriteResponse": ReadinessWriteResponse;
    "RejectPlanRequest": RejectPlanRequest;
    "ReplyPlanRequest": ReplyPlanRequest;
    "ResourceResponse": ResourceResponse;
    "ResourceType": ResourceType;
    "RiskTagExtraction": RiskTagExtraction;
    "RuledOutLeverExtraction": RuledOutLeverExtraction;
    "RunCreateResponse": RunCreateResponse;
    "RunDetailResponse": RunDetailResponse;
    "ScheduleChangesResponse": ScheduleChangesResponse;
    "ScheduleResponse": ScheduleResponse;
    "SourceHealthResponse": SourceHealthResponse;
    "SuggestionReviewRequest": SuggestionReviewRequest;
    "SuggestionReviewResponse": SuggestionReviewResponse;
    "UnavailabilityResponse": UnavailabilityResponse;
    "ValidationError": ValidationError;
    "WeatherResponse": WeatherResponse;
    "WeightProfileResponse": WeightProfileResponse;
  }
}

  export interface ApprovalResponse {
    "changed_objects": Array<components["schemas"]["ChangedObjectResponse"]>;
    "decision_id": string;
    "notification_draft_ids": Array<string>;
    "plan_id": string;
    "schedule_version_after": number;
    "schedule_version_before": number;
  }

  export interface ApprovePlanRequest {
    "acknowledged_condition_ids"?: Array<string>;
    "expected_schedule_version": number;
    "option_id": string;
  }

  export interface AskContext {
    "event_id"?: string | null;
    "job_ids"?: Array<string>;
    "plan_id"?: string | null;
    "readiness_item_ids"?: Array<string>;
    "resource_ids"?: Array<string>;
    "schedule_version"?: number | null;
  }

  export interface AskEvidence {
    "entity_id": string;
    "entity_type": string;
    "label": string;
    "source_updated_at": string | null;
  }

  export interface AskRequest {
    "context"?: components["schemas"]["AskContext"] | null;
    "question": string;
  }

  export interface AskResponse {
    "answer": string;
    "answered_at": string;
    "evidence": Array<components["schemas"]["AskEvidence"]>;
    "freshness": "current" | "stale" | "unknown";
    "scenario_id": string;
    "schedule_version": number;
    "uncertainty": string | null;
  }

  export interface BookingResponse {
    "cargo_id": string | null;
    "end_day": number;
    "id": string;
    "job_id": string | null;
    "load": string | number;
    "resource_id": string;
    "row_version": number;
    "start_day": number;
    "status": components["schemas"]["BookingStatus"];
  }

  export type BookingStatus = "planned" | "confirmed" | "cancelled"

  export interface CapacityPointResponse {
    "booking_ids": Array<string>;
    "capacity": string | number;
    "day": number;
    "overflow": string | number;
    "resource_id": string;
    "used": string | number;
    "utilization_percent": string | number;
  }

  export interface CapacityResponse {
    "feasible": boolean;
    "max_overflow": string | number;
    "points": Array<components["schemas"]["CapacityPointResponse"]>;
    "resource_id": string;
    "unit": string;
  }

  export interface ChangeEventExtraction {
    "cause"?: string | null;
    "eta_updates"?: Array<components["schemas"]["EtaUpdateExtraction"]>;
    "hard_constraints"?: Array<components["schemas"]["HardConstraintExtraction"]>;
    "job_ids"?: Array<string>;
    "levers_ruled_out"?: Array<components["schemas"]["RuledOutLeverExtraction"]>;
    "missing_info"?: Array<string>;
    "nature"?: components["schemas"]["EventNature"] | null;
    "objective"?: string | null;
    "requested_start"?: number | null;
    "risk_tags"?: Array<components["schemas"]["RiskTagExtraction"]>;
    "soft_preferences"?: Array<string>;
    "source_excerpt": string;
  }

  export interface ChangedObjectResponse {
    "after": Record<string, unknown>;
    "before": Record<string, unknown>;
    "change_kind": string;
    "entity_id": string;
    "entity_type": string;
  }

  export type Confidence = "high" | "medium" | "low"

  export interface CreateEventRequest {
    "cause"?: string | null;
    "nature"?: components["schemas"]["EventNature"] | null;
    "parent_event_id"?: string | null;
    "parent_plan_id"?: string | null;
    "raw_text": string;
  }

  export type DecisionAction = "approve" | "reject" | "reply"

  export interface DecisionChangeResponse {
    "after": Record<string, unknown>;
    "before": Record<string, unknown>;
    "change_kind": string;
    "decision_id": string;
    "entity_id": string;
    "entity_type": string;
    "field": string;
  }

  export interface DecisionDetailResponse {
    "acknowledged_condition_ids": Array<string>;
    "action": string;
    "actor": string;
    "category": string | null;
    "changes": Array<components["schemas"]["DecisionChangeResponse"]>;
    "context_status": "captured" | "partial_legacy";
    "created_at": string;
    "event_cause": string | null;
    "event_id": string;
    "event_nature": string | null;
    "id": string;
    "job_ids": Array<string>;
    "plan_id": string;
    "plan_version": number;
    "reason": string | null;
    "schedule_version_after": number | null;
    "schedule_version_before": number | null;
    "selected_option_id": string | null;
  }

  export interface DecisionListResponse {
    "decisions": Array<components["schemas"]["DecisionSummaryResponse"]>;
    "next_cursor": string | null;
    "total_count": number;
  }

  export interface DecisionMutationResponse {
    "action": string;
    "decision_id": string;
    "event_id"?: string | null;
    "plan_id": string;
    "replan_requested"?: boolean;
  }

  export interface DecisionSummaryResponse {
    "acknowledged_condition_ids": Array<string>;
    "action": string;
    "actor": string;
    "category": string | null;
    "context_status": "captured" | "partial_legacy";
    "created_at": string;
    "event_cause": string | null;
    "event_id": string;
    "event_nature": string | null;
    "id": string;
    "job_ids": Array<string>;
    "plan_id": string;
    "plan_version": number;
    "reason": string | null;
    "schedule_version_after": number | null;
    "schedule_version_before": number | null;
    "selected_option_id": string | null;
  }

  export interface DemoResetRequest {
    "scenario_id"?: string;
  }

  export interface DemoResetResponse {
    "reset_at": string;
    "scenario_id": string;
    "schedule_version": number;
    "seed_checksum": string;
    "seed_version": string;
  }

  export interface DemoScenarioResponse {
    "available": boolean;
    "description": string;
    "mode": string;
    "name": string;
    "reset_allowed": boolean;
    "scenario_id": string;
    "scenario_start_date": string;
    "seed_checksum": string;
    "seed_version": string;
  }

  export interface DemoScenariosResponse {
    "mode": string;
    "scenarios": Array<components["schemas"]["DemoScenarioResponse"]>;
  }

  export interface DiagnosticsResponse {
    "database": Record<string, unknown>;
    "metrics": Record<string, unknown>;
    "service": string;
    "solver": Record<string, unknown>;
    "status": "ok" | "degraded";
    "vertex_ai": Record<string, unknown>;
  }

  export interface ErrorEnvelope {
    "error": components["schemas"]["ErrorPayload"];
  }

  export interface ErrorPayload {
    "code": string;
    "details"?: Record<string, unknown>;
    "message": string;
    "request_id": string;
    "retryable": boolean;
  }

  export interface EtaUpdateExtraction {
    "eta_earliest"?: number | null;
    "eta_latest"?: number | null;
    "job_id": string;
    "source_excerpt": string;
    "stage": string;
  }

  export interface EventDetailResponse {
    "event": components["schemas"]["EventResponse"];
    "extractions": Array<components["schemas"]["ExtractionVersionResponse"]>;
    "plans": Array<components["schemas"]["LinkedPlanResponse"]>;
    "runs": Array<components["schemas"]["LinkedRunResponse"]>;
  }

  export interface EventListResponse {
    "events": Array<components["schemas"]["EventSummaryResponse"]>;
    "next_cursor": string | null;
    "scenario_lifecycle_counts": Record<string, unknown>;
    "total_count": number;
  }

  export type EventNature = "request" | "disruption" | "opportunity"

  export interface EventResponse {
    "cause": string | null;
    "created_at": string;
    "created_by": string;
    "extraction_version": number;
    "id": string;
    "nature": components["schemas"]["EventNature"] | null;
    "origin_type": string;
    "raw_text": string;
    "scenario_id": string;
    "state": components["schemas"]["EventState"];
    "updated_at": string;
  }

  export type EventState = "received" | "extracted" | "clarification_needed" | "planning" | "closed"

  export interface EventSummaryResponse {
    "cause": string | null;
    "created_at": string;
    "extraction_version": number;
    "id": string;
    "job_ids": Array<string>;
    "latest_plan_id": string | null;
    "latest_plan_status": string | null;
    "latest_run_id": string | null;
    "latest_run_state": string | null;
    "nature": components["schemas"]["EventNature"] | null;
    "raw_text_preview": string;
    "state": components["schemas"]["EventState"];
    "updated_at": string;
  }

  export interface ExtractionCorrectionRequest {
    "expected_extraction_version": number;
    "extraction": components["schemas"]["ChangeEventExtraction"];
  }

  export interface ExtractionStartResponse {
    "event_id": string;
    "extraction_version": number;
    "state": components["schemas"]["EventState"];
    "status": string;
  }

  export interface ExtractionVersionResponse {
    "confidence_summary": Record<string, unknown>;
    "corrected": boolean;
    "corrected_at": string | null;
    "correction_actor": string | null;
    "created_at": string;
    "event_id": string;
    "extracted_json": Record<string, unknown>;
    "model_name": string;
    "prompt_version": string;
    "version": number;
  }

  export interface HTTPValidationError {
    "detail"?: Array<components["schemas"]["ValidationError"]>;
  }

  export interface HardConstraintExtraction {
    "kind": string;
    "source_excerpt": string;
    "value"?: unknown;
  }

  export interface HealthResponse {
    "service": string;
    "status": "ok" | "ready";
  }

  export interface JobResponse {
    "duration_days": number;
    "id": string;
    "job_type": string;
    "lock_reason": string | null;
    "locked": boolean;
    "row_version": number;
    "shortfall_bopd": string | number;
    "site": string;
    "start_day": number;
    "status": components["schemas"]["JobStatus"];
  }

  export type JobStatus = "planned" | "active" | "complete" | "cancelled"

  export interface LeverResponse {
    "allowed": boolean;
    "approval": string | null;
    "cost_weight": string | number;
    "name": string;
  }

  export interface LinkedPlanResponse {
    "base_schedule_version": number;
    "created_at": string;
    "id": string;
    "status": string;
    "verdict": string;
    "version": number;
  }

  export interface LinkedRunResponse {
    "attempt": number;
    "completed_at": string | null;
    "extraction_version": number;
    "id": string;
    "started_at": string;
    "state": string;
  }

  export interface PlanDetailResponse {
    "base_schedule_version": number;
    "counterfactual": Record<string, unknown> | null;
    "created_at": string;
    "event_id": string;
    "evidence": Array<components["schemas"]["PlanEvidenceResponse"]>;
    "explanation": Record<string, unknown>;
    "id": string;
    "lineage": Array<components["schemas"]["PlanLineageResponse"]>;
    "options": Array<components["schemas"]["PlanOptionResponse"]>;
    "recommended_option_id": string | null;
    "run_id": string;
    "status": string;
    "verdict": string;
    "version": number;
  }

  export interface PlanEvidenceResponse {
    "claim_id": string;
    "claim_text": string;
    "evidence_type": string;
    "plan_id": string;
    "tool_call_id": string | null;
  }

  export interface PlanLineageResponse {
    "created_at": string;
    "event_id": string;
    "id": string;
    "run_id": string;
    "status": string;
    "supersedes_plan_id": string | null;
    "verdict": string;
    "version": number;
  }

  export interface PlanOptionResponse {
    "changes": Array<Record<string, unknown>>;
    "conditions": Array<unknown>;
    "id": string;
    "is_recommended": boolean;
    "kpi": Record<string, unknown>;
    "label": string;
    "objective_value": string | null;
    "plan_id": string;
    "rank": number;
    "solve_milliseconds": number | null;
    "solver_status": string;
    "violations": Array<Record<string, unknown>>;
    "weight_profile": Record<string, unknown>;
  }

  export interface PolicyDataHealthResponse {
    "as_of": string;
    "sources": Array<components["schemas"]["SourceHealthResponse"]>;
    "stale_after_hours": number;
  }

  export interface PolicyLeversResponse {
    "levers": Array<components["schemas"]["LeverResponse"]>;
  }

  export interface PolicyProfilesResponse {
    "default_profile": string;
    "profiles": Array<components["schemas"]["WeightProfileResponse"]>;
  }

  export interface PublicRunEventResponse {
    "phase": string | null;
    "public": Record<string, unknown>;
    "run_id": string;
    "seq": number;
    "timestamp": string;
    "type": string;
  }

  export interface ReadinessDetailResponse {
    "history": Array<components["schemas"]["ReadinessSuggestionResponse"]>;
    "item": components["schemas"]["ReadinessItemResponse"];
    "scenario_id": string;
    "schedule_version": number;
    "source": components["schemas"]["ReadinessSourceResponse"];
    "suggestion": components["schemas"]["ReadinessSuggestionResponse"] | null;
  }

  export interface ReadinessItemResponse {
    "confidence": components["schemas"]["Confidence"];
    "earliest_feasible_start": number | null;
    "effective_eta": number | null;
    "effective_slack": number | null;
    "eta_earliest": number | null;
    "eta_latest": number | null;
    "feasible_for_target": boolean;
    "freshness_hours": number | null;
    "id": string;
    "job_id": string;
    "last_updated": string | null;
    "lead_time_days": number;
    "not_before_day": number | null;
    "notes": Array<string>;
    "plan_on_latest": boolean;
    "planned_day": number | null;
    "required_by": number;
    "risk_buffer_days": number;
    "row_version": number;
    "slack": number | null;
    "source_reference": string | null;
    "source_type": string;
    "stage": string;
    "stale": boolean;
    "status": components["schemas"]["ReadinessStatus"];
    "step_order": number;
    "vendor_expedite_required": boolean;
  }

  export interface ReadinessListResponse {
    "items": Array<components["schemas"]["ReadinessItemResponse"]>;
    "scenario_id": string;
    "schedule_version": number;
    "summary": components["schemas"]["ReadinessSummary"];
    "total_count": number;
  }

  export interface ReadinessPatchRequest {
    "confidence"?: components["schemas"]["Confidence"] | null;
    "eta_earliest"?: number | null;
    "eta_latest"?: number | null;
    "expected_row_version": number;
    "planned_day"?: number | null;
    "risk_buffer_days"?: number | null;
    "source_reference"?: string | null;
    "status"?: components["schemas"]["ReadinessStatus"] | null;
  }

  export interface ReadinessSourceResponse {
    "confidence": components["schemas"]["Confidence"];
    "freshness_hours": number | null;
    "last_updated": string | null;
    "source_reference": string | null;
    "source_type": string;
    "stale": boolean;
  }

  export type ReadinessStatus = "pending" | "ready" | "blocked" | "waived"

  export interface ReadinessSuggestionResponse {
    "base_row_version": number;
    "confidence": string | number | null;
    "created_at": string;
    "event_id": string;
    "id": string;
    "proposed_patch": Record<string, unknown>;
    "readiness_item_id": string;
    "review_actor": string | null;
    "review_note": string | null;
    "reviewed_at": string | null;
    "source_excerpt": string | null;
    "state": string;
  }

  export interface ReadinessSummary {
    "at_risk": number;
    "blocked": number;
    "low_confidence": number;
    "stale": number;
    "total": number;
  }

  export interface ReadinessWriteResponse {
    "item": components["schemas"]["ReadinessItemResponse"];
    "schedule_version": number;
  }

  export interface RejectPlanRequest {
    "category"?: string | null;
    "reason": string;
    "replan"?: boolean;
  }

  export interface ReplyPlanRequest {
    "context": string;
  }

  export interface ResourceResponse {
    "active": boolean;
    "capacity": string | number;
    "id": string;
    "metadata": Record<string, unknown>;
    "name": string;
    "type": components["schemas"]["ResourceType"];
    "unit": string;
  }

  export type ResourceType = "barge" | "supply_boat" | "crane" | "test_bay" | "lift_crew"

  export interface RiskTagExtraction {
    "object_id"?: string | null;
    "source_excerpt": string;
    "tag": string;
  }

  export interface RuledOutLeverExtraction {
    "lever": string;
    "source_excerpt": string;
  }

  export interface RunCreateResponse {
    "attempt": number;
    "event_id": string;
    "extraction_version": number;
    "run_id": string;
    "state": string;
    "stream_url": string;
  }

  export interface RunDetailResponse {
    "attempt": number;
    "completed_at": string | null;
    "error_code": string | null;
    "event_id": string;
    "events": Array<components["schemas"]["PublicRunEventResponse"]>;
    "extraction_version": number;
    "plan_id": string | null;
    "run_id": string;
    "started_at": string;
    "state": string;
    "timeout_at": string | null;
    "tool_call_budget": number;
    "tool_call_usage": number;
  }

  export interface ScheduleChangesResponse {
    "changes": Array<components["schemas"]["ChangedObjectResponse"]>;
    "decision_id": string;
    "schedule_version_after": number | null;
    "schedule_version_before": number;
  }

  export interface ScheduleResponse {
    "bookings": Array<components["schemas"]["BookingResponse"]>;
    "capacity": Array<components["schemas"]["CapacityResponse"]>;
    "from_day": number | null;
    "jobs": Array<components["schemas"]["JobResponse"]>;
    "resources": Array<components["schemas"]["ResourceResponse"]>;
    "scenario_id": string;
    "to_day": number | null;
    "unavailability": Array<components["schemas"]["UnavailabilityResponse"]>;
    "version": number;
    "weather": Array<components["schemas"]["WeatherResponse"]>;
  }

  export interface SourceHealthResponse {
    "item_count": number;
    "latest_updated_at": string | null;
    "source_type": string;
    "stale_count": number;
    "status": string;
  }

  export interface SuggestionReviewRequest {
    "note"?: string | null;
  }

  export interface SuggestionReviewResponse {
    "schedule_version": number;
    "suggestion": components["schemas"]["ReadinessSuggestionResponse"];
  }

  export interface UnavailabilityResponse {
    "end_day": number;
    "id": string;
    "kind": "maintenance" | "unavailable";
    "reason": string;
    "resource_id": string;
    "start_day": number;
  }

  export interface ValidationError {
    "ctx"?: Record<string, unknown>;
    "input"?: unknown;
    "loc": Array<string | number>;
    "msg": string;
    "type": string;
  }

  export interface WeatherResponse {
    "day": number;
    "go": boolean | null;
    "location": string;
    "metric": string;
    "source": string;
    "value": string | number | null;
  }

  export interface WeightProfileResponse {
    "delay_weight": string | number;
    "lever_cost_weight": string | number;
    "movement_weight": string | number;
    "name": string;
    "risk_weight": string | number;
  }

export interface paths {
  "/api/v1/ask": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["AskResponse"];
            }
        };
        "404": {
          content:
            {
              "application/json": components["schemas"]["ErrorEnvelope"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
        "503": {
          content:
            {
              "application/json": components["schemas"]["ErrorEnvelope"];
            }
        };
      };
    };
  };
  "/api/v1/decisions": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["DecisionListResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/decisions/{decision_id}": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["DecisionDetailResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/demo/reset": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["DemoResetResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/demo/scenarios": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["DemoScenariosResponse"];
            }
        };
      };
    };
  };
  "/api/v1/demo/scenarios/{scenario_id}/runs/{run_id}/stream": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": unknown;
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/events": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["EventListResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
    post: {
      responses: {
        "201": {
          content:
            {
              "application/json": components["schemas"]["EventResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/events/{event_id}": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["EventDetailResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
    delete: {
      responses: {
        "204": {
          content: Record<string, never>;
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/events/{event_id}/extract": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ExtractionStartResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/events/{event_id}/extraction": {
    patch: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["EventDetailResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/events/{event_id}/runs": {
    post: {
      responses: {
        "201": {
          content:
            {
              "application/json": components["schemas"]["RunCreateResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/health/diagnostics": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["DiagnosticsResponse"];
            }
        };
      };
    };
  };
  "/api/v1/health/live": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["HealthResponse"];
            }
        };
      };
    };
  };
  "/api/v1/health/ready": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["HealthResponse"];
            }
        };
      };
    };
  };
  "/api/v1/plans/{plan_id}": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["PlanDetailResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/plans/{plan_id}/approve": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ApprovalResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/plans/{plan_id}/reject": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["DecisionMutationResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/plans/{plan_id}/reply": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["DecisionMutationResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/policy/data-health": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["PolicyDataHealthResponse"];
            }
        };
      };
    };
  };
  "/api/v1/policy/levers": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["PolicyLeversResponse"];
            }
        };
      };
    };
  };
  "/api/v1/policy/profiles": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["PolicyProfilesResponse"];
            }
        };
      };
    };
  };
  "/api/v1/readiness": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ReadinessListResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/readiness/suggestions/{suggestion_id}/accept": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ReadinessWriteResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/readiness/suggestions/{suggestion_id}/reject": {
    post: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["SuggestionReviewResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/readiness/{item_id}": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ReadinessDetailResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
    patch: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ReadinessWriteResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/runs/{run_id}": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["RunDetailResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/runs/{run_id}/stream": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": unknown;
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/schedule": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ScheduleResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
  "/api/v1/schedule/changes": {
    get: {
      responses: {
        "200": {
          content:
            {
              "application/json": components["schemas"]["ScheduleChangesResponse"];
            }
        };
        "422": {
          content:
            {
              "application/json": components["schemas"]["HTTPValidationError"];
            }
        };
      };
    };
  };
}
