# Frontend Task Catalog

Each task is deliberately bounded for a small coding model. Complete tasks in dependency order. Do not merge task scopes.

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
