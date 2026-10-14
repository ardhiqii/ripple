# Ripple Implementation Control

Status: active execution source of truth  
Audience: coding agents and reviewers  
Optimized for: small and mid-sized coding models working one bounded task at a time

Do not ask a coding model to read every document in this repository. Give it this file, one task packet, and only the referenced specification sections.

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

Historical planning context:

- [Technical plan](../engineering/technical-plan.md). Do not copy its old unversioned `/api/...` paths into new code.
- [Team summary](../product/ripple-summary-id.md). Use it for orientation, not implementation detail.

If current specs conflict with this file, this file wins for MVP implementation scope.

## 4. Small-model execution protocol

### 4.1 One task per run

A coding model receives exactly one task ID from the task catalog. Do not combine adjacent tasks to save turns.

### 4.2 Required prompt payload

Every implementation prompt includes:

```text
Task ID:
Objective:
Read first:
Allowed files:
Forbidden changes:
Acceptance commands:
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
7. Run every acceptance command in the packet.
8. Report changed files, verification results, and any unresolved blocker.

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
- Skip tests because a fixture works visually.
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
7. Run every acceptance command that currently exists.
8. If a contract is missing or contradictory, stop and report it instead of guessing.
9. Do not commit, push, deploy, or modify cloud resources.

Final response:
- Outcome
- Files changed
- Verification commands and results
- Blockers or follow-up review required
```

For a Luna-with-review task, append:

```text
Treat the existing specification as immutable. Implement it mechanically and flag any design decision instead of resolving it yourself.
```

## 5. Model routing guidance

### Luna-safe

Good tasks for a small fast model:

- Add a bounded presentational component from an exact contract.
- Add a typed route using an existing pattern.
- Implement a simple query hook or filter serializer.
- Add fixtures matching an existing schema.
- Add a CRUD endpoint whose service and schema already exist.
- Write unit tests for an existing pure function.
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

Small models may write tests or scaffolding around these areas, but should not independently redefine their logic.

## 6. Task catalogs

- [Frontend task catalog](frontend-tasks.md)
- [Backend task catalog](backend-tasks.md)
- [Integration and release task catalog](integration-tasks.md)

Task status values:

- `blocked`: prerequisite is not complete.
- `ready`: all prerequisites complete.
- `active`: exactly one agent owns it.
- `review`: implementation finished, acceptance review pending.
- `done`: acceptance commands pass and review completed.

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
- 4 focused test files.
- 1 dependency batch.
- 1 migration.

If a task exceeds those limits, split it before implementation unless the packet explicitly allows more.

## 8. Global commands

Frontend commands after foundation tasks exist:

```powershell
cd frontend
npm run build
npm run lint
npm run test -- --run
```

Backend commands after scaffold exists:

```powershell
cd backend
uv sync --frozen
uv run ruff check .
uv run pyright
uv run pytest
```

Integration commands after both services exist:

```powershell
docker compose up -d postgres
cd backend
uv run alembic upgrade head
uv run pytest tests/contract tests/api
cd ..\frontend
npm run build
npm run test:e2e
```

Task packets may use a smaller subset. Do not claim a command passed if its script has not been created yet.

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

A task is complete only when:

- It stays within allowed files or documents an approved exception.
- It follows frozen decisions and feature flags.
- Its acceptance commands pass.
- It includes required tests or fixtures.
- It has no dead controls or placeholder business behavior.
- Loading, empty, error, and disabled states required by the packet exist.
- No unrelated files were reformatted.
- No secrets, real company data, or environment files were added.
- The final report is short and evidence-based.
