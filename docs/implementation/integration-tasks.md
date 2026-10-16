# Integration and Release Task Catalog

These tasks connect already-complete frontend and backend contracts. Do not use integration tasks to repair unfinished subsystem logic silently.

**Current development-first override (2026-10-16):** INT-10–INT-13 and INT-17–INT-19 belong to the present development goal. INT-14–INT-16 are **deferred E2E/browser/visual QA** and are not prerequisites for `development complete`. Do not create/update/run tests, Playwright, browser walkthroughs, or mandatory independent-review packets now; older `Acceptance:` test commands below are superseded by [README §4.8](README.md#48-development-first-acceptance-override-2026-10-16). Preserve existing tests/E2E artifacts. The root runs generated-contract/build/static checks once after integrating shared writers and records `QA pending`.

The INT-10–INT-13 and INT-17–INT-19 pass is historical `dev_done / QA pending`; the current screenshot-recovery goal uses INT-20–INT-21 below under the same no-tests override.

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

## INT-10: Productization contract freeze

- Model fit: strong-model/product review; docs-only planning task
- Product decision: approved 2026-10-14 for synthetic local/preview; implementation remains in downstream packets
- Prerequisites: existing MVP audit
- Read: [productization plan](productization-plan.md), [implementation control](README.md), and only the older specification sections affected by contradictions.

Allowed files: `docs/implementation/productization-plan.md`, the three task catalogs, `docs/implementation/README.md`, and exact contradictory sections of `docs/design/uiux-interaction-spec.md` or `docs/product/product-build-plan.md`. No application, migration, seed, or deployment files.

Objective: Record the approved source-of-truth, metric denominator, scenario epoch/context and deep-link, seed isolation, server filter/count, Ask answer/evidence, and approval conflict contracts. Remove or explicitly supersede stale unversioned `/api/...` references and MVP-off controls in sections used by new packets. Keep frozen stack/features unchanged. This packet freezes product choices; it does not mark downstream implementation complete or waive its prerequisites/reviews.

Acceptance: A reviewer can identify one API owner and one expected result for every rendered action; no contradictory endpoint/state names in linked sections; all new packets have bounded Allowed files and explicit acceptance; `git diff --check`. Do not implement features in this packet.

## INT-11: Scenario-aware API transport and query keys

- Model fit: Luna-with-review
- Prerequisites: INT-10, BE-18, BE-19, BE-20
- Read: [data ownership §3](productization-plan.md#3-canonical-context-entity-identity-and-data-ownership), [flow §7](productization-plan.md#7-flow-and-invalidation-matrix).

Allowed files: `frontend/src/api/url.ts`, `frontend/src/api/generated/**` (generator output only), a new shared typed API transport under `frontend/src/api/`, `frontend/src/app/query-client.ts`, a small scenario context provider under `frontend/src/app/`, focused API/context tests, and **only for generated-contract compatibility** these four existing files: `frontend/src/features/demo/demo-data.test.ts`, `frontend/src/features/history/history-fixtures.ts`, `frontend/src/mocks/fixtures.ts`, `frontend/src/routes/history.tsx`. No other route/component work or redesign.

Objective: Regenerate OpenAPI from the approved backend, then build one request path for generated-type `/api/v1` calls carrying the active allowlisted `X-Scenario-ID`, normalized errors, and stable scenario-prefixed query keys. SSE and mutations must use the same scenario context. Do not expose a selector yet; default scenario still works. Because BE-19/BE-20 added required response fields, update the four compatibility files above to supply truthful, schema-valid synthetic values: demo `reset_allowed`/`scenario_start_date`; decision/event/readiness `total_count`; event `scenario_lifecycle_counts`; decision-detail event/job/plan metadata; and the History empty-list fallback. Keep counts consistent with the fixture's full filtered result and lifecycle states; keep decision-detail links consistent with existing fixture context. Do not cast away types, weaken generated schemas, fabricate live API responses, change History behavior, or migrate API consumers here (INT-12/FE-22 own those changes).

Acceptance: `npm run api:check` passes; the four compatibility files compile against the regenerated types without `as any`/schema relaxation; fixture counts/links and History empty state have focused assertions; header present on GET/PATCH/POST/SSE requests; changing scenario cannot reuse another scenario cache; unknown scenario is surfaced; local same-origin and preview API-origin configurations both work; `npm run build`, `npm run lint`, focused tests. Root reviews this bounded contract bridge before marking INT-11 done. INT-12/INT-13 and FE-17–FE-25 remain dependent on INT-11; no writing agent may own any of these four files concurrently with INT-11.

## INT-12: Migrate existing API consumers to shared transport

- Model fit: Luna-with-review
- Prerequisites: INT-11
- Read: [read ownership §3.2](productization-plan.md#32-read-ownership), [flow §7](productization-plan.md#7-flow-and-invalidation-matrix).

Allowed files: existing `frontend/src/features/history/history-api.ts`, `frontend/src/features/policy/policy-api.ts`, `frontend/src/features/demo/demo-api.ts`, `frontend/src/features/plans/plan-mutations.ts`, `frontend/src/api/agent-runs.ts`, `frontend/src/components/changes/change-inbox.tsx`, `frontend/src/components/changes/new-change-sheet.tsx`, `frontend/src/components/agent/ripple-panel.tsx`, and focused tests. Split before coding if an additional production file is needed.

Objective: Replace direct API fetch paths with the shared scenario-aware transport without changing UI business behavior yet. Preserve idempotency and SSE reconnect. Do not add new endpoint contracts or use a different base URL mechanism.

Acceptance: All in-scope calls carry scenario context; no `/api` unversioned endpoint; existing tests pass; `npm run build`, `npm run lint`, focused tests.

## INT-13: Scenario URL continuity and synthetic selector

- Model fit: Luna-with-review
- Prerequisites: INT-12, BE-18
- Read: [scenario context §3.1](productization-plan.md#31-context), [shell §6.1](productization-plan.md#61-global-shell-and-command-search), [Demo §6.8](productization-plan.md#68-ripple-panel-and-demo-lab).

Allowed files: `frontend/src/routes/__root.tsx`, `frontend/src/routes/search-schemas.ts`, `frontend/src/components/shell/global-header.tsx`, `frontend/src/components/shell/app-shell.tsx`, `frontend/src/app/**`, and focused route/shell tests. Split route-file edits into a follow-up packet if eight production files are exceeded.

Objective: Use backend-available synthetic scenarios for an Environment selector; validate the root `scenario` search param and retain it with TanStack Router `retainSearchParams`; inject it into shared transport; clear prior scenario caches and page-specific entity selection on switch. Do not permit arbitrary scenario strings or switch while an unsaved draft would be lost without confirmation.

Acceptance: Shared deep link opens the correct synthetic scenario in a fresh session; no cross-scenario entity appears; A-12 golden and fleet-scale remain isolated; back/forward and mobile menu work; `npm run build`, `npm run lint`, focused router tests.

## INT-14: Local E2E harness and seed smoke

- Model fit: Luna-safe with infrastructure review
- Prerequisites: INT-19 development handoff; this packet starts only in the later user-requested QA phase
- Read: [flow §7](productization-plan.md#7-flow-and-invalidation-matrix), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract), [verification §9](productization-plan.md#9-verification-gates).

Allowed files: `frontend/package.json`, `frontend/package-lock.json`, `frontend/playwright.config.ts` (new), `frontend/e2e/**` (new), E2E-only test helpers, and `docs/implementation/productization-plan.md` for exact run commands. No application production files. `@playwright/test` is the only approved new dev dependency in this packet; lock its version.

Objective: Add a reproducible browser E2E harness against local Vite + FastAPI + PostgreSQL with deterministic seed, one read-only Timeline→Readiness→Changes navigation smoke, and a documented start/stop/cleanup sequence. Do not use MSW as the E2E data source. Do not implement product fixes in this packet.

Deferred QA acceptance: `npm run test:e2e` runs the real local-API/PostgreSQL navigation smoke reproducibly; no cloud credentials or public preview writes are required. Report the actual E2E/browser result, not unit/component/API test counts.

## INT-15: Persisted cross-page E2E and seed replay

- Model fit: Luna-with-review and independent read-only verification for the synthetic local candidate
- Prerequisites: INT-14
- Read: [flow §7](productization-plan.md#7-flow-and-invalidation-matrix), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract), [verification §9](productization-plan.md#9-verification-gates).

Allowed files: `frontend/e2e/**` and E2E-only helpers. No new backend unit/API/contract test files and no production behavior changes; report bugs as bounded owning-packet follow-ups.

Objective: Cover search/filter/metrics; readiness write; event → extraction → run → plan → decision → schedule/history; direct links; pagination; scenario switch; reset/replay and isolation; 404/409/provider failure. Use real local services and deterministic synthetic data.

Deferred QA acceptance: Mutate → hard refresh → follow cross-page links → verify same IDs/versions → reset → exact baseline passes through real local services. A-12 golden and fleet-scale paths run; a second scenario remains untouched by reset. Exercise maintenance conflict/infeasibility and decision-time History immutability. Record E2E/browser evidence and actual outcomes; do not expand into unit/component/API test authoring.

## INT-16: Visual, accessibility, and preview truth gate

- Model fit: Luna-safe checks with senior visual/release review
- Prerequisites: INT-15
- Read: [visual system §5](productization-plan.md#5-shared-ui-system-and-layout), [screen contracts §6](productization-plan.md#6-screen-contracts), [verification §9](productization-plan.md#9-verification-gates).

Allowed files: focused frontend style/component/test files where a verified issue exists; visual snapshots and QA report under `docs/implementation/`. No cloud changes or new features. Split each discovered fix into its own bounded task if it exceeds eight production files.

Objective: Verify five documented viewports, sticky Timeline regions, nav decoration, selected versus focus, meaningful color/status, overlay focus return, reduced motion, empty/error, and no fake/dead action. Verify maintenance/unavailable labels and conflicting bookings against real local API data. For the **local candidate** gate, record public URL status as `not audited` unless it is proven to serve this exact build; public preview audit is a separate deployed-preview gate, not a local completion prerequisite. Do not deploy in this packet.

Deferred QA acceptance: 1440×900, 1366×768, 1100×700, 768×1024, 390×844 checked in the browser against the updated local API; keyboard and contrast checks; no console errors or content hidden behind sticky elements; UI labels synthetic/recorded truthfully. Record screenshot/release-claim findings. Do not call the public preview verified without a current-build audit; no unit/component test gate is added.

## INT-17: Generated OpenAPI type fidelity and compatibility

- Model fit: Luna-with-independent contract review
- Prerequisites: BE-20, BE-22, BE-23, BE-24
- Read: [approved contract repair §3.5](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15), [read models §3.4](productization-plan.md#34-frozen-openapi-read-model-target).

Allowed files: `backend/scripts/export_openapi.py`, new focused generator tests under `backend/tests/contract/`, `frontend/src/api/generated/**` (generator output only), `frontend/src/api/contract-compatibility.test.ts`, focused API type tests, and the known generated-contract fixtures `frontend/src/features/history/history-fixtures.ts` and `frontend/src/mocks/fixtures.ts` for schema-valid `event_cause`/`context_status` and Schedule `unavailability` values only. No hand-edited generated output, backend response-shape redesign, or route/component redesign. If the corrected generated types expose errors in other consumers, root records the exact compiler paths and adds only those exact paths to this packet's compatibility substep after read-only review; at most eight production files, no unsafe casts or behavior changes. Do not let the worker expand ownership on its own.

Objective: Regenerate from approved FastAPI OpenAPI after the backend contract changes. Correct nullable `anyOf`/`oneOf` generation so `T | null` remains typed, without `unknown` absorbing the union; preserve object references, required/optional distinctions, and stable output. Make existing consumers compile against the stricter generated types without weakening backend schemas or inventing data. The Schedule `unavailability` array and Decision `event_cause`/`context_status` fields are required response contract checks, not optional frontend guesses.

Acceptance: Generator unit tests cover nullable reference, primitive, nested object, enum, array, and optional versus required properties; generated output is deterministic; `npm run api:check`, `npm run build`, `npm run lint`, focused frontend type/API tests, `uv run ruff check .`, `uv run pyright`, focused backend generator tests. Independent reviewer checks representative generated fields and exact compatibility changes before `done`; generated-output ownership is exclusive.

## INT-18: Local/preview startup profile and seed installation

- Model fit: Luna-with-infrastructure review
- Prerequisites: BE-18, BE-22, BE-24
- Read: [seed/reset §8](productization-plan.md#8-seed-blueprint-and-reset-contract), [preview boundary §3.5](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15), [preview deployment](preview-deployment.md).

Allowed files: `backend/scripts/start_preview.sh`, `backend/scripts/seed_preview.py` **only for the explicit install-if-missing CLI mode**, `render.yaml` **configuration only**, `docs/implementation/preview-deployment.md`, and focused startup/seed tests under `backend/tests/seed/`. No cloud API calls, credentials, or application service/route changes. Treat the seed CLI and `render.yaml` as shared files with one writer; BE-22/BE-24 seed work must finish first.

Objective: Add `--install-if-missing` to the seed CLI for startup use only; require `--scenario`, make it mutually exclusive with `--verify`/`--reset`, check for the selected scenario's schedule-state row, install and verify the entire seed only when absent, and return an explicit `skipped_existing` result when present without altering rows or requiring baseline checksum. Keep the existing explicit `--verify` strict and `--reset` destructive/guarded. Make startup invoke `--scenario A-12-base --install-if-missing` and `--scenario fleet-scale --install-if-missing` after migrations, never silently overwriting an edited scenario. Make the checked-in Render profile `preview` rather than `staging` so the advertised synthetic scenario allowlist matches the preview contract. Keep one-instance preview caveat; no deployment or secret changes.

Acceptance: Shell/startup test checks both explicit scenario arguments, `--install-if-missing`, and fail-fast behavior; local isolated database test starts twice, then edits a scenario and restarts without losing the edit or failing its checksum; missing scenario installs and verifies a complete graph; strict `--verify` still detects drift and guarded `--reset` still restores baseline; preview profile exposes both allowlisted synthetic scenarios while production guard stays closed; `uv run ruff check .`, focused seed/startup tests. Independent infrastructure reviewer signs off configuration diff. This task makes a deployable artifact, not a deployed/publicly audited preview.

## INT-19: Development integration and UI/UX coherence handoff

- Model fit: root-owned integration; bounded workers repair their owning packets, not a single broad writer
- Prerequisites: FE-15–FE-25, BE-16–BE-24, INT-10–INT-13, INT-17–INT-18 are `dev_done` or have a concrete integration repair assigned
- Read: [development override](README.md#48-development-first-acceptance-override-2026-10-16), [screen contracts §6](productization-plan.md#6-screen-contracts), [flow matrix §7](productization-plan.md#7-flow-and-invalidation-matrix), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `docs/implementation/productization-plan.md` only for the final development handoff and exact bounded file-scope amendments. No new test, snapshot, E2E, browser, cloud, or blanket production-file edits. Repairs go through the responsible FE/BE/INT packet with one writer per file.

Objective: Integrate the current implementation as one coherent synthetic-data app. Review route/navigation and shared scenario state; Timeline, Readiness, Changes, Decision, History, Policy, Ask, and Demo handoffs; real `/api/v1` IDs and action ownership; UI token/spacing/typography/status consistency and responsive states in source; generated API shapes; rich deterministic seed/reset and startup mode. Remove dead controls, fixture fallbacks in live paths, and obviously inconsistent loading/error/empty states within owning packets. Keep existing tests untouched. Record a concise QA handoff with known unverified behavior; do not claim E2E or visual-browser verification.

Development acceptance: All scoped packets have integrated code and no known compile/type/static failure; root inspects high-risk code and reserves serial ownership for any fix. Run only `npm run api:check`, frontend build/lint, backend Ruff/Pyright, and `git diff --check` after shared writers finish. List actual outcomes and any unresolved risk. Mark `development complete / QA pending` only when all present-phase IDs are `dev_done`; INT-14–INT-16 and browser walkthrough remain deferred to the next user-requested QA goal.

## INT-20: Synthetic fleet landing and scenario continuity

- Model fit: Luna-with-root routing review
- Prerequisites: INT-13, INT-19; backend metadata already advertises allowed scenarios. This packet freezes the UI default before FE-26–FE-29, and does not change backend omitted-header default.
- Read: [preview UX §2](preview-ux-recovery.md#2-product-and-data-contract), [shared flow §4.5](preview-ux-recovery.md#45-shared-cross-page-flow), [existing shell §6.1](productization-plan.md#61-global-shell-and-command-search).

Allowed files: `frontend/src/routes/__root.tsx`, `frontend/src/app/scenario-context.tsx`, `frontend/src/app/scenario-metadata.ts`, `frontend/src/components/shell/global-header.tsx`, `frontend/src/components/shell/app-shell.tsx`, `frontend/src/routes/search-schemas.ts`, and `frontend/src/api/transport.ts` only if the UI default cannot be expressed without it. No page-specific Timeline/Readiness/Changes/History files, global styles, backend, generated types, or tests. Reserve shell/search/schema files exclusively. If route-generation output changes, root performs it serially after this worker finishes.

Objective: With no explicit URL scenario, select advertised `fleet-scale` in local/preview, immediately canonicalize URL context, and preserve that scenario through top nav, command search, Environment/Demo links, entity deep links, refresh and back/forward. Explicit A-12 and unknown IDs retain their established behavior. Distinguish active scenario and `Synthetic data` visibly; scenario switch clears old cache/selection and protects dirty drafts. Backend default header remains A-12. Do not hide the choice in localStorage or force fleet-scale when backend does not advertise it.

Development handoff: Root checks URL/header/query-key continuity and no cross-scenario fallback in source. No tests/browser now; static build after dependent page work integrates.

## INT-21: Preview UX recovery integration

- Model fit: root-owned cross-page integration; any code repair assigned to the owning FE/BE/INT packet with exclusive file ownership
- Prerequisites: BE-25, BE-26, INT-20, FE-26–FE-29 all `dev_done` or exact repair assigned
- Read: [preview UX recovery](preview-ux-recovery.md), [development override](README.md#48-development-first-acceptance-override-2026-10-16), [flow/invalidation §7](productization-plan.md#7-flow-and-invalidation-matrix).

Allowed files: `docs/implementation/productization-plan.md` for the new handoff ledger; `frontend/src/styles.css` and `frontend/src/styles/globals.css` only for **small** shared token/layout consistency corrections after all page writers finish. No blanket rewriting of page/backend files, test code, seed reset, browser, deployment, or cloud mutation. An exact integration defect returns to the owning packet under README §4.7 and gets one writer.

Objective: Verify in source that dense fleet is the default synthetic experience and A-12 remains explicit; connect Timeline, Readiness, Changes, plan, and History via scenario-retaining canonical IDs; confirm no stalled extraction or raw-float/UUID-first UI; review status/metric semantics, scope labels, loading/error/empty states, two-axis scroll/sticky legend implementation, seed v2/reset safety, and shared design-system cohesion. Trace both §4.5 rehearsals at source level. Keep Ask read-only and approval the sole schedule write. Document known QA risks without claiming browser or E2E validation.

Development acceptance: Root reviews each writer diff, runs only `npm run api:check`, frontend `npm run build`/`npm run lint`, backend `uv run ruff check .`/`uv run pyright`, and `git diff --check` **after** writer completion; repair concrete static failures with exclusive ownership. Do not run test suites, reset an existing database, or use the browser in this phase. Mark `development complete / QA pending` only when every newly scoped ID is integrated.

## INT-22: Timeline semantics and Gemini local-preview integration

- Model fit: root-owned integration after file reservations are released
- Prerequisites: BE-27, BE-28, FE-30, FE-31 `dev_done`, or an exact bounded repair assigned to the owning task. Read [follow-up contract](timeline-gemini-followup.md), [development override](README.md#48-development-first-acceptance-override-2026-10-16), and [cross-page flow](preview-ux-recovery.md#45-shared-cross-page-flow).

Allowed files: `docs/implementation/productization-plan.md` for factual handoff and scoped file-owner amendments; `docs/implementation/preview-deployment.md` for secret-name-only configuration clarification. No blanket edits to implementation, tests, database, or cloud. Concrete code defects return to one owning FE/BE task with exclusive file ownership.

Objective: Review integrated source from API schedule/seed to Timeline lanes/legend/navigation and event extraction gateway. Check seed-version truthfulness, no fabricated vendor, valid concurrency versus actual conflict, resource/sticky row alignment, Today/month/year/range state, scene-preserving links, Gemini local/preview opt-in and production Vertex guard, no key exposure, and approval as the only schedule write. Root owns static/build gate after both writers finish, not a browser/test/deployment pass. Record exact unverified E2E items and a non-destructive procedure for the later disposable-scenario replay.

Development acceptance: root reviews diffs and runs only `npm run api:check`, frontend `npm run build`/`npm run lint`, backend `uv run ruff check .`/`uv run pyright`, and `git diff --check` once relevant writers finish. No unit/API/component/E2E/browser/live-model test, database reset/replay, commit, push, deploy, or cloud mutation. Mark `development complete / E2E-browser QA pending` only after all five IDs are integrated; report actual static results and residual risks honestly.

## INT-23: Compact Timeline and horizon integration

- Model fit: root-owned integration after FE-32 and FE-33 release file reservations
- Prerequisites: FE-32 and FE-33 `dev_done` or exact bounded repair assigned; read [density/navigation contract](timeline-density-navigation.md), [development override](README.md#48-development-first-acceptance-override-2026-10-16), and [Timeline UI contract](../design/uiux-interaction-spec.md#6-screen-1-fleet-timeline-contract).

Allowed files: `frontend/src/styles.css` **only** for small shared Timeline/toolbar/sticky specificity and z-index integration, `docs/implementation/productization-plan.md` for a factual handoff/owner amendment. An exact interface mismatch returns to FE-32 or FE-33 with one released file owner; root does not blanket-rewrite both tasks. No test, browser, backend, API schema, seed, dependency, `.env`, deploy, or cloud write.

Objective: Source-trace selected period → buffered `/schedule` request → date canvas → resource/exception markers → metric denominator → URL/history → inspector. Confirm baseline rows remain compact, real concurrency is disclosed, weather is location context, conflicts are exact overflow days, controls are readable at 1366px, and horizontal pan can cross months without a snap. Review focus/hover/tap marker detail and sticky rail/header/legend layering. Reconcile component-scoped CSS with existing shared selectors without changing the rest of the design system. Record what remains for later browser E2E/visual QA; do not call screenshot appearance verified without a browser check.

Development acceptance: root reviews both diffs, runs `npm run api:check`, frontend `npm run build`/`npm run lint`, and `git diff --check` only after writer completion; backend static checks only if an exact backend repair occurred. No test suite, browser, DB reset, model call, commit, push, deploy, or cloud mutation. Mark `development complete / E2E-browser QA pending` when source and static checks are coherent; report actual results and unverified visual risks.

## INT-24: Issue/weather clarity integration

- Model fit: root-owned integration after FE-34 and FE-35 release their disjoint file reservations.
- Prerequisites: FE-34 and FE-35 `dev_done` or exact bounded repair assigned. Read [issue-clarity contract](timeline-issue-clarity.md), [development override](README.md#48-development-first-acceptance-override-2026-10-16), and [Timeline color rules](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/styles.css` **only** for scoped Timeline legend/overlay/sticky specificity if component CSS cannot solve a real collision; `docs/implementation/productization-plan.md` **only** for a factual handoff or exact file-owner amendment. Component repairs return to FE-34 or FE-35 after their file ownership is released; never edit both owners' files concurrently. No backend, API schema, seed, `.env`, generated types, dependencies, tests, browser, database, cloud, commit, push or deploy.

Objective: Source-trace weather `go` → header no-go marker; explicit unavailability and exact capacity `conflictDays` → resource × day tint/badge → tooltip/detail/job inspector; marker/legend semantics → design tokens and responsive sticky geometry. Confirm 16–17 Oct multi-issue example, priority/count, no routine-weather icon parade, no whole-fleet shading from one resource issue, no native `title` duplicate, no badge/date shift, no row-height regression, no hidden booking/pan/selection regression. At least inspect 2-week/Month, month boundary, multi-location weather, normal/empty rows and mobile agenda in source. Report browser visual QA pending; do not claim screenshots were verified by code inspection.

Development acceptance: after both workers finish, root reviews diffs and runs `npm run api:check`, frontend `npm run build`/`npm run lint`, and `git diff --check`; no test suite or browser walkthrough under README §4.8. If one exact compiler-required file outside the packets is necessary, use README's bounded scope-repair protocol with a single writer and document the amendment. Mark this development pass complete only when the static checks pass and the source contract is coherent; remain `E2E/browser QA pending`.

## INT-25: Timeline grid annotation and overflow integration

- Model fit: root-owned integration after FE-36, FE-37 and FE-38 release file reservations.
- Prerequisites: FE-36 → FE-37 and parallel FE-38 `dev_done` or an exact bounded repair assigned. Read [grid-annotation contract](timeline-grid-annotation-pass.md), [development override](README.md#48-development-first-acceptance-override-2026-10-16), and [Timeline design tokens](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/styles.css` **only** for a small, scoped `.unified .timeline-density` / calendar-header / legend specificity repair that component CSS cannot safely solve; `docs/implementation/productization-plan.md` **only** for factual handoff or an exact owner amendment. Component repair returns serially to FE-36, FE-37 or FE-38 under exclusive ownership. No broad CSS cleanup, API/backend/seed/generated types/dependencies, `.env`, test, browser, DB, model call, cloud, commit, push or deploy.

Objective: Source-trace explicit resource issues and precise conflict days → full resource-day tint and inset annotation, hidden booking per-day layout → line segments and sticky-rail count → reversible expanded row, and `go=false` weather → third-row date marker. Check issue+hidden same-day coexistence, selected-period count versus buffered canvas, no false conflict, no false weather capacity impact, booking selection/inspector, mouse/touch/keyboard pan, date/header/grid alignment across 2-week/Month and month boundary, sticky rail/header/legend z-index and no clipped actions. Confirm no old floating `+N bookings` or overhanging issue icons remain. Ensure FE-38 legend visually and verbally matches final encodings. Browser visual QA remains pending; source inspection alone cannot mark screenshots passed.

Development acceptance: root reviews each worker diff, applies only needed serial file-owner repairs, and after all writers finish runs `npm run api:check`, frontend `npm run build`, `npm run lint`, and `git diff --check`. Record actual results and remaining QA, with no test suite/browser walkthrough in this development phase. Mark development complete only when code paths are coherent and static checks pass; do not claim production/E2E verification.

## INT-26: Centered Timeline lanes and contextual-preview integration

- Model fit: root-owned integration after FE-39, FE-40 and FE-41 release all exclusive files.
- Prerequisites: FE-39 → FE-40 and parallel FE-41 `dev_done` or an exact bounded repair assigned. Read [centered-lanes contract](timeline-centered-lanes.md), [development override](README.md#48-development-first-acceptance-override-2026-10-16) and [Timeline design tokens](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/styles.css` **only** for a small, unavoidable Timeline-scoped sticky/header/overlay specificity repair; `docs/implementation/productization-plan.md` **only** for factual handoff or exact owner amendment. Component defects return to FE-39, FE-40 or FE-41 under a single exclusive writer. No broad CSS cleanup, API/backend/seed/generated types/dependencies, `.env`, test, browser, DB, model call, cloud, commit, push or deploy.

Objective: Source-trace whole booking IDs → stable compact lanes → full-range clickable hidden-booking band → expansion/inspector; explicit maintenance/unavailable and exact conflict days → tinted resource cells/top run marker → rich hover/focus preview → full click detail/job; `go=false` → only the relevant date-header tint/detail; then confirm legend, keyboard/touch/pan and layering match. Check selected job visibility, ID/count/date truth, issue-set changes, mixed issues with a hidden booking on the same day, no clipped floating surfaces, no blocked booking click, no false capacity conflict/weather unavailability, resource/track equal heights, 2-week/Month/month-boundary alignment and mobile agenda continuity. Source review cannot claim screenshot visual QA passed.

Development acceptance: root reviews every worker diff, returns component repairs serially to the owning ID, then runs `npm run api:check`, frontend `npm run build`, `npm run lint`, and `git diff --check` only after all writers finish. Report actual results and `browser/E2E QA pending`; do not run or write test suites in this development pass. Finish only when the source contracts and static checks are coherent.

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
