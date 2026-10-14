// GENERATED FILE - DO NOT EDIT.
// Source: backend/app FastAPI OpenAPI schema.
// Regenerate with: npm run api:generate

export interface components {
  schemas: {
    "ApprovalResponse": ApprovalResponse;
    "ApprovePlanRequest": ApprovePlanRequest;
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
    "ValidationError": ValidationError;
    "WeatherResponse": WeatherResponse;
    "WeightProfileResponse": WeightProfileResponse;
  }
}

  export interface ApprovalResponse {
    "changed_objects": unknown;
    "decision_id": unknown;
    "notification_draft_ids": unknown;
    "plan_id": unknown;
    "schedule_version_after": unknown;
    "schedule_version_before": unknown;
  }

  export interface ApprovePlanRequest {
    "acknowledged_condition_ids"?: Array<string>;
    "expected_schedule_version": number;
    "option_id": string;
  }

  export interface BookingResponse {
    "cargo_id": unknown;
    "end_day": unknown;
    "id": unknown;
    "job_id": unknown;
    "load": unknown;
    "resource_id": unknown;
    "row_version": unknown;
    "start_day": unknown;
    "status": unknown;
  }

  export type BookingStatus = "planned" | "confirmed" | "cancelled"

  export interface CapacityPointResponse {
    "booking_ids": unknown;
    "capacity": unknown;
    "day": unknown;
    "overflow": unknown;
    "resource_id": unknown;
    "used": unknown;
    "utilization_percent": unknown;
  }

  export interface CapacityResponse {
    "feasible": unknown;
    "max_overflow": unknown;
    "points": unknown;
    "resource_id": unknown;
    "unit": unknown;
  }

  export interface ChangeEventExtraction {
    "cause"?: string | unknown;
    "eta_updates"?: Array<components["schemas"]["EtaUpdateExtraction"]>;
    "hard_constraints"?: Array<components["schemas"]["HardConstraintExtraction"]>;
    "job_ids"?: Array<string>;
    "levers_ruled_out"?: Array<components["schemas"]["RuledOutLeverExtraction"]>;
    "missing_info"?: Array<string>;
    "nature"?: components["schemas"]["EventNature"] | unknown;
    "objective"?: string | unknown;
    "requested_start"?: number | unknown;
    "risk_tags"?: Array<components["schemas"]["RiskTagExtraction"]>;
    "soft_preferences"?: Array<string>;
    "source_excerpt": string;
  }

  export interface ChangedObjectResponse {
    "after": unknown;
    "before": unknown;
    "change_kind": unknown;
    "entity_id": unknown;
    "entity_type": unknown;
  }

  export type Confidence = "high" | "medium" | "low"

  export interface CreateEventRequest {
    "cause"?: string | unknown;
    "nature"?: components["schemas"]["EventNature"] | unknown;
    "parent_event_id"?: string | unknown;
    "parent_plan_id"?: string | unknown;
    "raw_text": string;
  }

  export type DecisionAction = "approve" | "reject" | "reply"

  export interface DecisionChangeResponse {
    "after": unknown;
    "before": unknown;
    "change_kind": unknown;
    "decision_id": unknown;
    "entity_id": unknown;
    "entity_type": unknown;
    "field": unknown;
  }

  export interface DecisionDetailResponse {
    "acknowledged_condition_ids": unknown;
    "action": unknown;
    "actor": unknown;
    "category": unknown;
    "changes": unknown;
    "created_at": unknown;
    "id": unknown;
    "plan_id": unknown;
    "reason": unknown;
    "schedule_version_after": unknown;
    "schedule_version_before": unknown;
    "selected_option_id": unknown;
  }

  export interface DecisionListResponse {
    "decisions": unknown;
    "next_cursor": unknown;
  }

  export interface DecisionMutationResponse {
    "action": unknown;
    "decision_id": unknown;
    "event_id"?: unknown;
    "plan_id": unknown;
    "replan_requested"?: unknown;
  }

  export interface DecisionSummaryResponse {
    "acknowledged_condition_ids": unknown;
    "action": unknown;
    "actor": unknown;
    "category": unknown;
    "created_at": unknown;
    "id": unknown;
    "plan_id": unknown;
    "reason": unknown;
    "schedule_version_after": unknown;
    "schedule_version_before": unknown;
    "selected_option_id": unknown;
  }

  export interface DemoResetRequest {
    "scenario_id"?: string;
  }

  export interface DemoResetResponse {
    "reset_at": unknown;
    "scenario_id": unknown;
    "schedule_version": unknown;
    "seed_checksum": unknown;
    "seed_version": unknown;
  }

  export interface DemoScenarioResponse {
    "available": unknown;
    "description": unknown;
    "mode": unknown;
    "name": unknown;
    "scenario_id": unknown;
    "seed_checksum": unknown;
    "seed_version": unknown;
  }

  export interface DemoScenariosResponse {
    "mode": unknown;
    "scenarios": unknown;
  }

  export interface DiagnosticsResponse {
    "database": Record<string, unknown>;
    "metrics": Record<string, unknown>;
    "service": string;
    "solver": Record<string, unknown>;
    "status": "ok" | "degraded";
    "vertex_ai": Record<string, unknown>;
  }

  export interface EtaUpdateExtraction {
    "eta_earliest"?: number | unknown;
    "eta_latest"?: number | unknown;
    "job_id": string;
    "source_excerpt": string;
    "stage": string;
  }

  export interface EventDetailResponse {
    "event": unknown;
    "extractions": unknown;
    "plans": unknown;
    "runs": unknown;
  }

  export interface EventListResponse {
    "events": unknown;
    "next_cursor": unknown;
  }

  export type EventNature = "request" | "disruption" | "opportunity"

  export interface EventResponse {
    "cause": unknown;
    "created_at": unknown;
    "created_by": unknown;
    "extraction_version": unknown;
    "id": unknown;
    "nature": unknown;
    "origin_type": unknown;
    "raw_text": unknown;
    "scenario_id": unknown;
    "state": unknown;
    "updated_at": unknown;
  }

  export type EventState = "received" | "extracted" | "clarification_needed" | "planning" | "closed"

  export interface EventSummaryResponse {
    "cause": unknown;
    "created_at": unknown;
    "extraction_version": unknown;
    "id": unknown;
    "nature": unknown;
    "raw_text_preview": unknown;
    "state": unknown;
    "updated_at": unknown;
  }

  export interface ExtractionCorrectionRequest {
    "expected_extraction_version": number;
    "extraction": components["schemas"]["ChangeEventExtraction"];
  }

  export interface ExtractionStartResponse {
    "event_id": unknown;
    "extraction_version": unknown;
    "state": unknown;
    "status": unknown;
  }

  export interface ExtractionVersionResponse {
    "confidence_summary": unknown;
    "corrected": unknown;
    "corrected_at": unknown;
    "correction_actor": unknown;
    "created_at": unknown;
    "event_id": unknown;
    "extracted_json": unknown;
    "model_name": unknown;
    "prompt_version": unknown;
    "version": unknown;
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
    "duration_days": unknown;
    "id": unknown;
    "job_type": unknown;
    "lock_reason": unknown;
    "locked": unknown;
    "row_version": unknown;
    "shortfall_bopd": unknown;
    "site": unknown;
    "start_day": unknown;
    "status": unknown;
  }

  export type JobStatus = "planned" | "active" | "complete" | "cancelled"

  export interface LeverResponse {
    "allowed": unknown;
    "approval": unknown;
    "cost_weight": unknown;
    "name": unknown;
  }

  export interface LinkedPlanResponse {
    "base_schedule_version": unknown;
    "created_at": unknown;
    "id": unknown;
    "status": unknown;
    "verdict": unknown;
    "version": unknown;
  }

  export interface LinkedRunResponse {
    "attempt": unknown;
    "completed_at": unknown;
    "extraction_version": unknown;
    "id": unknown;
    "started_at": unknown;
    "state": unknown;
  }

  export interface PlanDetailResponse {
    "base_schedule_version": unknown;
    "counterfactual": unknown;
    "created_at": unknown;
    "event_id": unknown;
    "evidence": unknown;
    "explanation": unknown;
    "id": unknown;
    "lineage": unknown;
    "options": unknown;
    "recommended_option_id": unknown;
    "run_id": unknown;
    "status": unknown;
    "verdict": unknown;
    "version": unknown;
  }

  export interface PlanEvidenceResponse {
    "claim_id": unknown;
    "claim_text": unknown;
    "evidence_type": unknown;
    "plan_id": unknown;
    "tool_call_id": unknown;
  }

  export interface PlanLineageResponse {
    "created_at": unknown;
    "event_id": unknown;
    "id": unknown;
    "run_id": unknown;
    "status": unknown;
    "supersedes_plan_id": unknown;
    "verdict": unknown;
    "version": unknown;
  }

  export interface PlanOptionResponse {
    "changes": unknown;
    "conditions": unknown;
    "id": unknown;
    "is_recommended": unknown;
    "kpi": unknown;
    "label": unknown;
    "objective_value": unknown;
    "plan_id": unknown;
    "rank": unknown;
    "solve_milliseconds": unknown;
    "solver_status": unknown;
    "violations": unknown;
    "weight_profile": unknown;
  }

  export interface PolicyDataHealthResponse {
    "as_of": unknown;
    "sources": unknown;
    "stale_after_hours": unknown;
  }

  export interface PolicyLeversResponse {
    "levers": unknown;
  }

  export interface PolicyProfilesResponse {
    "default_profile": unknown;
    "profiles": unknown;
  }

  export interface PublicRunEventResponse {
    "phase": unknown;
    "public": unknown;
    "run_id": unknown;
    "seq": unknown;
    "timestamp": unknown;
    "type": unknown;
  }

  export interface ReadinessDetailResponse {
    "history": unknown;
    "item": unknown;
    "scenario_id": unknown;
    "schedule_version": unknown;
    "source": unknown;
    "suggestion": unknown;
  }

  export interface ReadinessItemResponse {
    "confidence": unknown;
    "earliest_feasible_start": unknown;
    "effective_eta": unknown;
    "effective_slack": unknown;
    "eta_earliest": unknown;
    "eta_latest": unknown;
    "feasible_for_target": unknown;
    "freshness_hours": unknown;
    "id": unknown;
    "job_id": unknown;
    "last_updated": unknown;
    "lead_time_days": unknown;
    "not_before_day": unknown;
    "notes": unknown;
    "plan_on_latest": unknown;
    "planned_day": unknown;
    "required_by": unknown;
    "risk_buffer_days": unknown;
    "row_version": unknown;
    "slack": unknown;
    "source_reference": unknown;
    "source_type": unknown;
    "stage": unknown;
    "stale": unknown;
    "status": unknown;
    "step_order": unknown;
    "vendor_expedite_required": unknown;
  }

  export interface ReadinessListResponse {
    "items": unknown;
    "scenario_id": unknown;
    "schedule_version": unknown;
    "summary": unknown;
  }

  export interface ReadinessPatchRequest {
    "confidence"?: components["schemas"]["Confidence"] | unknown;
    "eta_earliest"?: number | unknown;
    "eta_latest"?: number | unknown;
    "expected_row_version": number;
    "planned_day"?: number | unknown;
    "risk_buffer_days"?: number | unknown;
    "source_reference"?: string | unknown;
    "status"?: components["schemas"]["ReadinessStatus"] | unknown;
  }

  export interface ReadinessSourceResponse {
    "confidence": unknown;
    "freshness_hours": unknown;
    "last_updated": unknown;
    "source_reference": unknown;
    "source_type": unknown;
    "stale": unknown;
  }

  export type ReadinessStatus = "pending" | "ready" | "blocked" | "waived"

  export interface ReadinessSuggestionResponse {
    "base_row_version": unknown;
    "confidence": unknown;
    "created_at": unknown;
    "event_id": unknown;
    "id": unknown;
    "proposed_patch": unknown;
    "readiness_item_id": unknown;
    "review_actor": unknown;
    "review_note": unknown;
    "reviewed_at": unknown;
    "source_excerpt": unknown;
    "state": unknown;
  }

  export interface ReadinessSummary {
    "at_risk": unknown;
    "blocked": unknown;
    "low_confidence": unknown;
    "stale": unknown;
    "total": unknown;
  }

  export interface ReadinessWriteResponse {
    "item": unknown;
    "schedule_version": unknown;
  }

  export interface RejectPlanRequest {
    "category"?: string | unknown;
    "reason": string;
    "replan"?: boolean;
  }

  export interface ReplyPlanRequest {
    "context": string;
  }

  export interface ResourceResponse {
    "active": unknown;
    "capacity": unknown;
    "id": unknown;
    "metadata": unknown;
    "name": unknown;
    "type": unknown;
    "unit": unknown;
  }

  export type ResourceType = "barge" | "supply_boat" | "crane" | "test_bay" | "lift_crew"

  export interface RiskTagExtraction {
    "object_id"?: string | unknown;
    "source_excerpt": string;
    "tag": string;
  }

  export interface RuledOutLeverExtraction {
    "lever": string;
    "source_excerpt": string;
  }

  export interface RunCreateResponse {
    "attempt": unknown;
    "event_id": unknown;
    "extraction_version": unknown;
    "run_id": unknown;
    "state": unknown;
    "stream_url": unknown;
  }

  export interface RunDetailResponse {
    "attempt": unknown;
    "completed_at": unknown;
    "error_code": unknown;
    "event_id": unknown;
    "events": unknown;
    "extraction_version": unknown;
    "plan_id": unknown;
    "run_id": unknown;
    "started_at": unknown;
    "state": unknown;
    "timeout_at": unknown;
    "tool_call_budget": unknown;
    "tool_call_usage": unknown;
  }

  export interface ScheduleChangesResponse {
    "changes": unknown;
    "decision_id": unknown;
    "schedule_version_after": unknown;
    "schedule_version_before": unknown;
  }

  export interface ScheduleResponse {
    "bookings": unknown;
    "capacity": unknown;
    "from_day": unknown;
    "jobs": unknown;
    "resources": unknown;
    "scenario_id": unknown;
    "to_day": unknown;
    "version": unknown;
    "weather": unknown;
  }

  export interface SourceHealthResponse {
    "item_count": unknown;
    "latest_updated_at": unknown;
    "source_type": unknown;
    "stale_count": unknown;
    "status": unknown;
  }

  export interface SuggestionReviewRequest {
    "note"?: string | unknown;
  }

  export interface SuggestionReviewResponse {
    "schedule_version": unknown;
    "suggestion": unknown;
  }

  export interface ValidationError {
    "ctx"?: Record<string, unknown>;
    "input"?: unknown;
    "loc": Array<string | number>;
    "msg": string;
    "type": string;
  }

  export interface WeatherResponse {
    "day": unknown;
    "go": unknown;
    "location": unknown;
    "metric": unknown;
    "source": unknown;
    "value": unknown;
  }

  export interface WeightProfileResponse {
    "delay_weight": unknown;
    "lever_cost_weight": unknown;
    "movement_weight": unknown;
    "name": unknown;
    "risk_weight": unknown;
  }

export interface paths {
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
