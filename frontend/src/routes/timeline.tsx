import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import App from '@/App'
import { useScenario } from '@/app/scenario-context'
import { useScenarioMetadata } from '@/app/scenario-metadata'
import type { JobInspectorContext } from '@/components/timeline/JobInspector'
import {
  containsRange,
  getPeriodForAnchor,
  getTimelineHorizonState,
  getTodayTarget,
  sameRange,
  type TimelineHorizon,
} from '@/features/schedule/timeline-horizon'
import { useSchedule } from '@/features/schedule/schedule-api'
import type { TimelineRange } from '@/features/schedule/types'
import { timelineSearchSchema } from './search-schemas'

export const Route = createFileRoute('/timeline')({
  validateSearch: timelineSearchSchema,
  component: TimelineRoute,
})

function TimelineRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { scenarioId } = useScenario()
  const metadata = useScenarioMetadata()
  const scenarioStartDate = metadata.data?.find((option) => option.id === scenarioId)?.scenarioStartDate
  const horizonState = useMemo(() => getTimelineHorizonState(search.horizon, search.from, search.to, scenarioStartDate), [scenarioStartDate, search.from, search.horizon, search.to])
  const bufferKey = `${scenarioId}:${horizonState.horizon}:${horizonState.selectedPeriod.key}`
  const [bufferState, setBufferState] = useState(() => ({ key: bufferKey, range: horizonState.canvasRange }))
  const canvasRange = bufferState.key === bufferKey && containsRange(bufferState.range, horizonState.selectedPeriod)
    ? bufferState.range
    : horizonState.canvasRange

  useEffect(() => {
    if (bufferState.key === bufferKey && containsRange(bufferState.range, horizonState.selectedPeriod)) return
    setBufferState({ key: bufferKey, range: horizonState.canvasRange })
  }, [bufferKey, bufferState, horizonState.canvasRange, horizonState.selectedPeriod])

  useEffect(() => {
    if (!scenarioStartDate) return
    if (search.horizon === horizonState.horizon && sameRange({ from: search.from, to: search.to }, horizonState.selectedPeriod)) return
    void navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        horizon: horizonState.horizon,
        from: horizonState.selectedPeriod.from,
        to: horizonState.selectedPeriod.to,
        rangeIssue: previous.rangeIssue,
      }),
    })
  }, [horizonState.horizon, horizonState.selectedPeriod, navigate, scenarioStartDate, search.from, search.horizon, search.rangeIssue, search.to])

  const scheduleQuery = useSchedule({
    fromDay: canvasRange.from,
    toDay: canvasRange.to,
    groups: search.job ? [] : search.groups,
    startDate: scenarioStartDate,
  })

  const effectiveSearch = useMemo(() => ({
    ...search,
    horizon: horizonState.horizon,
    from: horizonState.selectedPeriod.from,
    to: horizonState.selectedPeriod.to,
  }), [horizonState.horizon, horizonState.selectedPeriod, search])

  const updatePeriod = (period: TimelineRange, nextHorizon = horizonState.horizon) => {
    const next = getPeriodForAnchor(nextHorizon, period.from, parseScenarioStart(scenarioStartDate))
    void navigate({
      search: (previous) => ({
        ...previous,
        horizon: nextHorizon,
        from: next.from,
        to: next.to,
        rangeIssue: undefined,
      }),
    })
  }

  const handleHorizonChange = (nextHorizon: TimelineHorizon) => updatePeriod(horizonState.selectedPeriod, nextHorizon)
  const handleToday = () => {
    const today = getTodayTarget(horizonState.horizon, parseScenarioStart(scenarioStartDate))
    updatePeriod(today.period)
  }
  const handleAnchorDayChange = (dayIndex: number) => {
    const next = getPeriodForAnchor(horizonState.horizon, dayIndex, parseScenarioStart(scenarioStartDate))
    if (sameRange(next, horizonState.selectedPeriod)) return
    updatePeriod(next)
  }

  const openReadiness = (context: JobInspectorContext) => navigate({ to: '/readiness', search: { job: context.jobId } })
  const viewDecision = (context: JobInspectorContext) => {
    if (!context.decisionId) return
    return navigate({ to: '/decisions/$planId', params: { planId: context.decisionId }, search: {} })
  }

  if (scheduleQuery.isPending) return <TimelineState title="Loading schedule" description="Loading the active scenario schedule." />
  if (scheduleQuery.isError) return <TimelineState title="Schedule unavailable" description={scheduleQuery.error instanceof Error ? scheduleQuery.error.message : 'The schedule could not be loaded.'} onRetry={() => void scheduleQuery.refetch()} />
  if (!scheduleQuery.data.resources.length) return <TimelineState title="No resources in this view" description="The active scenario has no resources matching the current range or resource group." />

  return <App
    schedule={scheduleQuery.data}
    search={effectiveSearch}
    horizon={horizonState.horizon}
    selectedPeriod={horizonState.selectedPeriod}
    canvasRange={canvasRange}
    scenarioStartDate={scenarioStartDate}
    periodLabel={horizonState.periodLabel}
    compactPeriodLabel={horizonState.compactPeriodLabel}
    monthValue={horizonState.monthValue}
    monthMin={horizonState.monthMin}
    monthMax={horizonState.monthMax}
    todayLabel={horizonState.today.label}
    canPrevious={horizonState.canPrevious}
    canNext={horizonState.canNext}
    onHorizonChange={handleHorizonChange}
    onPeriodChange={updatePeriod}
    onToday={handleToday}
    onAnchorDayChange={handleAnchorDayChange}
    onSearchChange={(patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) })}
    onOpenReadiness={openReadiness}
    onViewDecision={viewDecision}
  />
}

function parseScenarioStart(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp)
}

function TimelineState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <main className="ds-page">
      <section className="ds-content ds-stack" aria-live="polite">
        <header className="ds-section-header">
          <div className="ds-stack">
            <span className="ds-label">Fleet Timeline</span>
            <h1 className="ds-heading ds-heading--page">{title}</h1>
            <p className="ds-copy">{description}</p>
          </div>
        </header>
        {onRetry ? <button type="button" className="w-fit rounded-xs border border-border px-3 py-2 text-sm font-bold text-ink hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus" onClick={onRetry}>Retry</button> : null}
      </section>
    </main>
  )
}
