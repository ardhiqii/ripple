# Ripple Coding Agent Instructions

## Start here

Before implementation, read `docs/implementation/README.md` completely.

Work on exactly one task ID from:

- `docs/implementation/frontend-tasks.md`
- `docs/implementation/backend-tasks.md`
- `docs/implementation/integration-tasks.md`

If no task ID was assigned, do not choose a large feature independently. Ask for or propose one bounded ready task.

## Execution rules

- Read the full assigned task packet and only its linked specification sections.
- Treat frozen stack decisions and MVP feature flags as immutable.
- Stay inside the packet's Allowed files.
- Stop instead of guessing when a contract is absent or contradictory.
- Preserve unrelated user changes.
- Do not commit, push, deploy, or modify cloud resources unless explicitly requested.
- Run the packet's acceptance commands and report their actual results.

## Architecture boundaries

- Frontend API types come from FastAPI OpenAPI.
- New frontend requests use `/api/v1` only.
- Backend domain and engine code cannot import FastAPI, SQLAlchemy, or ADK.
- ADK tools cannot write operational schedule data.
- Schedule changes happen only through the approval transaction.
- Do not add a Gantt library, second UI system, multi-agent architecture, Go backend, dark mode, upload, Alerts UI, or drag editing in MVP tasks.

## Final response format

- Outcome.
- Files changed.
- Verification commands and results.
- Blocker or review requirement, if any.
