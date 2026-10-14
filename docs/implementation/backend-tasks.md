# Backend Task Catalog

Backend tasks preserve the layer boundaries in the implementation control. Strong review is mandatory for solver, approval, and agent-control tasks.

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
