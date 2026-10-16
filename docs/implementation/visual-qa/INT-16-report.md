# INT-16 visual and accessibility QA

Date: 2026-10-15
Environment: local FastAPI + local PostgreSQL seed; no public preview or cloud resources used.

## Viewports checked

The Timeline was captured at the five packet-required viewport sizes after waiting for the page heading and real local API data:

- [1440×900](timeline-1440x900.png): desktop navigation, sticky resource column, aligned date grid, activity bars, and legend.
- [1366×768](timeline-1366x768.png): desktop layout remains within the viewport and the date grid stays aligned with the resource rows.
- [1100×700](timeline-1100x700.png): primary navigation collapses to the Menu control without hiding the Timeline controls.
- [768×1024](timeline-768x1024.png): tablet layout keeps the sticky resource column and readable controls.
- [390×844](timeline-390x844.png): mobile agenda layout is used; no horizontal overflow was detected.

## Checks

- Browser smoke and persisted-flow E2E passed against the local API, including Timeline → Readiness → Changes and deep links into Decision workspace and History.
- At 390×844 with `prefers-reduced-motion: reduce`, `document.documentElement.scrollWidth` was `390` for a `390` viewport, the first keyboard Tab focused the labelled `Ripple home` link, and browser console/page errors were empty.
- At 1440×900, the contrast audit checked 170 visible text/background pairs against WCAG AA thresholds with zero failures. The Ask Ripple overlay returned focus to the `Ask Ripple` button after Escape.
- Timeline date columns, resource rows, selected/conflict status marks, vendor legend, and scenario labels use meaningful text/status decoration; mobile navigation exposes the same routes through the Menu control.
- No production style/component change was needed from this audit. No public-preview audit or deployment was performed.

Senior visual/release review is still required for the screenshots and release claims before this gate can be marked fully reviewed.
