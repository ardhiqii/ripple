# Ripple Coding Agent Instructions

## Start here

Before implementation, read `docs/implementation/README.md` completely.

Implementation work is defined by task IDs from:

- `docs/implementation/frontend-tasks.md`
- `docs/implementation/backend-tasks.md`
- `docs/implementation/integration-tasks.md`

For a normal request, work on exactly one assigned task ID. If none was assigned, ask for or propose one bounded ready task; do not choose a large feature independently.

For an explicitly scoped multi-task `/goal`, the root agent may coordinate all task IDs named by the user across multiple turns. Each worker/subagent still owns exactly one task ID at a time. Do not silently expand the goal to other catalog tasks. Follow the orchestration rules below and `docs/implementation/README.md`.

## Current phase: development first

The product owner has explicitly deferred testing to a later E2E/browser QA phase. For the current development goal, implement the scoped application, integration, UI/UX, deterministic synthetic seed, and safe reset. Do not create, run, or update unit, component, API, contract, snapshot, or E2E test code merely to satisfy older packet acceptance text. Preserve all existing tests; do not delete or weaken them. The root may run build, lint, type, OpenAPI-generation consistency, and diff checks after integration as development sanity checks; these are not a substitute for deferred E2E. Do not start a browser walkthrough until separately requested. `docs/implementation/README.md` §4.8 and the catalog phase notes supersede older per-packet test commands and review gates for this phase. The current goal may be marked `development complete / QA pending`, never `E2E verified` or production-ready.

## Execution rules

- Read the full assigned task packet and only its linked specification sections.
- Treat frozen stack decisions and MVP feature flags as immutable.
- Stay inside the packet's Allowed files.
- Stop instead of guessing when a contract is absent or contradictory.
- Preserve unrelated user changes.
- Do not commit, push, deploy, or modify cloud resources unless explicitly requested.
- Follow the current-phase acceptance override in `docs/implementation/README.md` §4.8. Report actual development checks; do not claim deferred tests passed.

## Multi-task goal and parallel-agent rules

- Before starting a multi-task goal, inventory its task IDs, prerequisites, allowed files, development checks, and deferred QA gates. Track `blocked`, `ready`, `active`, `integrating`, and `dev_done` outside the source task catalogs. A packet's existence does not make it ready.
- The root agent owns task sequencing, contract-gate tracking, integration, and final development review. The synthetic-local product decisions in `docs/implementation/productization-plan.md` §3.5 are already approved; do not request the same decision again. The root reviews high-risk migration, solver, approval, Ask, and reset diffs during integration; an independent read-only reviewer is optional for a concrete safety concern, not a mandatory waiting gate in this phase. Assign a subagent one ready task ID with a written objective, exact allowed-file ownership, forbidden changes, and expected development evidence. Do not give multiple task IDs to one worker in a single assignment.
- Parallelize only independent ready tasks whose required contracts are frozen and whose write sets do not overlap. At most two writing subagents may work concurrently in a shared workspace. Read-only audits may run alongside them if they do not mutate state.
- For the current compact Timeline/navigation follow-up, use genuine overlap: reserve files, dispatch FE-32 and FE-33 as two disjoint writers **before waiting**, and perform root read-only review while they work. Neither touches shared `styles.css`; root owns INT-23 integration after both release their files. Do not serialize by immediately waiting after each spawn. See `docs/implementation/timeline-density-navigation.md` §4. Prior BE-27–BE-28, FE-30–FE-31, INT-22 source is preserved, not the new finish line.
- Reserve each file for one writer at a time, including shared styles, generated types, lockfiles, migrations, fixtures, snapshots, and tests. If a task needs an owned file, wait for its owner to finish and review before reassignment. When ownership or dependencies are uncertain, run tasks serially.
- Do not run concurrent commands that mutate the same database, seed state, generated artifacts, dependency installation, or test snapshots. Schema migrations, OpenAPI contract changes, seed/reset, and approval-transaction changes require serial integration and their packet's review gate.
- After a worker finishes, the root reviews its diff, resolves integration in the proper task scope, and marks the ID `dev_done` only when the intended implementation is present and coherent with shared contracts. Run static integration checks once at dependency boundaries and at the end, not the old test suite per packet. A failing build or broken contract must be repaired; lack of deferred E2E evidence is recorded as `QA pending`, not a development blocker.
- Stop and request a new senior/product decision only for an evidenced unsafe migration, security boundary failure, genuinely absent/contradictory contract, or action outside the authorized synthetic-local scope. A persistent goal does not authorize guessing, skipping safety review of code, or changing cloud resources.

## Architecture boundaries

- Frontend API types come from FastAPI OpenAPI.
- New frontend requests use `/api/v1` only.
- Backend domain and engine code cannot import FastAPI, SQLAlchemy, or ADK.
- ADK tools cannot write operational schedule data.
- Schedule changes happen only through the approval transaction.
- Do not add a Gantt library, second UI system, multi-agent architecture **inside the Ripple product**, Go backend, dark mode, upload, Alerts UI, or drag editing in MVP tasks. Coding subagents are allowed only under the orchestration rules above.

## Final response format

- Outcome.
- Files changed.
- Development checks actually run and results; list E2E/browser QA as deferred, not passed.
- Blocker, if any; otherwise state `development complete / QA pending`.
