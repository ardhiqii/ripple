# Fleet Planning Design System

This system extends the current Fleet Timeline visual language to the rest of the product. It is designed for dense offshore planning workflows where users scan many resources, dates, constraints, and status changes.

## Design read

- Product: internal B2B planning application.
- Audience: planners, supervisors, and operations leadership.
- Visual language: calm enterprise, information-dense, precise, and low decoration.
- Theme: light only for the prototype phase.
- Design dials: variance 3, motion 2, density 8.
- Technical foundation: React, native CSS tokens, and Phosphor icons.

## Core principles

1. **The data is the visual focus.** Chrome stays neutral so schedules, conflicts, and decisions remain easy to scan.
2. **One color axis per meaning.** Vendor hue, operational status, selection, and severity must not compete.
3. **Keep context during scrolling.** Headers, resource identity, filters, and legends stay visible when their context is still relevant.
4. **Use borders before shadows.** Elevation is reserved for overlays or truly raised surfaces.
5. **Dense does not mean cramped.** Data rows can be compact, but controls need clear targets and consistent spacing.

## Source files

- `src/design-system.css`: tokens and reusable CSS primitives.
- `src/ui/index.tsx`: reusable React components.
- `src/styles.css`: current Fleet Timeline reference implementation.

Import `design-system.css` before page-specific styles. This is already configured in `src/main.tsx`.

## Color system

### Structural colors

| Role | Token | Value | Usage |
|---|---|---:|---|
| Canvas | `--ds-color-canvas` | `#F6F8FA` | App background |
| Surface | `--ds-color-surface` | `#FFFFFF` | Panels, headers, navigation |
| Subtle surface | `--ds-color-surface-subtle` | `#F0F5FA` | Group rows, quiet hover |
| Primary text | `--ds-color-text` | `#15283A` | Titles and important data |
| Muted text | `--ds-color-text-muted` | `#758395` | Metadata and helper text |
| Border | `--ds-color-border` | `#D8E0E8` | Grid and component boundaries |
| Primary | `--ds-color-primary` | `#2563EB` | Selection, focus, active controls |

### Semantic colors

- Green is success or Baker when the surface is explicitly vendor-coded.
- Red is danger or Powerlift when the surface is explicitly vendor-coded.
- Blue is informational or Schlumberger when the surface is explicitly vendor-coded.
- Gray is neutral or no vendor.
- Warning uses amber only for warnings. Do not use amber as a decorative accent.

Never rely on color alone. Add an icon, label, border treatment, or pattern for conflicts and holds.

### Timeline color rules

- Vendor controls the task block hue.
- Planned work uses a light flat fill.
- Work in progress uses a hard progress overlay, not a decorative gradient.
- Completed work uses lower opacity and a check icon.
- Weather hold uses a diagonal hatch.
- Conflict uses a diamond or warning icon.
- Selection uses a 2px primary outline.

## Typography

- Display and page titles: Manrope, weight 700 or 800.
- Interface copy: DM Sans, weight 400 to 700.
- Dates, percentages, codes, and tabular data: IBM Plex Mono.
- Use sentence case for headings and controls.
- Page title: 20px.
- Section title: 16px.
- Body: 12px.
- Dense table and timeline text: 8px to 10px.
- Supporting paragraphs should not exceed 65 characters per line.

## Spacing and shape

Use the `--ds-space-*` scale. The default base unit is 4px.

- Tight data gap: 4px.
- Control internal gap: 8px.
- Standard component padding: 12px.
- Page gutter: 20px.
- Large section gap: 32px.

Radius rules:

- Badges and compact metadata: 4px.
- Buttons, inputs, task blocks: 6px.
- Panels: 8px.
- Large overlays only: 12px.
- Avoid pills unless the shape represents a filter token or binary choice.

## Layout patterns

### Workspace page

Use for timeline, map, dispatch, and operational planning pages.

```text
Header
Optional summary strip
Scrollable work area
Optional persistent legend or action bar
```

The page shell owns the viewport. The work area owns scrolling. Sticky context stays inside the work area.

### Standard content page

Use for readiness, settings, audit, and detail pages.

```tsx
<PageShell>
  <div className="ds-content ds-stack">
    <SectionHeader title="Readiness rules" description="Review operational checks and source freshness." />
    <section className="ds-panel">...</section>
  </div>
</PageShell>
```

### Dense data page

- Keep filters in one toolbar.
- Keep column labels sticky when the table scrolls.
- Use tabular numbers.
- Use row height between 44px and 68px.
- Do not place every metric inside a floating card.

## Components

Reusable exports live in `src/ui/index.tsx`:

- `PageShell`
- `Button`
- `IconButton`
- `TextField`
- `SelectField`
- `StatusBadge`
- `SectionHeader`
- `MetricStrip`

Example:

```tsx
import { Button, PageShell, SectionHeader, StatusBadge, TextField } from './ui'

export function ReadinessPage() {
  return (
    <PageShell>
      <div className="ds-content ds-stack">
        <SectionHeader
          eyebrow="Operations"
          title="Readiness review"
          description="Resolve blockers before work enters the committed plan."
          action={<Button variant="primary">Run checks</Button>}
        />
        <TextField label="Search checks" placeholder="Search by well or resource" />
        <StatusBadge tone="warning">2 checks need review</StatusBadge>
      </div>
    </PageShell>
  )
}
```

## Interaction states

Every interactive component must include:

- Default.
- Hover.
- Pressed.
- Keyboard focus.
- Disabled when relevant.
- Loading when an operation is asynchronous.
- Empty and error states for data surfaces.

Motion is limited to 140ms to 220ms. Use motion for feedback and state transitions, not decoration.

## Icons

- Use `@phosphor-icons/react` only.
- Default interface weight is regular or bold.
- Icons inherit text color.
- Standard size is 16px, with 20px for primary navigation.
- Every icon-only button requires an accessible label and tooltip.

## Page checklist

- Uses tokens from `design-system.css`.
- Primary blue is the only brand accent.
- Vendor and status meanings are not mixed.
- Numbers use tabular figures.
- Focus rings are visible.
- Empty, loading, and error states are present.
- Sticky elements do not cover content.
- Page does not introduce a new radius scale.
- No decorative gradients.
- No orange unless it represents a warning.
- No new icon library.
- Responsive behavior is defined below 768px.
