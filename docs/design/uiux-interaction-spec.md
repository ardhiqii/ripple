# Ripple UI/UX Interaction and Integration Specification

Status: implementation-ready companion to the [product build plan](../product/product-build-plan.md)  
Date: 13 October 2026  
Design read: dense B2B industrial operations workspace, calm, evidence-first, human-controlled  
Design dials: variance 3, motion 2, density 8

This document defines what every screen, component, control, and cross-page transition does. It removes ambiguity between visual design, frontend state, API behavior, and business rules.

## 1. How to use this specification

- The [product build plan](../product/product-build-plan.md) defines product architecture, scope, technical choices, and build order.
- The [design system](design-system.md) defines tokens, typography, spacing, colors, and visual component rules.
- This file defines interaction contracts and integration behavior.
- FastAPI OpenAPI remains the source of truth for network payloads.
- If a button behavior in a mock conflicts with this file, this file wins until the team explicitly changes the decision.

Every interactive control must answer seven questions:

1. What object is the user acting on?
2. Is the action local, navigational, read-only API, or write API?
3. What must be true before the action is enabled?
4. What visible pending state appears?
5. What happens on success?
6. What happens on failure?
7. Which cached data or route state changes afterward?

## 2. Global interaction laws

### 2.1 Action hierarchy

| Level | Meaning | Examples | Visual treatment |
|---|---|---|---|
| Primary | Completes the main task of the current state | Analyze change, Approve option, Reply and replan | Solid navy, one per action region |
| Secondary | Important alternative without committing | Compare options, Open readiness, Review extraction | Neutral border |
| Tertiary | Low-risk utility | Export, Copy link, Clear filter | Text or ghost control |
| Destructive | Removes or resets state | Reset demo, Discard draft | Red only inside confirmation context |
| Semantic | Resolves a typed state | Accept update, Reject plan, Acknowledge condition | Uses icon and label; color follows state |

There is never more than one primary button in the same decision region. A page can have a primary header action and a primary detail-panel action only when they apply to different objects.

### 2.2 Button lifecycle

All asynchronous buttons use this lifecycle:

```text
idle -> validating -> pending -> success | recoverable error | terminal error
```

- Validation errors stay next to the relevant field.
- Pending labels use verbs: `Analyzing...`, `Approving...`, `Replanning...`.
- Button width stays stable while its label changes.
- Pending write actions disable duplicate submission but do not freeze unrelated navigation.
- Success toasts confirm transient actions. Structural results appear inline or through navigation.
- Errors name the failed action and provide a recovery route.

### 2.3 Disabled controls

A disabled control must have an adjacent visible reason or a tooltip reachable by keyboard. Examples:

- `Approve option` disabled: no option selected.
- `Approve option` disabled: required condition not acknowledged.
- `Analyze change` disabled: input is empty.
- `Compare` disabled: fewer than two options selected.
- `Accept update` disabled: item changed since suggestion was generated.

### 2.4 Confirmation policy

Use confirmation dialogs only for:

- Approving a plan that writes schedule or readiness data.
- Resetting seeded demo data.
- Discarding an unsaved extraction correction or reply.
- Leaving while a write request has an uncertain result.

Do not confirm filters, navigation, panel closing, or reversible local preferences.

### 2.5 Toast policy

Use toasts for:

- Readiness item saved.
- Filter view copied.
- Export prepared.
- Non-blocking refresh failure.

Do not use a toast as the only feedback for approval, version conflicts, solver infeasibility, or agent failure.

### 2.6 Focus policy

- Opening a sheet or dialog places focus on its title or first required field.
- Closing returns focus to the invoking control.
- Navigating to a new screen focuses the page heading unless the route includes a selected object.
- After approval, focus moves to the applied-change summary, not the global header.
- Inline validation focuses the first invalid field only after submit.

### 2.7 Navigation guard policy

Warn before leaving only when there is:

- Unsaved pasted input.
- Corrected extraction not yet submitted.
- A reply draft not yet sent.
- An unresolved approval request whose network result is unknown.

Agent runs continue on the server. Leaving an active run does not require confirmation; the Changes row continues showing its status.

## 3. Route and page ownership

| Route | Page owner | Canonical object | Allowed deep-link state |
|---|---|---|---|
| `/timeline` | Schedule feature | Schedule range | `from`, `to`, `groups`, `vendors`, `status`, `job`, `zoom` |
| `/readiness` | Readiness feature | Readiness work queue | `risk`, `job`, `vendor`, `stage`, `confidence`, `freshness`, `item`, `group` |
| `/changes` | Events feature | Change event queue | `nature`, `state`, `job`, `q`, `event` |
| `/changes/$eventId` | Events + plans | Event under analysis | `tab`, `run`, `option`, `compare` |
| `/decisions/$planId` | Plans + decisions | Plan version | `tab`, `option`, `compare`, `evidence` |
| `/history` | Decisions feature | Decision audit list | `action`, `nature`, `job`, `actor`, `from`, `to`, `decision` |
| `/alerts` | Alerts feature | Alert queue | `severity`, `type`, `state`, `alert` |
| `/settings/policy` | Policy feature | Domain pack | `section`, `lever`, `source` |
| `/demo` | Demo feature | Seed scenario | `scenario`, `mode`, `step` |

Rules:

- The canonical object ID belongs in the path when the user is doing sustained work on it.
- Short-lived selection belongs in search state only if restoring it after refresh is useful.
- Hover, temporary expanded rows, and unsent form content stay local.
- Route state must be validated before components consume it.

## 4. Global shell interaction contract

### 4.1 `GlobalHeader`

Data dependencies:

- Application name and active scenario.
- Unresolved alert count.
- Current agent run count.
- Demo mode flag.

Controls:

| Control | Preconditions | Action | Success result | Failure behavior |
|---|---|---|---|---|
| Product mark | None | Navigate `/timeline` | Timeline route | No network dependency |
| Timeline tab | None | Navigate `/timeline` | Restores last timeline search state | No network dependency |
| Readiness tab | None | Navigate `/readiness` | Restores last readiness filters | No network dependency |
| Changes tab | None | Navigate `/changes` | Inbox opens; badge shows active work | No network dependency |
| History tab | None | Navigate `/history` | History opens | No network dependency |
| Search | App ready | Open `CommandSearch` | Search dialog focused | If index load fails, page navigation still works |
| Alerts | None | Navigate `/alerts` | Alert filters default to unresolved | Count fetch error shows neutral dot, not zero |
| Ask Ripple | Page exposes context or generic mode | Open `RipplePanel` | Panel receives active context chips | Panel loads with retry state if dependencies fail |
| Reset demo | Demo mode | Open confirmation | Reset mutation only after confirmation | Dialog remains with error and retry |
| Environment menu | None | Open menu | Policy and scenario links visible | Local control only |

### 4.2 `CommandSearch`

Search groups:

- Pages.
- Jobs.
- Resources.
- Change events.
- Decisions.
- Actions permitted in current context.

Selection behavior:

- Page result navigates directly.
- Job result navigates to `/timeline?job={id}`.
- Resource result navigates to its timeline group and row.
- Event result navigates to `/changes/{eventId}`.
- Decision result navigates to `/decisions/{planId}`.
- `New change` opens the change composer.

The command palette never mutates schedule data.

### 4.3 `RipplePanel`

Inputs from parent page:

```ts
type RippleContext = {
  route: string
  jobIds?: string[]
  resourceIds?: string[]
  readinessItemIds?: string[]
  eventId?: string
  planId?: string
  scheduleVersion?: number
}
```

Outputs:

- `eventCreated(eventId)` updates Changes badge and offers navigation.
- `runStarted(runId)` adds the active run to the shared run registry.
- `planReady(planId)` offers `Open decision workspace`.
- `readOnlyAnswer` remains in the panel and creates no event unless the user explicitly promotes it.

The panel never directly updates parent-page domain data. It emits IDs and the query layer owns refetching.

## 5. Cross-page transition matrix

| Origin | User intent | Destination | Context passed | Destination behavior |
|---|---|---|---|---|
| Timeline block | Inspect a job | Timeline inspector | `jobId`, date range | Block remains selected and visible |
| Timeline inspector | Review preparation risk | Readiness | `job={jobId}` | Job filter applied, riskiest item selected |
| Timeline inspector | Ask about job | Ripple panel | job, resource, schedule version | Composer starts in read-only Ask mode |
| Timeline inspector | Submit schedule change | Ripple panel | job, resource, dates | Composer starts in Submit change mode |
| Readiness row | Inspect item | Readiness drawer | `itemId` | Row remains active and scrolled into view |
| Readiness drawer | Investigate risk | Ripple panel | item, job, source freshness | Submit change mode with context summary |
| Readiness suggestion | Review source event | Change detail | `eventId` | Extraction tab opens and item highlighted |
| Change row | Continue analysis | Change detail | `eventId` | Current run or plan tab opens |
| Change detail | Review ready options | Decision workspace | `planId` | Recommended option selected, not approved |
| Decision workspace | Inspect schedule impact | Embedded diff or Timeline | `planId`, affected jobs | Timeline opens in comparison overlay |
| Decision approval | View applied result | Timeline | changed job IDs and decision ID | New positions highlighted |
| Decision approval | Review readiness result | Readiness | affected item IDs and decision ID | Changed items highlighted |
| History row | Audit decision | Decision detail | `planId` | Read-only audit mode |
| Alert row | Investigate | Alert drawer | `alertId` | Evidence and affected objects load |
| Alert drawer | Start replan | Ripple panel | alert, affected objects | Submit change mode with alert source |
| Policy lever | View decisions using lever | History | Future feature, hidden in MVP | No dead control is rendered |
| Demo scenario | Start guided run | Changes or split demo | scenario ID | Data reset or confirmed reuse, then run starts |

## 6. Screen 1: Fleet Timeline contract

### 6.1 Screen regions

1. Global header.
2. Metric strip.
3. Timeline toolbar.
4. Sticky resource rail.
5. Sticky calendar header.
6. Timeline canvas and resource groups.
7. Sticky legend and horizontal scroll affordance.
8. Job inspector sheet.

### 6.2 Data contract

Queries:

- `scheduleKeys.range({ from, to, groups, vendors, status })`
- `policyKeys.registry()` for semantic lever and lock context when needed.
- `eventKeys.activeForJobs(jobIds)` only when a selected job needs change badges.

Derived data:

- Visible resource groups.
- Timeline columns and day width.
- Vendor treatment.
- Status overlays.
- Capacity tracks.
- Conflict markers.
- Changed-by-decision markers.

### 6.3 Toolbar controls

| Control | Type | Action | URL effect | Query effect |
|---|---|---|---|---|
| Previous range | Icon button | Shift window backward by visible span | Replace `from`, `to` | Fetch new schedule range |
| Today | Button | Center scenario day 0 | Replace `from`, `to` | Fetch if range differs |
| Next range | Icon button | Shift window forward | Replace `from`, `to` | Fetch new schedule range |
| Date range | Popover | Select start and end | Replace `from`, `to` | Fetch new range |
| Zoom | Segmented control | Compact, Standard, Detailed | Replace `zoom` | No refetch; recompute layout |
| Resources | Multi-select | Show/hide resource groups | Replace `groups` | Refetch or local filter based on API |
| Vendors | Multi-select | Filter vendor ownership | Replace `vendors` | Prefer local filter when complete data loaded |
| Status | Multi-select | Filter activity state | Replace `status` | Prefer local filter |
| Fit range | Icon button | Calculate day width to fit | Replace `zoom=fit` | No refetch |
| Export | Dropdown | PNG or CSV when supported | None | Lazy action, never blocks timeline |

### 6.4 Timeline block interactions

| Input | Behavior |
|---|---|
| Pointer hover | Show tooltip with code, type, range, resource, vendor, status, readiness risk |
| Click | Set `job` search param and open inspector |
| Enter or Space | Same as click |
| Shift-click | Add to two-item comparison selection |
| Escape | Close tooltip, then inspector if open |
| Context menu button | Open actions: Inspect, Open readiness, Ask Ripple, Copy link |

There is no drag handle in MVP. Blocks must not visually imply direct dragging.

### 6.5 `JobInspector` controls

| Button | Preconditions | Result |
|---|---|---|
| Open readiness | Job has readiness chain | Navigate with job filter |
| Ask Ripple | Job selected | Open read-only panel with job context |
| Submit change | Job selected | Open change mode with job and current dates |
| View decision | Job has recent decision marker | Navigate to decision detail |
| Copy link | Route can serialize selection | Copy deep link, show toast |
| Close | None | Remove `job` search param and restore block focus |

### 6.6 Timeline screen exit criteria

- Every visible block has an accessible description.
- Horizontal scrolling does not move the resource rail.
- Vertical scrolling does not lose calendar, current group, or legend.
- A deep-linked job is selected after data loads.
- An invalid job ID removes itself from the URL and shows a non-blocking message.
- Applying an approved decision highlights only changed objects.

## 7. Screen 2: Readiness Board contract

### 7.1 Screen regions

1. Global header.
2. Readiness summary metrics.
3. Filter and grouping toolbar.
4. Virtualized or paginated readiness table.
5. Item detail sheet.
6. Suggested-update review dialog.

### 7.2 Data contract

Queries:

- `readinessKeys.list(filters)`
- `readinessKeys.detail(itemId)` when selected.
- `eventKeys.detail(sourceEventId)` only on explicit source expansion.

Mutations:

- Patch readiness status.
- Accept proposed update.
- Reject proposed update with optional note.

### 7.3 Filters and grouping

| Control | Values | Default |
|---|---|---|
| Risk | Critical, Due soon, On track | Critical + Due soon |
| Job | Multi-select | All |
| Vendor | Multi-select | All |
| Stage | Function test, paperwork, shorebase, load and sail | All |
| Confidence | Low, Medium, High | All |
| Freshness | Fresh, Stale | All |
| Group by | Urgency, Job, Stage | Urgency |
| Search | Item, job, source | Empty |

### 7.4 Row controls

| Control | Preconditions | Mutation or navigation | Cache behavior |
|---|---|---|---|
| Status checkbox | Item editable and not superseded | Patch status | Optimistic row update; rollback on error; invalidate readiness summary |
| Item link | None | Select `item` in URL | Fetch detail |
| Job link | Job exists | Navigate Timeline with job | Timeline query owns fetch |
| Source link | Source event exists | Navigate Change detail | No readiness mutation |
| Review update | Proposed update exists | Open review dialog | Detail query reused |
| More menu | None | Ask Ripple, Copy link, View history | Context-dependent |

### 7.5 Suggested update dialog

Shows:

- Current value.
- Proposed value.
- Source excerpt.
- Extraction confidence.
- Resulting slack change.
- Affected job risk.

Buttons:

| Button | Action |
|---|---|
| Accept update | Patch value; recalculate slack; invalidate schedule risk and alerts |
| Reject suggestion | Mark suggestion rejected; item value remains unchanged |
| Investigate with Ripple | Close dialog; open panel with item and source context |
| View source | Open related change detail in a new route |
| Cancel | Close without mutation |

### 7.6 Readiness screen exit criteria

- Lateness and staleness are visually and semantically separate.
- Checkbox rollback is visible and understandable.
- Proposed updates cannot be mistaken for committed values.
- Filters survive refresh and back navigation.
- Selection remains stable after background refetch unless the item was deleted or superseded.

## 8. Screen 3: Change Inbox contract

### 8.1 Screen regions

1. Global header.
2. Inbox summary and `New change` action.
3. Nature tabs and status filters.
4. Event list or table.
5. Event preview panel.
6. New-change sheet.

### 8.2 Event lifecycle labels

| Backend state | User-facing label | Available action |
|---|---|---|
| Draft | Draft | Continue or discard |
| Extracting | Reading input | Open live status |
| Needs info | Needs clarification | Add missing information |
| Ready | Ready to investigate | Start analysis |
| Running | Investigating | View live trace |
| Options ready | Options ready | Review plan |
| Pending decision | Awaiting decision | Approve, reject, or reply |
| Approved | Approved | View applied changes |
| Rejected | Rejected | View reason or reopen as new event |
| Superseded | Superseded | Open latest plan |
| Failed | Needs attention | Retry or view error |

### 8.3 Header controls

| Button | Behavior |
|---|---|
| New change | Opens paste/upload sheet |
| Run sample | Opens sample menu in demo mode |
| Refresh | Refetches inbox without losing filters |
| Saved views | Off for MVP; do not render |

### 8.4 Event row actions

| Current state | Primary row action | Secondary actions |
|---|---|---|
| Draft | Continue | Discard |
| Needs info | Add information | View source |
| Ready | Analyze | Edit extraction |
| Running | View progress | None |
| Options ready | Review options | View trace |
| Pending decision | Decide | Copy link |
| Approved | View changes | View audit |
| Rejected | View reason | Start revised request |
| Failed | Retry | View error details |

### 8.5 New-change sheet

Step 1, source input:

- Textarea for pasted message.
- File input is off for MVP and is not rendered.
- Sample message choices in demo mode.
- Context chips if launched from another page.

Buttons:

- `Review change` validates and submits the raw event.
- `Clear` removes input after confirmation only if non-empty.
- `Cancel` closes; if input is non-empty, offer Keep draft or Discard.

Step 2, extraction review:

- Nature.
- Cause.
- Jobs.
- Requested date or ETA range.
- Hard constraints.
- Soft preferences.
- Risk tags and source sentences.
- Ruled-out levers and source sentences.
- Missing information.

Buttons:

- `Start investigation` is primary.
- `Edit fields` toggles correction mode.
- `Save correction` updates the structured event.
- `Back to source` preserves extraction.
- `Discard event` is destructive and confirmed.

### 8.6 Change Inbox exit criteria

- The user can distinguish a raw event from a proposed plan.
- Active runs remain discoverable after navigation.
- Sample scenarios require no typing.
- A failed extraction never silently becomes an analyzed event.
- Every row has one obvious next action based on state.

## 9. Screen 4: Decision Workspace contract

### 9.1 Workspace modes

| Mode | Trigger | Writes allowed |
|---|---|---|
| Live analysis | Agent currently running | Reply disabled until current run ends; cancel only if API supports it |
| Review | Plan options ready | Approve, reject, reply |
| Replan | Reply created a new linked event | Review previous and current versions; current plan actions only |
| Audit | Opened from History | No writes; `Start similar change` creates new event |
| Stale | Schedule version changed | Approval blocked; recompute available |

### 9.2 Region ownership

#### Event context rail

Owns:

- Raw source.
- Extracted facts.
- Hard constraints.
- Ruled-out levers.
- Risk tags.
- Data freshness.

Does not own plan selection or approval state.

#### Plan workspace

Owns:

- Option selection.
- Compare selection.
- Schedule diff.
- KPI comparison.
- Readiness and capacity impact.
- Conditions.

#### Ripple decision panel

Owns:

- Agent run trace.
- Explanation tabs.
- Evidence links.
- Reply composer.
- Decision bar.

### 9.3 Agent run trace controls

| Control | Behavior |
|---|---|
| Expand step | Shows input summary and result, not raw prompt |
| Evidence link | Opens Evidence Drawer anchored to the claim |
| Retry run | Available only after recoverable failure |
| Copy technical detail | Copies sanitized tool result for debugging |
| Collapse completed steps | Keeps current and failed step visible |

### 9.4 Option card controls

| Control | Preconditions | Result |
|---|---|---|
| Select option | Option feasible and not stale | Sets active option in URL/local route state |
| Add to compare | Fewer than three options selected | Adds option ID to `compare` search state |
| Remove from compare | Option in compare set | Removes ID |
| Inspect schedule impact | Option has changes | Scrolls or switches to diff view |
| View conditions | Conditions exist | Focuses condition list |
| View evidence | Evidence exists | Opens evidence drawer filtered by option |

Infeasible alternatives can be inspected but never selected for approval.

### 9.5 Compare behavior

- Two or three options can be compared.
- Rows: target start, modeled production impact, jobs moved, minimum slack, expedites, conditions, policy approvals, solver status, and risk notes.
- Best numeric value can be marked, but the UI never declares a universally best option outside the selected weight profile.
- Sticky first column preserves metric names during horizontal scroll.
- `Use this option` selects an option and closes compare mode.

### 9.6 Condition acknowledgement

Each condition displays:

- Condition text.
- Source or policy origin.
- Required approver.
- Inside-model or outside-model state.
- Confirmation checkbox if approval requires human acknowledgement.

Acknowledgement is local until the user opens approval confirmation. The final approval payload includes the acknowledged condition IDs if the backend contract supports them. Otherwise, the UI records them in decision metadata.

### 9.7 Approval interaction contract

Preconditions:

- Plan status is proposed.
- Active option is feasible.
- No violations.
- All required conditions acknowledged.
- Current user can act as planner in prototype mode.
- Latest known schedule version equals plan base version before opening the final dialog.

Final confirmation shows:

- Selected option label.
- Jobs moved with before and after dates.
- Readiness dates changed.
- Cargo or resource assignment changed.
- Conditions being accepted.
- Estimated model impact.
- The fact that the server will revalidate.

Buttons:

- `Approve and apply` sends the write.
- `Back to review` closes without mutation.

Pending state:

- Dialog cannot close through outside click.
- Primary label becomes `Validating and applying...`.
- Timeline and readiness queries are not optimistically changed.

Success:

- Update plan cache to approved.
- Invalidate schedule, readiness, events, history, alerts, and relevant job details.
- Show applied-change summary with links to Timeline and Readiness.
- Store changed object IDs in navigation state for one-time highlighting.

Version conflict:

- Keep dialog open in conflict mode.
- Show current schedule version and objects changed since plan creation when available.
- Offer `Recompute with latest schedule` as primary.
- Offer `Return to review` as secondary.
- Never offer force apply.

Other failure:

- Keep selected option and acknowledgements.
- Show actionable error inline.
- Allow safe retry only when backend confirms no transaction was committed.

### 9.8 Reject interaction contract

Fields:

- Required reason.
- Optional category: unacceptable impact, missing information, wrong constraint, operational preference, other.
- Checkbox `Generate new options using this reason`.

Behavior:

- Without replan checkbox, reject plan and return to event summary.
- With replan checkbox, reject current plan, create linked reply event, then start a new run.
- Preserve rejected plan in version history.

### 9.9 Reply and replan contract

The composer shows inherited context and tells the user the reply will produce a new plan version.

Buttons:

- `Reply and replan` submits the new context.
- `Save draft` is omitted in MVP.
- `Discard` clears after confirmation when non-empty.

Success:

- New event ID and run ID appear.
- Previous plan becomes superseded only after the new plan is successfully created, not merely when the reply is sent.
- Version switcher shows old and new plans.
- Changed constraints receive a visual diff.

### 9.10 Decision Workspace exit criteria

- The planner can tell which layer produced every claim.
- The current plan version is always visible.
- Infeasible options cannot be approved through keyboard or pointer paths.
- Outside-model conditions cannot be overlooked.
- A version conflict cannot lead to force apply.
- Reply creates lineage instead of overwriting history.

## 10. Screen 5: Decision History contract

### 10.1 Regions

1. Summary metrics.
2. Filter bar.
3. Decision table.
4. Audit detail sheet or detail route.

### 10.2 Filters

- Date range.
- Decision action.
- Event nature.
- Job.
- Actor.
- Conditional state.
- Lever used.
- Free-text search.

### 10.3 Row interactions

| Control | Result |
|---|---|
| Decision ID or summary | Open audit detail |
| Job link | Open Timeline at decision date range |
| Event link | Open source Change detail |
| Plan version | Open Decision Workspace in audit mode |
| Copy link | Copy stable audit URL |
| Start similar change | Create a new draft with referenced context, never clone approval state |

### 10.4 Audit detail timeline

Sequence:

1. Source received.
2. Extraction created or corrected.
3. Agent run steps.
4. Plans proposed.
5. Replies or rejections.
6. Selected option.
7. Approval revalidation.
8. Applied changes.
9. Notification drafts if present.

No audit item can be edited. Corrections create a new linked record.

## 11. Screen 6: Alerts and Daily Check contract

### 11.1 Alert states

```text
open -> acknowledged -> investigating -> resolved
  \-> dismissed
```

Dismissed and resolved are different. Dismissed means no product action was taken; resolved means the underlying condition cleared or a decision addressed it.

### 11.2 Row controls

| Button | Preconditions | Result |
|---|---|---|
| Acknowledge | Alert open | Mark acknowledged, retain in list |
| Investigate | Alert open or acknowledged | Open context drawer or Ripple panel |
| View object | Affected object exists | Navigate to Timeline or Readiness |
| Dismiss | Dismissal allowed | Require short reason for critical alerts |
| View decision | Alert linked to decision | Open audit mode |

Starting an investigation creates an event linked to the alert. Approval resolves the alert only if the backend confirms the underlying condition no longer exists.

## 12. Screen 7: Policy and Data Health contract

### 12.1 Navigation

Sections:

- Action registry.
- Weight profiles.
- Risk rules.
- Freshness policy.
- Data sources.
- Scenario assumptions.

### 12.2 Action registry table controls

The hackathon view is read-only.

| Control | Result |
|---|---|
| Lever row | Open definition sheet |
| Approval owner link | Show owner explanation, no user admin route yet |
| Used in decisions | Navigate to filtered History when supported |
| Copy policy link | Copy deep link to lever |

Forbidden levers use a lock icon and neutral treatment, not error red. They are policy constraints, not system failures.

### 12.3 Data source health

Each source shows:

- Source name.
- Last successful update.
- Current freshness state.
- Affected entity count.
- Latest error if any.
- `View affected items` link.

No fake `Reconnect` button is shown unless an actual integration exists.

## 13. Screen 8: Demo Lab contract

### 13.1 Scenario card controls

| Button | Behavior |
|---|---|
| Preview scenario | Show learning goal, message, expected path, and data reset impact |
| Run scenario | Confirm reset if current state differs, then seed and start |
| Run recorded | Use fixtures and recorded SSE without backend model dependency |
| Compare A-12 pair | Enter split mode with synchronized baseline context |
| Reset all demo data | Destructive confirmation, reset endpoint, clear all caches |

### 13.2 Reset transaction

Before reset:

- Explain that all prototype schedule, readiness, events, plans, and decisions return to seed state.
- Require explicit confirmation.
- Disable duplicate submission.

After success:

- Clear Query cache rather than only invalidating it.
- Clear local drafts, comparison selection, one-time highlights, and active run registry.
- Navigate to the selected scenario start page.
- Show seed version or scenario name in the global header.

After failure:

- Preserve current UI data.
- State that reset did not complete.
- Offer retry and health detail.

### 13.3 A-12 comparison behavior

- Left side uses the base request.
- Right side uses the same data plus the test-bay sentence.
- Scrolling the lever traces can be synchronized, but each side remains independently inspectable.
- Differences are marked at extraction, available lever set, solver attempts, verdict, and recommendation.
- Color is not the sole difference marker.

## 14. Agent and plan state machines

### 14.1 Event state machine

```text
draft
  -> extracting
  -> needs_info -> extracting
  -> ready
  -> running
  -> options_ready
  -> pending_decision
  -> approved | rejected | failed
                    \
                     -> revised event -> running
```

### 14.2 Plan state machine

```text
proposed -> approved
        -> rejected
        -> stale -> recomputed plan
        -> superseded by linked plan
```

Only `proposed` can be approved. Audit mode never changes plan state.

### 14.3 Agent run state machine

```text
queued -> streaming -> completed
                  -> recoverable_error -> retrying -> streaming
                  -> terminal_error
```

The UI derives state from ordered server events and a final status, not from elapsed time.

### 14.4 Readiness suggestion state machine

```text
proposed -> accepted -> applied
         -> rejected
         -> stale -> replaced or dismissed
```

### 14.5 Alert state machine

```text
open -> acknowledged -> investigating -> resolved
  \-> dismissed
```

## 15. Button-to-API integration matrix

| UI control | API or client action | Pending state | Success cache effect | Failure state |
|---|---|---|---|---|
| Review change | `POST /api/events` | `Saving source...` | Add event detail and inbox row | Preserve input, inline error |
| Save extraction correction | Event patch endpoint required or include before run | `Saving...` | Update event detail and inbox | Keep correction draft |
| Start investigation | `POST /api/agent/run` through SSE client | Live run header | Stream updates event and plan caches | Partial trace plus retry |
| Retry run | Same run endpoint or new run contract | `Retrying...` | Replace active run reference, retain failed run audit | Retain old trace |
| Tick readiness | `PATCH /api/readiness/{itemId}` | Inline checkbox pending | Invalidate readiness summary and alerts | Roll back checkbox |
| Accept readiness suggestion | Readiness update endpoint | Dialog pending | Invalidate readiness, schedule risk, alerts | Keep dialog and proposed diff |
| Reject readiness suggestion | Suggestion status endpoint required | `Rejecting...` | Remove from pending count | Keep dialog on failure |
| Approve option | `POST /api/plans/{id}/approve` | `Validating and applying...` | Invalidate schedule, readiness, plan, event, decisions, alerts | Version conflict or retryable error |
| Reject plan | `POST /api/plans/{id}/reject` | `Rejecting...` | Update plan/event/history | Preserve reason on failure |
| Reply and replan | `POST /api/plans/{id}/reply`, then run | `Creating replan...` | Add linked event/run and version lineage | Preserve reply text |
| Reset demo | `POST /api/demo/reset` | `Resetting demo...` | Clear query cache and local scenario state | Keep current state |
| Run daily check | `POST /api/agent/daily-check` in hidden/demo control | `Checking...` | Invalidate alerts and events | Show health error |

Missing-contract note: the existing technical plan does not explicitly define endpoints for extraction correction, readiness suggestion rejection, and alert state changes. Before implementation, either add these endpoints to OpenAPI or remove the corresponding write controls. Never ship controls backed only by local state when they imply an audited business action.

## 16. Query invalidation matrix

| Successful mutation | Schedule | Readiness | Events | Plans | Decisions | Alerts | Policy |
|---|---:|---:|---:|---:|---:|---:|---:|
| Create event | No | No | Yes | No | No | Maybe | No |
| Correct extraction | No | No | Yes | Stale related plans | No | No | No |
| Complete agent run | No | No | Yes | Yes | No | No | No |
| Tick readiness | Maybe risk overlay | Yes | No | Stale related plan if version bumps | No | Yes | No |
| Accept readiness suggestion | Maybe | Yes | Yes | Maybe | Yes if audited | Yes | No |
| Approve plan | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Reject plan | No | No | Yes | Yes | Yes | No | No |
| Reply and replan | No | No | Yes | Yes | Yes | No | No |
| Reset demo | Clear all | Clear all | Clear all | Clear all | Clear all | Clear all | Refetch |

If readiness ticks bump `schedule_version`, any open plan based on the previous version is potentially stale. The UI should not locally mark every plan stale; it should show a freshness warning and let the approval endpoint remain authoritative.

## 17. Component integration map

### 17.1 Shell composition

```text
AppProviders
  RouterProvider
    AppShell
      GlobalHeader
        PrimaryNav
        CommandSearch
        AlertButton
        RippleTrigger
        ScenarioMenu
      RouteOutlet
      RipplePanel
      GlobalToaster
```

`RipplePanel` is mounted once at shell level so route transitions do not destroy an active session. The panel consumes route context through a small adapter, not direct imports from page components.

### 17.2 Timeline composition

```text
TimelineRoute
  MetricStrip
  TimelineToolbar
  TimelineViewport
    TimelineCalendar
    ResourceRail
      ResourceGroupHeader
      ResourceLabel
    TimelineCanvas
      WeatherBand
      TodayMarker
      ResourceRow
        TimelineBlock
        CapacityTrack
    TimelineLegend
  JobInspector
```

`TimelineViewport` owns scrolling. Children receive scroll state through CSS sticky positioning and a minimal timeline context. Do not store continuous scroll position in React state.

### 17.3 Decision composition

```text
DecisionRoute
  DecisionVersionHeader
  EventContextRail
    SourceExcerpt
    ExtractionSummary
    ConstraintList
    LeverPolicyList
  PlanWorkspace
    PlanOptionList
      PlanOptionCard
    OptionCompareTable
    ScheduleDiff
    ConditionList
  RippleDecisionPanel
    AgentRunTimeline
      ToolTraceRow
    AudienceExplanation
    EvidenceDrawer
    ReplyComposer
    DecisionBar
```

Selection state lives at `DecisionRoute`. Cards, diff, conditions, explanation, and decision bar receive the same selected option ID. No child maintains a competing selected option.

### 17.4 Shared run registry

The shell may maintain a small UI registry:

```ts
type ActiveRun = {
  runId: string
  eventId: string
  status: 'queued' | 'streaming' | 'completed' | 'failed'
  startedAt: string
}
```

This registry is for discoverability and panel continuity only. The server remains authoritative. On reload, active event queries rebuild it.

## 18. shadcn primitive mapping

| Ripple component | shadcn or headless foundation | Custom responsibility |
|---|---|---|
| Global navigation | Navigation Menu or custom semantic nav | Dense active state and responsive collapse |
| Command search | Command + Dialog | Cross-entity result grouping and routes |
| Ripple panel | Sheet + Resizable | Context modes and session continuity |
| Job inspector | Sheet | Job summary and cross-page actions |
| Filter controls | Popover, Command, Checkbox | URL serialization and active-filter count |
| Option cards | Toggle Group or custom radio semantics | KPI, condition, evidence layout |
| Compare view | TanStack Table + Scroll Area | Sticky metric column and option selection |
| Decision confirmation | Alert Dialog | Change summary and version handling |
| Reject flow | Dialog + Form | Required reason and optional replan |
| Tabs | Tabs | URL-synced workspace panels |
| Notifications | Sonner | Transient mutation feedback only |
| Tool trace | Collapsible | Stream phase semantics and evidence |
| Evidence drawer | Sheet | Claim-to-tool-result navigation |
| Split workspace | Resizable Panels | Stable min sizes and responsive fallback |

Generated shadcn components are styled once at the primitive layer. Domain-specific semantics live in Ripple components, not repeated Tailwind class strings in routes.

## 19. Form validation contracts

### 19.1 New change

- Text required when no file is attached.
- Trim whitespace.
- Client length limit mirrors backend limit.
- Do not reject operational abbreviations.
- File validation stays hidden until backend contract exists.

### 19.2 Extraction correction

- At least one job required unless `missing_info` explicitly allows an unidentified job.
- Request requires a target or a clearly stated open-ended objective.
- ETA earliest cannot be after ETA latest.
- Every risk tag and ruled-out lever requires a source excerpt.
- Forbidden lever cannot be changed through extraction correction.

### 19.3 Reject plan

- Reason required and trimmed.
- Minimum length should discourage empty phrases but not force essays.
- Category optional.

### 19.4 Reply and replan

- Reply required.
- Current plan ID included automatically.
- Warn if text appears to approve rather than add context; approval still requires the explicit button.

### 19.5 Approval

- Option ID required.
- Required condition IDs acknowledged.
- Base schedule version included.
- No free-text form field in the final confirmation.

## 20. Permission and role readiness

The hackathon uses one planner role, but components must accept capability flags so later role support does not require page rewrites.

```ts
type Capabilities = {
  canEditReadiness: boolean
  canReviewExtraction: boolean
  canRunAgent: boolean
  canApprovePlan: boolean
  canRejectPlan: boolean
  canEditPolicy: boolean
  canResetDemo: boolean
}
```

Potential future role mapping:

| Action | Planner | Operations engineer | Logistics | Manager/auditor |
|---|---:|---:|---:|---:|
| View schedule | Yes | Yes | Yes | Yes |
| Submit change | Yes | Yes | Yes | No |
| Edit readiness | Yes | No | Yes | No |
| Correct extraction | Yes | Yes for own source | No | No |
| Approve plan | Yes | No | No | Configurable |
| Reject/reply | Yes | Comment only | Comment only | Configurable |
| View audit | Yes | Limited | Limited | Yes |
| Edit policy | Admin later | No | No | No |

Hiding a button is not authorization. Backend checks remain mandatory.

## 21. Concurrency and stale-data behavior

### 21.1 Schedule version

- Every plan stores `base_schedule_version`.
- Timeline shows current version only in diagnostics or conflict context, not as decorative UI.
- Approval always sends the expected version.
- Background refetch may warn that an open plan could be stale, but the server decides.

### 21.2 Concurrent readiness edit

- Optimistic checkbox writes include latest item version if available.
- On conflict, restore server value and show who updated it if provided.
- Suggested updates generated from older item versions become stale and cannot be accepted.

### 21.3 Agent run while navigating

- Closing the Ripple panel does not cancel the server run.
- Changes badge shows active run count.
- Reopening the event resumes from cached and server state.
- Starting another run for the same event requires a deliberate retry or reply action.

## 22. Keyboard contract

| Shortcut | Context | Action |
|---|---|---|
| `Ctrl/Cmd + K` | Global | Open command search |
| `Ctrl/Cmd + J` | Global | Toggle Ripple panel |
| `G` then `T` | Outside text input | Go to Timeline |
| `G` then `R` | Outside text input | Go to Readiness |
| `G` then `C` | Outside text input | Go to Changes |
| `G` then `H` | Outside text input | Go to History |
| `Esc` | Overlay | Close topmost non-blocking overlay |
| Arrow keys | Timeline block group | Move focus across nearby activities where practical |
| Enter | Focused row or block | Open detail |
| Space | Checkbox or selectable option | Toggle selection |

Shortcuts are documented in command search and never fire while typing in an input.

## 23. Copy and label inventory

Approved primary action labels:

- `New change`
- `Review change`
- `Start investigation`
- `Review options`
- `Use this option`
- `Approve option`
- `Approve and apply`
- `Reject plan`
- `Reply and replan`
- `Recompute with latest schedule`
- `Investigate with Ripple`
- `Accept update`
- `Reset demo`

Avoid:

- `Submit` without an object.
- `Continue` when the next action can be named.
- `Apply AI` or `Trust recommendation`.
- `Optimize` when the actual action includes extraction and investigation.
- `Chat now`.
- `Fix` for changes that require planner judgment.

## 24. Telemetry contracts

Every event includes route, scenario, object IDs, and a correlation ID when available. Never send raw pasted source text to product analytics.

| Event | When fired | Important properties |
|---|---|---|
| `page_viewed` | Stable route rendered | route, selected object type |
| `change_source_submitted` | Event created | source type, context origin |
| `extraction_corrected` | Correction saved | corrected field names only |
| `agent_run_started` | SSE request accepted | event nature, scenario |
| `agent_run_completed` | Done event received | latency, tool count, outcome |
| `agent_run_failed` | Terminal error | normalized error type, last phase |
| `option_compared` | Compare view opened | option count, profiles |
| `evidence_opened` | Evidence drawer opens | claim type, tool type |
| `plan_approved` | Backend confirms | verdict, condition count, jobs moved |
| `plan_rejected` | Backend confirms | reason category, replan requested |
| `plan_replied` | Linked event created | reply length band, not content |
| `readiness_updated` | Backend confirms | stage, resulting risk band |
| `demo_reset` | Reset confirms | scenario |

## 25. Screen-level acceptance checklist

### Timeline

- [ ] Sticky calendar, rail, group, and legend work together.
- [ ] Filter URL restores accurately.
- [ ] Block semantics survive without color.
- [ ] Inspector connects to readiness, agent, and decisions.
- [ ] Changed-by-decision highlight clears predictably.

### Readiness

- [ ] Slack, confidence, and freshness remain distinct.
- [ ] Optimistic tick rolls back on failure.
- [ ] Suggested updates show before/after and source.
- [ ] Source and job links route correctly.
- [ ] Filters and selected item survive refresh.

### Changes

- [ ] Every event state has one obvious next action.
- [ ] Draft and extraction are recoverable.
- [ ] Active runs persist across page navigation.
- [ ] Sample scenarios work without typing.
- [ ] Failed extraction does not enter plan review.

### Decision Workspace

- [ ] Event, policy, engine, and human layers are distinguishable.
- [ ] Selection drives cards, diff, conditions, and decision bar consistently.
- [ ] Infeasible and stale options cannot be approved.
- [ ] Approval shows exact changes and revalidates.
- [ ] Reply creates lineage and constraint diff.
- [ ] Evidence is reachable from every material claim.

### History

- [ ] Records are immutable.
- [ ] Source, plan versions, decision, and applied changes are linked.
- [ ] Audit routes are stable and shareable.
- [ ] Starting a similar change creates a new draft.

### Alerts

- [ ] Dismissed and resolved are distinct.
- [ ] Investigate creates a linked event.
- [ ] Critical dismissal captures a reason.
- [ ] Resolution depends on underlying condition, not only user click.

### Policy and Data Health

- [ ] Forbidden lever is explained without looking like a system error.
- [ ] Every policy row can deep-link.
- [ ] Source freshness links to affected items.
- [ ] No unsupported integration action appears.

### Demo Lab

- [ ] Reset is explicit and transactional.
- [ ] Recorded mode uses the production component path.
- [ ] A-12 pair comparison identifies the exact sentence and downstream differences.
- [ ] Judge can run the core story without team guidance.

## 26. Contract gaps to resolve before coding

These decisions affect backend and frontend contracts, not visual design. Their proposed resolutions are now defined in [backend-agentic-spec.md](../engineering/backend-agentic-spec.md#34-decisions-resolved-from-the-ui-integration-plan):

1. Add or remove an endpoint for correcting extracted event fields before an agent run.
2. Define persistence and endpoints for readiness suggestions, including rejection.
3. Define alert list and state-update endpoints if Alerts ships.
4. Decide whether approval payload records acknowledged condition IDs.
5. Decide whether active agent runs can be cancelled or only abandoned in the UI.
6. Define how an SSE client resumes after disconnect: last event ID, full replay, or fresh plan fetch.
7. Define decision-list filters supported server-side.
8. Define whether readiness ticks always bump schedule version.
9. Define changed-object IDs returned by approval for precise timeline highlighting.
10. Define cached demo fallback behavior in production mode.

None of these gaps blocks visual component work. They must be frozen before wiring the corresponding write interactions.

## 27. Recommended implementation order at component level

1. `AppProviders`, typed router, query client, API error normalization.
2. Customized shadcn primitive batch and token bridge.
3. `AppShell`, `GlobalHeader`, route context adapter, command search.
4. Timeline decomposition and `JobInspector`.
5. Readiness table, filters, detail sheet, update review.
6. Change Inbox, composer, extraction review.
7. Shared agent stream reducer and active run registry.
8. `RipplePanel` against recorded SSE.
9. Decision Workspace selection model and option comparison.
10. Evidence, conditions, schedule diff, explanations.
11. Approve, reject, reply, version conflict.
12. History and audit mode.
13. Demo Lab, reset, recorded fallback, A-12 comparison.
14. Alerts and Policy/Data Health according to final scope.
15. Accessibility, E2E flows, responsive states, performance pass.

## 28. Interaction definition of done

An interaction is done only when:

- Its label names the action.
- Preconditions and disabled reasons are defined.
- Keyboard and pointer paths work.
- Focus behavior is correct.
- Loading, success, error, stale, and retry states exist.
- The API or local owner is explicit.
- Query invalidation is explicit.
- Navigation destination and passed context are explicit.
- Analytics excludes sensitive source text.
- The action respects policy, capability, and human-approval boundaries.

If any one of these is missing, the control is a visual prototype, not an implementation-ready product control.
