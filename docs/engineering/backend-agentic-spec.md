# Ripple Backend and Agentic System Specification

Status: proposed implementation-ready backend plan  
Date: 13 October 2026  
Companions: [product build plan](../product/product-build-plan.md), [UI/UX interaction specification](../design/uiux-interaction-spec.md), and [technical plan](technical-plan.md)

This document defines the backend architecture, agent runtime, deterministic engine, solver, database, API, streaming, reliability, security, testing, and deployment contracts needed to build Ripple without reopening core engineering decisions during implementation.

## 1. Language decision

### 1.1 Recommendation

Use Python 3.12 for the Ripple backend, agent, engine, and solver in one modular Cloud Run service.

Do not introduce Go in the hackathon or first pilot unless a team constraint makes Python impossible.

### 1.2 Why Python wins for Ripple

| Consideration | Python | Go | Ripple impact |
|---|---|---|---|
| Google ADK | Mature and broad ecosystem | Mature ADK Go 2.0 with graph workflows and HITL | Both are viable |
| OR-Tools CP-SAT | Official first-class API | No official Go API listed by OR-Tools | Strong Python advantage |
| Shared agent and solver process | Direct function calls and typed models | Requires unofficial binding, cgo, or a Python solver service | Python avoids a network boundary |
| Structured model output | Pydantic integrates naturally | Strong static typing but more mapping work | Python is faster for iteration |
| Fast API development | FastAPI and OpenAPI generation | Excellent HTTP libraries but more manual contract plumbing | Python fits the existing plan |
| Evaluation and analysis | Strong agent eval and data tooling | Improving but smaller ecosystem | Python advantage |
| Concurrency and efficiency | Good for I/O; CPU work needs bounded workers | Excellent native concurrency and efficient binaries | Go advantage, not decisive at prototype load |
| Deployment | Official FastAPI path on Cloud Run | Excellent Cloud Run fit | Both are viable |
| Team delivery risk | One language for API, agent, and solver | Mixed-language architecture likely | Python is lower risk |

The deciding factor is not that Go cannot build agents. ADK Go is production-capable. The deciding factor is that Ripple's most specialized dependency, OR-Tools CP-SAT, has an official Python interface but not an official Go interface. Keeping the agent, engine, and solver in one process also makes tool calls faster, tests simpler, and approval revalidation safer.

### 1.3 When Go becomes appropriate later

Consider Go for a separate service only when one of these is measured:

- High-volume inbound event ingestion.
- Many long-lived external connector streams.
- A dedicated API gateway with strict latency and memory requirements.
- A platform team that standardizes on Go.
- Agent and solver have already become independently scalable services.

Do not split by language merely because Go has stronger concurrency. The current workload is low-volume, latency is dominated by model calls, and solver jobs are small but CPU-bound.

### 1.4 Architecture decision record

```text
ADR-BE-001
Decision: Python 3.12 modular monolith on Cloud Run.
Includes: FastAPI, ADK Python, Pydantic, SQLAlchemy, PostgreSQL, OR-Tools.
Rejected for now: all-Go backend, Go API plus Python solver microservice.
Reason: official solver support, one transaction boundary, fastest implementation,
        simplest evaluation and debugging path.
Revisit trigger: measured load or organizational standard, not preference.
```

## 2. Backend goals and non-goals

### 2.1 Goals

- Convert untrusted operational text into a validated `ChangeEvent`.
- Keep policy, model reasoning, deterministic checks, and human decisions separate.
- Produce only plans that pass modeled constraints.
- Preserve every source, plan version, tool result, reply, and decision for audit.
- Revalidate plans transactionally at approval.
- Stream meaningful progress to the UI.
- Remain demonstrable when Gemini is unavailable.
- Keep domain logic independent from ADK and HTTP.
- Generate frontend types from OpenAPI.

### 2.2 Non-goals

- Multi-agent orchestration.
- Generic autonomous task execution.
- Direct mailbox or WhatsApp integration.
- Direct write access from model tools.
- Arbitrary Python code execution by the model.
- Real-time collaborative editing.
- Multi-region active-active architecture.
- Event-sourcing every domain table.
- Premature microservices.

## 3. Runtime architecture

### 3.1 Deployment topology

```text
Firebase Hosting
  -> /api/* rewrite
Cloud Run: ripple-api
  FastAPI / ASGI
  Agent workflow and ADK runtime
  Deterministic engine
  Bounded CP-SAT worker pool
  SSE stream endpoints
  Approval transaction service
      |
      +-> Vertex AI Gemini
      +-> Cloud SQL PostgreSQL
      +-> Secret Manager
      +-> Cloud Logging and Trace
      +-> Cloud Storage for optional uploads

Cloud Scheduler
  -> OIDC-authenticated daily-check endpoint
```

### 3.2 Modular monolith boundaries

The service deploys as one container but enforces module boundaries:

| Module | May depend on | Must not depend on |
|---|---|---|
| Domain | Standard library, domain types | FastAPI, ADK, SQLAlchemy |
| Engine | Domain, domain config | Agent prompts, HTTP |
| Solver | Domain, engine contracts, OR-Tools | ADK, FastAPI |
| Application | Domain, engine, solver, repositories | FastAPI route objects |
| Agent | Application read tools, schemas, model adapter | SQLAlchemy models directly |
| Persistence | Domain repository interfaces, SQLAlchemy | ADK prompt logic |
| API | Application services, schemas | Solver internals, raw SQL |
| Infrastructure | Cloud clients, tracing, config | Domain policy decisions |

### 3.3 Process model

- One ASGI application per container.
- Start with one Uvicorn worker per Cloud Run container.
- Use async I/O for database, Vertex AI, and streaming.
- Run CP-SAT through a bounded worker executor so it never blocks the event loop.
- Start with Cloud Run concurrency 8 and tune after load testing.
- Limit simultaneous solver jobs per instance to 2.
- Keep no authoritative schedule or session state in process memory.

## 4. Repository layout

```text
backend/
  app/
    main.py
    config.py
    bootstrap.py
    api/
      dependencies.py
      errors.py
      middleware.py
      routers/
        health.py
        schedule.py
        readiness.py
        events.py
        runs.py
        plans.py
        decisions.py
        alerts.py
        policy.py
        demo.py
    domain/
      enums.py
      errors.py
      jobs.py
      resources.py
      readiness.py
      changes.py
      plans.py
      decisions.py
      alerts.py
      policy.py
    application/
      schedule_service.py
      readiness_service.py
      event_service.py
      agent_run_service.py
      plan_service.py
      approval_service.py
      alert_service.py
      demo_service.py
      unit_of_work.py
    agent/
      runtime.py
      workflow.py
      model_gateway.py
      model_config.py
      schemas.py
      numeric_checker.py
      evidence.py
      prompts/
        intake.md
        investigation.md
        strategy.md
        explanation.md
        notifications.md
      tools/
        schedule.py
        readiness.py
        capacity.py
        weather.py
        simulation.py
        optimization.py
        plans.py
    engine/
      schedule.py
      readiness.py
      capacity.py
      weather.py
      risk.py
      simulate.py
      counterfactual.py
    solver/
      model_builder.py
      profiles.py
      solve.py
      diagnostics.py
      worker.py
    persistence/
      db.py
      models.py
      repositories/
      migrations/
      seed/
        offshore_base.sql
        scenarios/
    streaming/
      events.py
      publisher.py
      replay.py
    observability/
      logging.py
      tracing.py
      metrics.py
    security/
      input_boundary.py
      upload_validation.py
      redaction.py
    demo/
      recorded_runs/
      reset.py
  tests/
    unit/
    contract/
    integration/
    api/
    agent/
    solver/
    load/
  evals/
    datasets/
    runners/
    scorers/
    reports/
  alembic.ini
  pyproject.toml
  Dockerfile
```

## 5. Core application services

### 5.1 `ScheduleService`

Responsibilities:

- Fetch schedule range and resources.
- Return current schedule version.
- Produce schedule diff between baseline and plan option.
- Resolve changed objects for applied decisions.

It does not run Gemini or mutate schedule independently.

### 5.2 `ReadinessService`

Responsibilities:

- List and filter readiness items.
- Calculate required dates and slack through the engine.
- Apply manual status updates.
- Manage AI-proposed readiness updates.
- Bump schedule version for planning-relevant changes.

### 5.3 `EventService`

Responsibilities:

- Store raw untrusted input.
- Manage extraction versions.
- Apply planner corrections.
- Link replies, alerts, and source events.
- Enforce event state transitions.

### 5.4 `AgentRunService`

Responsibilities:

- Create and deduplicate runs.
- Execute the controlled agent workflow.
- Persist ordered stream events.
- Enforce time and tool budgets.
- Support reconnect and optional cancellation.

### 5.5 `PlanService`

Responsibilities:

- Persist plan versions and options.
- Validate that recommended options have no modeled violations.
- Link evidence and tool calls.
- Mark plans stale, rejected, approved, or superseded.

### 5.6 `ApprovalService`

Responsibilities:

- Lock schedule version.
- Re-run deterministic simulation.
- Enforce conditions and capabilities.
- Apply selected changes atomically.
- Record decision and changed objects.
- Create notification outbox rows.

No other service may write jobs, bookings, cargo assignments, or plan-derived readiness dates.

### 5.7 `AlertService`

Responsibilities:

- Create and deduplicate alerts from deterministic findings.
- Enforce alert state transitions.
- Link alerts to events and decisions.
- Resolve alerts only after the underlying condition clears.

## 6. Request context and middleware

Every request receives:

```python
class RequestContext:
    request_id: UUID
    correlation_id: UUID
    actor_id: str
    scenario_id: str
    capabilities: set[str]
    received_at: datetime
```

Middleware order:

1. Trusted proxy and request ID.
2. Structured request logging.
3. Authentication placeholder or demo actor resolution.
4. Scenario resolution.
5. Request size limit.
6. CORS only for explicit local development origins.
7. Exception normalization.
8. Timing and trace completion.

Rules:

- Accept incoming `X-Request-ID` only if valid; otherwise generate one.
- Return `X-Request-ID` on every response.
- Use `Idempotency-Key` on high-risk POST endpoints.
- Never log raw pasted messages or uploaded document text by default.

## 7. Database model

### 7.1 Domain tables

#### `schedule_state`

| Column | Type | Rule |
|---|---|---|
| `id` | smallint | Always 1 per scenario |
| `scenario_id` | text | Part of unique key if multiple scenarios coexist |
| `version` | bigint | Monotonically increasing |
| `updated_at` | timestamptz | Server timestamp |

#### `jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | text | Domain ID such as A-12 |
| `scenario_id` | text | Seed or future tenant boundary |
| `site` | text | Platform or location |
| `job_type` | text | Domain-configured |
| `start_day` | integer | Relative scenario day |
| `duration_days` | integer | Positive |
| `shortfall_bopd` | numeric | Prototype priority metric |
| `locked` | boolean | Engine hard constraint |
| `lock_reason` | text nullable | Human-readable reason |
| `status` | text | Planned, active, complete, cancelled |
| `row_version` | bigint | Optimistic concurrency |

Indexes: scenario plus date range, scenario plus status, locked jobs.

#### `resources`

- ID, scenario, type, name, capacity, unit, active state, metadata JSONB.
- Unique resource name per scenario.

#### `bookings`

- ID, scenario, job or activity ID, resource ID, start day, end day, load, status, row version.
- Check `end_day >= start_day`.
- Index by resource and date range.

#### `readiness_items`

- ID, scenario, job ID, stage, step order, lead time.
- Planned day, ETA earliest, ETA latest, confidence.
- Status, source type, source reference, last updated.
- Not-before day, risk buffer days, row version.
- `required_by`, `slack`, and `stale` remain derived.

#### `cargo_items`

- ID, scenario, job ID, description, deck units, needed-by day, sailing booking ID, row version.

#### `weather_forecast`

- Scenario, location, day, wave height, go flag, source, last updated.
- Unique scenario plus location plus day.

### 7.2 Event and agent tables

#### `events`

- UUID ID.
- Scenario ID.
- Nature and cause, nullable until extraction succeeds.
- Raw text encrypted at rest by platform storage.
- File object reference, never public URL.
- State.
- Parent event ID and parent plan ID.
- Origin type: manual, readiness, alert, demo, API.
- Extraction version.
- Created by and timestamps.

#### `event_extractions`

- Event ID and version.
- Extracted JSONB validated against schema.
- Model name, prompt version, confidence summary.
- Corrected by user flag, correction actor and timestamp.
- Immutable versions; event points to current version.

#### `agent_runs`

- Run UUID.
- Event ID and extraction version.
- State and attempt number.
- Model configuration snapshot.
- Tool-call budget and usage.
- Token and cost metadata when available.
- Started, completed, timeout timestamps.
- Error code and sanitized detail.
- Idempotency key.

#### `agent_run_events`

- Run ID.
- Monotonic sequence number.
- Event type.
- Public payload JSONB.
- Internal payload JSONB nullable and restricted.
- Created timestamp.
- Unique run plus sequence.

This table enables stream replay and audit without relying on one live HTTP connection.

#### `tool_calls`

- Tool call UUID and run ID.
- Tool name and ordinal.
- Sanitized input JSONB.
- Result JSONB.
- Started and completed timestamps.
- Status and error code.
- Deterministic input hash for diagnostics.

### 7.3 Plan and decision tables

#### `plans`

- Plan UUID.
- Event ID and run ID.
- Version within event lineage.
- Verdict.
- Recommended option ID nullable.
- Base schedule version.
- Explanation JSONB.
- Counterfactual.
- Status.
- Supersedes plan ID nullable.
- Created timestamp.

#### `plan_options`

- Option UUID and plan ID.
- Label and weight profile.
- Solver status.
- Objective value and solve milliseconds.
- Changes JSONB.
- Conditions JSONB.
- KPI JSONB.
- Violations JSONB.
- Rank and recommendation flag.

Normalize later only if reporting needs it. The approved changes are copied into audit tables during approval.

#### `plan_evidence`

- Plan ID.
- Claim ID and claim text.
- Tool call ID.
- Evidence type.
- Unique plan plus claim ID.

#### `decisions`

- Decision UUID.
- Plan ID and selected option ID nullable.
- Action: approve, reject, reply.
- Actor.
- Reason and reason category.
- Acknowledged condition IDs.
- Schedule version before and after.
- Created timestamp.

#### `decision_changes`

- Decision ID.
- Entity type and entity ID.
- Field or change kind.
- Before JSONB and after JSONB.
- Used for precise audit and frontend highlighting.

### 7.4 Supporting tables

#### `readiness_suggestions`

- ID, event ID, item ID, proposed patch, source excerpt.
- Confidence, base row version, state, review actor, review note, timestamps.

#### `alerts`

- ID, scenario, type, severity, state.
- Dedupe key.
- Affected objects JSONB.
- Evidence JSONB.
- Linked event and decision IDs.
- Acknowledgement, dismissal, and resolution metadata.

#### `notification_outbox`

- ID, decision ID, audience, payload, state, attempts, next-attempt timestamp.
- Prototype generates drafts only; sending stays disabled.

#### `idempotency_keys`

- Actor, route scope, key, request hash, response status, response body, expiry.
- Unique actor plus route scope plus key.

## 8. Transaction and versioning rules

### 8.1 Schedule version bumps

Bump schedule version when a change can affect feasibility or an open plan:

- Job date, duration, lock, resource, or status changes.
- Booking or cargo assignment changes.
- Readiness ETA, planned day, completion status, confidence, or risk buffer changes.
- Weather go/no-go changes.

Do not bump for:

- Comments.
- UI-only acknowledgements.
- Read-only agent runs.
- Notification drafts.
- Audit metadata.

### 8.2 Row versions

Use `row_version` for optimistic updates to readiness and other directly edited entities. Schedule-wide approval uses the stronger `schedule_state.version` lock.

### 8.3 Plan lineage

- Every reply creates a new event linked to the previous plan.
- Every successful agent run creates a new plan version.
- Old plans remain immutable.
- A plan becomes superseded only when the replacement plan is successfully persisted.
- Re-running after infrastructure failure may create a new run attempt without creating a new logical event.

## 9. REST API contract

All endpoints use `/api/v1` in code even if Firebase exposes a compatibility rewrite from `/api` during the prototype.

### 9.1 Response conventions

Success envelope is avoided for ordinary resources. Return typed resources directly.

Error shape:

```json
{
  "error": {
    "code": "schedule_version_conflict",
    "message": "The schedule changed after this plan was created.",
    "request_id": "...",
    "retryable": false,
    "details": {
      "expected_version": 12,
      "current_version": 14,
      "changed_objects": []
    }
  }
}
```

### 9.2 Health and metadata

| Method | Path | Result |
|---|---|---|
| GET | `/api/v1/health/live` | Process alive, no dependency calls |
| GET | `/api/v1/health/ready` | Database reachable and app initialized |
| GET | `/api/v1/meta` | App name, scenario, build SHA, feature flags |

### 9.3 Schedule and policy

| Method | Path | Contract |
|---|---|---|
| GET | `/api/v1/schedule?from=&to=&groups=` | Jobs, resources, bookings, weather, capacity, version |
| GET | `/api/v1/schedule/changes?decision_id=` | Changed objects for highlight and audit |
| GET | `/api/v1/policy/levers` | Action registry |
| GET | `/api/v1/policy/profiles` | Solver weight profiles |
| GET | `/api/v1/policy/data-health` | Source health and freshness summary |

### 9.4 Readiness

| Method | Path | Contract |
|---|---|---|
| GET | `/api/v1/readiness` | Filtered items plus summary and derived risk fields |
| GET | `/api/v1/readiness/{item_id}` | Detail, source, suggestion, history |
| PATCH | `/api/v1/readiness/{item_id}` | Patch allowed fields with `expected_row_version` |
| POST | `/api/v1/readiness/suggestions/{id}/accept` | Apply patch if base row version matches |
| POST | `/api/v1/readiness/suggestions/{id}/reject` | Record rejection and optional note |

### 9.5 Events and extraction

| Method | Path | Contract |
|---|---|---|
| POST | `/api/v1/events` | Create event from text and optional file reference |
| GET | `/api/v1/events` | Filtered inbox with cursor pagination |
| GET | `/api/v1/events/{event_id}` | Source, extraction, state, linked runs and plans |
| PATCH | `/api/v1/events/{event_id}/extraction` | Save planner correction using expected extraction version |
| POST | `/api/v1/events/{event_id}/extract` | Start or retry extraction only |
| DELETE | `/api/v1/events/{event_id}` | Draft-only deletion in prototype; otherwise archive |

### 9.6 Agent runs and streaming

Required two-step contract for new code:

| Method | Path | Contract |
|---|---|---|
| POST | `/api/v1/events/{event_id}/runs` | Create idempotent run, return `run_id` and stream URL |
| GET | `/api/v1/runs/{run_id}/stream` | SSE, supports `Last-Event-ID` or `after` sequence |
| GET | `/api/v1/runs/{run_id}` | Run state, public trace, plan ID when ready |
| POST | `/api/v1/runs/{run_id}/cancel` | Future contract; do not implement or expose in MVP |

Do not implement the old compatibility endpoint `/api/agent/run` for MVP. New frontend code uses the two-step contract so reconnect, page navigation, and audit share one run identity.

### 9.7 Plans and decisions

| Method | Path | Contract |
|---|---|---|
| GET | `/api/v1/plans/{plan_id}` | Full plan, options, evidence, lineage |
| POST | `/api/v1/plans/{plan_id}/approve` | Selected option, expected schedule version, acknowledged condition IDs |
| POST | `/api/v1/plans/{plan_id}/reject` | Required reason, category, optional replan flag |
| POST | `/api/v1/plans/{plan_id}/reply` | New context, creates linked event |
| GET | `/api/v1/decisions` | Cursor-paginated audit log with filters |
| GET | `/api/v1/decisions/{decision_id}` | Immutable audit record and changes |

Approval response:

```json
{
  "decision_id": "...",
  "plan_id": "...",
  "schedule_version_before": 12,
  "schedule_version_after": 13,
  "changed_objects": [
    {"type": "job", "id": "A-12", "fields": ["start_day"]},
    {"type": "cargo_item", "id": "D07-DRUMS", "fields": ["sailing_id"]}
  ],
  "notification_draft_ids": []
}
```

### 9.8 Alerts and demo

| Method | Path | Contract |
|---|---|---|
| GET | `/api/v1/alerts` | Filtered alerts and counts |
| POST | `/api/v1/alerts/{id}/acknowledge` | Actor and expected alert version |
| POST | `/api/v1/alerts/{id}/dismiss` | Reason required for critical alert |
| POST | `/api/v1/agent/daily-check` | OIDC protected; creates or resolves alerts |
| POST | `/api/v1/demo/reset` | Idempotent seed reset with scenario ID |
| GET | `/api/v1/demo/scenarios` | Scenario metadata and availability |

## 10. Pagination, filtering, and cache semantics

- Use cursor pagination for events, decisions, alerts, and potentially readiness at scale.
- Use stable sort plus ID as the final cursor component.
- Limit page size to 100; default 50.
- Timeline uses bounded date-range queries, not pagination.
- Return `ETag` for policy and metadata endpoints when practical.
- Set `Cache-Control: no-store` on plan, decision mutation, and active-run responses.
- Use short private caching for schedule/readiness GETs only if it does not hide schedule version changes.

## 11. SSE protocol

### 11.1 Event envelope

```json
{
  "run_id": "uuid",
  "seq": 17,
  "type": "tool_result",
  "timestamp": "2026-10-13T10:00:00Z",
  "phase": "investigation",
  "public": {
    "tool_call_id": "uuid",
    "tool": "check_capacity",
    "summary": "D+5 sailing would exceed deck capacity by 5 units."
  }
}
```

SSE frame:

```text
id: 17
event: tool_result
data: {json}
```

### 11.2 Event types

- `run_started`
- `step`
- `tool_call`
- `tool_result`
- `extraction`
- `plan`
- `warning`
- `error`
- `done`
- `heartbeat`

### 11.3 Public versus internal trace

Public trace may include:

- Tool names.
- Sanitized inputs.
- Deterministic results.
- Lever opened and policy reason.
- Human-readable phase summary.

Never stream:

- Hidden chain-of-thought.
- System prompts.
- Secrets.
- Raw database credentials.
- Unsanitized stack traces.
- Full internal model payloads.

### 11.4 Reconnect behavior

- Persist every public event before publishing it.
- Client reconnects with `Last-Event-ID` or `after={seq}`.
- Server replays persisted events after that sequence, then tails live events.
- If run is complete, replay ends with `done`.
- If requested sequence predates retention, return a `snapshot_required` error and direct client to GET the run resource.

### 11.5 Heartbeats and timeouts

- Send heartbeat every 10-15 seconds without creating database audit rows for every heartbeat.
- Agent run soft timeout: 45 seconds.
- Hard timeout: 60 seconds for hackathon.
- Individual Gemini call timeout: 20 seconds.
- Individual deterministic tool timeout: 3 seconds, solver allowed 2 seconds plus overhead.

## 12. Agent workflow

### 12.1 Architecture choice

Use one controlled agent workflow, not several autonomous agents.

The model may choose which allowed read or solve tool to call next, but deterministic application code controls:

- State transitions.
- Tool availability.
- Policy validation.
- Tool-call budget.
- Timeout.
- Schema validation.
- Plan persistence.
- Approval permissions.

### 12.2 Workflow states

```text
load_event
  -> extract_or_load_extraction
  -> require_clarification | load_policy
  -> investigate
  -> frame_allowed_levers
  -> baseline_solve
  -> iterative_lever_loop
  -> profile_comparison
  -> counterfactual_if_needed
  -> validate_options
  -> generate_explanations
  -> numeric_check
  -> persist_plan
  -> complete
```

### 12.3 Intake

Input:

- Raw source text.
- Minimal source metadata.
- Existing selected-object context.
- Current domain vocabulary.

Output:

- Strict `ChangeEventExtraction` schema.
- Every hard constraint, risk tag, and ruled-out lever includes a source excerpt.
- Missing information is explicit.

Rules:

- Source content is delimited as untrusted data.
- Instructions inside source text are ignored.
- Unknown IDs are not invented.
- Relative dates resolve against scenario day, not wall-clock date.
- Extraction never mutates operational tables.

### 12.4 Clarification gate

Stop before optimization when:

- No affected job can be resolved.
- Requested date is essential but ambiguous.
- A source contradiction changes a hard constraint.
- An ETA range is invalid.

The backend returns structured missing fields. The frontend collects corrections and starts a new extraction version.

### 12.5 Investigation

The agent can access only read and analysis tools. Recommended order is readiness, capacity, weather, then broader schedule. The runtime may enforce required prerequisite calls before optimization.

### 12.6 Lever framing

```text
available levers
  = action registry allowed levers
  - levers ruled out by extracted context
  - levers incompatible with hard constraints
```

The model may close an allowed lever. It cannot open a forbidden lever. The solver wrapper independently rejects forbidden requests.

### 12.7 Lever loop

1. Solve with no new levers.
2. Compare result with event goal.
3. Identify blocking constraint from structured diagnostics.
4. Ask model to choose the next relevant allowed lever from a bounded list.
5. Validate choice against registry and ruled-out set.
6. Solve again.
7. Stop when goal is met, no relevant lever remains, or tool budget is reached.

Default limits:

- Maximum 15 total tool calls.
- Maximum 5 solver calls in lever loop.
- Maximum 3 profile comparison solves.
- Maximum 2 schema repair attempts per model output.

### 12.8 Profile comparison

Run deterministic profiles from configuration:

- `production_first`
- `stability_first`
- `low_risk`

Gemini describes trade-offs but does not set weights or calculate KPIs.

### 12.9 Explanation and evidence

- Generate separate short explanations for planner, management, and logistics.
- Provide a structured claim list before prose.
- Each material claim references a tool call or plan field.
- Numeric checker validates all dates, durations, capacity values, and KPIs.
- Regenerate once on mismatch.
- Fall back to deterministic templates if mismatch remains.

### 12.10 Replan on feedback

- Reply text becomes a new source attached to the prior plan.
- Intake extracts only the delta plus inherited confirmed context.
- Hard constraints accumulate unless explicitly revoked by the planner.
- The new run uses current schedule version, not the old baseline.
- Old plans remain available for comparison.

## 13. Model gateway

### 13.1 One interface

```python
class ModelGateway(Protocol):
    async def extract_change(...): ...
    async def choose_next_lever(...): ...
    async def compare_options(...): ...
    async def explain_plan(...): ...
    async def draft_notifications(...): ...
```

The domain and application layers do not import Vertex SDK classes.

### 13.2 Model configuration

Store by task, not one global model string:

```yaml
models:
  intake:
    name: ${INTAKE_MODEL}
    temperature: 0
    max_output_tokens: 2000
  strategy:
    name: ${STRATEGY_MODEL}
    temperature: 0.1
    max_output_tokens: 2500
  explanation:
    name: ${EXPLANATION_MODEL}
    temperature: 0.2
    max_output_tokens: 2000
```

Pin explicit model IDs after verifying availability before deployment. Do not hard-code a model family throughout the codebase.

### 13.3 Prompt versioning

- Prompts live in repository files.
- Every prompt has a semantic version or content hash.
- Agent run stores prompt versions and model configuration.
- Eval reports identify the exact prompt and model combination.
- Production prompt changes require eval run and review.

### 13.4 Retry rules

Retry only:

- Transport reset.
- Rate limit with server retry hint.
- Temporary Vertex unavailability.
- Schema validation failure through a repair prompt, not blind network retry.

Do not retry:

- Safety refusal without changed input.
- Policy violation.
- Invalid domain ID.
- Deterministic infeasibility.

Use exponential backoff with jitter and total attempt budget. Never allow retries to exceed the agent hard timeout.

## 14. Tool contracts and guardrails

### 14.1 Tool categories

| Category | Tools | Side effect |
|---|---|---|
| Read | Schedule, readiness, capacity, weather, levers | None |
| Analysis | Simulate, optimize, counterfactual | None |
| Persistence | Propose plan | Writes plan artifact only |
| Drafting | Notification draft | Writes draft only |
| Operational write | None exposed to model | Prohibited |

### 14.2 Common tool result envelope

```python
class ToolResult[T]:
    tool_call_id: UUID
    ok: bool
    data: T | None
    error_code: str | None
    evidence_summary: str
    schedule_version: int | None
    duration_ms: int
```

### 14.3 Validation before execution

- Validate IDs against scenario scope.
- Validate date horizon.
- Validate requested levers against registry.
- Validate weight profile against configuration.
- Reject excessive batch size.
- Normalize and hash inputs for traceability.

### 14.4 Deterministic tool errors

Return structured errors such as:

- `unknown_job`
- `invalid_date_range`
- `forbidden_lever`
- `ruled_out_lever`
- `schedule_version_changed`
- `solver_timeout`
- `model_invalid`
- `insufficient_data`

The agent may respond to these errors, but cannot reinterpret them as success.

## 15. Deterministic engine

### 15.1 Design rules

- Pure functions where possible.
- All time values are integer scenario days.
- No database access inside calculation functions.
- No LLM or prompt dependencies.
- Domain pack injected explicitly.
- Same input produces same output.

### 15.2 Readiness calculation

Outputs per item:

- Required-by day.
- ETA earliest and latest.
- Risk buffer.
- Effective ETA.
- Slack.
- Freshness.
- Confidence.
- Earliest feasible job start.

Feasibility uses ETA latest plus configured low-confidence or risk buffer.

### 15.3 Capacity calculation

- Interval overlap for unary resources.
- Aggregate load for capacitated resources.
- Clear unit enforcement.
- Return used, capacity, overflow, and contributing bookings.

### 15.4 Weather calculation

- Domain pack defines metric and limit.
- Seeded forecast remains deterministic.
- Missing weather is not assumed safe. It becomes insufficient data or a conditional result according to policy.

### 15.5 Risk rules

Gemini assigns allowed tags with quoted evidence. Engine maps tags to fixed effects. Unknown tags have no schedule effect and appear as notes.

### 15.6 Simulation

Input:

- Immutable schedule snapshot.
- Proposed change set.
- Domain pack.

Output:

- Violations with type, object, day, and evidence.
- KPI deltas.
- Changed objects.
- Result schedule snapshot or diff.

Simulation never persists.

## 16. CP-SAT solver

### 16.1 Model inputs

- Schedule snapshot and horizon.
- Jobs and resource assignments.
- Readiness effective dates.
- Weather availability.
- Cargo and sailing capacity.
- Hard constraints.
- Open lever set.
- Weight profile.

### 16.2 Decision variables

- Job start integer per movable job.
- Optional interval per job/resource assignment where applicable.
- Cargo-to-sailing Boolean assignment.
- Lever-use Boolean indicators.
- Readiness planned-date variables only when corresponding lever is open.

### 16.3 Hard constraints

- No overlap on unary resources.
- Capacity within limit.
- Job starts no earlier than effective readiness.
- Cargo arrives by needed date.
- No marine activity on no-go weather days.
- Locked jobs remain fixed.
- Extracted hard constraints.
- Closed-lever values remain fixed.
- Forbidden levers cannot create variables.

### 16.4 Objective

Use integer-scaled terms only:

```text
production delay cost
+ lever use cost
+ job movement penalty
+ risk profile penalties
```

Weights come from versioned configuration. Store the profile and exact weights with solver diagnostics.

### 16.5 Determinism and limits

- Time limit 2 seconds.
- Fixed random seed where supported.
- Prefer one search worker in evals for reproducibility.
- Production may use controlled parallel search if output stability remains acceptable.
- Store solver status, wall time, objective, best bound, and model fingerprint when available.

### 16.6 Status mapping

| OR-Tools status | Ripple handling |
|---|---|
| OPTIMAL | UI may say optimal when useful, otherwise best feasible plan |
| FEASIBLE | Best feasible plan found |
| INFEASIBLE | Return blockers and run counterfactual |
| MODEL_INVALID | Internal error; do not show as business infeasibility |
| UNKNOWN | Timeout or limit; show no verified plan unless a feasible solution exists |

### 16.7 Solver isolation

- Execute through a bounded worker interface.
- No shared mutable CP-SAT model instances.
- Build a fresh model per solve.
- Enforce per-run solver-call budget.
- Record memory and duration metrics.

## 17. Approval transaction

### 17.1 Preconditions

- Actor has approval capability.
- Plan exists and is proposed.
- Option belongs to plan.
- Option is feasible and has no violations.
- Required condition IDs are acknowledged.
- Idempotency key is valid.

### 17.2 Transaction algorithm

```python
async with unit_of_work.transaction():
    state = await schedule_repo.lock_state_for_update(scenario_id)

    if state.version != request.expected_schedule_version:
        raise ScheduleVersionConflict(...)

    plan = await plan_repo.get_for_update(plan_id)
    validate_plan_status(plan)
    option = plan.require_option(request.option_id)
    validate_condition_acknowledgements(option, request)

    snapshot = await schedule_repo.load_snapshot(scenario_id)
    simulation = engine.simulate(snapshot, option.changes, domain_pack)

    if simulation.violations:
        raise PlanNoLongerFeasible(simulation.violations)

    before = capture_affected_rows(snapshot, option.changes)
    await schedule_repo.apply(option.changes)
    after = await schedule_repo.load_affected_rows(option.changes)

    new_version = state.version + 1
    await schedule_repo.set_version(new_version)
    decision = await decision_repo.insert_approval(...)
    await decision_repo.insert_changes(diff(before, after))
    await plan_repo.mark_approved(plan.id)
    await event_repo.mark_approved(plan.event_id)
    await outbox_repo.create_drafts(decision.id)

return approval_result
```

### 17.3 Idempotency

- Same key plus identical request returns stored result.
- Same key plus different request returns 409 `idempotency_key_reused`.
- If client loses connection after commit, retry returns the original approval result.
- Database uniqueness prevents two approvals of the same plan.

### 17.4 Failure rules

- Any error before commit rolls back all operational changes.
- Notification draft failure does not roll back approval if handled through outbox creation.
- Response failure after commit is recovered through idempotency.
- Never partially update schedule and readiness in separate transactions.

## 18. Readiness write flows

### 18.1 Manual tick

1. Validate capability and row version.
2. Update status and audit metadata.
3. Recalculate affected job readiness.
4. Bump schedule version if planning feasibility changes.
5. Re-evaluate matching alerts asynchronously or inline for prototype.
6. Return updated item, derived slack, row version, and schedule version.

### 18.2 AI suggestion

- Suggestion stores base item row version.
- Accept fails with 409 if item changed since suggestion.
- Accept uses same service path as manual update and records source event.
- Reject records reason without changing item.
- Stale suggestion cannot be accepted.

## 19. Alerts and daily check

### 19.1 Deterministic detection first

The engine identifies:

- Negative or low slack.
- Stale source.
- Weather conflict.
- Capacity conflict.
- Conditional confirmation deadline.
- Newly feasible opportunity.

Gemini writes summaries only after deterministic findings exist.

### 19.2 Deduplication

Create stable dedupe key from:

```text
scenario + alert_type + affected_object + condition_version
```

Update an existing open alert rather than creating daily duplicates.

### 19.3 Resolution

- Resolve after engine confirms condition cleared.
- Approval may trigger immediate re-evaluation.
- Dismissal does not resolve underlying condition.
- Reopened condition creates new occurrence metadata or reopens according to policy.

## 20. File upload pipeline

File upload is off for the MVP. This section defines its future contract so enabling it later does not change the trust boundary.

1. API validates MIME type, extension, declared size, and actual size.
2. Store in private Cloud Storage with random object name.
3. Do not parse active content.
4. Extract text or image understanding through a bounded service step.
5. Treat extracted content as untrusted source data.
6. Store source hash and extraction metadata.
7. Apply retention policy and delete abandoned drafts.

Prototype limits:

- PDF, PNG, JPEG only.
- Maximum 10 MB.
- No ZIP, Office macros, HTML, SVG, or executable formats.

## 21. Security model

### 21.1 Trust boundaries

- Browser input is untrusted.
- Pasted operational content is untrusted prompt data.
- Model output is untrusted until schema and policy validation pass.
- Tool arguments are untrusted until validated.
- Solver output is trusted only for the exact validated input snapshot.
- Approval is trusted only after database transaction succeeds.

### 21.2 Prompt injection defense

- Delimit source text clearly.
- System instruction says extract facts only and ignore embedded instructions.
- Do not expose operational write tools to model.
- Validate every tool argument in application code.
- Restrict tools by workflow phase.
- Require source excerpts for contextual constraints.
- Reject forbidden levers outside model judgment.

### 21.3 Secrets and identity

- Production uses Cloud Run service account for Vertex AI.
- Database secret in Secret Manager.
- No long-lived cloud keys in environment or repository.
- Daily check requires Cloud Scheduler OIDC.
- Demo public access is allowed only for seeded synthetic data.

### 21.4 Data handling

- Synthetic data only in public deployment.
- Redact raw source from normal logs and traces.
- Keep raw source access auditable in future production.
- Use parameterized SQL through ORM or query builder.
- Sanitize filenames and content-disposition headers.
- Escape generated notification content when rendered.

## 22. Error taxonomy

### 22.1 Client-correctable

- `validation_error` 422.
- `missing_information` 422 with structured fields.
- `unknown_entity` 404.
- `policy_violation` 403 or 422 depending on actor versus plan rule.
- `version_conflict` 409.
- `idempotency_key_reused` 409.

### 22.2 Business outcomes

- `request_infeasible` is a successful plan result, not an HTTP error.
- `solver_infeasible` within an agent run becomes a structured tool result.
- `conditional_plan` is a verdict, not a warning response.

### 22.3 Infrastructure

- `model_unavailable` 503, retryable.
- `agent_timeout` 504 or completed failed run resource.
- `database_unavailable` 503.
- `stream_interrupted` is client connection state; run may continue.
- `internal_error` 500 with request ID only.

## 23. Reliability and recovery

### 23.1 Timeouts

| Operation | Timeout |
|---|---:|
| Normal database statement | 3 s |
| Approval transaction | 10 s |
| Gemini call | 20 s |
| CP-SAT solve | 2 s |
| Complete agent run soft limit | 45 s |
| Complete agent run hard limit | 60 s |

### 23.2 Retry budgets

- Database read: one retry only for transient connection reset before transaction.
- Database write transaction: no automatic whole-request retry without idempotency.
- Model call: maximum two retries within total deadline.
- Solver: no blind retry with identical inputs after timeout; change limits or report status.
- Cloud Storage upload: client may retry chunk or request through idempotent object key.

### 23.3 Circuit breakers

For hackathon, implement simple failure counters around Vertex AI only if time allows. Always implement timeout and cached demo fallback first.

### 23.4 Graceful degradation

- Model unavailable before extraction: allow structured manual extraction form or recorded scenario.
- Model unavailable after tools ran: persist tool results and generate deterministic explanation template.
- Solver unavailable or invalid model: do not recommend a plan.
- Database unavailable: health readiness fails; no writes accepted.
- Stream lost: run continues and events replay after reconnect.

## 24. Observability

### 24.1 Structured logs

Standard fields:

- Timestamp.
- Severity.
- Request and correlation IDs.
- Scenario ID.
- Actor pseudonymous ID.
- Route and status.
- Event, run, plan, and decision IDs when relevant.
- Duration.
- Error code.

No raw source text or hidden prompts.

### 24.2 Trace spans

```text
HTTP request
  event.create
  agent.run
    model.intake
    tool.check_readiness
    solver.baseline
    model.choose_lever
    solver.lever_iteration
    solver.profile_compare
    model.explain
    numeric_check
    plan.persist
  approval
    schedule.lock
    simulate.revalidate
    schedule.apply
    audit.persist
```

### 24.3 Metrics

API:

- Request count, latency, error rate by route.
- Active SSE connections.
- Database pool usage.

Agent:

- Runs by outcome.
- Intake schema failure rate.
- Tool calls per run.
- Run duration.
- Model latency and retries.
- Token and estimated cost per run.
- Numeric-check mismatch rate.

Engine and solver:

- Solve duration and status.
- Model invalid count.
- Infeasible count.
- Plan revalidation failure rate.

Business flow:

- Approval, rejection, reply counts.
- Version conflict count.
- Time event-to-decision.
- Readiness suggestion acceptance rate.

### 24.4 Health endpoints

- Liveness does not query dependencies.
- Readiness checks database and successful initialization.
- Vertex AI health is reported in metadata or diagnostics but does not make the whole API unready.
- Solver self-check can run at startup against a tiny model and expose result in diagnostics.

## 25. Performance and Cloud Run settings

### 25.1 Initial deployment settings

- 1 vCPU.
- 1 GiB memory, increase to 2 GiB if OR-Tools and concurrent runs require it.
- Concurrency 8.
- Minimum instances 1 during judging.
- Maximum instances capped to protect budget.
- Request timeout above agent hard timeout, for example 90 seconds.
- CPU allocated during request processing; consider always-allocated CPU only if background execution requires it.

### 25.2 Database pool

- Small async pool per instance, for example size 5 and overflow 3.
- Pool pre-ping.
- Statement timeout.
- Short transactions.
- Never hold database transaction open during model calls or solver exploration.

### 25.3 SSE caveat

Long-lived SSE requests consume Cloud Run concurrency. Concurrency 8 is an initial safe value, not a universal optimum. Load test with realistic simultaneous streams and solver work before raising it.

### 25.4 Background work

Do not depend on in-process background tasks surviving after an HTTP response unless Cloud Run execution semantics are configured for it. The simplest prototype keeps an active agent run tied to its streaming request or explicit run endpoint. A future production version can use Cloud Tasks or Pub/Sub workers.

## 26. Configuration

Use typed settings loaded once at startup.

```text
APP_NAME
ENVIRONMENT
BUILD_SHA
DATABASE_URL
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
VERTEX_MODE
INTAKE_MODEL
STRATEGY_MODEL
EXPLANATION_MODEL
AGENT_SOFT_TIMEOUT_SECONDS
AGENT_HARD_TIMEOUT_SECONDS
SOLVER_TIMEOUT_SECONDS
MAX_TOOL_CALLS
MAX_SOLVER_CALLS
CLOUD_RUN_CONCURRENCY
DB_POOL_SIZE
DEMO_MODE
MOCK_MODEL_MODE
UPLOAD_BUCKET
LOG_LEVEL
```

Rules:

- Secrets come from Secret Manager.
- Feature flags are typed and exposed through metadata only when safe.
- Domain policy stays in versioned YAML, not environment variables.
- Startup fails fast on missing required production settings.

## 27. Python package recommendations

Production dependencies:

- FastAPI and Uvicorn.
- Pydantic v2 and pydantic-settings.
- SQLAlchemy 2 async and asyncpg.
- Alembic.
- Google ADK Python.
- Google Gen AI or Vertex client required by the selected ADK version.
- OR-Tools.
- Google Cloud SQL Python Connector if used.
- Google Cloud Storage and Secret Manager clients when features require them.
- OpenTelemetry instrumentation compatible with Cloud Trace.
- Structlog or standard-library JSON logging adapter.
- Tenacity only for narrow, explicit transient retries.
- python-multipart only when upload is enabled.

Development dependencies:

- pytest, pytest-asyncio, pytest-cov.
- Hypothesis for engine invariants.
- httpx and ASGI test client.
- Ruff for lint and formatting.
- mypy or Pyright for static checking.
- Testcontainers or a dedicated local Postgres for integration tests.
- Time-freezing helper for timestamp tests if needed.

Pin versions through a lockfile. Do not put unconstrained package ranges into deployment.

## 28. Testing strategy

### 28.1 Unit tests

Domain and engine:

- Readiness deadline and slack calculation.
- ETA range and low-confidence buffer.
- Stale data behavior.
- Capacity and interval overlap.
- Weather rule.
- Risk-tag effects.
- Simulation diff and KPI calculation.

Agent support:

- Lever-set construction.
- Forbidden and ruled-out lever validation.
- Numeric checker.
- Evidence mapping.
- State transition guards.

### 28.2 Property tests

- Approved simulation never contains hard violations.
- Closing levers never expands feasible choices dependent on those levers.
- Locked jobs never move.
- Capacity never exceeds limits in a feasible option.
- Plan application followed by simulation remains feasible.
- Schedule version increases monotonically.

### 28.3 Solver golden tests

- A-12 baseline.
- A-12 target D+3 impossible.
- A-12 D+5 with expedited test but deck overflow.
- A-12 clean after moving cargo.
- Constrained A-12 message closes expedite lever.
- D-07 slip and risk buffer.
- No-go weather case.
- Forbidden lever rejection.
- Timeout or UNKNOWN handling.
- Model invalid handling.

### 28.4 Repository integration tests

- Migrations from empty database.
- Approval lock and version conflict.
- Duplicate idempotency key.
- Readiness optimistic concurrency.
- Plan lineage.
- Demo reset restores exact seed.
- Alert deduplication.

### 28.5 API contract tests

- OpenAPI schema generation.
- Error envelope consistency.
- Capability checks.
- Pagination cursors.
- SSE event order and replay.
- Stream reconnect after sequence.
- Approval response changed objects.

### 28.6 Agent evals

Dataset categories:

- Requests: feasible, conditional, infeasible, ambiguous.
- Disruptions: readiness delay, weather, capacity, qualitative risk.
- Opportunities.
- Prompt injection and hostile source content.
- Thin evidence.
- Same data, different sentence pairs.
- Planner reply and replan.

Metrics:

- Nature and cause accuracy.
- Entity extraction accuracy.
- Hard constraint recall and precision.
- Forbidden or ruled-out lever violations.
- Infeasible recommendation count.
- Numeric mismatch count.
- Evidence coverage.
- Median and p95 run duration.
- Cost per run.

### 28.7 Load and resilience tests

- Eight simultaneous SSE runs on one instance.
- Solver worker limit under concurrent requests.
- Database pool saturation.
- Client disconnect and reconnect.
- Vertex timeout.
- Approval submitted twice.
- Approval during concurrent readiness update.
- Container restart during completed-run replay.

## 29. Demo and mock strategy

### 29.1 Mock modes

- `MOCK_MODEL_MODE=recorded`: replay stored model decisions while real engine and solver run.
- `MOCK_MODEL_MODE=full`: replay full SSE fixture for frontend-only work.
- Production default: live Vertex AI.

### 29.2 Recorded artifacts

Record:

- Sanitized model inputs excluding secrets.
- Structured model outputs.
- Tool calls and deterministic results.
- Final public SSE sequence.

Fixtures must state prompt version, model family, schema version, and scenario seed version.

### 29.3 Demo reset

- Use a database transaction.
- Scope to demo scenario only.
- Delete derived events, plans, decisions, suggestions, alerts, and outbox rows.
- Restore domain tables from versioned seed.
- Set schedule version to seed version.
- Return seed checksum.

Reset never runs in a real production tenant without an explicit environment guard.

## 30. Deployment pipeline

### 30.1 Required checks

1. Ruff format and lint.
2. Static type check.
3. Unit and property tests.
4. Solver golden tests.
5. Database migration test.
6. API contract and OpenAPI generation.
7. Small agent eval smoke set with mock model.
8. Container build.
9. Vulnerability scan if available.

### 30.2 Deployment steps

1. Build immutable image tagged with commit SHA.
2. Run migrations as a controlled job or pre-deploy step.
3. Deploy new Cloud Run revision without traffic.
4. Run readiness and smoke scenarios.
5. Shift traffic.
6. Keep prior revision available for rollback.
7. Verify Firebase rewrite and SSE behavior.

### 30.3 Migration rules

- Forward-only migrations during hackathon.
- Schema changes are backward-compatible across one deployment transition when possible.
- Destructive migrations require backup and explicit review.
- Seed reset is not a migration.

## 31. Build sequence

### Phase BE-0: foundation

- Create package, config, logging, FastAPI app, health routes.
- Add async PostgreSQL and Alembic.
- Establish domain models and repository interfaces.
- Freeze OpenAPI error format.

Exit: service starts locally, readiness checks DB, tests and lint pass.

### Phase BE-1: deterministic domain

- Implement schedule snapshot, readiness, capacity, weather, risk, simulation.
- Add domain pack loader and action registry.
- Add seed database and golden tests.

Exit: A-12 calculations pass without Gemini or HTTP.

### Phase BE-2: solver

- Build CP-SAT model and profile config.
- Add counterfactual and diagnostics.
- Add bounded solver worker.
- Add performance and determinism tests.

Exit: all A-12 and D-07 golden cases return expected results under limit.

### Phase BE-3: read APIs and writes

- Schedule, readiness, policy, and event endpoints.
- Extraction correction contract.
- Readiness optimistic concurrency and suggestions.
- Demo reset.

Exit: frontend can operate on live domain APIs without agent.

### Phase BE-4: agent runtime

- Model gateway and structured intake.
- Controlled lever loop.
- Tool wrappers.
- Run persistence and SSE replay.
- Explanation, evidence, and numeric checker.

Exit: A-12 produces a plan through live or recorded model mode.

### Phase BE-5: decisions

- Plan persistence and lineage.
- Approval transaction and idempotency.
- Reject and reply/replan.
- Decision audit and changed-object response.

Exit: approval atomically updates schedule and readiness, then appears in history.

### Phase BE-6: reliability and deployment

- Cloud Trace, metrics, redaction.
- Failure recovery and demo fallback.
- Load tests and concurrency tuning.
- Cloud Run, Cloud SQL, secrets, Firebase rewrite.

Exit: production URL survives critical demo paths and model failure fallback.

### Phase BE-7: optional features

- Alerts and daily check.
- File upload.
- Notification drafts.
- E-02 opportunity.
- Second domain pack.

## 32. Cross-team integration gates

| Gate | Backend output | Frontend dependency |
|---|---|---|
| G1 | OpenAPI base schemas and error envelope | Generated TypeScript types |
| G2 | Schedule and readiness fixtures | Timeline and Readiness screens |
| G3 | Recorded SSE and run schema | Ripple panel and Decision Workspace |
| G4 | Plan and option payload | Option cards, comparison, evidence |
| G5 | Approval response and 409 detail | Decision flow and changed highlights |
| G6 | Reply lineage | Version switcher and replan UI |
| G7 | Demo reset and scenarios | Demo Lab |
| G8 | Alert endpoints | Alerts screen |

Each gate includes:

- OpenAPI update.
- JSON fixture.
- Happy-path contract test.
- At least one failure fixture.
- Short changelog entry when a field changes.

## 33. Backend definition of done

A backend feature is done when:

- Domain rule is outside route and prompt code.
- Input and output schemas are explicit.
- Authorization or capability check exists.
- Transaction boundary is defined.
- Idempotency behavior is defined for high-risk writes.
- Error codes are normalized.
- Logs and traces exclude sensitive source text.
- Unit and integration tests cover success and failure.
- OpenAPI and frontend fixture are updated.
- Metrics expose latency and outcome.
- Demo reset or fixture behavior remains deterministic.

The backend is demo-ready when:

- A-12 base and constrained variants produce the expected different lever paths.
- D-07 handles ETA range, seal risk, stale data, and replan.
- No forbidden or ruled-out lever reaches the solver.
- No plan with violations can be approved.
- Approval is atomic, idempotent, and version checked.
- SSE reconnect replays progress.
- Numeric explanations match deterministic output.
- Recorded fallback works when Vertex AI is unavailable.
- Cloud Run health, logs, traces, and budget-safe settings are verified.

## 34. Decisions resolved from the UI integration plan

1. Extraction correction uses `PATCH /events/{id}/extraction` with version check.
2. Readiness suggestions have persisted accept and reject endpoints.
3. Alerts have persisted acknowledge and dismiss endpoints if the Alerts feature ships.
4. Approval records acknowledged condition IDs.
5. Run cancellation is cooperative and optional for MVP; navigation never assumes cancellation.
6. SSE reconnect uses persisted sequence IDs and replay.
7. Decision filters are server-side with cursor pagination.
8. Planning-relevant readiness changes bump schedule version.
9. Approval returns changed object IDs and fields.
10. Demo fallback supports recorded model mode and full recorded SSE mode.

## 35. Official references

- Google ADK documentation: <https://google.github.io/adk-docs/>
- ADK Go 2.0 announcement: <https://developers.googleblog.com/announcing-adk-go-20/>
- Google OR-Tools: <https://developers.google.com/optimization>
- CP-SAT status and API behavior: <https://developers.google.com/optimization/cp/cp_solver>
- Cloud Run FastAPI quickstart: <https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-fastapi-service>
- Cloud Run Python optimization: <https://docs.cloud.google.com/run/docs/tips/python>
- Cloud Run concurrency guidance: <https://docs.cloud.google.com/run/docs/about-concurrency>

These references validate platform capability. Ripple's architecture and business rules remain the decisions defined in the project documents.
