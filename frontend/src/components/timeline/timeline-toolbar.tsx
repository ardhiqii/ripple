import { CalendarBlank, CaretLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'

import {
  getPeriodForMonthValue,
  shiftTimelinePeriod,
  type HorizonPeriod,
  type TimelineHorizon,
} from '@/features/schedule/timeline-horizon'
import type { TimelineRange } from '@/features/schedule/types'

import './timeline-navigation.css'

interface TimelineToolbarProps {
  query: string
  scope: string
  groups: string[]
  status?: string
  horizon: TimelineHorizon
  period: HorizonPeriod
  scenarioStartDate?: string
  periodLabel: string
  compactPeriodLabel: string
  monthValue: string
  monthMin: string
  monthMax: string
  todayLabel: 'Today' | 'Scenario start'
  canPrevious: boolean
  canNext: boolean
  onQueryChange: (query: string) => void
  onScopeChange: (scope: string) => void
  onStatusChange: (status: string) => void
  onHorizonChange: (horizon: TimelineHorizon) => void
  onPeriodChange: (range: TimelineRange) => void
  onToday: () => void
}

export function TimelineToolbar({ query, scope, groups, status, horizon, period, scenarioStartDate, periodLabel, compactPeriodLabel, monthValue, monthMin, monthMax, todayLabel, canPrevious, canNext, onQueryChange, onScopeChange, onStatusChange, onHorizonChange, onPeriodChange, onToday }: TimelineToolbarProps) {
  const previousLabel = horizon === '2w' ? 'Previous 2 weeks' : 'Previous month'
  const nextLabel = horizon === '2w' ? 'Next 2 weeks' : 'Next month'
  const start = scenarioStartDate ? new Date(`${scenarioStartDate}T00:00:00Z`) : undefined

  const setHorizon = (nextHorizon: TimelineHorizon) => {
    if (nextHorizon === horizon) return
    onHorizonChange(nextHorizon)
  }

  return (
    <header className="topbar timeline-navigation">
      <div className="title-lockup timeline-navigation__title">
        <span className="logo"><CalendarBlank weight="bold" /></span>
        <div>
          <h1>Fleet Timeline</h1>
          <p>Integrated offshore resource planning</p>
        </div>
        <span className="demo">Demo data</span>
      </div>

      <div className="timeline-navigation__filters" aria-label="Timeline filters">
        <label className="timeline-navigation__search">
          <MagnifyingGlass aria-hidden="true" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search vessels, tasks, or locations..." aria-label="Search timeline" />
        </label>
        <div className="timeline-navigation__filter-selects">
          <select value={scope} onChange={(event) => onScopeChange(event.target.value)} aria-label="Resource group">
            {['All resources', ...groups].map((option) => <option key={option}>{option}</option>)}
          </select>
          <select value={status ?? ''} onChange={(event) => onStatusChange(event.target.value)} aria-label="Activity status">
            <option value="">All status</option>
            <option value="planned">Planned</option>
            <option value="progress">In progress</option>
            <option value="complete">Complete</option>
            <option value="hold">On hold</option>
          </select>
        </div>
        <details className="timeline-navigation__filter-menu">
          <summary>Filters</summary>
          <div className="timeline-navigation__filter-popover">
            <label>Resource group<select value={scope} onChange={(event) => onScopeChange(event.target.value)} aria-label="Resource group filter">{['All resources', ...groups].map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>Status<select value={status ?? ''} onChange={(event) => onStatusChange(event.target.value)} aria-label="Status filter"><option value="">All status</option><option value="planned">Planned</option><option value="progress">In progress</option><option value="complete">Complete</option><option value="hold">On hold</option></select></label>
          </div>
        </details>
      </div>

      <div className="timeline-navigation__date-nav" aria-label="Timeline horizon and date controls">
        <div className="timeline-navigation__horizons" role="group" aria-label="Timeline horizon">
          <button type="button" className={horizon === '2w' ? 'is-active' : ''} aria-pressed={horizon === '2w'} onClick={() => setHorizon('2w')}>2 weeks</button>
          <button type="button" className={horizon === 'month' ? 'is-active' : ''} aria-pressed={horizon === 'month'} onClick={() => setHorizon('month')}>Month</button>
        </div>
        <button type="button" aria-label={previousLabel} title={previousLabel} disabled={!canPrevious} onClick={() => { const previous = shiftTimelinePeriod(period, horizon, -1, start); if (previous) onPeriodChange(previous) }}>
          <CaretLeft aria-hidden="true" />
        </button>
        <button type="button" className="timeline-navigation__today" onClick={onToday}>{todayLabel}</button>
        <button type="button" aria-label={nextLabel} title={nextLabel} disabled={!canNext} onClick={() => { const next = shiftTimelinePeriod(period, horizon, 1, start); if (next) onPeriodChange(next) }}>
          <CaretRight aria-hidden="true" />
        </button>
        <label className="timeline-navigation__month-picker" title="Jump to a calendar month">
          <span>{monthValue ? formatMonthValue(monthValue) : 'Choose month'}</span>
          <input type="month" value={monthValue} min={monthMin || undefined} max={monthMax || undefined} aria-label="Choose month and year" onChange={(event) => { const next = getPeriodForMonthValue(event.target.value, start); if (next) onPeriodChange(next) }} />
          <span className="sr-only">Months before the scenario start are unavailable. Future months remain navigable within the synthetic preview horizon.</span>
        </label>
        <span className="timeline-navigation__period-label" title={periodLabel} aria-live="polite">{compactPeriodLabel}</span>
      </div>
    </header>
  )
}

function formatMonthValue(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
