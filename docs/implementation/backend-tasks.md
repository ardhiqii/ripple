# Backend Task Catalog

Backend tasks preserve the layer boundaries in the implementation control. The root inspects solver, approval, migration, reset, and agent-control changes before integration; unresolved unsafe behavior is never `dev_done`.

**Current development-first override (2026-10-16):** For BE-16–BE-24, implement the Objective and keep database/approval/agent boundaries intact, but do not create, update, or run unit/API/contract/solver/seed test code now. Older `Acceptance:` test commands and independent-sign-off requirements below are deferred under [README §4.8](README.md#48-development-first-acceptance-override-2026-10-16). The root inspects diffs and runs Ruff/Pyright once at integration boundaries; migrations/seed/reset are not casually executed on a shared DB. Mark `dev_done / QA pending`. Preserve all existing tests and BE-00–BE-15 work.

The BE-16–BE-24 pass is historical `dev_done / QA pending`; the current screenshot-recovery goal uses BE-25–BE-26 below under the same no-tests override.

## BE-00: Python service scaffold

Model fit: Luna-safe  
Prerequisites: none  
Read: [implementation control](README.md), [backend spec sections 3-6](../engineering/backend-agentic-spec.md#3-runtime-architecture)

Allowed files:

- New `backend/**` scaffold
- Root local development config only when explicitly required

Objective:

- Create Python 3.12 project with locked dependencies.
- Add FastAPI app, typed settings, JSON logging, request IDs, liveness, readiness, Ruff, Pyright, and pytest.
- Do not connect Gemini or OR-Tools yet.

Acceptance:

- `uv sync`
- `uv run ruff check .`
- `uv run pyright`
- `uv run pytest`
- Health endpoints pass ASGI tests.

## BE-01: Database and migrations baseline

Model fit: Luna-with-review  
Prerequisites: BE-00  
Read: [backend spec sections 7 and 8](../engineering/backend-agentic-spec.md#7-database-model)

Allowed files:

- Persistence, database config, migrations, database tests

Objective:

- Add async SQLAlchemy, asyncpg, Alembic, unit-of-work interface, and initial schema.
- Implement schedule, event/run, plan/decision, readiness suggestion, alert, outbox, and idempotency tables exactly as specified.

Forbidden:

- No business logic in ORM models.
- No destructive migration shortcuts.

Acceptance:

- Empty database upgrades to head.
- Downgrade test only if migration is explicitly reversible.
- Constraints and unique indexes have integration tests.

## BE-02: Domain types and policy pack

Model fit: Luna-safe  
Prerequisites: BE-00  
Read: [backend spec sections 4, 7, and 15](../engineering/backend-agentic-spec.md#15-deterministic-engine), [proposal section 6.4](../product/ripple-proposal.md#64-who-does-what)

Allowed files:

- `backend/app/domain/**`
- Domain YAML configuration
- Unit tests

Objective:

- Implement framework-free domain entities, enums, errors, action registry, risk rules, weight profiles, and offshore pack loader.

Forbidden:

- No FastAPI, SQLAlchemy, ADK, or Vertex imports.

Acceptance:

- Invalid or forbidden policy configuration fails at startup validation.
- Domain tests run without database or network.

## BE-03: Deterministic readiness and risk engine

Model fit: Luna-with-review  
Prerequisites: BE-02  
Read: [backend spec section 15](../engineering/backend-agentic-spec.md#15-deterministic-engine), [technical plan sections 5.1 and 5.4](../engineering/technical-plan.md#51-readiness-rules)

Allowed files:

- `backend/app/engine/readiness.py`
- `backend/app/engine/risk.py`
- Focused tests

Objective:

- Implement required-by, effective ETA, confidence buffer, stale rule, slack, and earliest feasible start.

Acceptance:

- A-12 with test D+4 returns earliest start D+7.
- Quality finding and stale-source golden cases pass.
- Property tests cover ordering and buffer invariants.

## BE-04: Capacity, weather, and simulation engine

Model fit: Luna-with-review  
Prerequisites: BE-02, BE-03  
Read: [backend spec sections 15.3-15.6](../engineering/backend-agentic-spec.md#153-capacity-calculation)

Allowed files:

- Capacity, weather, simulation engine modules
- Focused tests

Objective:

- Implement unary overlap, capacitated resources, weather constraints, immutable change application, violations, KPI deltas, and changed objects.

Acceptance:

- D+5 deck 105 percent overflow case passes.
- Moving drums produces D+5 90 and D+6 75.
- Locked job and no-go weather cases fail with typed violations.

## BE-05: CP-SAT solver and counterfactual

Model fit: strong-model recommended  
Prerequisites: BE-02 through BE-04  
Read: [backend spec section 16](../engineering/backend-agentic-spec.md#16-cp-sat-solver), [technical plan sections 5.2-5.3](../engineering/technical-plan.md#52-constraints-in-simulate-and-cp-sat)

Allowed files:

- `backend/app/solver/**`
- Solver golden and performance tests

Objective:

- Implement fresh-model-per-solve CP-SAT model, profiles, lever variables, diagnostics, bounded worker, and counterfactual.

Forbidden:

- No Gemini-chosen weights.
- No forbidden lever variables.
- No result labeled feasible unless status is FEASIBLE or OPTIMAL and simulation is clean.

Acceptance:

- All A-12 solver golden cases pass under two seconds.
- Fixed-seed eval runs are reproducible.
- MODEL_INVALID and UNKNOWN have explicit tests.

## BE-06: Repositories and seed data

Model fit: Luna-with-review  
Prerequisites: BE-01, BE-02  
Read: [backend spec sections 7 and 29](../engineering/backend-agentic-spec.md#29-demo-and-mock-strategy), [technical plan section 6](../engineering/technical-plan.md#6-offshore-scenario-data-seed)

Allowed files:

- Repository implementations
- Seed SQL/data
- Repository integration tests

Objective:

- Implement schedule snapshots, event/run, plan/decision, readiness, alert, and idempotency repositories.
- Seed exact A-12 and D-07 data.

Acceptance:

- Seed checksum is stable.
- Snapshot reconstructs all engine inputs.
- Repository methods preserve scenario boundaries.

## BE-07: Read APIs and readiness writes

Model fit: Luna-safe  
Prerequisites: BE-03, BE-04, BE-06  
Read: [backend spec sections 9.2-9.4 and 18](../engineering/backend-agentic-spec.md#92-health-and-metadata)

Allowed files:

- Schedule, policy, and readiness routers
- Application services and schemas for those routes
- API tests

Objective:

- Implement `/api/v1` schedule, policy, readiness list/detail, manual update, and suggestion review endpoints.
- Apply row-version and schedule-version rules.

Acceptance:

- OpenAPI schemas are stable.
- Readiness 409 conflict and optimistic rollback fixture exist.
- No business calculations live in route handlers.

## BE-08: Event intake and extraction versions

Model fit: Luna-with-review  
Prerequisites: BE-06, BE-07  
Read: [backend spec sections 9.5 and 12.3-12.4](../engineering/backend-agentic-spec.md#95-events-and-extraction)

Allowed files:

- Event service, schemas, router
- Input boundary and event tests

Objective:

- Create text-only events.
- Persist immutable extraction versions and planner corrections.
- Enforce event state transitions and clarification gate contract.

Forbidden:

- No file upload.
- No model call in route handler.

Acceptance:

- Correction requires expected extraction version.
- Source text never appears in ordinary logs.

## BE-09: Model gateway and structured intake

Model fit: strong review required  
Prerequisites: BE-02, BE-08  
Read: [backend spec sections 12.3 and 13](../engineering/backend-agentic-spec.md#13-model-gateway), [proposal design principles](../product/ripple-proposal.md#65-design-principles)

Allowed files:

- Model gateway, intake prompt, schemas, redaction, intake evals

Objective:

- Implement Vertex-backed structured extraction behind `ModelGateway`.
- Enforce source excerpts, strict schema, repair limit, prompt version, and hostile-input boundary.

Forbidden:

- No tool calls or schedule writes.
- No logging raw prompt content.

Acceptance:

- Intake eval set covers normal, ambiguous, and injection content.
- Entries without required source excerpt are rejected or dropped explicitly.

## BE-10: Persisted runs and resumable SSE

Model fit: strong review required  
Prerequisites: BE-06, BE-08  
Read: [backend spec sections 9.6 and 11](../engineering/backend-agentic-spec.md#11-sse-protocol)

Allowed files:

- Run service/router
- Streaming modules
- Run repositories and tests

Objective:

- Implement run creation, ordered persisted public events, resumable GET stream, replay, heartbeat, timeout, and run detail.
- Cancellation remains disabled.

Acceptance:

- Disconnect and replay resumes after exact sequence.
- Duplicate reconnect does not duplicate reducer-visible events.
- Hidden prompts and chain-of-thought never enter public payload.

## BE-11: Controlled agent lever workflow

Model fit: strong-model recommended  
Prerequisites: BE-05, BE-09, BE-10  
Read: [backend spec section 12](../engineering/backend-agentic-spec.md#12-agent-workflow), [proposal sections 5.4 and 7.3](../product/ripple-proposal.md#54-why-the-combination-and-not-either-half)

Allowed files:

- Agent workflow, tools, prompts, numeric checker, evidence
- Agent tests and evals

Objective:

- Implement deterministic workflow states around one ADK agent.
- Enforce policy-filtered lever loop, budgets, profile comparison, counterfactual, evidence, and numeric checker.

Forbidden:

- No multi-agent system.
- No operational write tool.
- No model arithmetic or weights.

Acceptance:

- Forbidden and ruled-out levers are never sent to solver.
- A-12 pair produces different lever paths.
- Numeric mismatch falls back to deterministic explanation.

## BE-12: Plan persistence and audit reads

Model fit: Luna-with-review  
Prerequisites: BE-06, BE-11  
Read: [backend spec sections 7.3, 8.3, and 9.7](../engineering/backend-agentic-spec.md#73-plan-and-decision-tables)

Allowed files:

- Plan service/router/repositories
- Decision read endpoints
- Contract tests

Objective:

- Persist immutable plans, options, evidence, and lineage.
- Expose plan and decision reads with cursor filtering.

Acceptance:

- Recommended option with violations is rejected.
- Superseded plans remain readable.

## BE-13: Approval, rejection, and reply

Model fit: strong-model required  
Prerequisites: BE-04, BE-06, BE-12  
Read: [backend spec sections 8 and 17](../engineering/backend-agentic-spec.md#17-approval-transaction)

Allowed files:

- Approval and plan decision services
- Relevant repositories and routers
- Transaction, concurrency, and idempotency tests

Objective:

- Implement atomic approval exactly as pseudocoded.
- Implement rejection reason and reply-linked event.
- Return changed objects and schedule versions.

Forbidden:

- No optimistic or force apply.
- No model call inside approval transaction.
- No partial notification side effect before commit.

Acceptance:

- Duplicate approval is idempotent.
- Concurrent schedule change returns 409.
- Any failed apply rolls back every operational table.
- Revalidation catches a newly infeasible option.

## BE-14: Demo reset and recorded modes

Model fit: Luna-with-review  
Prerequisites: BE-06, BE-10 through BE-13  
Read: [backend spec section 29](../engineering/backend-agentic-spec.md#29-demo-and-mock-strategy)

Allowed files:

- Demo service/router
- Recorded artifacts and tests

Objective:

- Implement scenario-scoped transactional reset, recorded model mode, full SSE fixture mode, and scenario metadata.

Acceptance:

- Reset returns stable seed checksum.
- Production guard prevents reset outside demo scenario.
- Recorded and live modes share response contracts.

## BE-15: Observability and deployment hardening

Model fit: strong review required  
Prerequisites: BE-13, BE-14  
Read: [backend spec sections 21-25 and 30](../engineering/backend-agentic-spec.md#21-security-model)

Allowed files:

- Observability, container, deployment, and focused performance configuration

Objective:

- Add trace spans, metrics, redaction, Cloud Run configuration, DB pool limits, solver worker limits, and health diagnostics.

Acceptance:

- No raw source in logs or traces.
- Eight simultaneous recorded streams pass load test.
- Container uses documented timeouts and concurrency.

## BE-16: Scenario-keyed schedule state migration

- Model fit: strong-model recommended; Luna may add tests only after contract review
- Prerequisites: INT-10
- Read: [scenario context §3.1](productization-plan.md#31-context), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `backend/app/persistence/models.py`, `backend/migrations/versions/0002_scenario_schedule_state.py` (new), `backend/app/persistence/repositories.py` only if required, `backend/tests/persistence/**`, and focused concurrency/migration tests.

Objective: Remove the singleton `schedule_state.id = 1` constraint while retaining `id` as surrogate primary key and `scenario_id` as the unique logical lock key. Provide safe generated/default IDs for additional scenarios without changing the golden A-12 seed's explicit `id=1`; preserve its row and version. Review migration upgrade/downgrade safety, row lock, and version increment before code. Do not modify solver or approval logic.

Acceptance: Existing A-12 state survives upgrade; two scenarios can coexist and increment independently; concurrent approvals still lock only the target scenario; migration rollback is documented; `uv run ruff check .`, `uv run pyright`, focused persistence/concurrency tests. Stop if migration would reinterpret or destroy real data.

## BE-17: Deterministic fleet-scale synthetic seed

- Model fit: Luna-with-review for seed builder; strong review for relational graph
- Prerequisites: BE-16
- Read: [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `backend/seed/**`, `backend/scripts/seed_preview.py`, seed helper files under `backend/scripts/`, and focused seed tests. No migrations, agent, solver, or operational route changes.

Objective: Keep A-12 golden seed unchanged; add separate versioned `fleet-scale` synthetic scenario with deterministic IDs, relationally valid bookings/readiness/events/runs/plans/decisions, expected counts, epoch, and checksum. Add idempotent install/verification path; no runtime randomness and no default overwrite.

Acceptance: Install twice yields same counts/checksum; 16–24 resources, 35–50 jobs, 60–100 bookings, 25–40 readiness items, 20–30 events, and six audited link chains; A-12 golden tests unchanged; `uv run ruff check .`, `uv run pyright`, focused seed and solver-golden tests. If schema lacks a required relation, stop for review.

## BE-18: Scenario metadata and safe reset

- Model fit: Luna-with-review plus senior transaction review
- Prerequisites: BE-17
- Read: [scenario context §3.1](productization-plan.md#31-context), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `backend/app/application/demo_service.py`, `backend/app/application/schemas.py`, `backend/app/api/routers/demo.py`, `backend/app/api/middleware.py`, `backend/app/config.py` if needed, `backend/scripts/seed_preview.py`, and focused demo API/reset/CLI tests.

Objective: Keep the existing demo metadata fields and add `scenario_start_date` and `reset_allowed` exactly as frozen in §3.1; `A-12-base` day zero is `2026-10-13`, and fleet-scale is advertised only in synthetic local/preview. Allowlist accepted `X-Scenario-ID` values; omitted header defaults to A-12, explicit blank/unknown is `404 unknown_scenario`. Reset only an explicitly allowlisted synthetic scenario whose request body matches the header, in one transaction. Add explicit `--scenario`, `--verify`, and `--reset` CLI behavior; no broad implicit destructive target. Preview startup may install missing seed but never overwrite edited data. Preserve production guard and existing A-12 recorded behavior.

Acceptance: Unknown scenario header is rejected; reset one scenario restores its checksum/version/graph and leaves another byte-equivalent; failed reset rolls back; non-demo and production reset denied; `uv run ruff check .`, `uv run pyright`, focused demo API tests.

## BE-19: Event and Readiness list read models

- Model fit: Luna-with-review for exact queries; strong review for API contract changes
- Prerequisites: INT-10, BE-17
- Read: [read-model target §3.4](productization-plan.md#34-frozen-openapi-read-model-target), [search §4.2](productization-plan.md#42-search-behavior), [flow §7](productization-plan.md#7-flow-and-invalidation-matrix).

Allowed files: `backend/app/api/routers/events.py`, `backend/app/api/routers/readiness.py`, `backend/app/application/event_service.py`, `backend/app/application/readiness_service.py`, `backend/app/application/schemas.py`, matching repository read functions, and focused API tests. Split before implementation if more than eight production files are required.

Objective: Implement the exact §3.4 event fields, `total_count`, scenario-wide lifecycle counts, `job_id` and `q` semantics; add readiness `source_type`, server `q`, filtered `total_count`, and retain its unfiltered scenario `summary`. Preserve existing cursor format and scenario isolation. No write endpoint or state machine change.

Acceptance: Event list links to existing job/run/plan IDs; filtered counts do not depend on current cursor page while lifecycle counts remain scenario-wide; readiness source/search handoff returns intended items and its summary remains scenario-wide; filters never leak another scenario; OpenAPI reflects approved parameters; `uv run ruff check .`, `uv run pyright`, focused API tests. Stop only for a concrete schema contradiction, not to re-request INT-10 product approval.

## BE-20: Decision History read model and filters

- Model fit: Luna-with-review for exact queries; strong review for API contract changes
- Prerequisites: INT-10, BE-17, BE-24
- Read: [read-model target §3.4](productization-plan.md#34-frozen-openapi-read-model-target), [approved immutable context §3.5](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15), [search §4.2](productization-plan.md#42-search-behavior), [History §6.6](productization-plan.md#66-decision-history).

Allowed files: `backend/app/api/routers/plans.py`, `backend/app/application/plan_service.py`, matching decision repository read functions, response schemas only if needed, and focused decision-list API tests. No approval transaction or solver edits.

Objective: Add exact §3.4 event/job/plan context in immutable decision summaries and detail, including nullable decision-time `event_cause` and explicit `context_status`; add filtered `total_count` and server `job_id`, `actor`, `nature`, UTC date-only `from`/`to`, and `q` filters. Read the decision-time values pinned by BE-24, never the event's current nature/cause or latest extraction. Preserve existing cursor format and stable ordering. Do not infer lever usage from free text; that control stays hidden without a relational contract.

Acceptance: >100 decisions paginate without duplicates or count drift; job/date/actor filters return correct linked records; correcting extraction/event after a decision does not change its summary, filter membership, search result, or detail; unknown historical context remains explicit and is not replaced with current values; scenario isolation holds; existing approval/audit tests stay green; OpenAPI updated; `uv run ruff check .`, `uv run pyright`, focused API tests.

## BE-21: Read-only Ask Ripple answer contract

- Model fit: strong-model recommended; not an independent Luna design task
- Prerequisites: INT-10, BE-19, BE-20
- Read: [rules §1](productization-plan.md#1-outcome-and-non-negotiable-rules), [data ownership §3](productization-plan.md#3-canonical-context-entity-identity-and-data-ownership), [Ripple §6.8](productization-plan.md#68-ripple-panel-and-demo-lab).

Allowed files: a new `/api/v1` read-only router/schema, existing application/agent read adapters, `backend/app/main.py` **only to register that router**, and focused contract/security tests. No persistence model, solver, schedule-write, or approval transaction edits. Split implementation if eight production files are exceeded.

Objective: Implement the frozen `POST /api/v1/ask` request/response and 422/404/503 behavior in §6.8 using scenario-scoped canonical context IDs. Reuse the existing controlled single-agent/model gateway boundary or deterministic read services; never create an event or mutate operational data. Before coding, review prompt-injection, cross-scenario lookup, and tool-authorization boundaries; this remains a senior security review, not a new product-choice gate.

Acceptance: Ask leaves schedule/event/decision counts and versions unchanged; invalid/cross-scenario IDs rejected; stale evidence is surfaced; provider failure has a truthful error; OpenAPI contract generated; `uv run ruff check .`, `uv run pyright`, focused security/API tests. Stop if a safe answer contract cannot be approved.

## BE-22: Resource unavailability source and Schedule read contract

- Model fit: Luna-with-independent senior schema review
- Prerequisites: INT-10, BE-17
- Read: [approved resource contract §3.5](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15), [Timeline §6.2](productization-plan.md#62-fleet-timeline-and-job-inspector), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `backend/app/persistence/models.py`, `backend/migrations/versions/0003_resource_unavailability.py` (new), matching schedule repository functions in `backend/app/persistence/repositories.py`, `backend/app/application/schemas.py`, `backend/app/application/schedule_service.py`, `backend/seed/fleet_scale.py`, `backend/scripts/seed_preview.py`, and focused schedule/migration/seed tests. No solver, approval transaction, or frontend files. Reserve migration/seed/repository files exclusively. The seed CLI file is required: its `_TABLES`, scenario-row predicates, install, verify, and reset paths must include the new table; updating only the seed builder would produce a false checksum or leave intervals behind on reset.

Objective: Persist scenario-scoped inclusive maintenance/unavailable intervals as first-class resource data, include them in `/api/v1/schedule` with stable IDs, kind, reason, and range/group semantics, and seed both kinds deterministically in fleet-scale. Keep A-12 golden seed unchanged. This packet exposes data; BE-23 owns planning/approval enforcement. Reject invalid ranges, unknown resources, and cross-scenario references; do not derive intervals from zero-capacity points or fake bookings.

Acceptance: Migration upgrade preserves A-12 row/version and existing bookings; downgrade safety documented; seed install twice is idempotent and checksum includes intervals; reset affects only target scenario; schedule filters/clips intervals at inclusive boundaries and retains empty resources; unknown/cross-scenario references rejected; OpenAPI includes typed collection; `uv run ruff check .`, `uv run pyright`, focused persistence/seed/schedule API tests. Independent reviewer signs off migration and reset isolation before `done`.

## BE-23: Enforce unavailability in planning and approval

- Model fit: strong-model review required for solver/approval safety
- Prerequisites: BE-22
- Read: [approved resource contract §3.5](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15), [metrics §4.1](productization-plan.md#41-planned-capacity-load), [approval rules §3.3](productization-plan.md#33-mutation-continuity).

Allowed files: `backend/app/domain/resources.py`, `backend/app/engine/simulate.py`, `backend/app/engine/capacity.py`, `backend/app/solver/cpsat.py`, the schedule snapshot loader in `backend/app/persistence/repositories.py`, `backend/app/application/schedule_service.py` only for availability-aware capacity reporting, `backend/app/agent/tools.py` only to use that same read-only capacity policy, `backend/app/application/decision_service.py` only for approval revalidation, and focused domain/engine/solver/agent-read/approval tests. No migration, seed, OpenAPI generator, or frontend files. These are at most eight production files; split before coding if another is needed.

Objective: Carry BE-22 intervals into the immutable scheduling snapshot. An overlapping booking is an explicit infeasible conflict in simulation; CP-SAT must exclude unavailable resource-days; approval must revalidate against current intervals and refuse stale/conflicting options atomically. Per-day unavailable capacity is zero and excluded from the planned-load denominator. Preserve existing historical conflicting bookings for visibility, not silent deletion. Do not add a resource-editing UI or let an agent write the schedule.

Acceptance: Tests cover inclusive first/last day, no overlap, overlapping booking, solver avoiding unavailable days, infeasible option, stale version, zero-capacity metric, and approval rollback/no partial decision; existing A-12 solver golden and approval tests pass; `uv run ruff check .`, `uv run pyright`, focused tests. Independent solver/approval reviewer records a pass before `done`.

## BE-24: Pin immutable Decision History context at write time

- Model fit: strong-model migration/transaction review required
- Prerequisites: BE-22, BE-23, BE-17 (serial Alembic, repository, approval-transaction, and seed ownership)
- Read: [approved immutable context §3.5](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15), [History §6.6](productization-plan.md#66-decision-history), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `backend/app/persistence/models.py`, `backend/migrations/versions/0004_decision_context_snapshot.py` (new), decision write functions in `backend/app/persistence/repositories.py`, `backend/app/application/decision_service.py`, `backend/seed/fleet_scale.py`, and focused migration/decision/approval/seed tests. `backend/app/application/plan_service.py` remains BE-20-owned; no frontend, solver, or unrelated route edits. BE-23 must finish and pass review before BE-24 edits their shared repository/approval files. BE-22 owns the seed CLI table traversal; BE-24 adds snapshot columns to existing decision rows, not a new table.

Objective: Audit whether `Plan → AgentRun → extraction_version → EventExtraction` provides verifiable historical event nature, cause, and job IDs. Persist decision-time event ID, plan version, nature, job IDs, searchable cause, and `context_status="captured"` in the same transaction as approve/reject/reply. Backfill only verifiable old synthetic values; represent unverifiable historical nature/cause as null and jobs as empty with `context_status="partial_legacy"`, never silently join the latest mutable event/extraction. The migration must retain decision IDs, versions, and audit changes; do not rewrite approval semantics. BE-20 owns response-schema exposure and filtering after this write path passes review.

Acceptance: After decision creation, later event/extraction correction leaves pinned context unchanged; approve/reject/reply each capture context transactionally and failure rolls back all writes; migration preserves old decisions and documents rollback/backfill limitations; fleet-scale install/reset remains deterministic; `uv run ruff check .`, `uv run pyright`, focused migration/decision/approval tests. Independent reviewer signs off write atomicity and historical-truth treatment before BE-20 resumes.

## BE-25: Complete synthetic-preview event extraction

- Model fit: Luna-with-root review of state transitions and scenario/security boundaries
- Prerequisites: BE-08, BE-09, BE-18, INT-19; no new migration or OpenAPI shape is presumed
- Read: [preview UX §1](preview-ux-recovery.md#1-what-the-screenshots-and-source-establish), [Changes §4.3](preview-ux-recovery.md#43-changes-and-event-detail), [backend events §9.5](../engineering/backend-agentic-spec.md#95-events-and-extraction), [graceful degradation §23.4](../engineering/backend-agentic-spec.md#234-graceful-degradation).

Allowed files: `backend/app/api/routers/events.py`, `backend/app/application/event_service.py`, `backend/app/agent/model_gateway.py` only for reusing an existing gateway adapter, `backend/app/config.py` only for a guarded local/preview setting, and one new bounded deterministic extraction helper under `backend/app/application/`. Do not edit seed builder/CLI, migrations, repositories, schedule/approval code, generated frontend types, shared tests, or cloud configuration. If a contract change or extra file is truly required, report the exact path to root for README §4.7 ownership amendment before editing.

Objective: Close the observed `planning/queued` dead end. `POST /api/v1/events/{id}/extract` must perform a bounded extraction attempt through the configured Gemini gateway where available, or through a clearly identified deterministic synthetic local/preview extractor when model credentials are unavailable. Persist a validated `EventExtraction` version using the existing service, with the correct `extracted` or `clarification_needed` state. A deterministic parser must use only source text and scenario-scoped known IDs; ambiguous/missing job or date produces `clarification_needed`, not fabricated certainty. It must never write schedule/readiness/decision data. Idempotent repeat requests, concurrent version changes, timeout/error recovery, and a truthful retryable failure must not leave an event indefinitely `planning`. In staging/production with no configured provider, return an honest provider-unavailable error, not silent demo output. Include source/model provenance in the persisted metadata.

Development handoff: Root source-reviews transition atomicity, provider guard, bounded timeout, scenario lookup, and no operational write. No test code or test run now under README §4.8. Report API response/state and any exact contract issue; root runs Ruff/Pyright only after parallel writers finish. FE-28 begins only after this completion contract is frozen.

## BE-26: Fleet-scale v2 story graph and versioned reset baseline

- Model fit: Luna-with-root seed/transaction review
- Prerequisites: BE-17, BE-22, BE-24, INT-18, INT-19
- Read: [data contract §2](preview-ux-recovery.md#2-product-and-data-contract), [seed/reset §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `backend/seed/fleet_scale.py`, `backend/scripts/seed_preview.py` only if seed-version/manifest registration requires it, and `backend/app/application/demo_service.py` only if advertised seed metadata needs the v2 version. No migration, event service/route, frontend, test code, or cloud file. Reserve the builder and CLI for this worker alone; never run install/reset/verify on a shared database in this development task.

Objective: Version deterministic fleet-scale v2 with the 20–24 resources / 40–50 jobs / 90–110 bookings / 35–45 readiness / 25–35 events / 10–12 immutable decisions targets and curated cross-linked cases in §2. Keep A-12 SQL untouched. Use believable human synthetic content and stable relational links; ensure decisions' pinned context matches their event/extraction at decision time, and that seed checksum includes every table already in the reset graph. Keep install-if-missing non-destructive; an existing v1 scenario needs explicit scenario-scoped reset/reinstall and warning, never silent startup overwrite. Preserve all pre-existing v1 rows as user state until explicitly reset. If the schema constrains one target, report it and preserve at least v1 counts.

Development handoff: Root source-reviews ID/link graph, version/checksum, reset allowlist and no accidental mutation outside target. No database command, test code, or test run now; root runs Ruff/Pyright only after parallel writers finish. FE-26/27/29 may render against the already frozen response contract while this worker builds the v2 data graph.

## BE-27: Fleet seed exception story and safe version visibility

- Model fit: Luna-safe with root seed/isolation review
- Prerequisites: BE-26 `dev_done`; [follow-up contract §1–3](timeline-gemini-followup.md#1-evidence-and-decisions) is frozen. No API vendor field is authorized.
- Read: [follow-up §3](timeline-gemini-followup.md#3-synthetic-data-and-live-model-boundary), [seed/reset §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `backend/seed/fleet_scale.py`; `backend/scripts/seed_preview.py` **only** for seed-version registration/checksum or an exact safe CLI diagnostic; `backend/app/application/demo_service.py` **only** for advertised seed-version metadata. No event service, model gateway, config, dependency/lockfile, migration, frontend, shared tests, or database command. Reserve seed builder/CLI exclusively. An existing fleet v1/v2 installation must remain untouched until a later explicit, scenario-scoped reset.

Objective: Make the deterministic fleet seed demonstrate capacity-valid concurrent bookings, an actual over-capacity case, visible booking–maintenance/unavailable intersections, area-wide weather context, standby rows, and human-readable exception reasons tied to cross-page IDs. Preserve A-12 and approval-only schedule writes. Version/checksum the revision and accurately advertise installed seed version; do not fake vendor identities or group-vendor correlation. Clarify which overlaps are intentional historic violations versus valid parallel capacity. No automatic reset, install-on-startup overwrite, or cloud data mutation.

Development handoff: root source-reviews determinism, version/checksum, scenario isolation, overlap intent, and installed-vs-source seed reporting. No tests, DB replay, browser, or reset in this pass; root runs backend static checks after writers finish.

## BE-28: Opt-in Gemini Developer API for local/preview extraction

- Model fit: Luna with root security/provider review
- Prerequisites: BE-25 `dev_done`; [follow-up contract §3](timeline-gemini-followup.md#3-synthetic-data-and-live-model-boundary) is frozen. Staging/production Vertex and approval boundaries stay intact.
- Read: [follow-up §1 and §3](timeline-gemini-followup.md#1-evidence-and-decisions), [graceful degradation §23.4](../engineering/backend-agentic-spec.md#234-graceful-degradation).

Allowed files: `backend/app/config.py`, `backend/app/agent/model_gateway.py`, `backend/app/application/event_service.py`, `backend/app/api/routers/events.py` **only if provider selection needs route plumbing**, `backend/app/api/routers/health.py` **only for secret-free diagnostics**, `backend/pyproject.toml`, `backend/uv.lock`, `backend/.env.example`, `backend/.env.preview.example`, and `docs/implementation/preview-deployment.md` for placeholder-only local/preview instructions. Local `backend/.env` is already configured and is **read by the runtime only, not a worker write target**. No seed builder/CLI, frontend, Ask service, agent tools, migrations, tests, or cloud config. The dependency and lock update is serially owned by this worker; no other package operation may overlap.

Objective: Wire `synthetic` local/preview default, explicit `gemini_developer` local/preview opt-in, and unchanged `vertex` staging/production through backend Settings into the existing structured gateway. Do not read only `os.getenv` when `.env` is loaded by Settings. Use `SecretStr` or equivalent non-logging secret representation for `RIPPLE_GEMINI_API_KEY`, explicit `RIPPLE_MODEL_PROVIDER` and `RIPPLE_INTAKE_MODEL`, official `google-genai` dependency, bounded timeout/retries and truthful provider/quota errors. The user-authorized temporary key and non-secret provider/model settings already exist in gitignored local `backend/.env`; consume through Settings at runtime only, and do not inspect, print, copy, overwrite, commit, or export its contents. Key presence alone must not opt in on other installations. Document the setting names and placeholder-only examples. Never call the model on startup, health, seed, background page load, or an automated acceptance command; only user-triggered extraction. An explicitly selected failing live provider must not silently produce synthetic extraction. Persist honest provenance; retain scenario validation and no schedule writes. Ask stays deterministic/read-only.

Development handoff: root source-reviews provider/environment guards, secret handling, runtime dependency, failure semantics, provenance, and absence of startup calls. No live-key call, tests, browser, deploy, or cloud mutation now; root runs backend static checks after writers finish.
