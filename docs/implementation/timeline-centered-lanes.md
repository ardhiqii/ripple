# Timeline centered lanes and contextual previews

Status: approved **development specification**, 2026-10-16 screenshot follow-up. Planning only; no implementation, browser QA or E2E result is claimed. This document supersedes the **per-day booking-fragment algorithm, hidden-line placement, 68–72px baseline height, bottom issue-band placement, and weather-header surface treatment** in [timeline-grid-annotation-pass.md](timeline-grid-annotation-pass.md). Preserve that document's absolute-day data truth, exact conflict-day semantics, resource-specific issue priority, selected-period count principle, location-scoped weather, pan/horizon, API and schedule-write boundaries. Do not replay FE-36–FE-38/INT-25 wholesale.

## 1. What the screenshots and source show

| Finding | Root cause in current source | Intended result |
|---|---|---|
| One booking breaks into dashed mini-blocks even though its original interval is continuous. | `timeline-overflow-layout.ts` selects winners separately for every day; `timeline-workspace.tsx` renders resulting fragments and `.is-clipped-*` dashed edges. | A booking is one continuous block over its full clipped interval. Compact mode hides or shows **whole booking IDs**, never intermittent pieces. |
| `+4` has no obvious date-range target; the thin line cannot be clicked and breaks at ID/lane changes. | `getHiddenSegments` splits on booking-ID signature and lane; `.timeline-hidden-booking-line` is 3px, `pointer-events:none`. | A visible, focusable **overflow band** across each connected run of dates containing hidden bookings. `+N bookings` sits inside that band; click/Enter expands the resource. |
| Issue count/wrench appears detached below the booking; line and badge compete with the next row. | Booking grid rows precede a 16px bottom marker band; issue marker is a tiny independent target. | Reserve a slim **top issue rail** in the resource row. One aligned icon/count centered over the affected run, with restrained resource-day tint behind the grid. Booking remains centered below. |
| Weather no-go label is improved but tiny and detached from its date. | The marker only paints its own 14px trigger. | Tint the **single date-header cell** softly, keep its number and weekday readable, and put the no-go icon/label in the third in-flow line. Do not tint all resource rows. |
| Current hover text is too small/simple for multiple maintenance or conflict events. | `timeline-marker-tooltip` is a 9px local absolute span; scrolling/sticky layers can clip it. The project-owned `ui/tooltip.tsx` is also local absolute rather than portaled. | Separate simple definition tooltip from a richer, collision-aware, portaled issue preview. Keep click detail for full evidence and actions. |

Design references are principles, not dependencies: [FullCalendar's more-link behavior](https://fullcalendar.io/docs/moreLinkClick) ties the overflow count to hidden events and an openable list; [shadcn Hover Card](https://ui.shadcn.com/docs/components/aria/hover-card) distinguishes a richer hover/focus preview from a terse tooltip. Ripple keeps its custom CSS Grid, project-owned primitives and current dependencies; do not install FullCalendar or a second UI system.

## 2. Frozen visual model

For every desktop resource row, render three aligned vertical zones **inside the same resource/track row**:

```text
date columns     16       17       18       19       20
issue rail       [──── 2 issues ────][ maintenance ]
booking lane          [ FS-JOB-009 continuous ]
overflow band                [ +3 bookings ────────── ]
```

This is a structural illustration, not literal colors or data. The top rail belongs to a resource and absolute dates; the central lane belongs to bookings; the bottom band describes hidden bookings. The left sticky resource cell has exactly the same row height. In rows without issues or hidden bookings, keep the reserved strips visually quiet so booking blocks sit on the same center baseline across all resources.

### 2.1 Continuous booking blocks and row height

1. Deduplicate by stable `bookingId` as today. Sort whole booking intervals deterministically (selected booking first when applicable, then in-progress, earlier start, stable ID), but once assigned visible/hidden, keep the decision for the whole clipped canvas interval. Pack at most two **complete** visible intervals into non-overlapping lanes; never draw two blocks on top of each other. If an interval cannot fit either visible lane for its full span, hide the whole interval, even where a lane would be free for a few isolated days. Do not label this a capacity conflict; compact hiding is a view choice, independent of the backend's precise capacity result.
2. If a selected booking would otherwise be hidden, reserve it as a whole block and deterministically evict/repack lower-priority bookings. Preserve original IDs, start/end, status, click-to-inspector and explicit conflict-day underlining. A selected booking stays visible across pan and row expansion. Do not infer a vendor from the resource group or recolor bookings by resource category.
3. The only cut edge is at the **canvas boundary** when the real booking continues outside the loaded dates. It is not a dashed edge caused by the compact algorithm. Use a restrained continuation affordance and expose the real inclusive interval in the inspector.
4. Normal one-lane geometry targets **82–88px total**: 16–18px issue rail, 44–48px centered booking lane, 18–20px overflow rail, plus separators/padding. A genuinely simultaneous second visible lane adds its lane height; expanded mode grows for all packed bookings. Do not make a row 180–250px merely because one maintenance or weather interval exists. Empty rows retain the normal baseline. Keep text vertically centered and readable at 1366px; a short block may show ID only with the full label on hover/focus/inspector.
5. Compact/expanded row state is per resource and reversible. Preserve vertical scroll anchor, left-rail/track equal height, selected job and horizontal pan. Existing month/2-week controls and selected-period request math do not change.

### 2.2 Overflow as a real date-range control

1. Derive the union of **whole hidden booking intervals** clipped to the buffered canvas. Join overlapping or day-adjacent affected dates into one connected run; split **only** at a real day with zero hidden bookings. Do **not** split when the set/count of hidden booking IDs changes or when a visual booking lane changes. `N` on a run is the number of distinct hidden booking IDs intersecting that run, not the maximum simultaneous concurrency on every day. Hover/focus lists each hidden job and its actual dates so this meaning is not misleading.
2. Render a continuous neutral/slate band in the bottom strip, at least 18px high, across every run. The whole visible band is a button, not a 3px decorative line. Center `+N bookings` in the run where space permits; for short spans use a compact count with accessible full label and collision-safe preview. The band must not cover booking blocks, issue rail or horizontal scrollbar. The legend says `More bookings · open row`, not `conflict`.
3. Click/Enter/Space on any run expands this resource to all complete bookings using stable lanes; all bands disappear, and the sticky resource rail offers `Show fewer` for collapse. The rail may also offer `+N more across selected period` as a secondary shortcut, but it must not be the **only** obvious way to expand. Count in rail means distinct hidden IDs intersecting the selected period; if absent, do not render a stale count. Do not use a per-day `+N` that implies all jobs occur on just that day.
4. Hover/focus on the band previews `Additional bookings · <run dates>` plus up to four booking ID/date pairs, then `+M more; open row for all` when needed. The preview is informational; clicking the band expands the row, not a schedule mutation. A full booking can be opened in the expanded row/inspector.

### 2.3 Issue tint, top rail and exact intervals

1. Keep only source-truth resource issues: explicit maintenance/unavailable intervals and exact backend `conflictDays` with `overflow > 0`. Weather no-go is **not** resource unavailability or automatic capacity zero. For each resource×absolute-day grid cell, use one restrained highest-severity tint: danger for unavailable/conflict, otherwise warning for maintenance. Preserve gridline, weekend, today, selected period, booking text and focus ring. No whole-fleet column tint.
2. Aggregate contiguous days with the same **distinct active issue-ID set and severity** into a run. A continuous, thin range rule occupies the top issue rail over that full run. Center one clear 14–16px kind icon (single issue) or numeric count (multiple issues) within the run; for one-day runs it sits at the center of that day cell. Do not put icon at a start boundary, below the booking, in a negative margin, or in the neighboring row. For adjacent runs with different active sets, preserve an optical gap or border so they do not visually claim one identical event. The entire run rail is a labelled hover/focus/click target, separate from booking blocks. If the run is narrower than a readable label, show only the icon/count; the underlying target still spans the run.
3. The count is the number of distinct issue records active **throughout that run**. Mixed maintenance+conflict uses danger tint and a `2` marker, while preview lists both kinds separately; a following maintenance-only day is a separate warning run. Dates shown in preview/detail are original inclusive dates plus the intersecting displayed run. Keep the job's red conflict underline only on exact overflow days, not its full span.
4. Keep issue visual semantics independent of booking status/selection, and never block booking click or horizontal pan outside the issue rail. A change in search/vendor/status display filtering must not silently erase a persisted issue or its linked-job path.

### 2.4 Two levels of explanation, without tooltip clutter

1. **Simple tooltip:** for legend swatches, icon meaning and single-state shorthand, use a one-line definition such as `Maintenance · scheduled 17–18 Oct` or `More bookings · open this resource row`. It is non-interactive and never carries an action. Do not duplicate browser-native `title` on the same trigger.
2. **Rich issue preview on hover and keyboard focus:** use one restrained project-owned hover-card/tooltip-like surface, about 280–320px wide, with heading (`2 issues · Fleet Barge 2`), affected **displayed** date span and resource location, then a compact list of issue type + each original inclusive date span + actual reason and consequence. Example:

   ```text
   2 issues · Fleet Barge 2
   16–17 Oct 2026 · synthetic-offshore
   Capacity conflict  16–17 Oct  FS-JOB-009 exceeds capacity
   Maintenance        16–18 Oct  Scheduled crane maintenance
   Open details for linked jobs →
   ```

   The last line is an instruction, not a fake link inside a non-interactive tooltip. Show up to four issue records in the preview; if there are more, state `+M more in details`. Never hide a severity or occurrence count. Use 11–12px readable body, tabular dates/IDs, sentence case, comfortable 4–8px spacing, neutral surface, subtle shadow and semantic accent in a small icon/left rule only; no giant red panel. Hover delay ~150ms, close delay ~150–250ms to avoid flicker when moving across a narrow rail. `prefers-reduced-motion` removes movement.
3. **Click/tap/Enter detail popover:** retain the existing complete list, reason, impact, original dates, linked job actions and close. On open, suppress the hover preview. Escape/outside closes; focus returns to the originating run trigger. If preview has important information not in the detail, that is a bug. Do not put actionable controls only in hover. On touch, tap opens the detail directly; hover is not required to understand the state.
4. All floating surfaces must portal above the scrolling grid, sticky header/rail and legend, flip/shift inside the viewport at 1366×768 and 390px, and reposition or dismiss on scroll/resize. Establish a **local z-index order**: cell tint < range rail < booking < sticky rail/header < hover preview < click detail/sheet. Avoid arbitrary `9999`, clipped text, invisible focus, or pointer-capturing transparent overlays. Use existing project-owned primitives/patterns; `ui/tooltip.tsx` is currently non-portaled, so do not drop it unchanged into the scroll grid. No new package unless a separate approved dependency packet is created.
5. The accessible name on each issue trigger states resource, issue kind/count and dates. Focus opens the same information as hover; use `aria-describedby` only while preview is visible. Detail is a popover/dialog with an accessible heading. Each count and color has a textual equivalent in the trigger, preview, detail and legend.

### 2.5 Weather and persistent legend

1. Only a date with `go === false` gets a **soft warning tint on its own header cell**; keep date number, weekday, Today and selected-period indication readable. No-go icon/short text remains in the third in-flow row below weekday. Do not color the resource track, make weather look like an explicit unavailable resource, or put a cloud on normal/unknown observations. Multiple no-go locations on the same day share one marker.
2. Hover/focus shows date and affected location count/summary; click/tap shows all locations, metric/value and source in the existing detail. A date title tooltip must not duplicate/obscure the no-go preview. Keep header cell alignment with exact grid columns at month boundaries, at 1366px and narrow layouts.
3. Legend is three concise groups: **Schedule** (booking, in-progress, complete, more bookings/open row), **Resource issues** (maintenance, unavailable, capacity conflict, `N issues`), **Day context** (weather no-go, today, selected). Swatches/icons must match the actual row and date-header treatments. Do not equate neutral booking color with `No vendor`, nor blue primary selection with `Schlumberger`.

## 3. Delivery ownership and genuine parallelism

New scoped IDs: **FE-39, FE-40, FE-41, INT-26**. This is a Timeline-only frontend pass. No backend/API/seed/Gemini/other-page changes. The old FE-36–FE-38/INT-25 source is preserved as the starting point. Their implementation is not re-run.

| ID | Prerequisite and exclusive writer | Contract |
|---|---|---|
| FE-39 | Ready; owns `timeline-workspace.tsx`, `timeline-density.css`, `timeline-overflow-layout.ts`, optionally `timeline-layout.ts`; bounded `timeline-block.tsx` clipping repair | Whole-interval visible booking selection, continuous centered blocks, bottom clickable hidden-run bands, compact/expanded row geometry. Normalize exact conflict underline to the visible clipped interval; leave issue semantics present, but FE-40 will relocate their rail. |
| FE-41 | Ready **in parallel with FE-39**; owns `timeline-weather-marker.tsx`, `timeline-weather-marker.css`, `timeline-legend.tsx` | Header-cell no-go tint through the existing marker wrapper/`:has()` scoped CSS, compact hover/detail and final legend. Do not edit Workspace or density CSS. Keep `WeatherDayMarker({ observations })` export unchanged. |
| FE-40 | After FE-39 root review releases Workspace/density; may overlap still-running FE-41 | Owns `timeline-workspace.tsx`, `timeline-density.css`, optionally **one new** `components/timeline/timeline-hover-preview.tsx` and matching CSS | Top issue rail, centered run icon/count, richer portaled preview, complete click detail, stable collision/z-index/focus geometry. Preserve FE-39 booking/overflow behavior; do not edit FE-41 files. |
| INT-26 | Root only after FE-39/40/41 release all files | `frontend/src/styles.css` only if a small Timeline-scoped sticky/overlay specificity repair is unavoidable; `docs/implementation/productization-plan.md` for factual handoff only | Source/static integration of all three; return component defects to one exclusive owner serially. No broad CSS cleanup. |

**Parallel execution:** dispatch FE-39 and FE-41 before waiting for either. Root does read-only source review while they run. On FE-39 completion, review its diff and release Workspace/density; dispatch FE-40 immediately if FE-41 is still running and the write sets remain disjoint. If FE-41 finishes first, root reviews it and waits for FE-39's real dependency, not an artificial global barrier. At most two writing workers; each worker receives **one task ID** and its exact allowed files. Workers do not edit shared `styles.css`, generated types or each other's files. Only root runs static checks after integration. A required extra path uses README's bounded scope-repair protocol.

## 4. Development handoff and later QA

Apply [README §4.8](README.md#48-development-first-acceptance-override-2026-10-16): no new/updated/running test code, browser/E2E walkthrough, DB reset, model call, cloud mutation, commit, push or deploy in this pass. Root reviews diffs/imports and after all writers finish may run `npm run api:check`, frontend `npm run build`, `npm run lint`, `git diff --check`. Passing static checks is **development complete / browser QA pending**, never proof the screenshots or interactions passed.

The later browser goal should visually exercise: one uninterrupted full booking; selected booking surviving collapse; two truly simultaneous visible lanes; 4 hidden bookings across changing but connected dates yielding **one clickable range band**; split only at a real empty day; row expand/collapse without scroll jump; Barge 2 16–17 Oct mixed issues followed by 18 Oct maintenance-only; tooltip vs rich preview vs click detail; issue/job same-day click separation; no-go tint and multi-location detail; Today/selected readability; Oct→Nov horizontal pan; sticky and tooltip layering at 1366×768 and 390px; mouse, keyboard, touch and reduced-motion behavior. Record failures under owning ID, not new test-writing tasks.
