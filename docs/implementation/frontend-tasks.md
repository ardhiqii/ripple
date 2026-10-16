# Frontend Task Catalog

Each task is deliberately bounded for a small coding model. Complete tasks in dependency order. Do not merge task scopes.

**Current development-first override (2026-10-16):** For FE-15–FE-25, implement the Objective and required UI/UX states, but do not create, update, or run unit/component/route test code or perform browser checks now. Older `Acceptance:` test commands below are deferred to the later QA goal under [README §4.8](README.md#48-development-first-acceptance-override-2026-10-16). The root checks integrated code, generated types, build/lint once at dependency boundaries; mark `dev_done / QA pending`, not E2E-verified. Preserve existing test files. FE-00–FE-14 are historical packets, not a reason to restart the frontend from scratch.

The FE-15–FE-25 pass is historical `dev_done / QA pending`; the current screenshot-recovery goal uses FE-26–FE-29 below under the same no-tests override.

## FE-00: Frontend foundation dependencies

Model fit: Luna-safe  
Prerequisites: current Vite prototype builds  
Read: [implementation control](README.md), [design system sections 2-4](../design/design-system.md)

Allowed files:

- `frontend/package.json`
- Frontend lockfile
- `frontend/vite.config.ts`
- `frontend/tsconfig*.json`
- `frontend/components.json`
- `frontend/src/styles/globals.css`
- `frontend/src/styles/tokens.css`

Objective:

- Add Tailwind CSS v4 through the Vite-supported setup.
- Initialize shadcn with CSS variables.
- Add TanStack Router, Query, Table, React Hook Form, Zod, MSW, and required test packages.
- Bridge existing design tokens without changing the current timeline appearance.

Forbidden:

- No route or component rewrite.
- No color redesign.
- No UI library besides shadcn/Radix behavior dependencies.

Acceptance:

- `npm run build`
- `npm run lint`
- Existing timeline renders without visual regression.

## FE-01: Customized primitive baseline

Model fit: Luna-safe  
Prerequisites: FE-00  
Read: [design system sections 5-8](../design/design-system.md), [product plan section 11](../product/product-build-plan.md#11-design-system-implementation-with-tailwind-and-shadcn)

Allowed files:

- `frontend/src/components/ui/**`
- `frontend/src/lib/cn.ts`
- `frontend/src/styles/tokens.css`
- Focused component tests

Objective:

- Add and skin Button, Input, Textarea, Label, Badge, Tooltip, Sheet, Dialog, AlertDialog, Tabs, Skeleton, Separator, ScrollArea, and Sonner.
- Implement consistent control heights, radii, focus ring, disabled state, and active feedback.

Forbidden:

- No page composition.
- No default shadcn colors left unreviewed.
- No raw hex colors in components.

Acceptance:

- Component tests cover primary, secondary, destructive, disabled, focus, and loading button states.
- `npm run build`

## FE-02: Providers and typed router

Model fit: Luna-safe  
Prerequisites: FE-00  
Read: [product plan sections 5 and 10](../product/product-build-plan.md#5-information-architecture), [interaction spec section 3](../design/uiux-interaction-spec.md#3-route-and-page-ownership)

Allowed files:

- `frontend/src/app/**`
- `frontend/src/routes/**`
- `frontend/src/main.tsx`

Objective:

- Add TanStack Router and Query providers.
- Create typed route shells for all MVP routes.
- Add validated search schemas for Timeline, Readiness, Changes, Decision, History, Demo, and Policy.
- Keep unfinished routes as explicit development placeholders without fake functionality.

Forbidden:

- No data fetching beyond provider setup.
- No Alerts route in MVP navigation.

Acceptance:

- Direct navigation and refresh work on every MVP route.
- Invalid search params fall back safely.
- `npm run build`

## FE-03: Global application shell

Model fit: Luna-safe  
Prerequisites: FE-01, FE-02  
Read: [product plan section 6](../product/product-build-plan.md#6-global-application-shell), [interaction spec section 4](../design/uiux-interaction-spec.md#4-global-shell-interaction-contract)

Allowed files:

- `frontend/src/components/shell/**`
- Root route layout
- Shell tests

Objective:

- Implement 56 px fixed global header.
- Add Timeline, Readiness, Changes, and History primary navigation.
- Add command, Ask Ripple, demo reset trigger slot, and environment menu.
- Preserve maximum width for timeline workspace.

Forbidden:

- No persistent global sidebar.
- No dark mode toggle.
- No Alerts page link; alert icon may remain feature-gated and hidden.

Acceptance:

- Navigation is one line at 1366 px.
- Keyboard focus order is correct.
- Active route state is visible without relying only on color.

## FE-04: Timeline component decomposition

Model fit: Luna-with-review  
Prerequisites: FE-03  
Read: [interaction spec section 6](../design/uiux-interaction-spec.md#6-screen-1-fleet-timeline-contract), [design system section 9](../design/design-system.md#9-timeline-specific-rules)

Allowed files:

- Existing Timeline route and styles
- `frontend/src/components/timeline/**`
- `frontend/src/features/schedule/**`
- Timeline tests

Objective:

- Refactor current unified timeline into documented domain components.
- Preserve sticky calendar, resource rail, group headers, bottom legend, and semantic block treatments.
- Move filter and selection state into typed route search.

Forbidden:

- No visual redesign.
- No drag-and-drop.
- No API wiring beyond fixture adapter.

Acceptance:

- Existing visual baseline remains recognizable.
- Deep-linked job selection restores inspector state.
- Sticky behavior passes at 1366x768 and 1100x700.
- Unit tests cover day positioning and block width.

## FE-05: Job inspector and cross-page handoff

Model fit: Luna-safe  
Prerequisites: FE-04  
Read: [interaction spec sections 5 and 6.5](../design/uiux-interaction-spec.md#5-cross-page-transition-matrix)

Allowed files:

- `frontend/src/components/timeline/JobInspector*`
- Timeline route selection adapter
- Navigation tests

Objective:

- Add Open readiness, Ask Ripple, Submit change, View decision, Copy link, and Close actions.
- Pass exact job, resource, date, and schedule-version context.

Forbidden:

- No agent or readiness implementation.
- No local duplicate job cache.

Acceptance:

- Every action navigates or emits the documented context.
- Closing restores focus to the selected timeline block.

## FE-06: Readiness Board

Model fit: Luna-with-review  
Prerequisites: FE-01, FE-02, INT-01 fixtures  
Read: [interaction spec section 7](../design/uiux-interaction-spec.md#7-screen-2-readiness-board-contract)

Allowed files:

- Readiness route
- `frontend/src/components/readiness/**`
- `frontend/src/features/readiness/**`
- Readiness tests

Objective:

- Build filters, grouping, table, summary metrics, and item detail sheet.
- Keep slack, freshness, and confidence semantically separate.
- Implement optimistic status tick with rollback through the existing mutation contract.

Forbidden:

- No file upload.
- No Alerts navigation.
- No invented API response fields.

Acceptance:

- Filters survive refresh.
- Checkbox rolls back on mocked 409 or 500.
- Proposed update is visually distinct from current value.

## FE-07: Change Inbox and text intake

Model fit: Luna-safe  
Prerequisites: FE-01, FE-02, INT-01 fixtures  
Read: [interaction spec section 8](../design/uiux-interaction-spec.md#8-screen-3-change-inbox-contract)

Allowed files:

- Changes routes
- `frontend/src/components/changes/**`
- `frontend/src/features/events/**`
- Event tests

Objective:

- Build event list, state-based next actions, preview, new-change sheet, and extraction review.
- Support pasted text and sample scenarios only.
- Support extraction correction through generated API types.

Forbidden:

- No file input.
- No local-only audited actions.
- No saved views.

Acceptance:

- Every event state maps to one primary next action.
- Draft input is protected by navigation guard.
- Failed extraction cannot reach plan review.

## FE-08: Agent run client and shared registry

Model fit: Luna-with-review  
Prerequisites: FE-02, BE-08 contract or recorded fixture  
Read: [interaction spec sections 8.3-8.6 and 17.4](../design/uiux-interaction-spec.md#83-agent-state-machine), [backend spec section 11](../engineering/backend-agentic-spec.md#11-sse-protocol)

Allowed files:

- `frontend/src/features/agent/**`
- `frontend/src/api/**`
- Provider addition for run registry
- Stream reducer tests

Objective:

- Create run through POST.
- Stream through resumable GET SSE.
- Persist active-run discoverability across route navigation.
- Reconnect using sequence ID.
- Normalize error and completion states.

Forbidden:

- No fake typing.
- No chain-of-thought rendering.
- No run cancellation UI.

Acceptance:

- Reducer handles ordered, duplicate, missed, error, reconnect, and done events.
- Closing panel does not cancel run.

## FE-09: Contextual Ripple panel

Model fit: Luna-safe  
Prerequisites: FE-03, FE-08  
Read: [interaction spec sections 4.3 and 8](../design/uiux-interaction-spec.md#43-ripplepanel)

Allowed files:

- `frontend/src/components/agent/**`
- Shell-level panel mount
- Panel tests

Objective:

- Implement Ask and Submit Change modes.
- Render context chips, composer, live trace, errors, and plan-ready handoff.
- Keep panel mounted across route navigation.

Forbidden:

- No generic floating bubble.
- No Reply mode outside an existing plan.
- No file attachment.

Acceptance:

- Mode and context are always visible.
- Removing a context chip changes submitted payload.
- Panel works as overlay at 1366 px.

## FE-10: Decision Workspace review state

Model fit: Luna-with-review  
Prerequisites: FE-08, INT-02 plan fixture  
Read: [interaction spec sections 9.1-9.6](../design/uiux-interaction-spec.md#9-screen-4-decision-workspace-contract)

Allowed files:

- Decision routes
- `frontend/src/components/decision/**`
- `frontend/src/features/plans/**`
- Decision selection tests

Objective:

- Build event rail, plan options, compare table, schedule diff, conditions, trace, explanations, and evidence.
- Keep selected option state owned by route composition.

Forbidden:

- No approve/reject/reply mutations yet.
- No local child-selected option states.

Acceptance:

- Cards, compare, diff, conditions, and evidence follow one selected option.
- Infeasible option cannot enter approval state.

## FE-11: Decision mutations and concurrency UI

Model fit: strong review required  
Prerequisites: FE-10, BE-10  
Read: [interaction spec sections 9.7-9.9](../design/uiux-interaction-spec.md#97-approval-interaction-contract), [backend spec section 17](../engineering/backend-agentic-spec.md#17-approval-transaction)

Allowed files:

- Decision action components
- Plan mutation hooks
- Version conflict tests

Objective:

- Wire approve, reject, and reply/replan.
- Require condition acknowledgement.
- Handle 409 schedule-version conflict without force apply.
- Invalidate exact queries and carry changed-object highlight context.

Forbidden:

- No optimistic approval.
- No force apply.
- No silent retry of approval.

Acceptance:

- Duplicate click sends one request.
- Approval success invalidates all documented domains.
- 409 preserves review state and offers recompute.

## FE-12: History and minimal Policy view

Model fit: Luna-safe  
Prerequisites: FE-02, BE-11  
Read: [interaction spec sections 10 and 12](../design/uiux-interaction-spec.md#10-screen-5-decision-history-contract)

Allowed files:

- History and Policy routes
- History, audit, and policy components
- Relevant feature folders and tests

Objective:

- Build immutable decision list and audit detail.
- Build read-only action registry and data-health sections.
- Hide unsupported lever-to-history filter control.

Acceptance:

- Audit records cannot be edited.
- Stable routes restore selected record or policy section.

## FE-13: Demo Lab and recorded mode

Model fit: Luna-with-review  
Prerequisites: FE-07 through FE-12, BE-12  
Read: [interaction spec section 13](../design/uiux-interaction-spec.md#13-screen-8-demo-lab-contract)

Allowed files:

- Demo route and components
- Mock/recorded adapters
- Scenario fixtures
- Demo E2E tests

Objective:

- Add scenario launcher, reset confirmation, recorded mode, and A-12 pair comparison.
- Clear caches and local run state after successful reset.

Forbidden:

- No E-02 or plant scenario.
- No reset without explicit confirmation.

Acceptance:

- Main scenarios run without typing.
- Recorded mode uses production components.
- Failed reset preserves current state.

## FE-14: Accessibility and responsive hardening

Model fit: Luna-safe  
Prerequisites: FE-13  
Read: [product plan sections 16-19](../product/product-build-plan.md#16-accessibility-and-input-design)

Allowed files:

- Existing frontend production and test files only where a verified issue exists

Objective:

- Resolve keyboard, focus, contrast, reduced-motion, loading, empty, error, and viewport issues.
- Add mobile agenda alternative for timeline rather than compressing Gantt.

Acceptance:

- `npm run build`
- `npm run lint`
- Unit and E2E suite.
- Visual checks at documented viewports.

## FE-15: Shell navigation and shared state polish

- Model fit: Luna-safe
- Prerequisites: FE-03 (the current shell is already present)
- Read: [visual system §5](productization-plan.md#5-shared-ui-system-and-layout), [shell §6.1](productization-plan.md#61-global-shell-and-command-search).

Allowed files: `frontend/src/components/shell/global-header.tsx`, `frontend/src/components/shell/shell.test.tsx`, `frontend/src/styles/globals.css`, and focused shell/style tests.

Objective: Remove browser-default anchor underlines; distinguish active/hover/focus; label command search as page navigation; keep one-line desktop and usable mobile nav. Do not change routes or add another UI system.

Acceptance: Nav, brand link, command results, and Environment links have intentional decoration in all states; keyboard focus remains visible; 1366 px visual check; `npm run build`, `npm run lint`, focused tests.

## FE-16: Timeline selection, focus, and inspector continuity

- Model fit: Luna-safe with visual review
- Prerequisites: FE-15
- Read: [visual system §5](productization-plan.md#5-shared-ui-system-and-layout), [Timeline §6.2](productization-plan.md#62-fleet-timeline-and-job-inspector).

Allowed files: `frontend/src/App.tsx`, `frontend/src/components/timeline/timeline-block.tsx`, `frontend/src/components/timeline/JobInspector.tsx`, `frontend/src/styles.css`, and focused Timeline/inspector tests.

Objective: Remove fallback selection of `RAMG-01`; use URL job selection only while inspector is active; make selected treatment visually different from keyboard focus and vendor/status; clear selection on close while returning focus. Do not change API data wiring in this packet.

Acceptance: Open/close/deep-link/invalid-ID tests; no persistent blue outline after close; focus indicator remains accessible; `npm run build`, `npm run lint`, focused tests and visual review.

## FE-17: Schedule API adapter and Timeline read model

- Model fit: Luna-with-review
- Prerequisites: INT-13, FE-16, BE-23, INT-17
- Read: [data ownership §3](productization-plan.md#3-canonical-context-entity-identity-and-data-ownership), [approved resource contract §3.5](productization-plan.md#35-approved-contract-repair-for-local-synthetic-preview-2026-10-15), [Timeline §6.2](productization-plan.md#62-fleet-timeline-and-job-inspector).

Allowed files: `frontend/src/App.tsx`, `frontend/src/routes/timeline.tsx`, `frontend/src/features/schedule/**`, `frontend/src/components/timeline/timeline-workspace.tsx`, and focused schedule/Timeline tests. Generated OpenAPI files are read-only in this packet.

Objective: Fetch `/api/v1/schedule` through TanStack Query, map generated response types—including server-backed maintenance/unavailable intervals—to the existing resource/grid view, and show loading/empty/error/not-found states. Render unavailable spans separately from bookings, keep overlaps/conflicts visible, preserve sticky layout and mobile agenda. Do not edit seed, infer intervals from zero capacity, hardcode new schedule data, or perform mutations.

Acceptance: API fixture tests cover empty resource, maintenance/unavailable span, overlapping booking/conflict, inclusive clipping, unknown job, and schedule version; refresh/direct link yields the same server data; the visual key names unavailable status independently of vendor color; `npm run api:check`, `npm run build`, `npm run lint`, focused tests.

## FE-18: Working Timeline controls and capacity metrics

- Model fit: Luna-with-review
- Prerequisites: FE-17, BE-18
- Read: [metrics/search §4](productization-plan.md#4-metrics-and-search-contracts), [Timeline §6.2](productization-plan.md#62-fleet-timeline-and-job-inspector).

Allowed files: `frontend/src/App.tsx`, `frontend/src/components/timeline/**`, `frontend/src/features/schedule/**`, `frontend/src/routes/search-schemas.ts`, and focused Timeline/metric tests. No backend files.

Objective: Derive planned capacity load from API points; make range/group/vendor/status/search controls follow the documented scopes and URL; remove hardcoded percentages and fake Today/Export behavior. Keep business math in a pure feature mapper, not components.

Acceptance: Unit tests for multi-unit denominator, partial range, zero capacity, over-100, empty points, search and filter combinations; metric changes after refetch; `npm run build`, `npm run lint`, focused tests.

## FE-19: Persisted Readiness Board

- Model fit: Luna-with-review
- Prerequisites: INT-13, BE-19
- Read: [mutations §3.3](productization-plan.md#33-mutation-continuity), [search §4.2](productization-plan.md#42-search-behavior), [Readiness §6.3](productization-plan.md#63-readiness-board).

Allowed files: `frontend/src/routes/readiness.tsx`, `frontend/src/features/readiness/**`, `frontend/src/components/readiness/**`, and focused Readiness tests. Generated OpenAPI files are read-only.

Objective: Replace fixture initialization and no-op status writer with generated-type GET/detail/PATCH integration; use server version semantics, rollback/refetch, real source search, and job handoff. Do not modify schedule directly.

Acceptance: Mark ready persists after remount; failed PATCH rolls back; source handoff finds affected items; summary matches the queue scope; `npm run build`, `npm run lint`, focused tests.

## FE-20: Persisted Change Inbox and extraction lifecycle

- Model fit: Luna-with-review
- Prerequisites: INT-13, BE-19
- Read: [mutations §3.3](productization-plan.md#33-mutation-continuity), [search §4.2](productization-plan.md#42-search-behavior), [Changes §6.4](productization-plan.md#64-change-inbox-event-detail-and-intake).

Allowed files: `frontend/src/routes/changes/**`, `frontend/src/features/events/**`, `frontend/src/components/changes/**`, and focused Changes tests. Generated OpenAPI files are read-only.

Objective: Replace fixture list/Refresh and cloned event rows with server list/detail and cursor; enforce create → extract → review/correct → run gates; use server IDs and response states. Do not implement a new agent workflow or claim create means extraction-ready.

Acceptance: Hard refresh retains new event; fixture IDs are never sent to live API; filters/counts have stated scope; retry/error paths preserve draft; `npm run build`, `npm run lint`, focused tests.

## FE-21: Server-backed Decision Workspace

- Model fit: Luna-with-review plus senior approval review
- Prerequisites: FE-20, INT-13
- Read: [mutations §3.3](productization-plan.md#33-mutation-continuity), [Decision §6.5](productization-plan.md#65-decision-workspace), [flow §7](productization-plan.md#7-flow-and-invalidation-matrix).

Allowed files: `frontend/src/routes/decisions/$planId.tsx`, `frontend/src/features/plans/**`, `frontend/src/components/decision/**`, and focused Decision tests. Generated OpenAPI files are read-only.

Objective: Fetch the requested plan ID; remove arbitrary fixture fallback; retain typed approval/reject/reply mutations; make option metrics/conditions and 404/409 paths truthful; invalidate and hand off server-returned changed IDs. No backend transaction edits.

Acceptance: Unknown ID never renders A-12; refresh keeps chosen server plan; approve requires acknowledgement/version and is never auto-retried on 409; `npm run build`, `npm run lint`, focused tests; senior reviews approval payload and conflict handling.

## FE-22: Complete Decision History navigation and pagination

- Model fit: Luna-safe with integration review
- Prerequisites: FE-21, BE-20
- Read: [search §4.2](productization-plan.md#42-search-behavior), [History §6.6](productization-plan.md#66-decision-history).

Allowed files: `frontend/src/routes/history.tsx`, `frontend/src/features/history/**`, `frontend/src/components/history/**`, and focused History tests.

Objective: Load all requested cursor pages, expose filter scope honestly, and route job/event/plan/decision links with canonical IDs. “Start similar change” opens a new prefilled draft, never the old event.

Acceptance: >100-record fixture pagination, direct audit link, targeted Timeline handoff, new draft handoff, filtered-empty state; `npm run build`, `npm run lint`, focused tests.

## FE-23: Policy and data-health action integrity

- Model fit: Luna-safe
- Prerequisites: FE-19, FE-22, BE-20
- Read: [Policy §6.7](productization-plan.md#67-policy-and-data-health).

Allowed files: `frontend/src/routes/settings/policy.tsx`, `frontend/src/components/policy/**`, `frontend/src/features/policy/**`, and focused Policy tests.

Objective: Eliminate no-op lever/owner actions; make affected-source and decision links use supported filters or remove unsupported buttons. Keep the page read-only and never fabricate missing policy data.

Acceptance: Every rendered control changes a real view/route; unsupported action is absent; source handoff finds the intended records; `npm run build`, `npm run lint`, focused tests.

## FE-24: Ripple panel lifecycle and read-only Ask integration

- Model fit: Luna-with-review; Ask contract requires senior sign-off
- Prerequisites: FE-20, BE-21
- Read: [Ripple/Demo §6.8](productization-plan.md#68-ripple-panel-and-demo-lab), [flow §7](productization-plan.md#7-flow-and-invalidation-matrix).

Allowed files: `frontend/src/components/agent/**`, `frontend/src/components/shell/app-shell.tsx`, `frontend/src/api/agent-runs.ts`, and focused panel/run tests. Generated OpenAPI files are read-only.

Objective: Render real read-only Ask answer/evidence/error from approved backend contract; remove unhandled browser-event fake action; make Submit follow the existing extraction lifecycle; resume run stream after navigation. If BE-21 is not approved, stop—not a local fake response.

Acceptance: Ask creates no event/schedule write; Submit cannot run before extraction-ready; refresh/navigation resumes run; error/reconnect tests; `npm run build`, `npm run lint`, focused tests.

## FE-25: Demo Lab metadata, live flow, and reset UI

- Model fit: Luna-with-review
- Prerequisites: BE-18, FE-20, FE-24
- Read: [Ripple/Demo §6.8](productization-plan.md#68-ripple-panel-and-demo-lab), [seed §8](productization-plan.md#8-seed-blueprint-and-reset-contract).

Allowed files: `frontend/src/routes/demo.tsx`, `frontend/src/features/demo/**`, `frontend/src/components/demo/**`, and focused Demo tests.

Objective: Display only backend-available scenarios/modes; distinguish recorded from persisted live; live run follows extraction validation; confirm reset scope and refetch scenario data. No production reset path.

Acceptance: Recorded trace is labelled, live path yields server IDs, failed reset preserves view, successful reset restores seed checksum/version; `npm run build`, `npm run lint`, focused tests.

## FE-26: Dense Timeline and sparse-state layout

- Model fit: Luna-safe with root visual-source review
- Prerequisites: INT-20's **documented scenario contract** (not INT-20 implementation); BE-22 schedule shape is already frozen. INT-20 and BE-26 may run concurrently with FE-26 because write files are disjoint.
- Read: [preview UX §3](preview-ux-recovery.md#3-shared-ui-grammar-and-action-semantics), [Timeline §4.1](preview-ux-recovery.md#41-timeline), [existing Timeline contract](productization-plan.md#62-fleet-timeline-and-job-inspector).

Allowed files: `frontend/src/routes/timeline.tsx`, `frontend/src/components/timeline/**` excluding tests, `frontend/src/features/schedule/timeline-layout.ts`, `frontend/src/features/schedule/capacity-metrics.ts`, `frontend/src/features/schedule/schedule-adapter.ts` only for a proven existing-response mapping error, and `frontend/src/styles.css` **only for the existing `.unified .timeline-*`, `.timeline-shell`, `.timeline-scroll`, and directly related sticky/height selectors**. FE-26 exclusively reserves `styles.css` until its root review completes; no other writer may touch it concurrently. No unrelated global theme rule, shell/scenario route, generated type, seed, or test file. Reuse existing tokens; broader shared-style changes belong to INT-21 after FE-26 finishes.

Objective: Render a dense, scrollable fleet workspace with sticky date/resource axes and persistent legend, while A-12 fits its sparse content without an oversized empty canvas. Keep category grouping, real range/group/vendor/status/search filtering, meaningful maintenance/unavailable/conflict treatments, accurate visible-range capacity metrics, and selected-job inspector/focus. Preserve existing semantic color mapping; no gradient with unexplained meaning. Handle desktop two-axis scroll and narrow agenda without clipped actions.

Development handoff: Show source-level trace from schedule response to rows/metrics/inspector and list touched files. Do not create/run tests or browser checks. Root does static checks after integrating disjoint writers.

## FE-27: Readiness status clarity and human formatting

- Model fit: Luna-safe for UI; root reviews mutation wiring
- Prerequisites: INT-20's **documented scenario contract** (not INT-20 implementation); BE-19 readiness response is already frozen. INT-20 and BE-26 may run concurrently with FE-27 because write files are disjoint.
- Read: [preview UX §3](preview-ux-recovery.md#3-shared-ui-grammar-and-action-semantics), [Readiness §4.2](preview-ux-recovery.md#42-readiness), [existing Readiness contract](productization-plan.md#63-readiness-board).

Allowed files: `frontend/src/routes/readiness.tsx`, `frontend/src/components/readiness/**` excluding tests, `frontend/src/features/readiness/readiness-data.ts`, `frontend/src/features/readiness/readiness-api.ts` only to preserve mutation/refetch semantics. No shell/scenario routes, global styles, backend, generated types, or tests.

Objective: Replace the bare live checkbox with a clear inspect-then-`Mark ready`/`Reopen` action in detail. Show an explicit persistent status and next action, human stage names, capped relative freshness, and scope-labelled metrics. Preserve server PATCH expected-row-version, per-row pending, rollback/error, refetch and selected-row position. Job/source handoffs retain scenario and canonical IDs. No bulk selection without a real bulk action.

Development handoff: Root reviews that opening a row never mutates and action is a genuine server PATCH. No test code/runs/browser now; root runs static checks at integration.

## FE-28: One coherent Change event flow

- Model fit: Luna-with-root review of route/action state transitions
- Prerequisites: BE-25 extraction completion is integrated; INT-20's documented scenario contract is frozen. INT-20 implementation and BE-26 seed may run concurrently with FE-28 if files stay disjoint.
- Read: [preview UX §3](preview-ux-recovery.md#3-shared-ui-grammar-and-action-semantics), [Changes §4.3](preview-ux-recovery.md#43-changes-and-event-detail), [cross-page §4.5](preview-ux-recovery.md#45-shared-cross-page-flow).

Allowed files: `frontend/src/routes/changes/index.tsx`, `frontend/src/routes/changes/$eventId.tsx`, `frontend/src/components/changes/**` excluding tests, `frontend/src/features/events/events-data.ts`, `frontend/src/features/events/events-api.ts` only for mapping/polling of the frozen API. No shared shell/styles, Demo Lab, History, generated types, backend, or tests.

Objective: Use one canonical URL-backed event detail for row, Continue, new event and direct link. Make Source → Extraction → Investigation → Plan/decision progression intelligible, show one current next action, and avoid stacking intake/preview sheets for the same event. Start extraction through the real backend, auto-revalidate until persisted outcome or bounded failure, then review/correct in place; preserve source and explain retry. Do not show `Structured` without extraction data. Use meaningful titles, secondary IDs and exact state-based controls; connect server run and plan links. Do not infer approval from a created event or fake an extraction in React.

Development handoff: Root source-traces create→extract→review→run→plan and back/refresh behavior. No test code/runs/browser now; root runs static checks after dependent backend contract is integrated.

## FE-29: Populated and immutable History presentation

- Model fit: Luna-safe with root audit-link review
- Prerequisites: INT-20's **documented scenario contract** (not INT-20 implementation); BE-20/BE-24 History contract is already frozen. INT-20 and BE-26 may run concurrently with FE-29 because write files are disjoint.
- Read: [preview UX §3](preview-ux-recovery.md#3-shared-ui-grammar-and-action-semantics), [History §4.4](preview-ux-recovery.md#44-history), [cross-page §4.5](preview-ux-recovery.md#45-shared-cross-page-flow).

Allowed files: `frontend/src/routes/history.tsx`, `frontend/src/components/history/**` excluding tests, `frontend/src/features/history/history-data.ts`, `frontend/src/features/history/history-api.ts` only for a proven pagination/filter mapping issue. No Changes/Timeline files, shell/scenario routes, global CSS, backend, generated types, or tests.

Objective: Make persisted fleet decisions scannable with human cause/action/job/actor/time/version; keep immutable audit detail and server cursor/filter behavior. Distinguish truly empty A-12 from filtered-empty fleet and make all CTAs scenario-preserving typed routes. Remove raw-UUID/giant-zero-card visual prominence. Preserve event/plan/job audit links and selected decision URL state.

Development handoff: Root checks immutable source, server counts/pagination and link IDs in source. No test code/runs/browser now; root runs static checks after parallel writers finish.

## FE-30: Collision-safe Timeline tracks and direct horizontal navigation

- Model fit: Luna with root visual/interaction source review
- Prerequisites: FE-26 `dev_done`; [follow-up §1–2](timeline-gemini-followup.md#1-evidence-and-decisions) is frozen. BE-27 may run concurrently because no files overlap.
- Read: [follow-up §2](timeline-gemini-followup.md#2-timeline-layout-and-interaction-contract), [existing Timeline §6.2](productization-plan.md#62-fleet-timeline-and-job-inspector).

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-toolbar.tsx`, `frontend/src/features/schedule/timeline-layout.ts`, `frontend/src/routes/timeline.tsx` only for range/URL state, and `frontend/src/styles.css` **only for Timeline grid/track/scroll/sticky selectors**. No timeline-block/legend, design tokens, seed, backend, generated types, package files, test code, or unrelated CSS. Reserve `styles.css` and Timeline grid/toolbar files exclusively until root review.

Objective: Deterministically pack concurrent bookings into visible sublanes; give maintenance/unavailable a separate aligned exception rail, with matching variable-height sticky resource cells. Make exact booking-exception intersections visible without declaring capacity-valid concurrency a conflict. No block, badge, or tooltip may be covered by another booking or group sticky layer. Make direct horizontal trackpad/native scroll and empty-space drag-to-pan primary, without hijacking booking click, text selection, vertical scroll, touch, focus, or inspector. Keep previous/next buttons for **month** jumps, add labelled month/year selection and Today, and retain URL/API-range/metric consistency across year boundaries. No drag editing or schedule mutation. Preserve mobile agenda.

Development handoff: root source-reviews interval packing, row synchronization, pointer threshold/click safety, range/URL flow, and z-index containment. No tests/browser now; root runs frontend static/build checks after FE-31.

## FE-31: Truthful Timeline semantics, legend, and filters

- Model fit: Luna with root accessibility/data-contract review
- Prerequisites: FE-30 `dev_done`; its Timeline/CSS file reservations must be released. [Follow-up §1–2](timeline-gemini-followup.md#1-evidence-and-decisions) is frozen.
- Read: [follow-up §2](timeline-gemini-followup.md#2-timeline-layout-and-interaction-contract), [design system Timeline color rules](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/components/timeline/timeline-block.tsx`, `frontend/src/components/timeline/timeline-legend.tsx`, `frontend/src/components/timeline/timeline-workspace.tsx` **only for exception/weather presentation integration after FE-30**, `frontend/src/components/timeline/timeline-toolbar.tsx` **only to remove a nonfunctional vendor filter**, `frontend/src/features/schedule/schedule-adapter.ts` and `frontend/src/features/schedule/fixture-adapter.ts` only to remove the resource-type→vendor fiction in live data while preserving honestly vendor-coded static fixtures, and `frontend/src/styles.css` **only for Timeline semantic block/legend/exception selectors**. No global token rewrite, backend, seed, API schema, tests, package files, or unrelated page CSS. Reserve all shared Timeline/CSS files serially after FE-30.

Objective: Live bookings default neutral because `/schedule` has no vendor identity. Remove vendor legend/filter claims from live Timeline, including fake group→vendor color mapping. Use explicit labelled progress/complete, maintenance, unavailable, shared weather, conflict, Today, and selection channels with text/icon/pattern as well as color. Primary blue remains focus/action/quantitative metric, not a solid in-progress booking hue. Keep block details and exact affected dates available by keyboard/focus/inspector, including narrow blocks. Do not add a vendor field or guess it from metadata.

Development handoff: root checks legend against rendered encodings and source data, accessible labels, live/fixture distinction, no color-only status, and no false vendor filter. No tests/browser now; root runs frontend static/build checks after integration.

## FE-32: Compact Timeline rows and truthful exception markers

- Model fit: Luna with root source review of date/overflow semantics
- Prerequisites: FE-30/FE-31 source integrated; [density/navigation contract §1–3](timeline-density-navigation.md#1-evidence-user-intent-and-references) is frozen. Independent of FE-33's route/toolbar files; both may write concurrently.
- Read: [compact row/exception §2](timeline-density-navigation.md#2-compact-row-and-exception-contract), [frozen interface §3](timeline-density-navigation.md#frozen-workspace-integration-interface-for-parallel-workers), [Timeline color rule](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-block.tsx` only for precise booking marker/focus detail, `frontend/src/components/timeline/timeline-legend.tsx`, `frontend/src/features/schedule/timeline-layout.ts`, `frontend/src/features/schedule/schedule-adapter.ts`, `frontend/src/features/schedule/types.ts`, and one new `frontend/src/components/timeline/timeline-density.css` imported by the Workspace. No `App.tsx`, toolbar, route, search schema, schedule query, global `styles.css`, tokens, backend, seed, generated API, dependency, `.env`, or tests. Reserve these seven files exclusively. Reuse Phosphor and existing UI primitives; no Gantt package.

Objective: Replace one rail lane per issue with one compact marker band and 68–72 px baseline row, with at most two visible booking lanes and a reversible `+N bookings` disclosure for true concurrency. Weather observations remain typed location/day context and appear once in header/shared context, not as repeated `unavailable` resource intervals. Explicit unavailability keeps its own range icon/line. Compute conflict day segments only from capacity points with `overflow > 0` and `booking_ids`, never a report-wide false positive or entire booking span. Cluster simultaneous issue markers without growing rows. Show complete kind/date/reason/impact via hover, keyboard focus, and click/tap detail, with Escape/focus return. Preserve inspector and exact sticky rail alignment. Implement the frozen `TimelineWorkspace` props `canvasRange`, `selectedPeriod`, `dayWidth`, `onAnchorDayChange` and emit a settled absolute anchor on pan; do not own URL or API fetching. Keep mobile agenda accurate and accessible.

Development handoff: root checks CSS row budget, cluster disclosure, weather-versus-unavailability, exact capacity day mapping, no false conflict, keyboard detail, and whether Workspace interface matches §3. No test writing/runs/browser now; root runs static/build checks after parallel integration.

## FE-33: Honest horizon modes and cross-month horizontal navigation

- Model fit: Luna with root URL/window-state review
- Prerequisites: FE-30/FE-31 source integrated; [density/navigation contract §3](timeline-density-navigation.md#3-horizon-date-state-and-horizontal-pan-contract) is frozen. Independent of FE-32-owned files; both may write concurrently against the §3 interface.
- Read: [horizon/navigation §3](timeline-density-navigation.md#3-horizon-date-state-and-horizontal-pan-contract), [existing Timeline §6.2](productization-plan.md#62-fleet-timeline-and-job-inspector).

Allowed files: `frontend/src/components/timeline/timeline-toolbar.tsx`, `frontend/src/App.tsx`, `frontend/src/routes/timeline.tsx`, `frontend/src/routes/search-schemas.ts`, `frontend/src/features/schedule/schedule-api.ts`, one new `frontend/src/features/schedule/timeline-horizon.ts`, and one new `frontend/src/components/timeline/timeline-navigation.css` imported by the Toolbar. No Workspace, timeline-layout, adapter/types, block/legend, global `styles.css`, tokens, backend, seed, generated API, dependency, `.env`, or tests. Reserve these seven files exclusively. Do not alter another page's search schema beyond a necessary shared type-safe extension.

Objective: Add `2 weeks` rolling detail (default) and calendar-aligned `Month` mode, with URL `horizon` plus selected-period absolute `from/to`, month/year jump, Today/scenario-start semantics, and arrows labelled by active horizon. Fetch a bounded previous/current/next period buffer through `/api/v1/schedule`; selected-period metrics/counts remain scoped to the selected period. Continue pan across month boundaries by consuming Workspace's settled `onAnchorDayChange` and expanding the buffer near an edge without date/vertical-scroll jump or per-pixel refetch. Do not allocate a year of day columns on a far jump. For first partial scenario month, label actual 13 Oct onward; empty future periods remain navigable. Fix crowded 1366px toolbar with compact picker/date text and responsive filter handling. Preserve scenario, job, filters, direct links and browser history. Implement against frozen Workspace prop names; do not edit Workspace to resolve a mismatch while FE-32 owns it.

Development handoff: root checks URL/selected-period/buffer distinction, period boundary math, metric denominator, future empty range, search/toolbar readability and no per-pixel API calls. No tests/browser now; root runs static/build checks after parallel integration.

## FE-34: Resource-day issue alignment and compact issue detail

- Model fit: Luna with root source review of day/capacity semantics, range alignment and focus behavior.
- Prerequisites: FE-32/FE-33/INT-23 source present; [issue-clarity contract §1–3](timeline-issue-clarity.md#1-what-is-wrong-and-what-the-data-means) frozen. Independent of FE-35's write files, against the §3 frozen weather component interface.
- Read: [issue-clarity contract §2](timeline-issue-clarity.md#2-frozen-ui-contract), [ownership/interface §3](timeline-issue-clarity.md#3-implementation-ownership-and-parallel-execution), [design-system Timeline color rules](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-density.css`, optionally **one new** `frontend/src/features/schedule/timeline-issue-layout.ts`. No legend, weather component CSS, shared `styles.css`, App/route/toolbar, adapter, API/generated types, backend/seed, dependencies, `.env`, or tests. Reserve Workspace/density exclusively. FE-35 may create the frozen weather component in parallel; FE-34 may import it before it exists, but neither worker runs a build until both are integrated.

Objective: Make every maintenance/unavailable/exact-overflow issue visibly belong to its resource and affected absolute days: subtle issue-band day-cell tint, one correctly anchored compact badge at the first visible day of a same-issue run, continuous range treatment, accessible count/severity/icon, and no badge over a neighbouring date. Keep baseline row height and booking click/pan intact. Remove the native `title` tooltip; show one short custom hover/focus tooltip and a click/tap detail with each issue, inclusive dates, impact and linked-job action, viewport-safe placement, Escape/outside dismiss and focus return. The visual priority is unavailable/conflict danger over maintenance warning; never mix warning/danger into a gradient. Keep exact conflict-day mapping and no false capacity-zero/weather inference. In the header, replace the inline weather marker with FE-35's frozen `WeatherDayMarker`, rendering it only for `go === false` observations; do not own FE-35 files. Preserve mobile agenda, horizon, URL, filters and sticky rail.

Development handoff: root source-checks issue count/deduplication, first visible cell, multi-day/month-boundary clip, typed weather handoff, row geometry and keyboard/inspector flow. No tests/browser now under README §4.8; root runs static/build checks after FE-35 also completes.

## FE-35: No-go weather context and truthful Timeline legend

- Model fit: Luna with root semantics/accessibility review.
- Prerequisites: FE-32/FE-33/INT-23 source present; [issue-clarity contract §1–3](timeline-issue-clarity.md#1-what-is-wrong-and-what-the-data-means) frozen. Independent of FE-34's write files.
- Read: [issue-clarity contract §2](timeline-issue-clarity.md#2-frozen-ui-contract), [frozen interface §3](timeline-issue-clarity.md#3-implementation-ownership-and-parallel-execution), [design-system Timeline color rules](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/components/timeline/timeline-legend.tsx`, **new** `frontend/src/components/timeline/timeline-weather-marker.tsx`, **new** `frontend/src/components/timeline/timeline-weather-marker.css`. Do not edit Workspace/density/shared `styles.css`, App/route/toolbar, adapters/types, API/generated types, backend/seed, dependencies, `.env`, or tests. Reserve these files exclusively.

Objective: Export `WeatherDayMarker({ observations }: { observations: TimelineWeather[] })` for the FE-34 Workspace integration. Render one restrained day-header marker only if at least one observation has `go === false`; detail lists affected locations, metric/value, source and explains context versus explicit unavailability. Routine/unknown weather must not look like an issue; keep routine context reachable where existing date/agenda interaction supports it. No native `title` on a custom marker, no giant text-only browser tooltip; hover/focus gets a concise accessible summary and click/tap detail is viewport safe and Escape-dismissible. Rework the persistent legend into Schedule / Resource issues / Day context groups with actual icon/pattern/word semantics, including multi-issue count and weather no-go; remove vague `Exception marker`/`Weather` labels. Keep legend usable at 1366px and mobile without reducing chart height or altering sticky/pan behavior.

Development handoff: root checks exported interface, no-go-only signal, location scope, source explanation, legend truthfulness, keyboard/tap behavior and no outside file writes. No tests/browser now under README §4.8; root runs static/build checks after FE-34 also completes.

## FE-36: Background-first resource-day issues

- Model fit: Luna with root review of absolute-day semantics, CSS geometry and accessible detail.
- Prerequisites: FE-34/FE-35/INT-24 source present; [grid-annotation contract §1–2.1](timeline-grid-annotation-pass.md#1-screenshot-audit-and-design-decision) frozen. Independent of FE-38's write files; FE-37 waits for this task's Workspace/density reservation to be released.
- Read: [screenshot audit](timeline-grid-annotation-pass.md#1-screenshot-audit-and-design-decision), [resource-day issue contract](timeline-grid-annotation-pass.md#21-resource-day-issues-background-first-icon-second), [ownership §3](timeline-grid-annotation-pass.md#3-development-packets-ownership-and-genuine-parallelism), [Timeline design tokens](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-density.css`, optionally one new pure `frontend/src/features/schedule/timeline-issue-layout.ts`. No weather component, legend, `timeline-layout.ts`, App/route/toolbar, shared styles, API/backend/seed, generated types, packages, `.env`, or tests. Reserve Workspace/density exclusively until root review.

Objective: Replace the 24px circles floating out of a 16px band with restrained full **resource-day track-cell** tints and an exactly aligned inset icon/count inside the first affected annotation cell; draw the continuous affected-day rule and split whenever issue set/severity changes. One priority color per cell (danger over warning), precise `conflictDays`, no weather-to-capacity inference, no whole-fleet column tint or recolored booking. Keep no-issue days clear and the default row 68–72px. Preserve the existing hover/focus and click/tap detail, linked job, Escape, portal and inspector behaviors. Leave the booking overflow algorithm/control for FE-37; create only a clean seam so its occupancy line can sit at the visible booking-lane edge without competing with the issue band.

Development handoff: root checks Barge 2 16–17 Oct plus maintenance-only 18 Oct, first/last day clipping, dense/empty row geometry, hit targets and no booking-click interception by source review. No tests/browser now under README §4.8.

## FE-37: Date-true hidden-booking footprint and expansion

- Model fit: Luna with root review of deterministic interval packing, count semantics and scroll stability.
- Prerequisites: FE-36 `dev_done` and its Workspace/density reservation released; [grid-annotation contract §2.2](timeline-grid-annotation-pass.md#22-hidden-bookings-date-footprint-plus-stable-expand) frozen. FE-38 may still write in parallel because its files are disjoint.
- Read: [hidden-booking contract](timeline-grid-annotation-pass.md#22-hidden-bookings-date-footprint-plus-stable-expand), [coexistence/weather §2.3](timeline-grid-annotation-pass.md#23-dateweather-header-and-responsive-behavior), [ownership §3](timeline-grid-annotation-pass.md#3-development-packets-ownership-and-genuine-parallelism).

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-density.css`, `frontend/src/features/schedule/timeline-layout.ts`, optionally one new pure `frontend/src/features/schedule/timeline-overflow-layout.ts`. No FE-38 weather/legend files, shared styles, App/route/toolbar, API/backend/seed, generated types, packages, `.env`, or tests. Preserve FE-36 work in the two shared files; reserve them only after FE-36 root review.

Objective: Replace one misleading date-anchored `+N bookings` pill with a stable, sticky resource-rail `+N hidden bookings`/`Show fewer` control and neutral 2–3px occupancy rules over **all and only** days containing hidden bookings. In collapsed mode compute at most two visible booking IDs per absolute day using §2.2's deterministic continuity/priority order; render visible fragments and exact hidden-day segments. `N` counts distinct IDs hidden at least once in the selected period; never call a hidden booking a conflict. Expanded mode shows all jobs on stable lanes, removes the hidden line, preserves resource/vertical anchor, and can collapse again without losing selection or pan. Keep issue marks in the separate 16px band, with same-day coexistence and no booking click obstruction. Do not change schedule data, API, or URL behavior.

Development handoff: root checks Test Bay 4's four hidden bookings across multiple dates, reappearance when a lane frees, selected-job priority, selected-period versus buffer count, same-day issue coexistence, expand/collapse and sticky-height alignment by source review. No tests/browser now under README §4.8.

## FE-38: In-flow no-go weather and matching legend

- Model fit: Luna with root review of date-cell typography, location semantics and responsive fit.
- Prerequisites: FE-34/FE-35/INT-24 source present; [grid-annotation contract §2.3](timeline-grid-annotation-pass.md#23-dateweather-header-and-responsive-behavior) frozen. Independent of FE-36/FE-37 Workspace/density files; dispatch together with FE-36.
- Read: [screenshot audit](timeline-grid-annotation-pass.md#1-screenshot-audit-and-design-decision), [weather/responsive contract](timeline-grid-annotation-pass.md#23-dateweather-header-and-responsive-behavior), [issue/overflow encodings](timeline-grid-annotation-pass.md#2-frozen-layout-contract), [ownership §3](timeline-grid-annotation-pass.md#3-development-packets-ownership-and-genuine-parallelism).

Allowed files: `frontend/src/components/timeline/timeline-weather-marker.tsx`, `frontend/src/components/timeline/timeline-weather-marker.css`, `frontend/src/components/timeline/timeline-legend.tsx`. No Workspace/density, global styles, App/route/toolbar, adapters/types, API/backend/seed, packages, `.env`, or tests. Reserve these files exclusively.

Objective: Keep `WeatherDayMarker({ observations: TimelineWeather[] })` export unchanged. Place no-go weather in a third **in-flow** row beneath weekday inside the current date cell, with small icon and `No-go` text when width fits; never overlap date, weekday, neighbour cell or Today circle. Retain one marker per date and location-scoped detail/source; no `go=true` warning or capacity-zero claim. Update legend swatches/labels to mirror the FE-36 resource-day tint/inline count and FE-37 neutral hidden-booking line plus sticky-rail count. Preserve hover/focus/click/tap/Escape behavior, clear day/issue/booking categories, and mobile readability. Do not edit the date header in Workspace; use the existing marker interface and component CSS, and report any exact shared-header CSS need to INT-25 rather than editing another owner's file.

Development handoff: root checks 52px date-cell fit, multi-location no-go, normal weather absence, tab/focus, legend semantic match and no overhang in source. No tests/browser now under README §4.8.

## FE-39: Whole-booking lanes and clickable overflow runs

- Model fit: Luna with root review of interval packing, selected-job priority, date-run/count semantics and row geometry.
- Prerequisites: FE-36–FE-38/INT-25 source present and no active writer owns Workspace/density. [Centered-lanes contract §1–2.2](timeline-centered-lanes.md#1-what-the-screenshots-and-source-show) frozen. Independent of FE-41's weather/legend files; dispatch both before waiting.
- Read: [booking and overflow contract](timeline-centered-lanes.md#21-continuous-booking-blocks-and-row-height), [ownership](timeline-centered-lanes.md#3-delivery-ownership-and-genuine-parallelism), [Timeline design tokens](../design/design-system.md#timeline-color-rules).

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-density.css`, `frontend/src/features/schedule/timeline-overflow-layout.ts`, optionally `frontend/src/features/schedule/timeline-layout.ts` for a pure interval-packing helper. **Bounded integration amendment:** `frontend/src/components/timeline/timeline-block.tsx` only to normalize exact conflict-underline placement to the clipped visible booking interval (the existing code divides by the original full interval and becomes wrong when FE-39 renders a whole booking clipped by canvas). No weather/legend files, `components/ui`, shared styles, route/App/toolbar, API/backend/seed, generated types, packages, `.env`, or tests. Workspace/density/TimelineBlock are exclusive until root review; FE-40 cannot touch them yet.

Objective: Replace per-day winner/fragment selection with deterministic whole-interval selection and at most two non-overlapping visible booking lanes. Never split a booking merely to free a lane; only canvas clipping can show a continuation edge. Put booking blocks at a stable central baseline. Use a reserved bottom strip for one continuous, focusable/clickable `+N bookings` band per connected union of hidden intervals; split only at an actual gap, not a signature/lane/count change. `N` means distinct hidden IDs intersecting that band, and hover/focus explains their actual dates. Band click expands the row; rail `Show fewer` collapses. Keep selected booking visible, inspector/selection, exact conflict-day underline, issue semantics, no fake capacity conflict, selected-period rail count, pan/URL and scroll anchor. FE-40 will move the current issue band above the booking; leave a clear geometric seam and preserve current issue interactions until then.

Development handoff: root source-checks whole blocks, no dashed interior fragment, connected hidden runs, a genuine clickable full-range target, count truth when hidden IDs change mid-run, selected job, exact clipped-conflict underline, 1/2/expanded lane geometry, same-day issue coexistence and equal left/right row heights. No tests/browser now under README §4.8.

## FE-40: Centered resource-issue rail and rich hover preview

- Model fit: Luna with root review of exact issue-day semantics, layered interaction, portal/focus behavior and keyboard/touch access.
- Prerequisites: FE-39 `dev_done` and its Workspace/density reservation released. FE-41 may still work in parallel because its files are disjoint. [Centered-lanes contract §2.3–2.4](timeline-centered-lanes.md#23-issue-tint-top-rail-and-exact-intervals) frozen.
- Read: [issue contract](timeline-centered-lanes.md#23-issue-tint-top-rail-and-exact-intervals), [tooltip/preview contract](timeline-centered-lanes.md#24-two-levels-of-explanation-without-tooltip-clutter), [ownership](timeline-centered-lanes.md#3-delivery-ownership-and-genuine-parallelism).

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-density.css`, optionally one new `frontend/src/components/timeline/timeline-hover-preview.tsx` and its matching `timeline-hover-preview.css`. No FE-41 weather/legend files, `components/ui/tooltip.tsx`, shared styles, App/route/toolbar, API/backend/seed, generated types, packages, `.env`, or tests. Reserve Workspace/density exclusively after FE-39 review; preserve FE-39 continuous booking/overflow behavior.

Objective: Move issue range/control to a slim top rail; keep a single faint highest-severity resource-day tint behind the central booking and a centered 14–16px icon/count over the exact affected run. Multi-issue count is distinct records active throughout the run; split on set/severity changes. Hover/focus on the run shows a readable, portaled, viewport-safe rich preview of kind, real dates, reason and impact for up to four records plus remainder count. A simple one-line tooltip is for definitions only. Click/tap/Enter opens the full accessible detail with all records, linked-job actions, Escape/outside dismiss and focus return. No native duplicate `title`, no tooltip that captures booking clicks, no clipping behind sticky header/legend. Preserve exact `conflictDays`, original issue dates, filtered-job link, selection and touch/pan. Do not add a dependency or change global tooltip behavior.

Development handoff: root source-checks Barge 2 mixed 16–17 Oct then maintenance-only 18 Oct, run-center geometry, tint priority, original-vs-visible dates, multi-event preview contents, portal/z-index/collision/focus, booking/issue hit separation and normal/mobile paths. No tests/browser now under README §4.8.

## FE-41: Weather header tint and semantic Timeline legend

- Model fit: Luna with root review of no-go location semantics and compact date-header fit.
- Prerequisites: FE-36–FE-38/INT-25 source present. [Centered-lanes contract §2.5](timeline-centered-lanes.md#25-weather-and-persistent-legend) frozen. Independent of FE-39 Workspace/density files; dispatch both before waiting.
- Read: [weather/legend contract](timeline-centered-lanes.md#25-weather-and-persistent-legend), [preview levels](timeline-centered-lanes.md#24-two-levels-of-explanation-without-tooltip-clutter), [ownership](timeline-centered-lanes.md#3-delivery-ownership-and-genuine-parallelism).

Allowed files: `frontend/src/components/timeline/timeline-weather-marker.tsx`, `frontend/src/components/timeline/timeline-weather-marker.css`, `frontend/src/components/timeline/timeline-legend.tsx`. No Workspace/density, shared styles, `components/ui`, App/route/toolbar, API/backend/seed, generated types, packages, `.env`, or tests. Keep `WeatherDayMarker({ observations })` export unchanged. Use the existing weather-marker wrapper and scoped CSS for the header-cell tint; escalate an unavoidable exact shared-header selector to INT-26, not another worker's file.

Objective: Softly tint only each no-go date-header cell, keep day number/weekday/Today/selected state legible and `No-go` in the in-flow third line. One marker covers multiple no-go locations; hover/focus gives a compact date/location summary, click/tap retains complete metric/source detail. No routine weather parade, no resource-capacity implication or adjacent-date bleed. Simplify legend to Schedule / Resource issues / Day context with actual centered issue-rail, clickable more-bookings band and weather-cell encodings; remove stale hidden-line/`+N rail` wording. No new dependency or UI system.

Development handoff: root source-checks normal versus no-go dates, multi-location details, 52px header fit and sticky alignment, no native-title collision, legend matching FE-39/40 final semantics. No tests/browser now under README §4.8.

## FE-42: Timeline issue marker and preview visual cleanup

- Model fit: bounded frontend repair after the FE-39–FE-41 source pass.
- Prerequisites: FE-39–FE-41/INT-26 source present; no other writer owns the Timeline files below.
- Read: [centered-lanes issue semantics and preview](timeline-centered-lanes.md#23-issue-tint-top-rail-and-exact-intervals), [weather-cell semantics](timeline-centered-lanes.md#25-weather-and-persistent-legend). This packet supersedes only §2.3's decorative range rule: keep the run's full hover/focus/click target and centered icon/count, but do not draw a separate horizontal line.

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx`, `frontend/src/components/timeline/timeline-density.css`, `frontend/src/components/timeline/timeline-weather-marker.css`. No booking selection/overflow algorithm, issue data derivation, legend taxonomy, shared styles, route, API/backend/seed, package, `.env`, or test files.

Objective: Keep the booking blocks vertically centered and continuous. Remove the issue-only horizontal rule and visible band separator; show one small icon/count centered over its exact resource-date run, with the existing per-day severity tint and full-span accessible target intact. Soften the no-go header cell tint so it integrates with the calendar grid without losing the date/weekday or weather label. Repair the rich issue preview's colliding content: use class names that cannot inherit legacy global issue positioning, stack each record's type/date/reason/impact with stable width and wrapping, and retain viewport-safe portal/focus/detail behavior. Preserve clickable `+N bookings`, exact conflict days, linked-job detail, pan and all data semantics.

Development handoff: root inspects the scoped diff and runs only static build/lint plus `git diff --check`. Do not run tests or browser/E2E under README §4.8; visual QA remains pending.

## FE-43: Balanced Timeline rows and horizon-consistent calendar chrome

- Model fit: bounded visual integration of existing Timeline controls and grid.
- Prerequisites: FE-42 source present; no other writer owns the five production files below.
- Read: [centered booking/issue/weather model](timeline-centered-lanes.md#2-frozen-visual-model), [horizon and toolbar contract](timeline-density-navigation.md#3-horizon-date-state-and-horizontal-pan-contract). This screenshot follow-up supersedes only prior pixel geometry and decorative colors; data, selected-period calculation, pan and issue semantics stay frozen.

Allowed files: `frontend/src/features/schedule/timeline-layout.ts` (marker-height constant only), `frontend/src/components/timeline/timeline-workspace.tsx` (row geometry only), `frontend/src/components/timeline/timeline-density.css`, `frontend/src/components/timeline/timeline-weather-marker.css`, `frontend/src/components/timeline/timeline-navigation.css`. No shared stylesheet, API/backend/seed, route/horizon algorithm, legend semantics, packages, `.env`, or test files.

Objective: Balance the top issue space and bottom overflow space around each booking lane without losing the full-width clickable `+N bookings` band. A screenshot follow-up found that reserving the full 18px overflow strip in rows with no hidden bookings leaves an oversized blank bottom area; those rows should instead use only a 6px bottom gutter and omit the empty overflow layer. Rows with hidden bookings retain the full 18px clickable band. Remove white chip-like surfaces behind issue icons/count and weather No-go text while keeping accessible focus/hover feedback. Scope date and resource-track background rules to actual `weekend`/`today` classes, not child position, so 2-week and Month views show the same date with the same base color. Selected-period indication must not paint the whole month blue; preserve a subtle consistent range cue and weather tint. Give both horizon buttons fixed readable width and let the toolbar reflow before controls can shrink or clip.

Development handoff: inspect the scoped diff for equal row/rail heights, true-weekend color, weather specificity and responsive control widths. Run static build/lint and `git diff --check` only; browser/E2E remains later QA under README §4.8.

## FE-44: Distinct issue ranges and stable Timeline date controls

- Model fit: bounded frontend visual repair after the FE-43 screenshot review.
- Prerequisites: FE-43 source present and no active writer owns the Timeline workspace/toolbar files.
- Read: [exact resource-issue semantics](timeline-centered-lanes.md#23-issue-tint-top-rail-and-exact-intervals), [horizon/toolbar behavior](timeline-density-navigation.md#3-horizon-date-state-and-horizontal-pan-contract). This packet changes visual encoding and control layout only; it does not change issue dates, horizon math, API or selection semantics.

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx` (issue-cell presentation metadata only), `frontend/src/components/timeline/timeline-density.css`, `frontend/src/components/timeline/timeline-toolbar.tsx` (short visible period label only), `frontend/src/components/timeline/timeline-navigation.css`. No shared styles, legend taxonomy, route/horizon algorithm, data adapter, backend, seed, package, `.env`, or tests.

Objective: Make adjacent danger-level issue runs distinguishable without restoring the long horizontal issue line. Conflict days remain a soft solid danger tint; unavailable days use a restrained hatched danger tint matching the legend; maintenance remains warning. Mark only the start/end of each exact issue-set run with subtle vertical edge accents. Centered issue icon/count and full-run hover/focus/click target remain unchanged, with real dates in preview/detail. Stabilize the toolbar columns and date-control widths across 2-week/Month mode; use a short visible range label with the existing full accessible title, prevent Today/arrows/horizon buttons from shrinking or overlapping, and reflow the controls at narrower widths.

Development handoff: inspect exact issue/run data-to-class mapping, CSS precedence, toolbar widths and narrow-layout wrapping; run frontend build/lint and `git diff --check` only. Browser/E2E QA remains deferred under README §4.8.

## FE-45: Consistent hatched resource-issue ranges

- Model fit: bounded visual repair from the next Timeline screenshot review.
- Prerequisites: FE-44 source present; no other writer owns the Timeline issue presentation files.
- Read: [exact resource-issue semantics](timeline-centered-lanes.md#23-issue-tint-top-rail-and-exact-intervals). This packet supersedes FE-44's solid conflict/maintenance fill and double-sided run-edge treatment only. Issue records, exact dates, severity, icon/count, click/hover target, and booking/pan behavior remain unchanged.

Allowed files: `frontend/src/components/timeline/timeline-workspace.tsx` (issue-cell presentation metadata only), `frontend/src/components/timeline/timeline-density.css`, this FE-45 packet in `docs/implementation/frontend-tasks.md`. No shared styles, legend taxonomy/component, toolbar, route/horizon algorithm, data adapter, API/backend/seed, packages, `.env`, or test files.

Objective: Give maintenance, conflict and unavailable resource-day tints one cohesive diagonal-hatch language, with warning vs danger hue and a stronger hatch for unavailable than conflict. Keep fills restrained behind readable booking blocks and per-day gridlines. At adjacent exact issue-set runs, draw one clear vertical separator rather than two overlapping start/end strokes; at an exposed run end, retain one end edge. Do not extend a run into its neighbor, merge different issue IDs/kinds, add horizontal range rules, or recolor weather/no-issue days. Keep the persistent legend's existing issue taxonomy; match its issue swatch styling to the new fills in the allowed CSS only.

Screenshot refinement: keep diagonal hatching sparse enough to read at a glance, make the exposed end edge no heavier than the start edge or ordinary gridline, and return the group-progress/conflict-underline horizontal accents to a quieter weight. These are CSS-only presentation refinements; exact issue dates and booking data remain frozen.

Development handoff: inspect per-run adjacency, CSS specificity/gridlines and legend swatches; run static frontend build/lint and `git diff --check` only. Browser/E2E QA remains deferred under README §4.8.

## FE-46: Uniform issue boundaries and compact Timeline legend

- Model fit: bounded visual follow-up from the FE-45 screenshot review.
- Prerequisites: FE-45 source present; no other writer owns the Timeline density/legend files.
- Read: [exact resource-issue interval semantics](timeline-centered-lanes.md#23-issue-tint-top-rail-and-exact-intervals), [persistent legend taxonomy](timeline-centered-lanes.md#25-weather-and-persistent-legend). This packet changes presentation only; date sets, issue counts, severity priority, booking behavior and pan are frozen.

Allowed files: `frontend/src/components/timeline/timeline-density.css`, `frontend/src/components/timeline/timeline-legend.tsx`, this FE-46 packet in `docs/implementation/frontend-tasks.md`. No shared stylesheet, workspace issue derivation, route, API/backend/seed, dependencies, `.env`, or test files.

Objective: Make each visible start/end of a resource issue run read as the same stronger boundary weight, including where it touches a normal day or a different issue run, without drawing double strokes or covering booking blocks. Keep the restrained diagonal fills and exact-day gridlines. Refresh the legend swatches so maintenance, conflict, unavailable and no-go weather visually match the current Timeline; remove redundant generic tint copy but preserve all three semantic groups and text equivalents. Arrange the groups in a compact, readable desktop footer instead of one very long row; keep narrow/mobile overflow accessible without clipping controls or consuming excessive Timeline height.

Development handoff: inspect CSS layering, boundary adjacency, legend wording/swatch parity and responsive footer height; run static frontend build/lint and `git diff --check` only. Browser/E2E QA remains deferred under README §4.8.
