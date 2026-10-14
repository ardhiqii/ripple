# Integration and Release Task Catalog

These tasks connect already-complete frontend and backend contracts. Do not use integration tasks to repair unfinished subsystem logic silently.

## INT-00: Contract generation pipeline

Model fit: Luna-safe  
Prerequisites: BE-00, FE-00  
Read: [implementation control sections 8 and 11](README.md#11-api-freeze)

Objective:

- Export FastAPI OpenAPI.
- Generate frontend TypeScript types.
- Add drift check to build or test command.

Allowed files:

- Backend OpenAPI export script
- Frontend generated API directory
- Package scripts and focused CI config

Acceptance:

- Backend field rename causes frontend type check failure until regenerated.
- Generated file contains a header forbidding manual edits.

## INT-01: Shared fixtures and MSW handlers

Model fit: Luna-safe  
Prerequisites: INT-00, BE-07  
Read: [product plan section 15](../product/product-build-plan.md#15-mock-first-strategy)

Objective:

- Produce schedule, readiness, event, error, and policy fixtures from generated types.
- Add MSW handlers using `/api/v1` only.

Acceptance:

- Type check catches fixture drift.
- 200, 409, 422, 500, and offline cases exist where relevant.

## INT-02: Plan and stream fixtures

Model fit: Luna-with-review  
Prerequisites: INT-00, BE-10, BE-12  
Read: [backend spec section 11](../engineering/backend-agentic-spec.md#11-sse-protocol), [interaction spec section 9](../design/uiux-interaction-spec.md#9-screen-4-decision-workspace-contract)

Objective:

- Add typed A-12 plan fixtures and recorded SSE sequence.
- Include conditional, infeasible, version conflict, numeric-check fallback, and stream-reconnect cases.

Acceptance:

- Recorded sequence uses strictly increasing IDs.
- Final plan fixture matches OpenAPI types.

## INT-03: A-12 base end-to-end

Model fit: strong review required  
Prerequisites: FE-07 through FE-11, BE-11 through BE-14  
Read: [proposal section 6.2](../product/ripple-proposal.md#62-walkthrough-the-a-12-request)

Objective:

- Connect paste, extraction, run, lever trace, option review, approval, timeline highlight, readiness change, and history.

Acceptance:

- D+3 is rejected as impossible.
- D+5 conditional plan requires test D+2 and cargo move.
- Approval moves A-12 and D-07 cargo atomically.
- History records exact applied changes.

## INT-04: A-12 constrained pair

Model fit: strong review required  
Prerequisites: INT-03  
Read: [technical plan scenario 1b](../engineering/technical-plan.md#65-expected-results-per-scenario)

Objective:

- Run same baseline with the test-bay-full sentence.
- Demonstrate extraction, lever set, solver path, and verdict differences.

Acceptance:

- Expedite lever is ruled out with source sentence.
- No recommendation earlier than D+9 is presented.
- Split comparison names every downstream difference.

## INT-05: D-07 disruption

Model fit: strong review required  
Prerequisites: INT-03  
Read: [technical plan scenario 2](../engineering/technical-plan.md#65-expected-results-per-scenario)

Objective:

- Connect vendor update, ETA range, seal risk, stale data, replan options, reply, and lineage.

Acceptance:

- Underlying disruption cannot be rejected as if it did not happen.
- Rejected option and reply produce a new linked plan version.

## INT-06: Failure-path integration

Model fit: Luna-with-review  
Prerequisites: INT-03  
Read: [product plan section 17](../product/product-build-plan.md#17-loading-empty-and-failure-states), [backend spec section 23](../engineering/backend-agentic-spec.md#23-reliability-and-recovery)

Objective:

- Verify model unavailable, SSE disconnect, solver infeasible, numeric mismatch, database error, stale approval, and reset failure.

Acceptance:

- No failure displays a false success.
- Partial trace remains inspectable.
- Recorded fallback can complete the judge scenario.

## INT-07: Accessibility and visual acceptance

Model fit: Luna-safe with human visual review  
Prerequisites: FE-14, INT-03 through INT-06  
Read: [interaction spec section 25](../design/uiux-interaction-spec.md#25-screen-level-acceptance-checklist)

Objective:

- Execute keyboard, focus, contrast, reduced-motion, sticky-layout, and viewport checks.

Acceptance:

- 1440x900, 1366x768, 1100x700, 768x1024, and 390x844 checked.
- No console errors.
- Timeline has an accessible agenda alternative on mobile.

## INT-08: Release candidate gate

Model fit: strong review required  
Prerequisites: all Must tasks  
Read: [product plan definition of done](../product/product-build-plan.md#24-definition-of-done), [backend definition of done](../engineering/backend-agentic-spec.md#33-backend-definition-of-done)

Objective:

- Run full frontend, backend, contract, agent smoke, solver golden, and E2E suites.
- Verify deployment configuration and public demo claims.

Acceptance:

- Production URL opens without login.
- Reset and recorded fallback work.
- A-12 pair and D-07 pass.
- No secrets or real company data exist in tracked files or history.
- UI uses approved claim language.

## INT-09: Dual-environment preview deployment scaffold

Model fit: Luna-safe with infrastructure review  
Prerequisites: INT-00, BE-00, FE-00  
Read: [implementation control sections 3, 4, and 11](README.md#3-frozen-stack-decisions)

Objective:

- Keep local development on Vite, FastAPI, and a local PostgreSQL container.
- Add a no-secret preview path using Vercel, a Docker-hosted FastAPI service, and Supabase PostgreSQL.
- Preserve `/api/v1`, the existing Docker boundary, and environment contracts needed for the later GCP target.
- Document provisioning, environment variables, migrations, verification, free-tier limits, and rollback.

Allowed files:

- Root deployment manifests and ignore rules
- `frontend/package.json`, `frontend/vite.config.ts`, `frontend/vercel.json`
- Frontend API URL helper, its tests, and existing API call sites
- Frontend environment example files
- Backend settings, CORS setup, database URL normalization, Alembic environment, and focused tests
- Backend Docker/startup files and environment example files
- This task catalog and preview deployment documentation

Acceptance:

- Local frontend requests remain same-origin `/api/v1` and proxy to the local backend.
- Preview frontend can target an explicit HTTPS API origin without changing feature code.
- Preview API accepts only configured Vercel origins and can connect/migrate through a Supabase pooler URL.
- No credentials or project-specific URLs are committed.
- Frontend build/tests and focused backend tests pass.

## Release blockers

Any one of these blocks release:

- Infeasible plan can be approved.
- Forbidden or ruled-out lever reaches solver.
- Approval can partially apply.
- Version conflict can be forced through.
- Numeric explanation disagrees with engine.
- Demo reset affects data outside selected scenario.
- Raw source text appears in normal logs.
- Main scenario requires manual database repair.
- Frontend and OpenAPI types drift.
