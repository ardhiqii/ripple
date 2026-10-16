# Ripple Implementation Control

Status: active development-first execution source of truth; 2026-10-16 Timeline centered-lanes/contextual-preview follow-up is newly scoped, E2E/browser QA deferred by product owner
Audience: coding agents and integrators
Optimized for: small and mid-sized coding models working one bounded task at a time, optionally coordinated by a multi-task goal

Do not ask a coding worker to read every document in this repository. Give it this file, one task packet, and only the referenced specification sections. An explicitly scoped root goal may coordinate multiple workers under Section 4.7. **Section 4.8 overrides older test-code, test-command, E2E, and mandatory independent-sign-off language in task packets for the current development phase.** Preserve existing test files without modifying them. E2E/browser QA is a separate later goal.

## 1. Frozen implementation decisions

These decisions are final for the hackathon MVP. A task agent must not replace them with alternatives.

| Concern | Frozen decision |
|---|---|
| Product name | Ripple |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| UI primitives | Customized shadcn/ui, project-owned source |
| Icons | Phosphor only |
| Routing | TanStack Router with file-based typed routes |
| Server state | TanStack Query |
| Tables | TanStack Table |
| Forms | React Hook Form and Zod |
| Frontend API types | Generated from FastAPI OpenAPI |
| Frontend mock layer | MSW plus recorded SSE fixtures |
| Timeline | Custom CSS Grid, no Gantt library |
| Backend language | Python 3.12 |
| API framework | FastAPI and Pydantic v2 |
| Persistence | PostgreSQL, SQLAlchemy 2 async, Alembic |
| Agent | One controlled Google ADK agent workflow |
| Model | Gemini on Vertex AI through a model gateway |
| Solver | Google OR-Tools CP-SAT |
| Deployment | One modular backend service on Cloud Run |
| Frontend hosting | Firebase Hosting |
| API namespace | `/api/v1` |
| Streaming | Two-step run creation plus resumable GET SSE stream |
| Operational writes | Explicit human approval only |
| Theme | Light theme only for MVP |
| Authentication | No login for public synthetic demo |

## 2. Frozen MVP feature flags

| Feature | MVP state | Rule |
|---|---|---|
| Timeline | On | Must ship |
| Readiness Board | On | Must ship |
| Change Inbox | On | Must ship |
| Decision Workspace | On | Must ship |
| Decision History | On | Minimal complete audit path |
| Demo Lab | On | Must ship |
| A-12 base scenario | On | Must ship |
| A-12 constrained pair | On | Must ship |
| D-07 disruption | On | Must ship |
| Policy and Data Health | On | Read-only minimal view |
| Alerts UI | Off | Do not implement until core integration passes |
| Daily check | Off | Backend contract may exist; no MVP UI |
| File upload | Off | Paste text only |
| Notification drafts | Off | Outbox schema may exist; no sending |
| E-02 opportunity | Off | Add only after feature-freeze review |
| Plant turnaround | Off | Slide or documentation only |
| Agent run cancellation | Off | Navigation does not cancel runs |
| Saved views | Off | Do not render placeholder control |
| Dark mode | Off | Do not add theme toggle |
| Drag schedule editing | Off | No drag handles or mutation |
| Login and roles | Off | Capability interface may exist, all demo planner capabilities enabled |

An off feature must not appear as a dead button. Hide it entirely unless a task explicitly turns it on.

## 3. Document authority for implementation

Read in this order only when relevant:

1. This implementation control file.
2. Assigned task packet.
3. Exact linked sections in current specifications.
4. Existing code in the task's allowed file scope.

Current specifications:

- Product architecture: [product build plan](../product/product-build-plan.md).
- Visual rules: [design system](../design/design-system.md).
- Frontend behavior: [UI/UX interaction specification](../design/uiux-interaction-spec.md).
- Backend behavior: [backend and agentic specification](../engineering/backend-agentic-spec.md).
- Business intent: [product proposal](../product/ripple-proposal.md).
- Post-prototype connected-app delta: [productization plan](productization-plan.md). INT-10 product decisions were approved and frozen on 2026-10-14 for synthetic local/preview data; implementation and packet-level review remain pending. Read only the exact section linked by an assigned `FE-15+`, `BE-16+`, or `INT-10+` packet.
- Completed screenshot-recovery development contract: [preview UX recovery](preview-ux-recovery.md). `BE-25–BE-26`, `FE-26–FE-29`, and `INT-20–INT-21` are historical `dev_done / QA pending`; do not repeat their implementation.
- Previous Timeline/Gemini development contract: [Timeline semantics and Gemini preview](timeline-gemini-followup.md). `BE-27–BE-28`, `FE-30–FE-31`, and `INT-22` have source in the current worktree; preserve it and do not replay those packets wholesale. Gemini/provider decisions remain in force.
- Previous screenshot-density contract: [Compact Timeline and continuous navigation](timeline-density-navigation.md). Read only linked sections for `FE-32–FE-33` and `INT-23`. It specifically superseded earlier Timeline row-height, exception/weather presentation and month-navigation clauses; no other page, backend, or seed rewrite is authorized.
- Previous issue-clarity contract: [Timeline issue and weather clarity](timeline-issue-clarity.md). Read only linked sections for `FE-34–FE-35` and `INT-24`. It superseded the preceding contract's issue badge geometry, routine-weather-header, and legend presentation; the density/horizon/pan implementation is preserved.
- Previous grid-annotation contract: [Timeline grid annotation and overflow layout](timeline-grid-annotation-pass.md). Read only linked sections for historical `FE-36–FE-38` and `INT-25`; its per-day fragments, bottom issue band, thin hidden line and row-height target are superseded below. Its exact issue/weather data semantics, horizon/pan and other-page behavior remain frozen.
- Current centered-lanes contract: [Timeline centered lanes and contextual previews](timeline-centered-lanes.md). Read only linked sections for `FE-39–FE-41` and `INT-26`. It supersedes the preceding contract's per-day booking fragments, thin hidden-booking line, bottom issue band, row-height target and weather-header tint; retain its exact issue/weather data semantics, horizon/pan, API and other-page behavior.

Historical planning context:

- [Technical plan](../engineering/technical-plan.md). Do not copy its old unversioned `/api/...` paths into new code.
- [Team summary](../product/ripple-summary-id.md). Use it for orientation, not implementation detail.

If current specs conflict with this file, this file wins for MVP implementation scope.

## 4. Small-model execution protocol

### 4.1 One task per worker assignment

A coding worker receives exactly one task ID from the task catalog. Do not combine adjacent packets in one worker assignment to save turns. A root agent with an explicitly scoped multi-task goal may advance through multiple IDs over multiple turns under Section 4.7.

### 4.2 Required prompt payload

Every implementation prompt includes:

```text
Task ID:
Objective:
Read first:
Allowed files:
Forbidden changes:
Development check / handoff:
Stop condition:
```

### 4.3 Required agent behavior

The task agent must:

1. Read this file.
2. Read the full assigned task packet.
3. Read only the specification sections listed by the task.
4. Inspect existing files before editing.
5. Preserve unrelated user changes.
6. Implement the smallest complete change satisfying the packet.
7. Apply the development-phase override in Section 4.8 instead of old per-packet test commands.
8. Report changed files, intended behavior, development checks actually run, deferred QA, and any unresolved blocker.

### 4.4 Forbidden behavior

The task agent must not:

- Change stack choices.
- Add unlisted dependencies.
- Rename routes, API fields, or tokens outside the task.
- Implement off-scope feature flags.
- Rewrite an entire file to make a small change.
- Create a second design system.
- Add raw colors instead of tokens.
- Put business rules in route handlers, React components, or ADK tool wrappers.
- Let the agent write schedule data.
- Treat a fixture-only screen as integrated live behavior or claim deferred E2E passed.
- Push, commit, deploy, or modify cloud resources unless the task explicitly says so.

### 4.5 Stop and escalate

Stop without guessing when:

- An OpenAPI field required by the task is absent or contradictory.
- The database migration would destroy or reinterpret existing data.
- A package version is incompatible with React 19, Python 3.12, or the frozen stack.
- Approval, policy, or schedule-version behavior is ambiguous.
- A task requires files outside its allowed scope.
- Existing user changes overlap the exact code being modified and cannot be preserved.

### 4.6 Copy-paste task prompt

Use this wrapper when assigning one catalog task to a coding model:

```text
Execute exactly one Ripple implementation task.

Task ID: <ID>
Task packet: <relative link to task heading>

Instructions:
1. Read docs/implementation/README.md completely.
2. Read the full assigned task packet.
3. Read only the specification sections linked by that packet.
4. Inspect every allowed file before editing.
5. Do not modify files outside Allowed files.
6. Do not implement feature flags marked Off.
7. Apply README Section 4.8: implement without creating/running test code; root runs static development checks after integration, not per-packet suites.
8. If a contract is missing or contradictory, stop and report it instead of guessing.
9. Do not commit, push, deploy, or modify cloud resources.

Final response:
- Outcome
- Files changed
- Development checks actually run and results; E2E/browser QA is deferred
- Blockers, if any
```

For a Luna-with-review task, append:

```text
Treat the existing specification as immutable. Implement it mechanically and flag any design decision instead of resolving it yourself.
```

### 4.7 Multi-task goal orchestration

Use this only when the user explicitly names the multi-task goal scope. The root agent coordinates; Section 4.1 still applies to every worker assignment.

1. Inventory the scoped task IDs, prerequisites, Allowed files, development deliverables, and deferred QA. Track each ID outside these source documents using the statuses in Section 6. Do not infer `ready` from the existence of a packet.
2. Freeze required contracts before dependent implementation. INT-10 and §3.5 product decisions are recorded in the productization plan and no longer block dependent packets. Do not reopen them without a concrete contradiction. The root inspects high-risk migration, Ask, solver, approval, and reset code at integration boundaries without waiting on a formal independent sign-off or old test gate.
3. Form small waves from ready, independent IDs. Before spawning workers, reserve disjoint write-file ownership. Shared styles, route shell, generated OpenAPI types, lockfiles, migrations, seed builder/CLI, and configuration count as shared files. If ownership is uncertain, run serially. Use at most two concurrent writing workers in a shared workspace; the root integrates and can read/review in parallel. **For two ready disjoint tasks, dispatch both workers before waiting for either one.** While both run, root does read-only review/contract tracing. On the first completion, review its diff and refill the free slot with another ready disjoint task; do not wait for the slower worker except at a real dependency boundary. This prevents nominally parallel `spawn → wait → spawn` execution.
4. Give each worker one ID, its packet and linked sections, exact write ownership within Allowed files, development deliverable, and stop condition. Read-only research/review can run in parallel, but it must not mutate code, database, seed state, or generated artifacts.
5. Do not parallelize commands against the same mutable database or generated output. Run migrations, seed/reset, package installation, contract generation, and cross-task integration serially. No worker writes or runs test code in this phase.
6. The root reviews each diff before marking a task `dev_done`, then runs static development checks at dependency boundaries and once at the end. The development goal finishes when every scoped development ID is integrated, the live UI/API/seed/reset code paths are coherent, and static checks pass; it is explicitly `QA pending`, not E2E-verified. On a missing contract or unavoidable Allowed-files conflict, use the bounded scope-repair protocol or stop for a genuinely new decision.

**2026-10-15 product authorization for the local synthetic preview:** [§3.5 of the productization plan](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15) freezes the missing Schedule unavailability and immutable History contracts, authorizes their bounded backend/API/migration work, the BE-21 route-registration exception, generated nullable type repair, and local preview-script/profile repair. Do not reopen these as product-choice gates. The new BE-22–BE-24 and INT-17–INT-18 packets specify exact files and acceptance; the root may coordinate them only when the user names these IDs in the multi-task goal. No deployment/cloud mutation is authorized by this paragraph.

**Safety review without a waiting gate:** The root inspects the high-risk migration/seed/reset, solver/approval, Ask security, and generated-contract diffs before integration. A separate read-only reviewer may be used for a concrete ambiguity, but is not a mandatory prerequisite to continue development. Record any unresolved risk for QA; do not call a known unsafe mutation `dev_done`. INT-14–INT-16 and browser/visual evidence belong to the later QA goal. A worker's task-final response is not the root goal's final response.

**Dependency revalidation:** Distinguish `implemented on prior contract` from `integrated on current contract`. Keep existing implementation; re-open a dependent ID only for a concrete integration diff, not to rerun old tests. FE-18–FE-25 and BE-21 need code-path/contract review after FE-17/BE-20 and new upstream contracts. If unchanged and coherent, mark `dev_done`. Keep separate `development complete`, `E2E/browser QA pending`, and `deployed preview not audited` statuses.

**Bounded scope-repair protocol:** If a worker finds a build/contract-required file outside its packet, it reports the exact path and evidence without editing it. The root may add only that exact file to the owning packet for a mechanical repair inside the approved contract, reserve one writer, and document the amendment in the ledger. Split a new bounded task if the change is a different feature or crosses a safety boundary. This does not allow a worker's unilateral scope expansion, a second UI system, changed solver/approval policy, cloud mutation, or broad rewrites. Continue other ready work during a resolvable file-ownership amendment.

**Historical INT-11 compatibility bridge (2026-10-14):** INT-11's four fixture/test/route compatibility files were added to its earlier scope after BE-19/BE-20 made response fields required. This is history, **not an instruction to restart INT-11 or edit tests now**. Preserve INT-11/INT-12/INT-13 implementation if current contracts still compile. INT-17 owns the later nullable generator and Schedule-contract regeneration; never give two workers generated-output ownership simultaneously.

### 4.8 Development-first acceptance override (2026-10-16)

This section is the product owner's current-phase instruction and has precedence over older `Acceptance:` lines, `Read:` links to test plans, and test-related final gates in all three task catalogs. The old tests and E2E packets remain documented for the **later** QA goal; they are not development blockers.

- **Do now:** finish live `/api/v1` data paths and actions; responsive, consistent UI/UX; deterministic rich `fleet-scale` seed plus golden A-12; safe per-scenario install/reset; generated OpenAPI/types; local/preview startup configuration. Preserve all existing code and user changes.
- **Do not do now:** create/update/delete test files, run Vitest/Pytest/Playwright, add a test harness/snapshot, run an E2E or browser walkthrough, deploy, or mutate cloud resources. No worker should spend time on test fixtures except a compiler-required schema compatibility value in existing non-test demo data.
- **Development checks:** inspect diff and imports per packet. At shared contract boundaries, the root may run `npm run api:check`, frontend build/lint, backend Ruff/Pyright, and `git diff --check` after all relevant writers finish. These are static/build consistency checks, not testing. Do not make each worker repeat the full suite. Do not run seed reset or migrations against an existing shared database as a casual check.
- **Handoff state:** mark `dev_done` after implementation and root integration review; report `QA pending` for behavior not yet exercised. A compilation error, missing API contract, destructive seed path, or obvious unsafe approval path still needs repair before `dev_done`. Do not claim production-ready or E2E-verified.
- **Later phase:** INT-14–INT-16 use real-API E2E and a browser walkthrough in the user's session, including five-viewport visual/a11y and reset/replay. Do not turn the later phase into a unit/component/API test-writing backlog. It starts only on a separate user request; track fixes under the owning task ID.

The FE-15–FE-38, BE-16–BE-28, and INT-10–INT-25 development source is historical/preserved for the current screenshot pass; prior browser QA remains pending. The newly scoped goal is **FE-39, FE-40, FE-41, INT-26**. Do not rerun old IDs without a concrete integration repair. **Exclude INT-14–INT-16** until the user requests E2E/browser QA. INT-26 is the final integration packet; see [centered lanes §3](timeline-centered-lanes.md#3-delivery-ownership-and-genuine-parallelism) for exact parallel ownership and sequencing.

Subagents are a coding workflow; the MVP prohibition on a multi-agent *product architecture* remains unchanged.

## 5. Model routing guidance

### Luna-safe

Good tasks for a small fast model:

- Add a bounded presentational component from an exact contract.
- Add a typed route using an existing pattern.
- Implement a simple query hook or filter serializer.
- Add fixtures matching an existing schema.
- Add a CRUD endpoint whose service and schema already exist.
- Implement a bounded pure mapper or component against a frozen contract.
- Add loading, empty, and error states to one screen.
- Refactor repeated styling into an existing primitive.

### Luna-with-review

Small model can implement if the packet is exact and a stronger review follows:

- Database migrations.
- SSE reducer and reconnect behavior.
- Agent tool adapters.
- Plan option comparison state.
- Optimistic readiness mutation with rollback.
- Schedule version conflict UI.
- Approval endpoint wiring after transaction service exists.

### Strong-model recommended

Use a stronger reasoning model or require line-by-line review for:

- CP-SAT model construction or objective changes.
- Approval transaction and idempotency.
- Agent workflow state transitions and retry rules.
- Prompt injection boundary and tool authorization.
- Database schema redesign.
- Cross-spec contract changes.
- Production concurrency, security, or deployment changes.

Small models may implement bounded changes around these areas, but should not independently redefine their logic.

## 6. Task catalogs

- [Frontend task catalog](frontend-tasks.md)
- [Backend task catalog](backend-tasks.md)
- [Integration and release task catalog](integration-tasks.md)

Task status values:

- `blocked`: this task's prerequisite is not complete; the root goal can continue with another ready task.
- `ready`: all prerequisites complete.
- `active`: exactly one agent owns it.
- `integrating`: implementation finished, root checks shared contracts and diff.
- `dev_done`: implementation is integrated under Section 4.8; E2E/browser QA remains pending.

Track status outside these source documents, for example in the issue tracker or a temporary local checklist. Do not continuously rewrite task specs as progress tracking.

## 7. Branch and change-size rule

Recommended branch or worktree naming:

```text
feat/fe-03-app-shell
feat/be-05-read-apis
fix/int-04-a12-approval
```

Recommended maximum per task:

- 8 production files changed.
- 0 new test files in the current development phase.
- 1 dependency batch.
- 1 migration.

If a task exceeds those limits, split it before implementation unless the packet explicitly allows more.

## 8. Development checks and deferred QA commands

Root-only static/frontend checks after shared contracts are integrated:

```powershell
cd frontend
npm run build
npm run lint
```

Root-only static/backend checks after shared contracts are integrated:

```powershell
cd backend
uv sync --frozen
uv run ruff check .
uv run pyright
```

Database/E2E commands are intentionally omitted from this development control file. The deferred INT-14–INT-16 packets own the later real-API/browser QA runbook.

Older task packets list additional tests. Section 4.8 supersedes them for now. Do not claim a deferred command passed. Static build/check failures are development integration findings, not permission to weaken types.

## 9. Dependency installation rule

- Inspect the package manifest before importing any library.
- Install only dependencies named in the active task packet.
- Keep frontend dependency additions grouped in FE-00 or an explicit dependency task.
- Keep Python dependency additions grouped in BE-00 or an explicit dependency task.
- Lock dependency versions.
- Never use an unofficial Go binding for OR-Tools.

## 10. File ownership boundaries

| Area | Owner layer | Must not contain |
|---|---|---|
| `frontend/src/components/ui` | Styled accessible primitives | Domain API calls |
| `frontend/src/components/*` | Reusable domain UI | Route-owned fetching |
| `frontend/src/features/*` | Domain hooks and mappers | Global shell code |
| `frontend/src/routes/*` | Composition and route state | Large business algorithms |
| `backend/app/domain` | Pure domain types and rules | FastAPI, SQLAlchemy, ADK imports |
| `backend/app/engine` | Deterministic calculations | Database and LLM calls |
| `backend/app/solver` | CP-SAT modeling | HTTP and prompt logic |
| `backend/app/application` | Use cases and transactions | Framework route objects |
| `backend/app/agent` | Controlled model workflow | Direct SQL and operational writes |
| `backend/app/api` | HTTP validation and mapping | Business calculations |
| `backend/app/persistence` | Repositories and migrations | Prompt logic |

## 11. API freeze

- New frontend code calls `/api/v1` only.
- FastAPI OpenAPI is the schema source of truth.
- Generate TypeScript types; do not duplicate response interfaces manually.
- Agent execution uses:
  1. `POST /api/v1/events/{event_id}/runs`
  2. `GET /api/v1/runs/{run_id}/stream`
- Do not implement the old `POST /api/agent/run` compatibility endpoint for MVP.
- Approval requires option ID, expected schedule version, and acknowledged condition IDs.
- Approval returns decision ID, before/after schedule versions, and changed objects.

## 12. Definition of a completed task

A task is `dev_done` only when:

- It stays within allowed files or documents an approved exception.
- It follows frozen decisions and feature flags.
- Its intended live code path is present and coherent with current API/types; root has inspected the diff.
- It has not created or modified test code for this phase; existing tests are preserved.
- It has no dead controls or placeholder business behavior.
- Loading, empty, error, and disabled states required by the packet exist.
- No unrelated files were reformatted.
- No secrets, real company data, or environment files were added.
- The final report is short and evidence-based, clearly labels `QA pending`, and does not claim E2E/browser/production verification.
