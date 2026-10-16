# Ripple connected-app productization plan

Status: development-first synthetic local-candidate contract. INT-10 approved: 2026-10-14; recovery decisions approved: 2026-10-15; product owner deferred unit/API/component tests and E2E/browser QA on 2026-10-16. This document specifies the intended app and later QA handoff; it is not evidence that implementation or public deployment is complete.

This is the post-prototype delta for a coherent, synthetic-data application. The product owner approved the eight INT-10 choices recorded in Sections 3–4 and 6–8: scenario epoch/context, synthetic fleet-scale visibility, server-wide search/count, read-only Ask with evidence, zero-capacity treatment, normalized fleet headline, and manual re-review after approval conflict. The existing PostgreSQL/API source-of-truth and scenario-isolated seed/reset rules are also approved. This approval authorizes the scoped local implementation packets, **not** cloud changes or use of real company data. It does not replace the frozen stack, feature flags, architecture boundaries, or one-task-per-worker rule in [README](README.md). A coding worker reads only the exact sections linked by its packet. `README.md` wins on conflicts. Do not call the public synthetic preview production-ready for real company data: login and roles are frozen off for the MVP.

## 1. Outcome and non-negotiable rules

The user can begin on any route, act on a real synthetic entity, refresh, follow links to other routes, and see the same persisted state. Reset returns that synthetic scenario to a documented baseline. UI polish is complete only after this continuity works.

1. PostgreSQL behind `/api/v1` is the operational source of truth for the synthetic preview. MSW and recorded SSE are test/fallback surfaces, never parallel operational data stores.
2. The current A-12 solver golden scenario remains stable. Scale-test data is a separate scenario, not extra rows quietly appended to the A-12 seed.
3. Read models come from generated FastAPI OpenAPI types. Do not hand-author duplicate API interfaces.
4. No operational schedule write outside the existing approval transaction. Readiness writes use the dedicated readiness endpoints. Ask mode is read-only.
5. No fake-success toast, no no-op action, no control that silently resets to fixture state. Missing contracts are an explicit blocker, not an invitation to invent responses.
6. Existing MVP-off features stay off: auth/roles, Alerts UI, upload, dark mode, drag editing, saved views, daily-check UI, and multi-agent architecture.
7. Every mutation has pending, success, validation-error, network-error, and stale-version behavior; every read has loading, empty, filtered-empty, and error states.

## 2. Verified gap register

| Priority | Current evidence | Required resolution |
|---|---|---|
| P0 | `App.tsx` and `fixture-adapter.ts` render static Timeline rows and default-select `RAMG-01` after inspector close. `TimelineMetricStrip` hardcodes all percentages. | Map one schedule API response to rows, remove default selection, calculate metrics from capacity points. |
| P0 | `readiness-board.tsx` initializes from `mocks/fixtures.ts`; default `mockUpdateReadinessStatus` resolves without saving. | Query readiness API and PATCH actual item; refetch and verify persistence. |
| P0 | `change-inbox.tsx` initializes and Refreshes from `events-fixtures.ts`; some row actions call real endpoints with fixture IDs. New event locally clones the first fixture. | Use event list/detail responses, valid backend IDs, real refresh and lifecycle mapping. |
| P0 | Decision route calls `planWorkspaceById()`, which falls back to A-12 fixture for an unknown ID, while approval/rejection/reply call the real backend. | Fetch `GET /api/v1/plans/{id}`; unknown ID must be a 404 state, never another plan. |
| P0 | `ScheduleState` has a database check `id = 1`; despite a `scenario_id` column, two scenarios cannot coexist in one database. | Senior-reviewed migration to scenario-keyed state is required before a separate fleet-scale seed. Do not ask Luna to work around it by overwriting A-12. |
| P0 | `ripple-panel.tsx` Ask dispatches `ripple:ask`; no listener or answer contract exists. Submit creates an event and immediately starts a run. | Define a read-only answer contract with senior review; until it exists, hide/disable Ask execution truthfully. Submit must complete extraction review before run. |
| P1 | Baseline audit found underlined header anchors and Timeline selection/focus collision. FE-15/FE-16 were subsequently reported complete. | Root review confirms the diff and visual/test evidence; preserve the distinct nav, selection, and focus treatments. |
| P1 | History is live but only the first page is loaded; Timeline links lose target context and “Start similar change” opens the existing event. | Implement cursor loading and valid deep links; new-change prefill must create a new draft. |
| P1 | Policy route passes no-op handlers for opening a lever and explaining an approval owner; affected-source link searches a field Readiness does not search. | Wire supported read-only detail/filter actions or remove controls. |
| P1 | Demo Lab has two local scenarios but backend metadata/reset only knows A-12 base; live Run creates an event then starts a run before extraction validation. | Match backend scenario availability, separate recorded/live, enforce the real lifecycle. |
| P1 | Dates are split between September 2026 frontend fixtures, October 2026 backend seed, and a hardcoded “Today” fixture range. | Define scenario epoch and relative-day conversion once; use “Scenario start” if wall-clock Today is outside the scenario. |

Baseline diagnostic on 2026-10-14: frontend Vitest 33 files / 117 tests passed, but this did not verify persisted cross-page behavior. The preview was inspected read-only on Timeline, Readiness, Changes, Decision, History, Policy, Demo, and Ripple panel. History showed zero records; Readiness showed two fixture items. After FE-15/FE-16, the worker reported 33 files / 120 tests passing, lint/build passing, and selected/focus visual review passing; the root goal still records its own acceptance review.

## 3. Canonical context, entity identity, and data ownership

### 3.1 Context

All operational requests share one scenario context resolved by the existing backend request middleware. The shell displays the active scenario from `GET /api/v1/demo/scenarios`, not hardcoded copy. The root URL search parameter is `scenario`; TanStack Router retains it across navigation, and the shared transport sends that exact ID in `X-Scenario-ID` on GET, PATCH, POST, and resumable SSE. **Preview UX amendment (2026-10-16):** an unqualified local/preview UI entry chooses advertised `fleet-scale`, canonicalizes the URL, and shows the active synthetic-scenario label; if metadata does not advertise fleet-scale, it chooses advertised `A-12-base` and explains that smaller golden scenario. An explicit `scenario=A-12-base` must stay A-12. The backend omitted-header default remains `A-12-base` for compatibility. An explicitly supplied blank or unknown ID is rejected as `404 unknown_scenario` and visibly explained, never silently replaced. The backend allowlist is the set of available synthetic scenario IDs advertised by metadata for the running environment; it validates the header before scenario-scoped reads or writes. The `scenario` URL value and request header must agree; the frontend does not issue an operational request until metadata validation succeeds. A scenario switch clears entity-specific route selection, prior scenario query cache, and ephemeral drafts only after warning about unsaved input. A route or query change must not silently switch scenarios. [Preview recovery §2](preview-ux-recovery.md#2-product-and-data-contract) governs this UI-only default change.

`GET /api/v1/demo/scenarios` keeps existing `scenarios` and `mode` and each entry's existing `scenario_id`, `name`, `description`, `seed_version`, `seed_checksum`, `available`, and `mode`. Add `scenario_start_date` (`YYYY-MM-DD`) and `reset_allowed` (boolean); do not add a duplicate `display_name` field. `A-12-base` uses the seed's `2026-10-13` day-zero date. The new `fleet-scale` seed declares its own fixed day-zero date (use `2026-10-13` for comparable preview timelines). `fleet-scale` is advertised only in synthetic `local`/`preview` environments. Preserve existing A-12 demo availability where configured, but production reset stays disabled; no synthetic scenario is authorization to access real-data tenants. Metadata contains no tenant secret.

Canonical entity IDs: `job_id`, `resource_id`, `booking_id`, `readiness_item_id`, `event_id`, `run_id`, `plan_id`, `option_id`, `decision_id`, and `schedule_version`. The UI may show a short code/name, but all mutations and cross-page links carry canonical IDs. A removed or unknown ID produces a visible not-found/stale notice and is cleared from selection, never mapped to a different fixture object.

Scenario time is integer `D+n` in the domain. Calendar date = `scenario_start_date` plus `n` UTC calendar days; booking ends remain inclusive as in the existing schedule API. If metadata is unavailable, show `D+n` and an error/recorded-mode label rather than an invented month/year. The Timeline control says `Today` only when wall-clock today falls inside the advertised scenario horizon; otherwise it says `Scenario start` and jumps to day zero. API timestamps are UTC ISO-8601; localized UI timestamps show their timezone label.

### 3.2 Read ownership

| Surface | Owner query | Keys / invalidation |
|---|---|---|
| Timeline rows, blocks, capacity | `GET /api/v1/schedule?from&to&groups` | scenario + range + groups; invalidate after approval or reset |
| Readiness queue/detail | `GET /api/v1/readiness`, `GET /api/v1/readiness/{id}` | scenario + filters + item; invalidate after readiness write, approval, reset |
| Change inbox/detail | `GET /api/v1/events`, `GET /api/v1/events/{id}` | scenario + server filters + cursor; invalidate after create/extract/correct/run/decision/reset |
| Run trace | `GET /api/v1/runs/{id}` and `GET /api/v1/runs/{id}/stream` | run ID; reconnect after last sequence; navigation never cancels |
| Decision workspace | `GET /api/v1/plans/{id}` | plan ID and version; invalidate after run or decision |
| Decision History | `GET /api/v1/decisions` and `GET /api/v1/decisions/{id}` | action/cursor and decision ID; invalidate after decision/reset |
| Policy/data health | existing policy GET endpoints | refetch on entry and after reset; policy is read-only |
| Demo metadata/reset | existing demo endpoints | scenario + seed checksum; reset clears all scenario-scoped query cache |

Use the existing TanStack Query provider. Route components own fetching and URL state; feature adapters own OpenAPI-to-view mapping; reusable components never own fetch calls. Local component state is for ephemeral draft, expanded row, or focus—not an operational copy of server state.

### 3.3 Mutation continuity

After a successful mutation, show a server-confirmed result and invalidate the relevant query keys. Do not patch a fixture array as the only success effect. Use server-returned IDs and versions. Approval uses option ID, expected schedule version, condition IDs, idempotency key, and the existing transaction; the resulting changed-object IDs drive a temporary highlight only after refetch. On `409 version_conflict`, preserve the selected option and acknowledgements as a **draft only**, refetch the plan and current schedule, show the current version and changed objects from `GET /api/v1/schedule/changes` when available, and disable approval until the user explicitly recomputes and re-reviews a current plan. Never auto-retry, substitute a newer version, or offer force apply. Copy: “The schedule changed since this option was prepared. Review the latest plan before approving.” Primary action: “Recompute with latest schedule”; secondary: “Return to review.” A retry after an ambiguous network result first checks the server decision/idempotency outcome; it must not create a second approval.

### 3.4 Frozen OpenAPI read-model target

INT-10 decision: **frozen target contract**, not fields that already exist. BE-18/19/20/21 implement the original additions; BE-22/23/24 and INT-17 close the approved §3.5 recovery contract. Frontend code consumes new fields only after regenerated FastAPI OpenAPI passes contract tests. Preserve existing response fields and cursor format unless a packet explicitly changes them.

- Demo scenario metadata adds only `scenario_start_date` (ISO `YYYY-MM-DD`) and `reset_allowed`; keep existing `name`, `seed_version`, and `seed_checksum`. A-12 remains default and `fleet-scale` is advertised only in synthetic local/preview environments.
- `GET /api/v1/events` adds `job_id` to existing `nature`, `state`, `q`, `limit`, `after`. Each summary adds `job_ids: string[]`, `latest_run_id: UUID|null`, `latest_run_state: string|null`, `latest_plan_id: UUID|null`, and `latest_plan_status: string|null`. The list adds `total_count: int` for the full filtered query before cursor pagination and `scenario_lifecycle_counts: {draft, reading_input, needs_clarification, ready_to_investigate, investigating, options_ready, stale, approved, rejected, superseded, failed, integrity_error}` for the unfiltered scenario. Missing links are null/empty, never a fixture ID. `q` is trimmed, case-insensitive substring matching event ID, cause, and raw source text within the active scenario; `job_id` matches linked canonical job IDs. Apply filters before count/cursor, order by `created_at DESC, id DESC`, and return the existing opaque `next_cursor`.
- Lifecycle mapper is one pure function of the actual event, latest run, and latest plan states, shared by row labels and scenario counts. Precedence: latest plan `approved` → Approved; `rejected` → Rejected; `superseded` → Superseded; `stale` → Stale; `proposed` → Options ready. Otherwise latest run `failed`/`timed_out` → Failed, `queued`/`running`/`completed` without a linked plan → Investigating (completed-without-plan must show an explicit pending-plan note). Otherwise event `planning` without a run → Reading input; `clarification_needed` → Needs clarification; `extracted` → Ready to investigate; `received` → Draft. A `closed` event without a terminal linked plan or any unrecognized combination → Integrity error, never silently “Approved.” Counts sum to the scenario event count. Do not create a new persisted event state just for a UI label.
- `GET /api/v1/readiness` keeps existing `job_id`, `status`, `confidence`, `risk`, and `item`; add `source_type` and `q`. `q` is trimmed, case-insensitive substring matching item ID, job ID, stage, `source_type`, and `source_reference` across the whole scenario. The current unpaginated `items` are filtered; add `total_count` for that filtered result. The existing `summary` remains **unfiltered scenario-wide** and must be labelled as such in the UI. If readiness later gains pagination, server `q` and count must continue to cover the full filtered query. Link targets carry canonical `job_id` and source type, not a display label.
- `GET /api/v1/decisions` keeps `action`, `plan_id`, `limit`, `after`; add `job_id`, `actor`, `nature`, UTC date-only `from`/`to` (`YYYY-MM-DD`, both inclusive), and `q`. Each summary adds `event_id: UUID`, `job_ids: string[]`, `plan_version: int`, `event_nature: string|null`, `event_cause: string|null`, and `context_status: "captured"|"partial_legacy"`; the list adds `total_count` before cursor pagination. Detail uses the same pinned fields. `captured` means the decision transaction saved all available context; `partial_legacy` means at least one historical field cannot be proven and is null/empty, not guessed from current state. These fields and searchable event cause reflect the **decision-time record**, not the current mutable event/latest extraction. `q` is trimmed, case-insensitive substring matching decision ID, plan ID, reason, and decision-time event cause. Filter before count/cursor, order by `created_at DESC, id DESC`; reset the client cursor on every filter change. An invalid cursor or date range is `422`, not a partial result. Lever usage is **not** inferred from free text: hide “Used in decisions” until explicit linkage exists.
- Each added field/filter is scenario-scoped, indexed where necessary, and represented in generated OpenAPI. Multiple-page/cursor and failure-path checks are deferred to E2E/browser QA; no frontend agent may assume a field exists before its backend packet and type generation land.

### 3.5 Approved contract repair for local synthetic preview (2026-10-15)

The product owner approved the following bounded additions so FE-17 and BE-20 can meet their already-frozen screen contracts. These are implementation authorization, not evidence that code is done; the new [BE-22–BE-24](backend-tasks.md#be-22-resource-unavailability-source-and-schedule-read-contract) and [INT-17–INT-18](integration-tasks.md#int-17-generated-openapi-type-fidelity-and-compatibility) packets own the work.

- **Resource unavailability:** `/api/v1/schedule` gains a required typed, scenario-scoped `unavailability` array (empty for A-12). Each interval has `id: string` (stable persisted ID), `resource_id: string` (canonical), inclusive integer `start_day`/`end_day`, `kind: "maintenance"|"unavailable"`, and `reason: string`. The interval belongs to the same scenario as its resource. A range query returns intersecting intervals with response day bounds clipped to the requested inclusive range while preserving the stable ID; a group query includes only intervals for returned resources. No range means original persisted bounds. It is persisted synthetic operational data, not a frontend fixture, zero-capacity inference, or a booking with an invented status. Unknown resource, inverted range, and cross-scenario reference are invalid. Fleet-scale seed includes both kinds on separate resources, including one conflict case. The engine/solver and approval revalidation must treat an overlapping booking as infeasible and must never approve a newly conflicting option; existing historical conflicts remain visible, not silently deleted. Unavailable resource-days have zero eligible capacity and are excluded from planned-load denominators under §4.1. No public editing UI is added.
- **Immutable decision context:** A decision's event ID, plan version, event nature, job IDs, and searchable cause are fixed at decision time. First inspect `Plan → AgentRun → extraction_version → EventExtraction` for verifiable versioned values. New approve/reject/reply decisions capture them in the same transaction as the decision and use `context_status="captured"`. A targeted migration is authorized. For older synthetic rows, backfill only verifiable values: plan event ID/version may come from its immutable plan; unknown historical nature/cause remains null and unknown jobs remain empty with `context_status="partial_legacy"`, never populated from a newer extraction while claiming immutability. Empty jobs on a captured decision may legitimately mean no linked jobs; the status removes that ambiguity. Filtering and direct audit detail use the same pinned context. Correcting an event after a decision must not change its History row, filter membership, or audit links.
- **Contract hygiene:** Regenerate frontend types from FastAPI after backend changes; fix the checked-in generator so nullable `anyOf`/`oneOf` maps to `null` rather than `unknown`, without `as any`, handwritten response interfaces, or weakening backend validation. Accept a narrow `backend/app/main.py` registration exception for BE-21's read-only Ask route. The root inspects prompt-injection, cross-scenario IDs, and no-write boundaries in source during development; behavioral verification is deferred to QA.
- **Preview boundary:** Development completion requires coherent implementation and static/build checks, not E2E, screenshots, public URL audit, or a browser walkthrough. INT-14–INT-16 and the user's browser session are reserved for a later QA request. Local preview-script/configuration work is authorized; pushing, deploying, changing cloud resources, or claiming the public URL has the new build is not.

## 4. Metrics and search contracts

### 4.1 Planned capacity load

The metric is **Planned capacity load**, not actual utilization. The backend already returns per-resource, per-day capacity points (`used`, `capacity`, `overflow`, `utilization_percent`). For the visible inclusive day range, include only points whose resource is `active` and whose `capacity > 0`; an inactive or zero/missing-capacity day is unavailable, not a 0% observation. Resource percentage = `100 * sum(used) / sum(capacity)` for its eligible visible points. Group percentage = the same ratio over eligible points of one capacity unit; never sum unlike units. Because barge jobs and supply-boat deck units are unlike units, the retained fleet headline is the arithmetic mean of each eligible resource-day's normalized `100 * used/capacity`, labelled **Average planned load across resources**. Display eligible resource-day count, visible range, and group scope in its tooltip; do not imply that it is a physical capacity sum.

Do not clamp text at 100%. A visual bar can cap at 100%, but show overflow amount and a conflict icon for over-capacity. If no eligible points exist, render `—` with “No capacity data for this range,” not 0%. Source and denominator are explained in the metric tooltip. Progress inside a job block is a different field; never infer it from resource load. All top metrics follow the visible range and resource-group scope; text search and vendor/status highlighting must not silently change their denominator. A group with mixed capacity units must be split by unit or show `—` with an explanation, never a fabricated aggregate.

### 4.2 Search behavior

Header command search is **page navigation only** and labelled “Find a page.” Timeline search matches resource name/code/location and job code/type; matching a job keeps its resource row and visibly dims nonmatching blocks; matching count and Clear are shown. Vendor/status filters decide which blocks are visible; a resource with zero matching blocks may remain only if the resource itself matches the text query. A deep-linked selected job stays visible even if filters would hide it, with an “Outside current filters” notice and a Clear filters action; never silently select a different job.

Readiness search matches item ID, job ID, stage, `source_type`, and `source_reference` through the approved server `q`. Changes uses server `q`, `nature`, `state`, `job_id`, and cursor. History uses server `q`, `action`, `plan_id`, `job_id`, `actor`, `nature`, UTC `from`/`to`, and cursor. None may filter only page 1 while presenting a global count. Search/filter state is URL-preserved; every filter change resets the cursor, and Clear filters is available. Distinguish “no data” from “no match.” Debounce free-text queries; do not debounce buttons/selects.

Every summary count defines its scope: entire scenario, server-filtered result, or currently displayed page. No count is computed from a different source than its table. Include accessible labels and tabular numerals.

## 5. Shared UI system and layout

Keep the current calm light palette and custom CSS Grid Timeline. Do not add another component system, Gantt package, or decorative orange/blue gradients. Use existing tokens and customized shadcn primitives. The audit skill specifically prioritizes separating missing states and removing generic card treatment; for Ripple, dense operational hierarchy takes precedence over marketing-style motion or oversized whitespace.

- **Color channels:** vendor hue belongs to the narrow block border and subtle vendor fill; status belongs to text/icon/pattern; risk uses a diamond or warning icon; selection uses a neutral row cue and inspector association; keyboard focus alone uses the 2 px blue outer ring. Selected and focus may coexist. No permanent selected outline after sheet close.
- **Navigation:** no browser-default underlines. Active page gets a restrained background + leading marker; hover/focus remain distinct. Brand link is not styled as body hyperlink. Page title and secondary metadata are consistent across routes.
- **Surfaces:** one canvas and one white panel level; thin cool borders; no colored rectangles behind KPI numerals. Risk/health badges are compact semantic accents. Dense tables use sticky header only within their scroll container.
- **Timeline:** global header fixed, resource rail sticky horizontally, date header sticky vertically, bottom legend persistent, center canvas scrolls. Prevent overlapping sticky layers and ensure inspector does not reflow the grid. Mobile uses existing agenda alternative, not a squashed timeline.
- **Interaction:** 44 px touch target when feasible, visible focus, reduced motion, skeleton/empty/error states, no `window.alert`/fake success. Every icon-only button has label and tooltip. Keyboard Escape closes overlay and returns focus to trigger. Keep DOM reading order meaningful.

## 6. Screen contracts

### 6.1 Global shell and command search

Top-level navigation remains Timeline, Readiness, Changes, History. Policy and Demo stay under Environment; Decision is reached contextually. The shell shows active scenario and backend connectivity/seed mode without promising real production data. Command search finds pages only; each result routes to a valid route and preserves scenario context, not stale page-specific filters. A not-found route offers Timeline and Changes links. All route transitions retain active run registry and avoid closing an in-flight run. Acceptance: nav has no underline in default/active/hover; 1366 px one-line; keyboard focus order and mobile menu work; route active state does not rely on color only.

### 6.2 Fleet Timeline and Job Inspector

Toolbar: text search; group selector; previous/next range; scenario start/Today behavior; date range display; export hidden until implemented (no permanently disabled teaser). Optional vendor/status controls must be functional before shown. Summary strip sits above the timeline; clicking a metric filters to that resource group and scrolls its first row into view if the design retains clickability—otherwise metrics are explicitly static indicators. Date header and left rail stay legible during two-axis scroll; legend is persistent and describes vendor plus status separately.

Render resource groups and bookings from schedule response, including empty resource rows, overlapping bookings, maintenance/unavailable intervals, and capacity conflicts. Use stable date math with inclusive booking end and tested clipping at range boundaries. Block hover/keyboard tooltip identifies job, dates, resource, vendor, status, readiness risk. Click adds `job` URL param and opens inspector; close removes it and the persistent selected treatment, then restores focus. Inspector shows actual schedule version and only actions for valid linked objects. Readiness handoff includes canonical job ID; Submit change opens the intake with context but does not create an event until submitted. Deep link to an unknown job shows a non-blocking not-found message. Approval highlight appears only for IDs from the approval response after fresh schedule data arrives.

### 6.3 Readiness Board

Use API list/detail. Top summary includes total, at risk, stale, low confidence with explicit scenario/filter scope. Filters: risk, job, stage, confidence, freshness, search, group-by; only show vendor if API supplies reliable vendor linkage. Row displays item/job, stage, required-by, ETA, effective slack, freshness, confidence, status, next action. Review sheet shows source reference and full chain; avoid unexplained raw IDs as the primary title. “Mark ready” issues PATCH with expected row/version fields from OpenAPI, disables only that row while pending, and rolls back/refetches on failure. Source-health handoff must use a real source filter/query. Opening a job goes to Timeline with its job selected and relevant range. If readiness becomes stale while a plan is open, show the warning but leave approval authority to the server.

### 6.4 Change Inbox, event detail, and intake

Inbox summary, filter bar, rows, and preview all use the event API. `Refresh` refetches server data. Row copy leads with cause/summary and human-readable state; IDs/versions are secondary monospaced metadata. Actions are state-specific: new draft → paste source → create event → start/await extraction → review/correct extraction → start investigation → stream → plan link. A create response does not imply extraction is complete. If extraction needs info or fails, show the correct remediation and preserve source. The composer only shows `Start investigation` when backend state permits it. Corrected extraction uses server response and version, never clones a fixture object. Server errors surface code/message with retry guidance. Direct `/changes/{eventId}` loads detail independently of inbox pagination. “Run sample” is either a real prefilled composer path in demo mode or hidden; it must not suggest a run was started.

### 6.5 Decision Workspace

Fetch the requested plan ID. Header states event, run, plan version, base/current schedule version, verdict, and status. An unknown plan has a not-found screen. Options compare like units with units named (days, bopd, count), show infeasible reasons, and link evidence/conditions. Selecting an option changes only review state. Acknowledgement applies to the selected option only. Approve/reject/reply have confirmation boundaries, disabled/pending/error states, idempotency keys, and server response handling. Approval invalidates schedule/readiness/event/plan/history, then offers targeted Timeline and Readiness links. Rejection/reply show recorded decision ID and linked event/run if present; they do not claim a new run before one exists. 409 version conflict shows changed objects and requires recompute/review. Audit mode is read-only after a decision. No fake fixture fallback for unknown plan IDs.

### 6.6 Decision History

History reads immutable server records, with cursor pagination and filters whose scope is explicit. Empty history explains how decisions are produced; filtered-empty offers Clear. Row shows action, event/jobs, actor, plan version, timestamp, schedule version transition. Detail sheet shows before/after and evidence links. Job link opens a Timeline range around that job and selects it; event and plan links open canonical routes. Copy stable link copies the decision URL. “Start similar change” opens a **new** intake draft prefilled with context, not the old event detail. Never mutate an audit record.

### 6.7 Policy and Data Health

Read-only data comes from policy endpoints. Section navigation scrolls/focuses a real section and updates URL; action names open their definition; approval owner either explains the role/capability in a supported read-only sheet or is plain text. “Used in decisions” must query actual decision metadata; if API cannot filter by lever, remove the action until a contract exists. “View affected items” must pass an API-backed source filter or valid query. Keep “not supplied by API” copy for risk rules/assumptions rather than fabricating values. No edit controls.

### 6.8 Ripple panel and Demo Lab

Ask and Submit are visibly different modes. The frozen Ask endpoint is `POST /api/v1/ask` with a read-only application use case; POST carries a bounded question body but has **no** event, run, schedule, readiness, decision, or outbox write. Request: `question` (trimmed 1–2000 characters) and optional `context` with canonical `job_ids`, `resource_ids`, `readiness_item_ids`, `event_id`, `plan_id`, and `schedule_version`; scenario comes only from the validated `X-Scenario-ID` context, not a trusted body field. Response: `scenario_id`, `answer`, `evidence[]` (`entity_type`, `entity_id`, `label`, `source_updated_at` nullable UTC), `freshness` (`current`, `stale`, `unknown`), `uncertainty` (nullable explanatory text), `schedule_version`, and `answered_at` (UTC). Evidence IDs must resolve inside the active scenario. The answer must distinguish current facts from model inference and say when evidence is missing/stale. Empty/oversized questions are `422`; unknown or cross-scenario IDs are `404`; provider/read failure is a truthful `503` or existing normalized API error, never a fabricated answer. Treat the question and retrieved text as untrusted; the controlled single-agent/model gateway or deterministic read service may read allowlisted data only and cannot call operational write tools. If BE-21 is not implemented or unavailable, hide/disable the Ask send action with an explanation while preserving Submit. The shared run registry resumes SSE from last sequence after navigation. Submit uses the Change intake lifecycle, not create-event-then-immediate-run.

Demo Lab lists only backend-available scenarios/modes. Recorded traces are clearly labelled recorded and cannot masquerade as persisted live runs. Live run follows extraction validation and navigates via server IDs. Reset is a scenario-scoped, confirmed, destructive synthetic-data operation through existing `POST /api/v1/demo/reset`: the body `scenario_id` must equal the validated header, be allowlisted, and have `reset_allowed=true`; a mismatch or unavailable scenario is rejected without mutation. Display affected scenario and seed version and warn that a shared preview reset affects other testers of **that scenario**. Backend restores it transactionally; frontend clears only that scenario's caches/drafts/runs and refetches. A failed reset retains current UI state. A-12 base/constrained comparison uses the same golden baseline; D-07 remains a required MVP smoke path.

## 7. Flow and invalidation matrix

| User action | Server result required | Refetch / navigation |
|---|---|---|
| Open job | Schedule row + job ID | URL `job`; inspector; no mutation |
| Update readiness | Write response with item/version | Readiness list/detail; schedule risk overlay if affected |
| Create change | Persisted event ID | Event list/detail; extraction state |
| Extract/correct | Extraction version and validated state | Event detail/list; never auto-run on create alone |
| Start run | Persisted run ID | Run registry + resumable stream; event/plan after completion |
| Approve | Decision ID, before/after versions, changed IDs | Schedule, readiness, event, plan, history; focused handoff |
| Reject/reply | Decision ID and linked event/version | Event, plan, history; run only if explicitly started and confirmed |
| Reset synthetic scenario | Seed version/checksum and schedule version | Clear scenario cache; refetch all visible routes; no other scenario affected |

Invalidations should happen through shared query keys, not a window reload. Backend and frontend must agree on state names via OpenAPI. Test each transition after a hard browser refresh and a direct URL load.

For rendered controls, the single owner and observable result are frozen below. Hide any control before its owner contract is implemented; never substitute a local fixture success.

| Control | Owner | Observable result |
|---|---|---|
| Navigation and page command search | TanStack Router root scenario + page route | Correct page opens with scenario retained; no mutation |
| Timeline range/group/search/filters, metric strip | URL state + `GET /api/v1/schedule` and pure capacity mapper | Rows/blocks/counts reflect current range; metric scope is labelled |
| Job inspector and handoff links | Timeline URL `job` + schedule canonical IDs | Same job opens after refresh; Readiness/Changes receive its ID |
| Readiness search and source handoff | `GET /api/v1/readiness` with server filters | Full-scenario matching items and labelled counts |
| Mark ready / suggestion review | Existing `/api/v1/readiness/{itemId}` PATCH or suggestion accept/reject endpoints | Server version/result persists after refresh |
| Change search/refresh/intake/extraction | Existing `/api/v1/events` list/create/detail/extract/correction endpoints | Server IDs, lifecycle, and filtered counts persist |
| Start investigation / trace | `POST /api/v1/events/{eventId}/runs`, then resumable `GET /api/v1/runs/{runId}/stream` | Run ID and trace survive navigation |
| Plan selection and approve/reject/reply | `GET /api/v1/plans/{planId}` and existing decision endpoints | Server decision/version; 409 requires manual re-review |
| History filters, detail, copy link, similar draft | `GET /api/v1/decisions`/`{decisionId}`; Router/clipboard for nonwrites | Complete cursor-backed results, stable link, new draft rather than old event |
| Policy definition/source links | Existing policy GETs plus supported Readiness/History filters | Real read-only detail/handoff; unsupported lever usage hidden |
| Ask Ripple | Target `POST /api/v1/ask` (BE-21), read-only | Answer, evidence, freshness, uncertainty; no operational write |
| Demo selector/recorded/live/reset | Existing `/api/v1/demo/scenarios`, recorded stream, event lifecycle, scoped `/api/v1/demo/reset` | Advertised mode is truthful; reset restores only selected scenario |

Export, Alerts/Daily Check, upload, saved views, drag editing, and unimplemented owner actions are not rendered in the MVP.

## 8. Seed blueprint and reset contract

Keep `offshore_a12.sql` as the golden A-12 baseline and the recorded A-12 pair contract. BE-16 removes only the `schedule_state.id = 1` singleton constraint; keep `id` as a surrogate primary key so the existing A-12 seed's explicit `id=1` remains valid, keep `scenario_id` unique as the logical lookup/lock key, and provide a safe generated/default ID for additional scenarios. The migration preserves A-12 version and row identity, and concurrent version increments lock by `scenario_id`; do not reinterpret existing rows or change approval transaction semantics. Then add a separate synthetic `fleet-scale` scenario for UI/integration testing and expose its selector in local/preview only **after** BE-18 and INT-13 implement the frozen scenario contract. Target data (deterministic, not random at runtime): 16–24 resources across barge/supply boat/test bay/lift crew; 35–50 jobs; 60–100 bookings across 28 days; 25–40 readiness items; 20–30 events distributed across the **actual backend** event states `received`, `extracted`, `clarification_needed`, `planning`, and `closed`. Linked extraction/run/plan/decision records must produce UI lifecycle cases such as running, options-ready, approved, rejected, and failed through one tested mapper—never by inventing extra database event states. Include at least 6 audited link chains, an empty resource, sub-100 and over-100 capacity, concurrent bookings, a hold, a lock, a stale source, uncertain ETA, low confidence, infeasible option, version conflict test setup, and partial-search matches.

Every FK/link must resolve within one scenario. Seed IDs, epoch, statuses, metrics, expected counts, and checksum are versioned; BE-22's resource-unavailability rows and BE-24's decision-time snapshots must be included in the fleet-scale manifest/checksum. Use a deterministic builder or SQL; no production-like real company names or secrets. Seed install is idempotent by contract. Reset is restricted by explicit scenario allowlist and `local`/`preview` environment guard, transactionally deletes/restores only the selected synthetic graph, reports checksum/version, and must leave a second scenario untouched. `reset_allowed` reflects that exact server policy. Preview startup uses `--scenario <ID> --install-if-missing` for both synthetic scenarios after migration: it installs and verifies only an absent scenario and returns `skipped_existing` without changing or baseline-checking an edited one. This flag is mutually exclusive with strict read-only `--verify` and guarded destructive `--reset`; it is not a reset shortcut. The target local CLI contract is `uv run python scripts/seed_preview.py --scenario fleet-scale --verify` for read-only baseline verification and `uv run python scripts/seed_preview.py --scenario fleet-scale --reset --confirm-reset` for explicit destructive restoration. The CLI must require an explicit target and refuse broad/default production targets. Actual install/mutation/reset replay and link-count evidence are deferred to the later QA phase.

**Development seed deliverable:** Preserve the already written deterministic builder rather than replacing it with random/demo-only frontend arrays. Its current source declares 18 resources, 40 jobs, 80 bookings, 32 readiness items, 25 events, and both maintenance/unavailable intervals; these are source-inspected targets, not a claim that a database replay has passed. Keep the exact stable IDs and manifest/checksum, with meaningful cases across all resource groups: occupied/empty rows, overlap/conflict, zero/over-capacity, uncertain/late source, five event lifecycle states, running/failed/option-ready runs, approved/rejected decisions, stale/version conflict, and at least six linked event→run→plan→decision chains. The live UI must use these persisted entities and links, not page-local copies. A normal preview restart may only install a missing scenario. An explicit reset warns which **single** scenario will be restored and must not touch A-12 when fleet-scale is selected; implementation is required now, destructive replay evidence is deferred to QA.

**Preview UX recovery delta (2026-10-16):** The screenshot review found that these v1 fleet counts do not help when the unqualified UI opens small A-12. [Preview UX recovery](preview-ux-recovery.md) now specifies fleet-scale as the local/preview UI landing when advertised, a coherent v2 seed with richer operational stories, explicit Readiness status actions, one Changes event lifecycle, and populated History. BE-25/26, INT-20/21, and FE-26–29 own this **new** development pass. Existing INT-19 handoff below is historical and does not claim these screenshot issues are resolved. Existing preview databases are not auto-reset to v2.

**INT-21 screenshot-recovery development handoff (2026-10-16):** Status is `development complete / E2E-browser QA pending`. The new scoped ledger is `dev_done` for BE-25, BE-26, INT-20, FE-26, FE-27, FE-28, FE-29, and INT-21. BE-25 now has bounded local/preview deterministic extraction with persisted terminal outcome, truthful provider-unavailable behavior outside synthetic environments, provenance, and retry-safe stale-planning recovery. BE-26 advertises and seeds fleet-scale v2 with 22 resources, 44 jobs, 100 bookings, 40 readiness items, 30 events, 12 immutable decisions, and 12 linked event→run→plan→decision chains; install/reset remains explicit and scenario-scoped. INT-20 selects advertised fleet-scale for unqualified local/preview entry, retains canonical `scenario` URL/header/cache context, and keeps explicit A-12 and unknown-scenario behavior honest. FE-26–29 integrate persisted API data for dense/sparse Timeline, explicit Readiness review actions, canonical Changes extraction flow, and populated/empty scenario-safe History. Root source review confirmed Ask is read-only and approval remains the sole schedule-write path; the root repaired one exact Ruff ownership issue in BE-25 (`TimeoutError`).

**INT-21 static evidence:** `frontend npm run api:check`, `frontend npm run build`, `frontend npm run lint`, `backend uv run ruff check .`, `backend uv run pyright`, and `git diff --check` completed successfully after integration. Lint reports six existing Fast Refresh warnings and the production build reports normal dependency/chunk-size warnings; no tests, database reset/replay, browser walkthrough, E2E, deployment, or cloud mutation was run. Local PostgreSQL/API persistence, seed/reset replay, cross-page mutation continuity, and the five viewport visual/accessibility gate remain deferred to INT-14–INT-16 QA.

## 9. Development exit and deferred QA

**Now — development exit (INT-19):** All scoped frontend/backend/integration code paths are implemented; the root inspects navigation/action ownership, responsive states in source, generated OpenAPI/type compatibility, seed graph/reset guard, migration/approval/Ask safety, and no live fixture fallback. After shared writers finish, run only generated-contract consistency, build/lint, Ruff/Pyright, and diff checks. Record failures as owning-packet repairs. No test code, test runs, browser, screenshots, or destructive reset in this phase. Label the result `development complete / QA pending`, not production-ready.

**INT-19 development handoff (2026-10-16):** Status is `development complete / QA pending`. BE-22/23/24, BE-20, INT-17/18, and FE-17 were integrated against the current contracts; BE-24 received independent historical-context review and INT-18 received independent startup/configuration review. The root ran `npm run api:check`, `npm run build`, `npm run lint`, `uv run ruff check .`, `uv run pyright`, and `git diff --check`; all completed successfully, with six pre-existing Fast Refresh lint warnings and normal Vite bundle/dependency warnings. One exact-file compiler amendment updated `frontend/src/features/schedule/schedule-adapter.test.ts` with empty required `unavailability` fields without changing test behavior. No test suite, browser walkthrough, E2E, destructive reset replay, public deployment, or cloud resource was executed. QA must still verify local PostgreSQL/API persistence, seed/reset replay, decision immutability after corrections, and the five required viewports under the later user-authorized QA goal.

**Scoped development ledger:** FE-15–FE-25, BE-16–BE-24, INT-10–INT-13, and INT-17–INT-18 are `dev_done` based on retained implementation plus current-contract source/static integration. INT-19 is `dev_done` with the handoff above. FE/BE/INT packet-level behavioral tests, local database replay, browser walkthrough, and visual evidence remain QA-pending; INT-14–INT-16 are intentionally excluded from this development goal.

**Later — user-requested QA (INT-14–INT-16):** Real local Postgres/API E2E and browser walkthrough will cover create → extract → correct → run → plan → approve/reject/reply, readiness PATCH, scenario switch, cursor pagination, 404/409/provider failures, decision immutability, unavailable resource conflicts, mutate → refresh → cross-page continuity → single-scenario reset → exact baseline, plus accessibility/visual review at 1440×900, 1366×768, 1100×700, 768×1024, and 390×844. QA is E2E/browser-first; do not create a new unit/component/API test backlog. The user will explicitly authorize browser access when ready.

### Deferred local E2E run sequence — do not execute in the current development goal

Use only the local synthetic database; do not provide cloud credentials. From two terminals:

```powershell
# Terminal 1: apply the local schema/seed, then keep the API running
$env:RIPPLE_DATABASE_URL = "postgresql+asyncpg://postgres:<local-password>@127.0.0.1:55432/ripple"
$env:RIPPLE_ENVIRONMENT = "local"
uv run alembic upgrade head
uv run python scripts/seed_preview.py --scenario fleet-scale
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: run the browser smoke twice; the local Vite server is started by Playwright
cd ../frontend
npm run test:e2e
```

Stop the API with `Ctrl+C`. Playwright stops its local Vite server automatically; test artifacts stay under `frontend/playwright-report/` and `frontend/test-results/`. No reset is part of the navigation smoke. For reset/replay, use the explicit local command in §8 with `--reset --confirm-reset` only against the named synthetic scenario.

## 10. Execution order and review boundaries

Packet catalog additions `FE-15+`, `BE-16+`, and `INT-10+` are in the three existing task catalogs. Execute exactly one ID per Luna worker assignment; an explicitly scoped root `/goal` coordinates multiple IDs under [README §4.7–4.8](README.md#47-multi-task-goal-orchestration). This phase is **development only**. Preserve existing work, do not write/run tests, and do not wait for independent sign-off or E2E. The root inspects risky diffs and integrates contracts; only ready tasks with disjoint write ownership run in parallel.

**INT-10 sign-off recorded:** the product owner approved scenario epoch/meta shape, `fleet-scale` visibility in synthetic local/preview, server search/filter/count semantics, read-only Ask/evidence, unavailable capacity treatment, the normalized fleet headline, and approval-conflict re-review UX on 2026-10-14. Sections 3–4 and 6–8 are the frozen target contract. Do not reopen those choices or infer that E2E passed. The root must inspect schema migration, Ask security boundary, and approval wiring in code; only a new unsafe or contradictory condition needs escalation.

**Development execution card (2026-10-16):** Create a ledger for scoped IDs with `ready/active/integrating/dev_done`; record earlier code as `implemented`, not automatically accepted or discarded. First inspect the current dirty worktree. Retain FE-15/16, BE-16–19/21, and INT-10–13 work that matches the present contract. The core serial ownership spine is:

| Wave | Owner / output | Safe parallel opportunity |
|---|---|---|
| A | BE-22 → BE-23 → BE-24: unavailability source, solver/approval policy, immutable decision snapshot. Reserve migration, repositories, decision service, seed builder/CLI exclusively. | One frontend worker may handle FE-15/16 or independent FE-19/20 UI code, if its API contract is frozen and files do not overlap. |
| B | BE-20 reads the pinned History context. INT-18 follows BE-24 for seed/startup configuration. | INT-18 may overlap BE-20 only with disjoint files and no concurrent seed/database/generation command. |
| C | INT-17 generates the final OpenAPI/types once after backend contracts. FE-17 then consumes Schedule unavailability. | Read-only code audits or independent UI source work; no second generated-output writer. |
| D | FE-18–FE-25 and BE-21/INT-11–13: integrate existing code against final types, fix only concrete broken handoffs in the owning packet. | Up to two writing subagents on disjoint screen areas, never shared shell/styles/fixtures. |
| E | INT-19 root development integration: one coherent app, rich persisted seed/reset code, UI/UX source consistency, static/build checks, honest QA handoff. | No concurrent writer during final generated/build integration. |

BE-23 and BE-24 are **serial**, even though their topics differ, because they share repository/approval files. FE-17 waits for INT-17, not a new frontend mock contract. INT-14–INT-16 are excluded from this goal and remain the later QA phase. No unit/component/API/contract/E2E test authoring or execution in these waves. If a build/contract error exposes one extra file, use README §4.7's exact-file ownership amendment and keep other ready work moving. A genuinely unsafe migration, security finding, or contradictory business contract still needs escalation; lack of deferred test evidence does not.

The prior INT-11 generated-type bridge is historical. INT-17 is the new nullable type-fidelity and Schedule-contract generation task; do not restart unrelated INT-11 transport code. The dependency graph names integration prerequisites, not a command to rewrite completed work.

The frozen model path is Gemini through Vertex AI's model gateway, with recorded mode for deterministic local/preview flows. No OpenAI key is required or authorized. A standalone Gemini API key pasted into chat is not automatically a working Vertex credential; never copy it into source, fixtures, logs, or documentation. Live-model configuration is a separate environment/security verification, not a reason to block INT-11's OpenAPI/frontend bridge or to silently replace the frozen gateway.

## 11. Reference rationale

- [SAP Fiori Planning Calendar](https://experience.sap.com/fiori-design-web/planning-calendar/): compare multiple resources over time, sticky temporal context, responsive fallback.
- [SAP Fiori Gantt](https://experience.sap.com/fiori-design-web/gantt-chart/): capacity/overflow alongside resource planning, not just decorative blocks.
- [Atlassian color foundations](https://atlassian.design/foundations/color): separate semantic, selected, and focused treatments; never rely only on hue.
- [Carbon data table](https://v10.carbondesignsystem.com/components/data-table/usage/): table toolbar owns search/filter/actions and rows progressively disclose detail.

These are design references, not instructions to add SAP/Carbon/Atlassian UI libraries.

## 12. Historical Luna handoff (INT-19 pass)

The earlier test-count reports are historical, not the current phase's completion metric. Keep all existing test/E2E files untouched. The current outcome is working development code with a deterministic seed and reset flow, integrated UI/API contracts, and a documented `QA pending` handoff. Do not start the user's browser walkthrough yet. The root reviews high-risk Ask/approval/migration/reset code directly; a specific unresolved safety concern may need a separate reviewer, but generic missing sign-off does not stall other development work. Task status stays outside the catalogs.

For a single-task worker assignment, copy-paste:

```text
Execute exactly one assigned Ripple task: <TASK-ID>.
Read docs/implementation/README.md completely, then that exact task packet
in its catalog, then only its linked plan sections.
Inspect allowed files before editing. Stay inside Allowed files. Do not change
frozen stack/flags, other packets' files, cloud resources, or unrelated user work.
Apply README §4.8 instead of older packet test commands: implement code only,
preserve existing tests, and do not create/run tests or open the browser.
If a linked contract is missing or conflicting, stop and report it.
Do not commit, push, deploy, or modify cloud resources.
Final: outcome; files changed; development checks actually run; QA pending;
concrete blocker only if one remains.
```

For each worker assignment, fill the ID and packet link only after implementation prerequisites are ready. Do not ask a worker to read the entire documentation tree or implement multiple packets in one assignment. Reserve its exact files; the root handles integration and high-risk source review. A worker must report a real unsafe condition, not mark it complete or silently bypass it.

The following root prompt was for the earlier INT-19 pass. **Do not reuse it for the new screenshot-recovery goal**; use §13 instead. For a root agent in Goal mode, this was the earlier bounded multi-task objective:

```text
/goal Finish the Ripple synthetic LOCAL DEVELOPMENT candidate for the
explicitly scoped IDs FE-15–FE-25, BE-16–BE-24, INT-10–INT-13, and
INT-17–INT-19. Exclude INT-14–INT-16 for later E2E/browser QA. First read
docs/implementation/README.md completely, then §10 of
docs/implementation/productization-plan.md and the active task packet only.
Apply README §4.8 over old test/review acceptance text. Product decisions
in §3.5 are approved; do not ask for them again.
Audit the dirty worktree and build an evidence ledger. Prior implementation
is preserved; integrate rather than repeat passing work. Complete the
BE-22 -> BE-23 -> BE-24 -> BE-20 -> INT-17 -> FE-17 spine, INT-18 after
BE-24, the affected FE/BE/INT handoffs, then INT-19. Finish responsive,
consistent UI/UX and live page actions using persisted synthetic API data.
Keep the rich deterministic fleet-scale seed, safe scenario reset, and
preview install-if-missing path; no page-local fake operational data.
Assign exactly one ready ID per worker. Use up to two writing subagents only
on independent disjoint files; root reviews high-risk diffs and integration.
Serialize migrations, repository/approval edits, OpenAPI output, seed/reset,
and any shared mutable state. If an approved contract exposes a
mechanical out-of-scope compile path, use README §4.7's exact-file amendment
before reassignment; never let a worker expand scope unilaterally.
Do not create/update/run unit, component, API, contract, snapshot, or E2E
tests. Do not open the user's browser yet. After writers finish, root runs
only OpenAPI consistency, frontend build/lint, backend Ruff/Pyright, and
diff checks; fix concrete failures. Complete when all scoped IDs are
dev_done and INT-19 records `development complete / QA pending`. Do not
claim E2E, visual-browser, public URL, or production verification. No
commit, push, deploy, cloud mutation, real data, or chat-pasted secrets.
Stop only for a new evidenced unsafe migration, failing security boundary,
genuinely missing/contradictory contract, or unavailable mandatory tool.
```

## 13. Current Luna `/goal` handoff: screenshot-recovery pass

Use this prompt for the **new** scope; §12 is retained only as historical context. The root should complete all named IDs, not stop after the first worker. The exact source of truth is [preview UX recovery](preview-ux-recovery.md) plus the eight new catalog packets.

```text
/goal Finish Ripple's LOCAL/PREVIEW screenshot-recovery DEVELOPMENT pass:
BE-25, BE-26, INT-20, FE-26, FE-27, FE-28, FE-29, INT-21.
Do not reopen historical FE-15–FE-25, BE-16–BE-24, INT-10–INT-19
without a concrete integration defect. INT-14–INT-16 browser/E2E QA is later.

Read docs/implementation/README.md completely, then
docs/implementation/preview-ux-recovery.md and the exact assigned packet
for each worker. Audit the dirty worktree first; preserve all existing code
and user changes. Build a task/dependency/file-owner ledger.

Fix the actual screenshot findings: unqualified local/preview entry must
land on advertised fleet-scale rather than sparse A-12, with visible
scenario label and URL continuity; A-12 stays explicitly available. Make
fleet-scale v2 deterministic, substantial and relationally coherent with
safe explicit scenario reset (never auto-reset an edited database). Timeline
must be dense/scrollable, but sparse A-12 must not show a giant blank grid.
Readiness must use an explicit Mark ready/Reopen action, not an unexplained
live checkbox, and format freshness/stages for humans. Changes must use
one canonical event-detail flow; backend extraction must really reach a
persisted outcome or truthful failure, not stay queued forever. History
must show real fleet decisions and keep immutable audit links/scenario.
Keep Ask read-only and approval as the sole schedule-write path.

Use REAL overlap: reserve disjoint files, spawn TWO ready writing subagents
before waiting for either; one ID per worker. Root conducts read-only
source/diff review while both work. When the first completes, review its
diff and immediately refill the free slot with a ready disjoint task;
do not wait for the slower worker unless its contract is a prerequisite.
Suggested first pair BE-25 + BE-26. INT-20 can overlap FE-27 after file
reservation; FE-26 + FE-29 and FE-28 + FE-29 can overlap when ready.
Maximum two writing subagents. No overlapping files, global CSS,
seed/CLI, generated output, mutable DB command or dependency install.
FE-28 waits for BE-25. INT-21 root integrates only after page writers.

Development only: do not create/update/run tests, Playwright or browser;
do not reset the current DB, commit, push, deploy, or change cloud
resources. Preserve existing tests. After all writers finish, root runs
only api:check, frontend build/lint, backend Ruff/Pyright and git diff
--check, and repairs concrete failures with one file owner. Review
cross-page IDs, route/action state and seed/reset safety in source.
Finish when all eight IDs are dev_done and INT-21 records
`development complete / E2E-browser QA pending`. Report files and actual
static checks. Do not claim visual/browser or production verification.
```

## 14. Current Luna `/goal` handoff: Timeline semantics and Gemini preview

Section 13 is historical `dev_done / QA pending`. The active follow-up is [Timeline semantics and Gemini preview](timeline-gemini-followup.md) and the five exact task packets below. Use this prompt; do not turn it into another broad redesign or replay an installed database.

For live `/schedule`, the follow-up's neutral-booking/no-vendor contract supersedes older §4 and §5–6 vendor-color/tooltip/legend/filter prose. Vendor-specific fixtures remain fixture-only. The follow-up's direct pan + previous/next **month** + month/year picker supersedes the older generic previous/next range language. This is a scoped amendment, not permission to alter approval, solver, or production Vertex behavior.

```text
/goal Complete Ripple's LOCAL/SYNTHETIC-PREVIEW development follow-up:
BE-27, BE-28, FE-30, FE-31, INT-22. Finish ALL five IDs, not only the
first worker. Prior BE-25–BE-26, FE-26–FE-29, INT-20–INT-21 are historical
dev_done / QA pending. INT-14–INT-16 E2E/browser QA is a separate later pass.

Read docs/implementation/README.md completely, then
docs/implementation/timeline-gemini-followup.md and each worker's exact
task packet. Audit and preserve the dirty worktree. Make a task/dependency/
file-owner ledger before writes.

Fix the Timeline truthfully: concurrent capacity-valid bookings get visible
sublanes, availability has a separate aligned exception rail, and actual
conflicts are labelled on affected dates. Do not let blocks cover each
other. The live API has NO vendor identity: neutral booking cards, no fake
resource-group-to-vendor mapping, no false vendor legend/filter. Status,
weather, maintenance, unavailable, conflict, selection, and capacity load
must have distinct labelled/icon/pattern channels. Trackpad/native
horizontal scroll and empty-space drag-to-pan are the PRIMARY ways to move
across dates. Buttons jump previous/next MONTH; add a month/year picker and
Today. Do not add drag editing.

Add explicit backend-only Gemini Developer API opt-in for local/preview
extraction through the existing gateway. Keep synthetic default there and
Vertex for staging/production. Wire backend Settings, pin google-genai,
surface quota/provider failures truthfully, and never auto-call a model or
silently fall back after an explicitly chosen live provider fails. Ask
remains read-only and approval remains the sole schedule write. The user-
authorized temporary key already exists in gitignored local backend/.env.
BE-28 reads it through backend Settings at runtime only; workers must not
inspect, print, copy, overwrite, commit, or export its value. The ignored
local file also already selects RIPPLE_MODEL_PROVIDER=gemini_developer and
RIPPLE_INTAKE_MODEL=gemini-2.5-flash. Key presence alone does not opt in on
other installations; examples use placeholders only. Model access is not
yet verified, so return an honest provider error if that key lacks access.
Never run automated live-key calls in this development goal. Recommend
rotating the exposed key before public-preview use.

Make the deterministic seed's concurrency, exceptions, and weather story
clear, versioned, and scenario-isolated. Existing installed fleet data is
user state: no automatic reset. No shared preview or A-12 reset.

Use REAL parallelism with shared-workspace safety: reserve disjoint files
and spawn TWO ready writing subagents, BE-27 + BE-28, before waiting for
either. Root performs read-only Timeline/contract review while they run.
When a worker completes, review its diff and refill the free slot with
FE-30 if ready while the other continues. FE-31 follows FE-30 serially
because both own Timeline/CSS files. A third read-only reviewer may run
alongside the two writers, but never a third writer. Give each worker ONE
task ID and exact allowed-file/forbidden-file instructions. Do not run
concurrent seed/reset, dependency lock updates, OpenAPI generation, DB
mutations, or shared CSS writes. Root integrates INT-22 after workers.
Do not immediately wait after each spawn as though execution were serial.

Development only: no creating/updating/running unit, API, component,
snapshot, E2E, Playwright, browser, database replay/reset, or live-key
tests. No commit, push, deploy, or cloud mutation. Preserve existing test
files. After writers finish, root runs api:check, frontend build/lint,
backend Ruff/Pyright and git diff --check, then repairs exact failures
with one file owner. Report actual results and QA pending honestly.
```

## 15. INT-22 integration handoff (2026-10-16)

Status: **development complete / E2E-browser QA pending**. The follow-up was
implemented as five bounded task IDs: BE-27 seed/version safety, BE-28
explicit Gemini Developer API plumbing, FE-30 collision-safe Timeline layout
and navigation, FE-31 truthful Timeline semantics, and this INT-22 root
integration review. Existing dirty-worktree changes were preserved.

- BE-27 source-inspected `fleet-scale-v3` is deterministic, versioned, and
  checksum-backed. Install-if-missing is restricted to local/preview and
  reset requires the named scenario plus `--confirm-reset`; advertised source
  metadata does not claim that a database is installed when it was not
  verified.
- BE-28 keeps synthetic as the default, uses Settings-backed
  `gemini_developer` only when explicitly selected for local/preview, keeps
  Vertex for staging/production, pins `google-genai`, and reports provider
  failures without silent synthetic fallback or startup/health/page-load
  model calls. Ask remains read-only and approval remains the schedule-write
  path.
- FE-30 packs concurrent bookings into visible sublanes, renders exceptions
  on a separate rail, supports native/empty-space pan, month/year navigation,
  and Today without drag editing. FE-31 keeps live/API bookings neutral,
  limits vendor semantics to the fixture scenario, and exposes status,
  exception, weather, conflict, Today, and selection meanings explicitly.
- Scope-repair amendment: FE-31 received exclusive ownership of the exact
  required files `frontend/src/App.tsx` and
  `frontend/src/features/schedule/timeline-layout.ts` after its worker
  reported the live vendor legend and the compile error. No other packet
  scope was expanded.

Root static verification completed with these actual results:

- `npm run api:check` (from `frontend`) — PASS, exit 0.
- `npm run build` (from `frontend`) — PASS, exit 0; only dependency annotation
  and bundle-size warnings.
- `npm run lint` (from `frontend`) — PASS, exit 0; 6 existing Fast Refresh
  warnings and 0 errors.
- `uv run --frozen ruff check .` (from `backend`) — PASS, exit 0.
- `uv run --frozen pyright` (from `backend`) — PASS, 0 errors/warnings/
  informations.
- `git diff --check` — PASS, exit 0; only Git line-ending normalization
  warnings.

No automated tests, browser walkthrough, five-viewport audit, database
replay/reset, live Gemini call, deployment, cloud mutation, commit, or push
was performed in this development pass. Those remain explicit QA/review
requirements; installed database state and model access are not claimed as
verified here.

## 16. Current Luna `/goal` handoff: compact Timeline and cross-month pan

The §14 prompt and §15 handoff are historical source context. The latest screenshot review found that the no-overlap fix made resource rows too tall, duplicated weather, overstated conflict dates, and left horizontal panning bounded by the fetched range. The active source of truth is [compact Timeline and continuous navigation](timeline-density-navigation.md) plus `FE-32`, `FE-33`, `INT-23`. This pass is frontend-only unless a concrete missing backend contract is evidenced; do not reopen BE-27/28 or overwrite local Gemini `.env`.

```text
/goal Complete Ripple's LOCAL/SYNTHETIC-PREVIEW compact Timeline
development follow-up: FE-32, FE-33, INT-23. Finish ALL three IDs, not just
the first worker. Preserve existing FE-30/31, Gemini/seed work, every dirty
worktree change, and backend/.env; do not re-run old packets wholesale.

Read docs/implementation/README.md completely, then
docs/implementation/timeline-density-navigation.md and each worker's exact
task packet. Inventory prerequisites and reserve files. Freeze the §3
Workspace interface before parallel writes.

FE-32: Normal resource row ~68–72 px; exception/conflict must not add a
28 px lane each. Keep at most two booking lanes visible for genuine
concurrency, with a reversible +N disclosure. Maintenance and explicit
unavailable become icon-first, date-aligned markers plus thin interval
signals, with complete hover/focus/click detail. Weather is typed
location/day context, shown once per relevant location/day, not repeated
as fake resource unavailability. Derive conflict days only from capacity
points with overflow > 0 and their booking IDs; never mark an entire
booking from report-wide overflow. Keep sticky rail and canvas row heights
exactly aligned and preserve job inspector/mobile agenda.

FE-33: Add 2 weeks rolling detail and calendar-aligned Month view. A label
'October 2026' cannot mean 13 Oct–11 Nov; first partial month is labelled
explicitly. Previous/next act on the active horizon, month/year picker
jumps to a real calendar month, Today/scenario start stays honest. Direct
trackpad/empty-space drag/touch/keyboard horizontal navigation must cross
month boundaries. Fetch bounded adjacent periods, preserve scroll anchor
and vertical position, and avoid per-pixel refetch or eager year-long DOM.
URL keeps scenario, filters, selected job, horizon and selected-period
from/to. Metrics describe the selected period, not the buffer. Compact
the 1366px toolbar so search and date controls are readable.

PARALLELISM: Spawn TWO writing subagents for FE-32 and FE-33 before
waiting for either. Give each exactly one ID and its disjoint Allowed
files. FE-32 owns Workspace/adapter/marker files and new density CSS;
FE-33 owns Toolbar/App/route/search/API-range files and new navigation
CSS. Neither edits global styles.css, generated types, backend, seed,
.env, dependency/lockfile, or tests. Root reviews source/diffs while both
run; do not spawn-and-immediately-wait serially. After both finish and
release ownership, root alone integrates INT-23 and small shared CSS.
If the frozen interface needs one exact extra file, report evidence and
reserve it serially under the bounded scope-repair rule.

Development only: no unit/component/API/E2E tests, test-file edits,
Playwright/browser walkthrough, DB reset, live Gemini calls, commit, push,
deploy, or cloud mutation. After both workers finish, root runs only
npm run api:check, frontend build/lint, and git diff --check; repair
concrete static failures with one file owner. Report actual results and
E2E-browser visual QA as pending, not passed. Do not call it production-
ready until later browser QA checks compact rows, issue details, and pan
across calendar boundaries.
```

## 17. INT-23 integration handoff (2026-10-16)

Status: **development complete / E2E-browser QA pending**. FE-32 and FE-33
were implemented by separate writers with the frozen Workspace interface;
INT-23 then reconciled the shared Timeline shell and navigation/sticky layers.
Existing FE-30/FE-31, Gemini, seed, backend, environment, and unrelated dirty
worktree changes were preserved. A concrete range-buffer defect found during
root review was repaired in the released FE-33 schedule query file: buffered
canvas days now retain absolute-day weather context after range projection.

Source review confirmed the selected-period versus buffered-canvas split,
selected-period metric denominator, exact overflow-day conflict mapping,
two-lane booking disclosure, location/day weather context, URL horizon/from/to
state, bounded adjacent-period fetch, and settled Workspace anchor callback.

Root verification results:

- `npm run api:check` from `frontend` — PASS, exit 0.
- `npm run build` from `frontend` — PASS, exit 0; only dependency annotation
  and bundle-size warnings.
- `npm run lint` from `frontend` — PASS, exit 0; 6 pre-existing Fast Refresh
  warnings and 0 errors.
- `git diff --check` — PASS, exit 0; Git line-ending normalization warnings
  only.

No automated tests, browser/Playwright walkthrough, five-viewport visual
audit, database reset/replay, Gemini/model call, deployment, cloud mutation,
commit, or push was performed. Those remain the required review gate before
calling the Timeline visually verified or production-ready.

## 18. INT-24 integration handoff (2026-10-16)

Status: **development complete / E2E-browser QA pending**. FE-34 and FE-35
were implemented in parallel against the frozen WeatherDayMarker interface,
then reviewed and integrated by root under INT-24. FE-32/FE-33/INT-23 remain
the baseline; no backend, API, seed, adapter, route, or generated-type scope
was reopened.

- FE-34 now renders resource-scoped issue tint/range treatment and one
  first-visible-day badge per issue-set run, with danger priority, exact
  overflow-day mapping, original inclusive detail dates, linked-job actions,
  custom tooltip, viewport-safe detail, Escape/outside dismissal, and focus
  return. The old inline weather marker was removed from Workspace.
- FE-35 now exports `WeatherDayMarker`; only `go === false` observations
  create a persistent header marker, while detail names locations, metric,
  value, source, and weather-only semantics. The legend is grouped into
  Schedule, Resource issues, and Day context with `2 issues` and Weather
  no-go semantics; generic Weather and Exception marker labels are removed.
- INT-24 adds only the shared grouped-legend/overlay specificity required by
  the unified shell. Existing sticky rail/header/legend, horizon, pan,
  filters, URL, inspector, and mobile agenda paths remain owned by their
  earlier tasks.

Root source review covered the 16–17 October multi-issue case, maintenance
only, conflict inside a longer booking, routine weather, multi-location no-go,
month-boundary clipping, normal/empty rows, and mobile agenda paths.

Root static verification:

- `npm run api:check` from `frontend` — PASS, exit 0.
- `npm run build` from `frontend` — PASS, exit 0; only dependency annotation
  and bundle-size warnings.
- `npm run lint` from `frontend` — PASS, exit 0; 6 existing Fast Refresh
  warnings and 0 errors.
- `git diff --check` — PASS, exit 0; Git line-ending normalization warnings
  only.

No tests, browser/Playwright walkthrough, five-viewport visual/a11y audit,
database reset/replay, model call, deployment, cloud mutation, commit, or push
was performed. Browser/E2E QA remains explicitly pending.

## 19. FE-36/FE-37/FE-38/INT-25 integration handoff (2026-10-16)

Status: **development complete / E2E-browser QA pending**. FE-36, FE-37 and
FE-38 were released in their reserved file scopes, then root reviewed the
combined Timeline source under INT-25. FE-36 keeps issue tint behind bookings
with danger priority, contiguous 2px rules, and an inset first-cell marker.
FE-37 adds deterministic per-day booking fragments, selected-period distinct
hidden-booking counts in the sticky resource rail, neutral hidden-day rules,
and reversible expansion with explicit scroll-anchor preservation. FE-38 keeps
`go=false` weather in the date header's third in-flow row and aligns the
grouped legend with the final encodings.

Root source review confirmed issue-plus-hidden-day coexistence, buffered canvas
versus selected-period counting, reappearance after a per-day priority change,
empty rows, compact row geometry, exact conflict-day mapping, routine weather
without capacity impact, booking selection/inspector identity, and the
existing pan/sticky/header/legend paths. No broad `styles.css` repair was
needed: component selectors already provide the required Timeline scope and
the existing unified sticky/overlay rules remain compatible. No backend, API,
adapter, seed, generated type, dependency, or environment scope was reopened.

Root static verification:

- `npm run api:check` from `frontend` — PASS, exit 0.
- `npm run build` from `frontend` — PASS, exit 0; only dependency annotation
  and bundle-size warnings.
- `npm run lint` from `frontend` — PASS, exit 0; 6 existing Fast Refresh
  warnings and 0 errors.
- `git diff --check` — PASS, exit 0; Git line-ending normalization warnings
  only. Scoped new-file whitespace scan — PASS.

No tests, browser/Playwright walkthrough, five-viewport visual/a11y audit,
database reset/replay, model call, deployment, cloud mutation, commit, or push
was performed. Browser/E2E QA remains explicitly pending before production
readiness; it must verify 2-week/Month and month-boundary alignment, issue
detail/keyboard behavior, hidden-booking expansion, and five viewports.
