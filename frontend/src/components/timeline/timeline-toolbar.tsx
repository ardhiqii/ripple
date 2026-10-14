import { CalendarBlank, CaretLeft, CaretRight, DownloadSimple, MagnifyingGlass } from '@phosphor-icons/react'

import { timelineDays, resourceGroupOptions } from '@/features/schedule/fixture-adapter'
import { shiftTimelineRange } from '@/features/schedule/timeline-layout'
import type { TimelineRange } from '@/features/schedule/types'

interface TimelineToolbarProps {
  query: string
  scope: string
  range: TimelineRange
  onQueryChange: (query: string) => void
  onScopeChange: (scope: string) => void
  onRangeChange: (range: TimelineRange) => void
}

export function TimelineToolbar({ query, scope, range, onQueryChange, onScopeChange, onRangeChange }: TimelineToolbarProps) {
  const rangeLabel = `${timelineDays[range.from]?.day ?? range.from} ${timelineDays[range.from]?.month?.slice(0, 3) ?? ''} – ${timelineDays[range.to]?.day ?? range.to} ${timelineDays[range.to]?.month?.slice(0, 3) ?? ''} 2026`
  const atStart = range.from <= 0
  const atEnd = range.to >= timelineDays.length - 1

  return (
    <header className="topbar">
      <div className="title-lockup">
        <span className="logo"><CalendarBlank weight="bold" /></span>
        <div>
          <h1>Fleet Timeline</h1>
          <p>Integrated offshore resource planning</p>
        </div>
        <span className="demo">Demo data</span>
      </div>

      <div className="filters">
        <label>
          <MagnifyingGlass aria-hidden="true" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search vessels, tasks, or locations..." aria-label="Search timeline" />
        </label>
        <select value={scope} onChange={(event) => onScopeChange(event.target.value)} aria-label="Resource group">
          {resourceGroupOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      <div className="date-nav" aria-label="Timeline range controls">
        <button type="button" aria-label="Previous range" disabled={atStart} onClick={() => onRangeChange(shiftTimelineRange(range, -1, timelineDays.length))}>
          <CaretLeft aria-hidden="true" />
        </button>
        <button type="button" className="today" onClick={() => onRangeChange({ from: 0, to: Math.min(14, timelineDays.length - 1) })}>Today</button>
        <button type="button" aria-label="Next range" disabled={atEnd} onClick={() => onRangeChange(shiftTimelineRange(range, 1, timelineDays.length))}>
          <CaretRight aria-hidden="true" />
        </button>
        <b aria-live="polite">{rangeLabel}</b>
        <button type="button" className="export" aria-label="Export timeline" disabled title="Export is unavailable in fixture mode">
          <DownloadSimple aria-hidden="true" /><span>Export</span>
        </button>
      </div>
    </header>
  )
}
