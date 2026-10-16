# Ripple Product and Frontend Build Plan

Status: proposed implementation plan  
Date: 13 October 2026  
Primary target: a polished hackathon product that remains credible as an industrial operations application

This plan turns the product proposal, technical plan, team summary, current timeline prototype, and the design system into one build direction. It is intentionally more specific than a normal product brief so the team can implement without reopening basic UX and architecture decisions.

For FE-15+/BE-16+/INT-10+ synthetic-preview implementation, the [INT-10 frozen contract](../implementation/productization-plan.md) supersedes older MVP-off controls, unversioned API paths, multi-entity command search, reset-all language, and utilization wording below. This document remains product context, not permission to ship Alerts, upload, or real-data production behavior.

Detailed control behavior, page-to-page handoffs, component ownership, button-to-API contracts, query invalidation, state machines, and per-screen acceptance criteria live in the [UI/UX interaction specification](../design/uiux-interaction-spec.md). Backend architecture, agent workflow, solver, persistence, streaming, reliability, security, testing, and deployment contracts live in the [backend and agentic specification](../engineering/backend-agentic-spec.md). The three documents are one implementation plan and should be reviewed together.

## 1. Product decision in one paragraph

Ripple is not a schedule editor with a chatbot attached. It is a decision workspace for operational schedule changes. A planner receives a request, disruption, or opportunity; Ripple converts unstructured information into a structured case; the engine and solver verify possible responses; the planner approves, rejects, or adds context; and the product updates schedule, readiness, and decision history as one traceable flow.

The schedule timeline remains the main operational surface. Readiness, change intake, AI reasoning, option comparison, approval, and audit history are connected views of the same decision, not separate mini-products.

## 2. Decisions this plan locks

1. Use React 19, TypeScript, Vite, Tailwind CSS v4, and customized shadcn/ui.
2. Keep the existing design system as the visual source of truth. Tailwind and shadcn consume its tokens; they do not replace its visual language.
3. Use a wide top navigation instead of a permanent global sidebar. The timeline needs horizontal space.
4. Use eight screen templates, but expose only four items in primary navigation.
5. Make the AI contextual. It opens as a global work panel from operational pages and becomes an embedded decision panel inside the Decision Workspace.
6. Do not use a generic floating chat bubble.
7. Use a custom CSS-grid timeline. Do not introduce a heavy Gantt library for the prototype.
8. Keep all schedule writes behind explicit human approval. The agent has no direct schedule-write action.
9. Keep filters, selected dates, tabs, and compare mode in the URL so a view can be refreshed, bookmarked, and shared.
10. Optimize for a 1366 x 768 laptop first. The dense timeline gets a purpose-built mobile list view rather than being compressed into an unusable miniature Gantt.

## 3. Product principles

### 3.1 Trust before spectacle

- Numbers shown in explanations must come from engine or solver output.
- Every recommendation shows evidence, data freshness, conditions, and solver status.
- "Conditional" is a structural state, not a decorative badge.
- The interface distinguishes model interpretation, deterministic checks, company policy, and human confirmation.
- The UI says "best feasible plan found" unless the solver explicitly proves optimality.

### 3.2 Context never disappears

- Date headers stay sticky while the schedule scrolls vertically.
- Resource labels stay sticky while the timeline scrolls horizontally.
- Group labels stay sticky within their vertical section.
- The schedule legend stays visible at the bottom of the timeline viewport.
- The active event, selected option, and schedule version remain visible while the user reviews evidence or replies to the agent.

### 3.3 Density with hierarchy

- The product is dense because planners compare many objects, not because every region is visually loud.
- Borders and surface changes create hierarchy before shadows.
- One color axis communicates one meaning.
- Text, icons, labels, and status shapes always accompany color.
- Progressive disclosure hides explanation depth without hiding risk or approval requirements.

### 3.4 AI proposes, systems verify, humans decide

| Layer | Responsibility | Visual treatment |
|---|---|---|
| Company policy | Allowed levers, required approver, cost weight | Neutral policy badge and registry link |
| Gemini | Event extraction, contextual framing, lever sequence, explanation | Ripple agent identity and reasoning trace |
| Engine and solver | Dates, capacity, weather, feasibility, KPIs | Monospace values, verified icon, evidence link |
| Planner | Approve, reject, correct context, confirm conditions | Explicit decision bar with actor and consequences |

## 4. Users and jobs to be done

### 4.1 Primary user: planner or scheduler

Needs to understand what changed, find a feasible response, compare trade-offs, keep locked commitments safe, and make a defensible decision quickly.

Primary jobs:

- See the current resource plan and where capacity is tight.
- Understand whether a requested date is possible.
- See which readiness item or shared resource blocks it.
- Compare options without manually reconciling multiple spreadsheets.
- Approve, reject, or reply with additional operational context.
- Explain the decision to operations, logistics, vendors, and management.

### 4.2 Contributing user: production or operations engineer

Needs to submit urgency and context, then understand why a request can or cannot be met.

### 4.3 Contributing user: logistics or warehouse coordinator

Needs a prioritized readiness list, changed loading requirements, and clear dates after a plan is approved.

### 4.4 Reviewing user: manager or auditor

Needs decision rationale, estimated impact, conditions, policy compliance, source freshness, and an immutable record.

### 4.5 Prototype role model

Authentication and role enforcement stay out of hackathon scope. The prototype uses one Planner identity but includes audience-specific explanation tabs. The information architecture must not prevent real roles from being added later.

## 5. Information architecture

### 5.1 Screen count

Build eight screen templates:

| No. | Screen | Route | Primary purpose | MVP priority |
|---|---|---|---|---|
| 1 | Fleet Timeline | `/timeline` | Current resource plan, constraints, and capacity | Must |
| 2 | Readiness Board | `/readiness` | Cross-job readiness work queue ranked by slack | Must |
| 3 | Change Inbox | `/changes` | Intake and triage of requests, disruptions, and opportunities | Must |
| 4 | Decision Workspace | `/changes/$eventId` and `/decisions/$planId` | Agent trace, verified options, comparison, reply, and approval | Must |
| 5 | Decision History | `/history` | Auditable record of accepted, rejected, and superseded plans | Should |
| 6 | Alerts and Daily Check | `/alerts` | Future proactive risks and suggested replans | MVP-off; no route/control rendered |
| 7 | Policy and Data Health | `/settings/policy` | Action registry, source freshness, model assumptions | Should as read-only |
| 8 | Demo Lab | `/demo` | Guided scenarios, reset, and A-12 side-by-side comparison | Must for judging |

The route count is larger than the navigation count because operational details deserve stable URLs, while the primary navigation must stay compact.

### 5.2 Primary navigation

The 56 px global header contains:

- Product mark and active scenario name.
- Primary tabs: Timeline, Readiness, Changes, History.
- Global search or command launcher.
- No Alerts icon/count while the feature is MVP-off.
- `Ask Ripple` button.
- `Reset selected scenario` action, visually secondary and available only when metadata says `reset_allowed`.
- User or environment menu containing Policy and Data Health.

Do not put Policy and Demo Lab as equal top-level tabs. Alerts is MVP-off and has no rendered navigation/control.

### 5.3 Navigation behavior

- `Ctrl/Cmd + K` opens page-navigation search only. Entity search stays within its owning page; it is not the AI prompt.
- `Ctrl/Cmd + J` opens or closes the Ripple panel.
- Browser back restores previous filters and selected object through typed URL search parameters.
- A selected job can deep-link as `/timeline?job=A-12&from=0&to=14`.
- A readiness filter can deep-link as `/readiness?risk=critical&group=job`.
- Every event and decision has a stable URL.

### 5.4 Context continuity between screens

- Clicking a timeline job opens a quick inspector without leaving the timeline.
- From that inspector, `Open readiness` preserves the selected job filter.
- From readiness, `Investigate with Ripple` creates or links a change event with the item context prefilled.
- From a change, `Review plan` enters the Decision Workspace.
- After approval, `View applied changes` returns to the timeline with moved blocks highlighted.
- Every applied schedule change links back to the decision record that caused it.

## 6. Global application shell

### 6.1 Desktop anatomy

```text
+--------------------------------------------------------------------------------+
| Ripple | Timeline Readiness Changes History | Search | Ask Ripple | Environment |
+--------------------------------------------------------------------------------+
| Optional page toolbar: date, filters, view controls, page actions               |
+--------------------------------------------------------------------------------+
|                                                                                |
|                         active page workspace                                  |
|                                                                                |
+--------------------------------------------------------------------------------+
```

- The global header is fixed.
- Page toolbars are sticky below the global header only where needed.
- Timeline and Decision Workspace consume the remaining viewport height and own their scroll containers.
- Standard pages scroll normally below the header.

### 6.2 Why there is no global sidebar

The timeline needs every horizontal pixel at 1366 px. A persistent sidebar would compete with the sticky resource rail and make date comparison harder. The top navigation also keeps the prototype close to the current visual direction.

### 6.3 Responsive behavior

| Width | Behavior |
|---|---|
| `>= 1440` | Full navigation labels, dockable agent panel, three-column Decision Workspace when useful |
| `1200-1439` | Full core navigation, agent panel overlays by default, two-column Decision Workspace |
| `768-1199` | Collapsed navigation menu, timeline remains scrollable, inspector becomes a sheet |
| `< 768` | Read-only operational summary and agenda/list schedule; decision actions require explicit confirmation and use full-screen sheets |

Mobile is a companion experience, not the primary planning surface. Do not force the desktop Gantt into a narrow viewport.

## 7. Screen specifications

### 7.1 Fleet Timeline

Purpose: answer "what is planned, what is constrained, and where is capacity available?"

Layout:

- Compact metric strip for **Average planned load across resources**, group planned capacity load, readiness risk, and conflicts; denominator and sample count come from actual schedule capacity points.
- Page toolbar with date navigation, actual Today or Scenario start, range selector, and functional group/filter controls; hide export until implemented.
- Sticky resource rail on the left.
- Sticky day/month calendar header.
- Vertically sticky group headers for Barges, Supply Boats, Test Bays, and Lift Crews.
- Timeline canvas with semantic job blocks.
- Sticky bottom legend and horizontal scrollbar.
- Context inspector as a right-side sheet when a block is selected.

Timeline block content, in priority order:

1. Job or activity code.
2. Activity type.
3. Status or condition marker.
4. Vendor or responsible party only when space allows.
5. Readiness, conflict, and lock indicators.

Color rules:

- Vendor ownership uses outline and soft fill: Baker green, Powerlift red, Schlumberger blue, no vendor neutral gray.
- Status uses shape and small semantic indicators, not a second full-card color layer.
- Progress is a subtle left-to-right overlay only when it represents completed time or confirmed execution.
- Hatching means tentative or conditional time, never visual decoration.
- Red conflict treatment appears only when a modeled constraint is violated.
- Selection uses a navy focus ring and elevation.

Core interactions:

- Hover shows compact facts without moving layout.
- Click opens the job inspector.
- Shift-click compares two jobs or activities.
- Date and resource filters stay in the URL.
- After approval, changed blocks animate once for 600-800 ms and retain a `Changed by decision` marker until dismissed.
- Drag-and-drop schedule editing is not part of the hackathon MVP. The decision flow is the write path.

Required states:

- Empty resource row.
- Loading skeleton that preserves calendar width.
- Conflict and over-capacity state.
- Stale source state.
- Conditional activity state.
- No-go weather shading.
- Schedule version changed while viewing.

### 7.2 Readiness Board

Purpose: answer "what must become ready next, what is late, and which source needs confirmation?"

Recommended layout:

- Top summary: critical items, due in 48 hours, stale sources, proposed AI updates.
- Filter bar: slack, job, vendor, readiness step, confidence, source freshness.
- Main table grouped by urgency by default: Negative slack, Due soon, On track.
- Optional grouping by job or readiness stage.
- Right detail drawer for the selected item.

Primary columns:

- Status checkbox.
- Item and job.
- Required by.
- ETA range.
- Slack.
- Confidence.
- Source and last updated.
- Responsible party.
- Suggested update state.

Rules:

- Negative slack is the strongest urgency treatment.
- Staleness is separate from lateness. An item can be on time but based on stale data.
- AI-proposed updates are never silently applied. The user accepts or rejects them.
- A readiness tick is one of the few direct write paths and must show who changed it and when.

### 7.3 Change Inbox

Purpose: turn scattered change messages into a visible work queue.

Layout:

- Segmented tabs: All, Requests, Disruptions, Opportunities.
- Status filters: Needs review, Agent running, Options ready, Waiting for confirmation, Decided.
- Dense event list on the left or full-width table at smaller desktop widths.
- Selected event preview on the right.
- Prominent `New change` button.

Event row content:

- Nature icon and label.
- Short extracted title.
- Affected jobs and target date.
- Source channel and received time.
- Current state.
- Risk or missing-info indicator.
- Estimated urgency.

New change flow:

1. Paste text or choose a sample message.
2. File upload is post-MVP; the synthetic preview uses paste text only.
3. Review extracted fields.
4. Resolve missing information or correct extraction.
5. Start investigation.

Do not make users begin with a complex structured form. The structured extraction review appears after paste and gives the planner control before optimization starts.

### 7.4 Decision Workspace

Purpose: make one high-stakes schedule decision with sufficient context and evidence.

This is the core product screen and replaces the idea of a generic full-page chatbot.

Desktop layout at 1366 px:

```text
+----------------------+--------------------------------+------------------------+
| Event context        | Plan impact and option compare | Ripple decision panel  |
| 260-300 px           | flexible                       | 360-400 px             |
| source, extraction,  | mini timeline, KPI deltas,     | trace, explanation,    |
| constraints, policy  | conditions, readiness impact   | reply, decision bar    |
+----------------------+--------------------------------+------------------------+
```

At narrower widths, event context becomes a collapsible sheet and the main area uses two columns.

Workspace sections:

- Event summary and verbatim source excerpt.
- Extracted jobs, date, hard constraints, preferences, risk tags, and ruled-out levers.
- Lever trace showing the sequence attempted and why each step advanced or stopped.
- Option comparison for Production first, Stability first, and Low risk profiles.
- Before/after mini timeline.
- KPI deltas: modeled barrels, jobs moved, minimum slack, expedites, solve time.
- Conditions and required approvers.
- Counterfactual: what would make the requested target possible.
- Evidence drawer mapping claims to tool results.
- Audience explanation tabs for Planner, Management, and Logistics.
- Persistent decision bar: Approve option, Reject, Reply and replan.

Approval rules:

- An option must be explicitly selected.
- Conditions must be individually acknowledged.
- Outside-model conditions cannot look equivalent to verified facts.
- Approval revalidates against current `schedule_version`.
- A 409 stale-version response blocks approval and offers `Recompute with latest schedule`.
- The confirmation dialog summarizes exactly which jobs, dates, readiness items, and cargo assignments will change.

Rejection rules:

- Reason is required.
- Rejecting a request closes it unless the user chooses `Reject and ask for new options`.
- A disruption cannot be rejected as an event that happened. The planner can reject the proposed response and request another replan.

Reply rules:

- The reply becomes new context linked to the previous plan.
- The old plan remains visible and becomes superseded, not overwritten.
- The UI highlights which extracted constraints changed because of the reply.

### 7.5 Decision History

Purpose: answer "what did we decide, why, and what changed?"

Layout:

- Searchable and filterable decision table.
- Filters for date, nature, status, job, decision actor, conditional state, and estimated impact.
- Detail drawer or stable decision detail route.
- Timeline of event, plans, replies, approval, applied changes, and notification drafts.

The history record shows:

- Original source and extracted event.
- Every plan version.
- Selected option and alternatives considered.
- Rejection or reply reasons.
- Engine evidence and policy checks.
- Schedule version before and after.
- Applied changes and actor.

History is read-only. The product may offer `Start a similar change`, but never edits the old record.

### 7.6 Alerts and Daily Check

Post-MVP reference only. Do not render this page, alerts count, or daily-check control in the synthetic preview.

Purpose: make proactive risk useful without turning the product into a noisy notification center.

Alert groups:

- Negative readiness slack.
- Data stale beyond policy threshold.
- Weather window risk.
- Capacity conflict.
- Conditional commitment approaching its confirmation deadline.
- Opportunity created by an early readiness update or free resource gap.

Each alert has severity, affected objects, evidence, suggested next action, owner, and state. `Investigate with Ripple` creates an event with context already attached.

### 7.7 Policy and Data Health

Purpose: explain what Ripple is permitted to do and how trustworthy the current data is.

Sections:

- Action registry table: lever, allowed state, approver, cost weight, last changed.
- Weight profiles: Production first, Stability first, Low risk.
- Risk tag rules and their deterministic engine effects.
- Freshness policy and stale threshold.
- Data source health and last synchronization.
- Scenario assumptions for the prototype.

For the hackathon this page is read-only. Editing policy is a later role-controlled feature.

### 7.8 Demo Lab

Purpose: guarantee that judges can understand and run the core story with no setup.

Contents:

- Scenario cards for A-12 request, A-12 with test-bay constraint, D-07 disruption, and E-02 opportunity when ready.
- One-sentence learning goal on every scenario card.
- Reset the selected synthetic scenario only, with confirmation and seed-version disclosure; there is no reset-all action.
- Side-by-side A-12 comparison showing how one sentence changes the lever set and outcome.
- Guided steps that point to the current action without locking the user into a tour.
- Cached or recorded fallback state when the model endpoint is unavailable.

## 8. Ripple agent experience

### 8.1 Three entry modes

1. **Submit a change**: paste a message, review extraction, then investigate. File upload is MVP-off.
2. **Ask about current context**: ask a read-only question about the selected job, resource, readiness item, or plan.
3. **Reply and replan**: add a hard constraint or preference to an existing plan and generate a new version.

The mode is always visible above the composer. A user must not accidentally turn a question into a schedule-change event.

### 8.2 Placement

- The header `Ask Ripple` button opens a 420-460 px contextual sheet.
- The sheet overlays the Timeline at 1366 px so the calendar width does not reflow unexpectedly.
- On large displays it can be pinned.
- Inside the Decision Workspace, the same components render as an embedded panel with no duplicate conversation state.
- On mobile it becomes a full-screen sheet.

### 8.3 Agent state machine

```text
Draft input
  -> Extracting
  -> Needs clarification | Extraction ready
  -> Investigating
  -> Solver running
  -> Options ready
  -> Pending decision
  -> Approved | Rejected | Replied and replanning
  -> Applied and logged
```

Error branches:

- Input rejected or unreadable.
- Agent stream disconnected.
- Tool timeout.
- Solver returns infeasible.
- Numeric checker replaces the generated explanation.
- Schedule version changes before approval.
- Model unavailable and recorded demo result offered.

### 8.4 Streaming behavior

Use SSE event types already defined by the technical plan:

- `step`: user-readable phase update.
- `tool_call`: compact action with input summary.
- `tool_result`: expandable deterministic result.
- `plan`: structured options and recommendation.
- `error`: recoverable or terminal problem with next action.
- `done`: stream complete.

Render real events as they arrive. Do not simulate typing. Tool results use a compact trace row and expand on demand. The default view shows enough work to build trust without forcing the planner to read raw JSON.

### 8.5 Composer behavior

- Context chips show selected job, resource, event, or plan.
- `x` removes a context chip before sending.
- The primary action label changes by mode: `Analyze change`, `Ask`, or `Reply and replan`.
- Sample messages appear only in demo mode or an empty state.
- The composer supports multiline text and file attachment, but attachment remains feature-gated until backend support is ready.

### 8.6 Agent response anatomy

1. Short answer or current step.
2. Verified facts and blockers.
3. Recommended action or option.
4. Conditions and uncertainty.
5. Evidence links.
6. Structured next actions.

Never bury a stale-source warning or outside-model condition in a long paragraph.

## 9. End-to-end business flows

### 9.1 Request flow

1. User submits a request from Change Inbox or contextual agent panel.
2. System stores the raw source as an event.
3. Gemini extracts nature, cause, jobs, dates, constraints, risk tags, and ruled-out levers.
4. User reviews critical extraction fields when confidence is low or information is missing.
5. Agent retrieves schedule, readiness, capacity, and weather data.
6. Agent gets the action registry and closes any levers ruled out by context.
7. Solver runs with no levers, then opens permitted levers one at a time as needed.
8. System presents verdict, options, trade-offs, counterfactual, conditions, and evidence.
9. Planner approves, rejects with a reason, or replies with more context.
10. Approval revalidates the selected option and schedule version.
11. One transaction updates schedule, cargo assignment, readiness, decision log, and schedule version.
12. Frontend invalidates affected queries and highlights applied changes.
13. Optional notification drafts appear after approval.

### 9.2 Disruption flow

1. User submits a vendor update, forecast change, or operational failure.
2. System distinguishes what has happened from what can still be decided.
3. Proposed ETA and risk updates wait for confirmation when they come from untrusted text.
4. Once accepted for the analysis, the engine evaluates the new state.
5. Ripple returns replan options rather than a yes/no verdict.
6. The planner may reject an option but cannot reject the underlying event.
7. The selected replan follows the same revalidation, transactional write, and audit path as a request.

### 9.3 Opportunity flow

1. Early readiness or newly free capacity creates an opportunity event.
2. Ripple verifies that pulling work forward does not create a downstream conflict.
3. The user can accept, dismiss, or defer the opportunity.
4. Dismissal is logged but does not require a rejection reason in the MVP.

### 9.4 Readiness update flow

1. User ticks an item or reviews an AI-proposed update.
2. The change records source, actor, and timestamp.
3. Readiness slack is recalculated.
4. A schedule risk can create an alert but does not auto-run a replan unless the user starts one or the daily-check policy allows it.

### 9.5 Daily check flow

1. Engine identifies negative or low-slack items, stale data, conflicts, and approaching conditional deadlines.
2. Agent writes short alert summaries from deterministic results.
3. Alerts are deduplicated by affected object and condition.
4. User starts an investigation from an alert.
5. The resulting event and decision link back to the originating alert.

## 10. Frontend technical architecture

### 10.1 Recommended stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | React 19 + TypeScript + Vite | Matches current prototype and technical plan |
| Styling | Tailwind CSS v4 | Token-driven utilities, fast dense-layout work |
| UI primitives | shadcn/ui, locally owned and customized | Accessible primitives without a fixed visual theme |
| Routing | TanStack Router | Typed routes and validated URL search state for dense filters and deep links |
| Server state | TanStack Query | Fetch, cache, mutation, invalidation, and stale-state handling |
| Data table | TanStack Table | Headless control for readiness, inbox, and history tables |
| Forms | React Hook Form + Zod | Explicit validation for intake, rejection, reply, and extraction correction |
| API types | openapi-typescript + openapi-fetch | Pydantic/OpenAPI remains the contract source of truth |
| Agent streaming | `@microsoft/fetch-event-source` | POST request with SSE response and reconnection control |
| UI-only state | Zustand only if context/reducer becomes unwieldy | Keep transient panel and timeline preferences out of server cache |
| Dates | date-fns | Small, composable date and range formatting |
| Icons | Phosphor Icons | Already used by the design system |
| Notifications | Sonner through shadcn | Appropriate for concise mutation feedback |
| Resizable layout | shadcn Resizable / react-resizable-panels | Decision Workspace and pinned agent panel |
| Testing | Vitest + Testing Library + MSW + Playwright | Unit, interaction, API-mock, and critical-flow browser coverage |

Do not add another styled component kit such as MUI, Ant Design, Chakra, or Mantine. Their visual and spacing systems would compete with the custom design system. Headless libraries are acceptable when they solve behavior rather than visual styling.

### 10.2 Why TanStack Router

The application has meaningful URL state: date range, resource group, selected job, readiness filters, inbox state, compare mode, and decision tabs. A typed router makes that state bookmarkable and refactor-safe. React Router remains a valid lower-dependency alternative, but TanStack Router aligns better with this product's filter-heavy workspace.

### 10.3 Why not a Gantt library

The prototype needs a controlled 14-30 day grid, grouped resources, sticky axes, semantic blocks, and custom overlays. A general Gantt library adds interaction assumptions, styling cost, and bundle weight before the team needs dependencies, critical-path calculation, or freeform drag scheduling. Build the canvas with CSS grid and a small coordinate model.

### 10.4 Server state boundaries

TanStack Query owns:

- Schedule and schedule version.
- Resources and bookings.
- Readiness items.
- Events and event extraction.
- Plans and plan versions.
- Decisions and alerts.
- Action registry and data health.

Route search state owns:

- Date range and timeline zoom.
- Resource and status filters.
- Selected object IDs when the selection should survive refresh.
- Current inbox or history tab.
- Compare mode and selected option IDs.

Local component state owns:

- Hover state.
- Unsubmitted text.
- Expanded evidence rows.
- Temporary drawer and popover state.

Do not duplicate API objects into a global client store.

### 10.5 Query key plan

```ts
scheduleKeys.range({ from, to, groups, filters })
readinessKeys.list(filters)
readinessKeys.detail(itemId)
eventKeys.list(filters)
eventKeys.detail(eventId)
planKeys.detail(planId)
decisionKeys.list(filters)
alertKeys.list(filters)
policyKeys.registry()
policyKeys.dataHealth()
```

After plan approval, invalidate schedule ranges containing changed days, readiness lists, selected job detail, event detail, decision history, alerts, and schedule version. Prefer targeted invalidation but use a broad operational invalidation for the hackathon if contract certainty is low.

## 11. Design system implementation with Tailwind and shadcn

### 11.1 Token migration

Keep `frontend/src/design-system.css` as the canonical semantic palette during migration. Move reusable values into one Tailwind v4 theme entry file using `@theme inline` mappings.

Token layers:

1. Foundation: canvas, surfaces, text, borders, spacing, radius, type, shadow.
2. Semantic: primary, info, success, warning, critical, focus, disabled.
3. Domain: vendor colors, conditional, stale, conflict, no-go weather, verified.
4. Component: control height, timeline row height, resource rail width, agent panel width.

Pages consume semantic or component tokens. They do not reference raw color hex values.

### 11.2 shadcn customization policy

- Initialize shadcn with CSS variables and Tailwind v4.
- Treat generated files as source code owned by the project.
- Replace default radius, shadows, type, spacing, and focus ring with Ripple tokens before widespread use.
- Keep every primitive under `src/components/ui/`.
- Wrap primitives with domain components under `src/components/ripple/` when behavior or semantics repeat.
- Pages must not repeatedly override the same primitive with long one-off class strings.
- Use `class-variance-authority` for stable variants.
- Preserve Radix behavior and accessibility attributes while restyling.

### 11.3 shadcn components to install first

Foundation batch:

- Button, Input, Textarea, Label.
- Select, Checkbox, Radio Group, Switch.
- Badge, Separator, Skeleton.
- Tooltip, Popover, Dropdown Menu.
- Dialog, Alert Dialog, Sheet, Drawer.
- Tabs, Collapsible, Accordion.
- Command, Scroll Area, Resizable.
- Table, Pagination.
- Sonner.

Install components in batches and inspect generated diffs. Do not run a later `--overwrite` command over customized components without reviewing it.

### 11.4 Domain component inventory

#### Shell and navigation

- `AppShell`
- `GlobalHeader`
- `PrimaryNav`
- `PageToolbar`
- `CommandSearch`
- `ScenarioSwitcher`
- `DemoResetButton`

#### Timeline

- `TimelineViewport`
- `TimelineCalendar`
- `ResourceRail`
- `ResourceGroupHeader`
- `ResourceRow`
- `TimelineBlock`
- `CapacityTrack`
- `WeatherBand`
- `TodayMarker`
- `TimelineLegend`
- `JobInspector`

#### Readiness and data

- `ReadinessTable`
- `SlackIndicator`
- `FreshnessBadge`
- `ConfidenceBadge`
- `SourceReference`
- `SuggestedUpdateReview`
- `DataHealthSummary`

#### Agent and decisions

- `RipplePanel`
- `AgentComposer`
- `ContextChip`
- `AgentRunTimeline`
- `ToolTraceRow`
- `LeverTrace`
- `PlanOptionCard`
- `OptionCompareTable`
- `ConditionList`
- `EvidenceDrawer`
- `AudienceExplanation`
- `DecisionBar`
- `ScheduleDiff`
- `VersionConflictDialog`

#### Shared product primitives

- `MetricStrip`
- `EntityLink`
- `StatusBadge`
- `EmptyState`
- `ErrorState`
- `InlineAlert`
- `FilterBar`
- `DetailSheet`

## 12. Suggested frontend structure

```text
frontend/src/
  app/
    router.tsx
    providers.tsx
    query-client.ts
  routes/
    __root.tsx
    timeline.tsx
    readiness.tsx
    changes.index.tsx
    changes.$eventId.tsx
    decisions.$planId.tsx
    history.tsx
    alerts.tsx
    settings.policy.tsx
    demo.tsx
  components/
    ui/                    # customized shadcn source
    shell/
    timeline/
    readiness/
    changes/
    decision/
    agent/
    shared/
  features/
    schedule/
    readiness/
    events/
    plans/
    decisions/
    alerts/
    policy/
  api/
    client.ts
    generated.ts
    query-keys.ts
    errors.ts
  mocks/
    browser.ts
    handlers/
    fixtures/
    streams/
  lib/
    cn.ts
    dates.ts
    timeline.ts
    format.ts
  styles/
    globals.css
    tokens.css
    timeline.css
  test/
    setup.ts
```

Feature folders contain API hooks, domain mappers, and focused state logic. Route files compose features but do not contain large domain implementations.

## 13. Domain model the UI should expect

### 13.1 Core entities

- `Job`: identity, site, type, dates, duration, priority metric, locked state, operational status.
- `Resource`: barge, supply boat, test bay, crew, capacity and unit.
- `Booking`: resource allocation over time or capacity.
- `ReadinessItem`: stage, ETA range, required date, slack, confidence, freshness, source.
- `ChangeEvent`: request, disruption, or opportunity plus extracted context.
- `Plan`: verdict, versions, options, recommendation, explanation, evidence, base schedule version.
- `PlanOption`: changes, levers, conditions, solver status, KPIs, violations.
- `Decision`: approve, reject, or reply with actor, reason, and timestamp.
- `Alert`: condition, severity, evidence, owner, and resolution state.

### 13.2 UI-specific derived models

Create mapper functions rather than letting components reinterpret API data independently:

- `TimelineRowModel`
- `TimelineBlockModel`
- `ReadinessRiskModel`
- `EventListItemModel`
- `PlanComparisonModel`
- `AgentTraceModel`
- `DecisionAuditModel`

All formatted dates and numbers derive from one formatting layer so the same value is not rendered differently across screens.

## 14. API and mutation behavior

### 14.1 Contract generation

- FastAPI Pydantic models are the source of truth.
- Generate `generated.ts` from `/openapi.json` in a repeatable script.
- CI or the local verification script fails when generated types are out of date.
- Wrap the generated client with small domain functions; pages never construct raw fetch requests.

### 14.2 Mutation patterns

| Mutation | Optimistic? | Required feedback |
|---|---|---|
| Tick readiness item | Yes, with rollback | Saved actor/time or error |
| Accept/reject suggested readiness update | Yes if contract stable | Source and recalculated slack |
| Create event | No | Event created, extraction starting |
| Reject plan | No | Reason logged and status changed |
| Reply and replan | No | New linked event and streaming run |
| Approve plan | Never optimistic | Revalidation, transaction result, new schedule version |
| Reset demo | Never optimistic | Destructive confirmation and full cache reset |

Approval must never appear complete until the backend confirms the transaction.

### 14.3 Error normalization

Map API errors to typed product states:

- `validation_error`
- `missing_information`
- `stream_disconnected`
- `agent_timeout`
- `solver_infeasible`
- `version_conflict`
- `policy_violation`
- `model_unavailable`
- `unknown_error`

Each type has a product-specific recovery action. Avoid a generic "Something went wrong" when the system knows what happened.

## 15. Mock-first strategy

The frontend must remain fully demonstrable without a live backend.

Use MSW for request-level mocks and a small recorded-stream adapter for SSE. Keep fixtures structurally identical to generated API types.

Required fixtures:

- Baseline schedule with all resource groups.
- A-12 request run.
- A-12 constrained-message run.
- D-07 disruption run.
- Readiness risks and stale items.
- Conditional and infeasible options.
- Approved plan with timeline diff.
- Version conflict.
- Agent timeout and cached fallback.

Mock mode must exercise the same components and query hooks as live mode. Do not create a separate presentation-only frontend path.

## 16. Accessibility and input design

- Meet WCAG AA contrast for text, controls, and state indicators.
- Every timeline block is keyboard focusable and has an accessible name containing job, date range, resource, and status.
- Provide a table or agenda alternative for timeline information.
- Sticky regions must not obscure focused content.
- Focus returns to the invoking object after drawers and dialogs close.
- Destructive and high-stakes actions use explicit labels, not icon-only controls.
- Tooltip content cannot contain the only explanation of a critical state.
- Color is always paired with label, icon, pattern, or border style.
- Respect reduced-motion preferences. Changed-block animation becomes a static marker.
- Maintain at least 44 px pointer targets for mobile and 32-36 px compact controls on desktop with sufficient spacing.

## 17. Loading, empty, and failure states

### 17.1 Loading

- Preserve page structure with skeletons to prevent layout jumps.
- The timeline calendar and rail render before blocks when possible.
- Long agent operations show the actual current phase and elapsed time.
- Solver progress never pretends to be a percentage unless the backend provides one.

### 17.2 Empty

- Empty schedule range: offer date reset.
- No readiness risk: show an all-clear summary without confetti.
- Empty inbox: offer sample message and new change.
- No history: link to the first guided scenario.
- No search results: retain filters and offer clear reset.

### 17.3 Failure

- Stream disconnected: preserve received trace, allow resume or rerun.
- Agent unavailable: show engine-readable state and cached scenario result in demo mode.
- Solver infeasible: show blockers and counterfactual, not an error page.
- Stale approval: show schedule changes since plan creation and offer recompute.
- Partial data: display available information with a conspicuous trust warning.

## 18. Product copy rules

- Use plain operational language and short sentences.
- Use `Request`, `Disruption`, and `Opportunity` consistently.
- Use `Approve option`, not `Apply AI suggestion`.
- Use `Reply and replan`, not `Send message` inside the decision flow.
- Use `Estimated model impact`, never imply measured savings.
- Use `Conditional: confirmation required` for outside-model assumptions.
- Use `Best feasible plan found` unless optimality was proven.
- Use `Last updated 3 days ago` instead of only `Stale`.
- Name the blocking object: `D+5 sailing exceeds deck capacity by 5 units`, not `Capacity issue`.

## 19. Verification strategy

### 19.1 Unit tests

- Timeline day-to-column positioning.
- Block width and clipping.
- Resource grouping.
- Slack and freshness presentation mapping.
- Event and plan status mapping.
- API error normalization.
- Agent stream reducer.
- Approval condition validation.

### 19.2 Component tests

- Keyboard access to timeline blocks and inspectors.
- Readiness filters and checkbox rollback.
- Extraction correction form.
- Lever trace expansion.
- Option selection and conditional acknowledgement.
- Rejection reason requirement.
- Version conflict dialog.

### 19.3 End-to-end tests

Critical path 1:

1. Reset demo.
2. Open A-12 sample.
3. Watch recorded or live run.
4. Select D+5 option.
5. Confirm conditions.
6. Approve.
7. Verify timeline and readiness changes.
8. Open history and verify the audit record.

Critical path 2:

1. Run A-12 constrained-message scenario.
2. Verify expedite lever is ruled out.
3. Verify no earlier feasible plan is recommended.
4. Compare with the first scenario.

Critical path 3:

1. Run D-07 disruption.
2. Verify risk, ETA range, and stale-source treatment.
3. Reply with an additional constraint.
4. Verify a linked plan version is created.

### 19.4 Visual QA viewports

- 1440 x 900.
- 1366 x 768, primary acceptance viewport.
- 1100 x 700, compact laptop stress test.
- 768 x 1024, tablet.
- 390 x 844, mobile companion view.

Check sticky headers, sticky resource rail, sticky group headers, bottom legend, horizontal scroll, focus visibility, long job names, browser zoom at 125%, and empty rows.

## 20. Build sequence

### Phase 0: foundation and migration

Deliverables:

- Install Tailwind v4 and initialize shadcn with CSS variables.
- Map current design tokens to the Tailwind theme.
- Add TanStack Router and Query providers.
- Establish OpenAPI client and MSW mock mode.
- Move the current timeline into the new shell without visual regression.

Exit criteria:

- Existing timeline looks and behaves the same.
- Current production build passes.
- One shadcn button, sheet, input, and tooltip visibly match the design system.
- No page contains raw palette colors.

### Phase 1: product shell and Timeline

Deliverables:

- Global header and route structure.
- Typed date/filter URL state.
- Timeline refactor into domain components.
- Job inspector and changed-block state.
- Responsive and keyboard baseline.

Exit criteria:

- Timeline works at 1366 x 768 with sticky context intact.
- Timeline is reachable and controllable by keyboard.
- Direct URL to a selected job restores the inspector.

### Phase 2: Readiness and Change Inbox

Deliverables:

- Readiness table and detail sheet.
- Slack, confidence, freshness, and proposed-update patterns.
- Change Inbox and new-change paste flow.
- Sample scenario controls.

Exit criteria:

- A user can identify the most urgent readiness item within a few seconds.
- A sample message produces a stored event and opens the Decision Workspace.

### Phase 3: Decision Workspace and agent streaming

Deliverables:

- POST SSE client and typed stream reducer.
- Extraction review.
- Lever trace and evidence drawer.
- Option cards, comparison table, before/after schedule diff.
- Reply and replan version handling.

Exit criteria:

- A-12 works end to end on mocks, then against the live API.
- Every displayed number links to plan or tool evidence.
- Stream failure preserves partial results and offers recovery.

### Phase 4: decisions, history, and trust states

Deliverables:

- Approve, reject, and reply flows.
- Condition acknowledgement.
- Schedule-version conflict handling.
- Decision History and audit detail.
- Read-only Policy and Data Health page.

Exit criteria:

- Approval is transactional and never optimistic.
- A rejected or superseded plan remains auditable.
- Policy and stale-data context are reachable from recommendations.

### Phase 5: Demo Lab and hardening

Deliverables:

- Scenario launcher and reset.
- A-12 side-by-side comparison.
- Cached or recorded fallback.
- Alerts page if backend support is ready.
- Loading, empty, error, and responsive polish.
- Playwright critical-path coverage.

Exit criteria:

- A judge can complete the main story without typing.
- The main story survives a model outage through recorded fallback.
- No console errors at acceptance viewports.
- All public copy follows the claim rules.

## 21. Hackathon scope cut

### Must ship

- Product shell and primary navigation.
- Fleet Timeline.
- Readiness Board.
- Change Inbox paste flow.
- Decision Workspace with streaming trace and option comparison.
- Approve, reject with reason, and reply/replan.
- A-12 pair and D-07 scenario.
- Demo reset and recorded fallback.
- Decision log sufficient to show the approved path.

### Should ship

- Full Decision History filters.
- Read-only Policy and Data Health.
- Evidence drawer.
- Extraction correction UI.
- Conditional acknowledgement and stale-version recovery.
- E-02 opportunity.

### Could ship

- Alerts and daily check.
- File upload.
- Notification drafts.
- Pinned agent panel on wide monitors.
- Plant turnaround demo.

### Explicitly later

- Direct mailbox or WhatsApp integration.
- Login, roles, and multi-site tenancy.
- Manual drag-and-drop schedule editing.
- Editable policy registry.
- Collaborative comments and mentions.
- Decision retrieval with vector search.

## 22. Product analytics for a future pilot

Track only meaningful product events:

- Change submitted.
- Extraction corrected.
- Agent run completed or failed.
- Option viewed and compared.
- Evidence opened.
- Plan approved, rejected, or replied to.
- Time from event creation to decision.
- Version conflict rate.
- Readiness update accepted or rejected.
- Alert investigated or dismissed.

Potential pilot outcomes:

- Median time from change message to approved plan.
- Share of decisions with complete reason and evidence.
- Number of modeled conflicts caught before approval.
- Share of AI extractions corrected by planners.
- Share of recommendations rejected and why.
- Readiness stale-data rate.

Do not present model-estimated barrels as realized business value.

## 23. Security and trust checklist

- Treat pasted and uploaded content as untrusted data.
- Render source text as text, never HTML.
- Restrict attachment type and size before backend processing.
- Never expose system prompts, credentials, or raw internal stack traces.
- Sanitize downloadable filenames and generated notification content.
- Require backend policy checks even if the UI disables an action.
- Revalidate schedule version and constraints at approval.
- Keep the raw source, extracted structure, plan version, decision, and actor linked for audit.
- Clearly label synthetic demo data.
- Keep real company data, keys, and secrets out of the public repository.

## 24. Definition of done

A screen is done when:

- It uses the shared shell, tokens, and domain components.
- Loading, empty, error, stale, and success states are designed.
- Keyboard navigation and focus order work.
- It works at 1366 x 768 and its declared responsive modes.
- API data has a typed contract and mock fixture.
- Critical mutations show consequences and recovery.
- Copy follows the trust and claim rules.
- Build, lint, relevant tests, and browser console pass.

The product is demo-ready when:

- A new judge can identify the current problem, run A-12, understand why D+3 fails, see why D+5 is conditional, approve it, and find the resulting schedule and audit record without team guidance.
- The alternate A-12 message visibly closes the expedite lever and produces a different result from the same baseline data.
- D-07 demonstrates disruption handling, risk tags, ETA uncertainty, and a replan.
- The product remains usable if the live model call fails.

## 25. Recommended first implementation ticket set

1. Add Tailwind v4, shadcn configuration, and token bridge.
2. Add TanStack Router route tree and global shell.
3. Add TanStack Query, API client wrapper, and MSW provider.
4. Refactor the current unified timeline into route-level components with no visual changes.
5. Build `RipplePanel` shell and POST SSE reducer against a recorded stream.
6. Build Readiness Board against typed fixtures.
7. Build Change Inbox and extraction review.
8. Build Decision Workspace option comparison and evidence model.
9. Connect approve/reject/reply mutations and version-conflict state.
10. Build Demo Lab and A-12 compare mode.
11. Add Decision History and Policy/Data Health.
12. Complete Playwright critical paths and acceptance viewport QA.

## 26. Reference choices

- Tailwind v4 theme variables: <https://tailwindcss.com/docs/theme>
- shadcn Tailwind v4 and React 19 support: <https://ui.shadcn.com/docs/tailwind-v4>
- shadcn CSS-variable theming: <https://ui.shadcn.com/docs/theming>
- TanStack Router type safety: <https://tanstack.com/router/latest/docs/guide/type-safety>
- TanStack Router URL state model: <https://tanstack.com/router/latest>
- TanStack Query documentation: <https://tanstack.com/query/latest>

These references support the technical choices. Ripple's visual and interaction decisions continue to come from the [design system](../design/design-system.md) and the current timeline prototype.
