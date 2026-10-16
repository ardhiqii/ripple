import { useEffect, useMemo, useState } from 'react'

import { JobInspector, TimelineLegend, TimelineMetricStrip, TimelineToolbar, TimelineWorkspace } from '@/components/timeline'
import type { JobInspectorContext } from '@/components/timeline/JobInspector'
import { findJob, getVisibleJobs, getVisibleResources, vendorForTone } from '@/features/schedule/fixture-adapter'
import { calculateCapacityMetrics } from '@/features/schedule/capacity-metrics'
import type { HorizonPeriod, TimelineHorizon } from '@/features/schedule/timeline-horizon'
import type { TimelineRange, TimelineSchedule } from '@/features/schedule/types'
import type { TimelineSearch } from '@/routes/search-schemas'

export interface TimelineAppProps {
  search: TimelineSearch
  onSearchChange: (patch: Partial<TimelineSearch>) => void
  schedule: TimelineSchedule
  horizon?: TimelineHorizon
  selectedPeriod?: HorizonPeriod
  canvasRange?: TimelineRange
  scenarioStartDate?: string
  periodLabel?: string
  compactPeriodLabel?: string
  monthValue?: string
  monthMin?: string
  monthMax?: string
  todayLabel?: 'Today' | 'Scenario start'
  canPrevious?: boolean
  canNext?: boolean
  onHorizonChange?: (horizon: TimelineHorizon) => void
  onPeriodChange?: (period: TimelineRange) => void
  onToday?: () => void
  onAnchorDayChange?: (dayIndex: number) => void
  onOpenReadiness?: (context: JobInspectorContext) => void
  onViewDecision?: (context: JobInspectorContext) => void
}

export default function App({ search, onSearchChange, schedule, horizon, selectedPeriod, canvasRange, scenarioStartDate, periodLabel, compactPeriodLabel, monthValue, monthMin, monthMax, todayLabel, canPrevious, canNext, onHorizonChange, onPeriodChange, onToday, onAnchorDayChange, onOpenReadiness, onViewDecision }: TimelineAppProps) {
  const effectiveHorizon = horizon ?? '2w'
  const effectiveSelectedPeriod = useMemo<HorizonPeriod>(() => selectedPeriod ?? {
    horizon: effectiveHorizon,
    from: search.from,
    to: search.to,
    key: `${effectiveHorizon}:${search.from}:${search.to}`,
  }, [effectiveHorizon, search.from, search.to, selectedPeriod])
  const effectiveCanvasRange = canvasRange ?? effectiveSelectedPeriod
  const effectivePeriodLabel = periodLabel ?? `Selected period · D+${effectiveSelectedPeriod.from}–D+${effectiveSelectedPeriod.to}`
  const effectiveCompactPeriodLabel = compactPeriodLabel ?? `D+${effectiveSelectedPeriod.from}–D+${effectiveSelectedPeriod.to}`
  const effectiveMonthValue = monthValue ?? ''
  const effectiveMonthMin = monthMin ?? ''
  const effectiveMonthMax = monthMax ?? ''
  const effectiveTodayLabel = todayLabel ?? 'Today'
  const effectiveCanPrevious = canPrevious ?? true
  const effectiveCanNext = canNext ?? true
  const effectiveOnHorizonChange = onHorizonChange ?? (() => undefined)
  const effectiveOnPeriodChange = onPeriodChange ?? (() => undefined)
  const effectiveOnToday = onToday ?? (() => undefined)
  const effectiveOnAnchorDayChange = onAnchorDayChange ?? (() => undefined)
  const range: TimelineRange = effectiveSelectedPeriod
  const isFixtureSchedule = schedule.scenarioId === 'fixture'
  const [notice, setNotice] = useState<string>()
  const [queryDraft, setQueryDraft] = useState(search.q ?? '')
  const selected = findJob(schedule.resources, search.job)
  const selectedJobId = selected?.job.id
  const visibleResources = useMemo(() => getVisibleResources(schedule.resources, {
    groups: search.groups,
    vendors: isFixtureSchedule ? search.vendors : [],
    status: search.status,
    query: queryDraft,
    selectedJobId: selectedJobId,
  }), [queryDraft, isFixtureSchedule, schedule.resources, search.groups, search.status, search.vendors, selectedJobId])
  const metricResources = useMemo(() => search.groups.length ? schedule.resources.filter((resource) => search.groups.includes(resource.group)) : schedule.resources, [schedule.resources, search.groups])
  const metricScope = search.groups.length ? `Selected period; selected groups: ${search.groups.join(', ')}` : 'Selected period; all active resources'
  const metrics = useMemo(() => calculateCapacityMetrics(metricResources, schedule.capacity, effectiveSelectedPeriod, metricScope), [metricResources, metricScope, schedule.capacity, effectiveSelectedPeriod])
  const groups = useMemo(() => [...new Set(schedule.resources.map((resource) => resource.group))], [schedule.resources])
  const matchingJobCount = useMemo(() => {
    const normalizedQuery = queryDraft.trim().toLowerCase()
    return schedule.resources.reduce((total, resource) => {
      if (search.groups.length && !search.groups.includes(resource.group)) return total
      const jobs = getVisibleJobs(resource, { vendors: isFixtureSchedule ? search.vendors : [], status: search.status })
      if (!normalizedQuery) return total + jobs.length
      const resourceMatches = `${resource.name} ${resource.code} ${resource.location}`.toLowerCase().includes(normalizedQuery)
      return total + jobs.filter((job) => resourceMatches || `${job.id} ${job.label}`.toLowerCase().includes(normalizedQuery)).length
    }, 0)
  }, [isFixtureSchedule, queryDraft, schedule.resources, search.groups, search.status, search.vendors])
  const hasFilters = Boolean(queryDraft.trim() || search.groups.length || (isFixtureSchedule && search.vendors.length) || search.status)
  const selectedOutsideFilters = selected ? !matchesCurrentFilters(selected.resource, selected.job.id, queryDraft, search.groups, search.vendors, search.status, isFixtureSchedule) : false

  useEffect(() => setQueryDraft(search.q ?? ''), [search.q])

  useEffect(() => {
    if (queryDraft === (search.q ?? '')) return
    const timeout = window.setTimeout(() => onSearchChange({ q: queryDraft.trim() || undefined }), 220)
    return () => window.clearTimeout(timeout)
  }, [onSearchChange, queryDraft, search.q])

  useEffect(() => {
    if (!search.job) {
      setNotice(undefined)
      return
    }
    setNotice(selected ? undefined : `Job ${search.job} is not in the loaded period buffer. The selection is preserved.`)
  }, [search.job, selected])

  const updateScope = (scope: string) => onSearchChange({ groups: scope === 'All resources' ? [] : [scope] })

  return (
    <main className="app variant-4 unified">
      <TimelineToolbar
        query={queryDraft}
        scope={search.groups[0] ?? 'All resources'}
        groups={groups}
        status={search.status}
        horizon={effectiveHorizon}
        period={effectiveSelectedPeriod}
        scenarioStartDate={scenarioStartDate}
        periodLabel={effectivePeriodLabel}
        compactPeriodLabel={effectiveCompactPeriodLabel}
        monthValue={effectiveMonthValue}
        monthMin={effectiveMonthMin}
        monthMax={effectiveMonthMax}
        todayLabel={effectiveTodayLabel}
        canPrevious={effectiveCanPrevious}
        canNext={effectiveCanNext}
        onQueryChange={setQueryDraft}
        onScopeChange={updateScope}
        onStatusChange={(status) => onSearchChange({ status: status || undefined })}
        onHorizonChange={effectiveOnHorizonChange}
        onPeriodChange={effectiveOnPeriodChange}
        onToday={effectiveOnToday}
      />
      <TimelineMetricStrip metrics={metrics} />
      {notice && <div className="timeline-notice" role="status" aria-live="polite">{notice}</div>}
      {search.rangeIssue ? <div className="timeline-notice" role="alert">{search.rangeIssue === 'reversed' ? 'The requested Timeline range was reversed and has been reset to a valid period.' : 'The requested Timeline dates were malformed and have been reset to a valid period.'}</div> : null}
      {hasFilters ? <div className="timeline-notice" role="status" aria-live="polite"><span>{matchingJobCount} matching activit{matchingJobCount === 1 ? 'y' : 'ies'}</span> <button type="button" onClick={() => { setQueryDraft(''); onSearchChange({ q: undefined, groups: [], vendors: [], status: undefined }) }}>Clear filters</button></div> : null}
      {selectedOutsideFilters ? <div className="timeline-notice" role="status" aria-live="polite">Selected job is outside the current filters. <button type="button" onClick={() => { setQueryDraft(''); onSearchChange({ q: undefined, groups: [], vendors: [], status: undefined }) }}>Clear filters</button></div> : null}
      <div className="work-area">
        <TimelineWorkspace
          resources={visibleResources}
          days={schedule.days}
          canvasRange={effectiveCanvasRange}
          selectedPeriod={effectiveSelectedPeriod}
          dayWidth={48}
          onAnchorDayChange={effectiveOnAnchorDayChange}
          vendors={isFixtureSchedule ? search.vendors : []}
          status={search.status}
          query={queryDraft}
          capacityMetrics={metrics}
          selectedJobId={selectedJobId}
          onSelect={(jobId) => onSearchChange({ job: jobId })}
        />
      </div>
      {selected ? <JobInspector job={selected.job} resource={selected.resource} range={range} scheduleVersion={schedule.version} onClose={() => onSearchChange({ job: undefined })} onOpenReadiness={onOpenReadiness} onViewDecision={onViewDecision} /> : null}
      <TimelineLegend />
    </main>
  )
}

function matchesCurrentFilters(resource: { group: string; name: string; code: string; location: string; jobs: { id: string; label: string; tone: Parameters<typeof vendorForTone>[0]; status?: string }[] }, jobId: string, query: string, groups: string[], vendors: string[], status?: string, allowVendorFilter = false): boolean {
  const job = resource.jobs.find((candidate) => candidate.id === jobId)
  if (!job) return false
  const normalizedQuery = query.trim().toLowerCase()
  const textMatches = !normalizedQuery || `${resource.name} ${resource.code} ${resource.location} ${job.id} ${job.label}`.toLowerCase().includes(normalizedQuery)
  return (!groups.length || groups.includes(resource.group))
    && (!allowVendorFilter || !vendors.length || vendors.includes(vendorForTone(job.tone)))
    && (!status || (job.status ?? 'planned') === status)
    && textMatches
}
