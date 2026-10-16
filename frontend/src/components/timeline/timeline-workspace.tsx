import { Boat, CaretDown, Check, CloudRain, Factory, Prohibit, SquaresFour, UsersThree, Warning, Wrench, X } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { getVisibleJobs } from '@/features/schedule/fixture-adapter'
import type { CapacityMetrics } from '@/features/schedule/capacity-metrics'
import { BOOKING_LANE_HEIGHT, DAY_WIDTH, MARKER_BAND_HEIGHT, getJobGridPlacement, getVisibleDaySegments } from '@/features/schedule/timeline-layout'
import { getDistinctHiddenBookingIds, getTimelineOverflowLayout } from '@/features/schedule/timeline-overflow-layout'
import type { TimelineHiddenSegment } from '@/features/schedule/timeline-overflow-layout'
import type { TimelineDay, TimelineJob, TimelineRange, TimelineResource, TimelineUnavailability, TimelineWeather } from '@/features/schedule/types'
import { TimelineBlock } from './timeline-block'
import { WeatherDayMarker } from './timeline-weather-marker'
import './timeline-density.css'

interface TimelineWorkspaceSharedProps {
  resources: TimelineResource[]
  days: TimelineDay[]
  selectedJobId?: string
  vendors: string[]
  status?: string
  query?: string
  capacityMetrics?: CapacityMetrics
  onSelect: (jobId: string) => void
}

export interface TimelineWorkspaceProps extends TimelineWorkspaceSharedProps {
  canvasRange: TimelineRange
  selectedPeriod: TimelineRange
  dayWidth: number
  onAnchorDayChange: (absoluteDayIndex: number) => void
}

interface LegacyTimelineWorkspaceProps extends TimelineWorkspaceSharedProps {
  /** Compatibility overload until the route-owned FE-33 props are integrated. */
  range: TimelineRange
  canvasRange?: TimelineRange
  selectedPeriod?: TimelineRange
  dayWidth?: number
  onAnchorDayChange?: (absoluteDayIndex: number) => void
}

export function TimelineWorkspace(props: TimelineWorkspaceProps): ReactNode
export function TimelineWorkspace(props: LegacyTimelineWorkspaceProps): ReactNode
export function TimelineWorkspace({ resources, days, canvasRange, selectedPeriod, dayWidth, onAnchorDayChange, selectedJobId, vendors, status, query, capacityMetrics, onSelect, ...rest }: TimelineWorkspaceProps | LegacyTimelineWorkspaceProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef<PanState | null>(null)
  const suppressClickRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const legacyRange = 'range' in rest ? rest.range : undefined
  const resolvedCanvasRange = canvasRange ?? legacyRange ?? { from: 0, to: Math.max(0, days.length - 1) }
  const resolvedSelectedPeriod = selectedPeriod ?? resolvedCanvasRange
  const resolvedDayWidth = dayWidth ?? DAY_WIDTH
  const groups = [...new Set(resources.map((resource) => resource.group))]
  const dayColumns = `repeat(${days.length}, minmax(${resolvedDayWidth}px, 1fr))`
  const isSparse = resources.length <= 3 && groups.length <= 2
  const gridStyle = {
    gridTemplateColumns: `270px ${isSparse ? `${days.length * resolvedDayWidth}px` : `minmax(${days.length * resolvedDayWidth}px, 1fr)`}`,
    minWidth: `${270 + days.length * resolvedDayWidth}px`,
  }
  const todayIndex = days.findIndex((day) => day.today)

  const emitSettledAnchor = () => {
    const element = scrollRef.current
    if (!element || !onAnchorDayChange) return
    onAnchorDayChange(resolvedCanvasRange.from + Math.max(0, Math.round(element.scrollLeft / resolvedDayWidth)))
  }

  const scheduleSettledAnchor = () => {
    if (!onAnchorDayChange) return
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(emitSettledAnchor, 120)
  }

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const initialOffset = Math.max(0, resolvedSelectedPeriod.from - resolvedCanvasRange.from)
    element.scrollLeft = initialOffset * resolvedDayWidth
  }, [resolvedCanvasRange.from, resolvedSelectedPeriod.from, resolvedDayWidth])

  return (
    <section className={`timeline-shell timeline-density ${isSparse ? 'is-sparse' : 'is-dense'}`} aria-label="Fleet timeline workspace" data-resource-count={resources.length}>
      <style data-timeline-responsive>{responsiveTimelineStyles}</style>
      <div className="timeline-desktop" role="region" aria-label="Timeline Gantt chart">
        <div
          ref={scrollRef}
          className={`timeline-scroll ${isPanning ? 'is-panning' : ''}`}
          tabIndex={0}
          aria-label="Scrollable timeline canvas"
          onPointerDown={(event) => {
            if (!isTimelinePanSurface(event.target) || event.pointerType === 'touch' || event.button !== 0) return
            panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop, dragging: false }
          }}
          onPointerMove={(event) => {
            const state = panRef.current
            if (!state || state.pointerId !== event.pointerId) return
            const deltaX = event.clientX - state.startX
            const deltaY = event.clientY - state.startY
            if (!state.dragging) {
              if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 7) return
              if (Math.abs(deltaY) >= Math.abs(deltaX)) {
                panRef.current = null
                return
              }
              state.dragging = true
              suppressClickRef.current = true
              setIsPanning(true)
              event.currentTarget.setPointerCapture(event.pointerId)
            }
            event.preventDefault()
            event.currentTarget.scrollLeft = state.scrollLeft - deltaX
            event.currentTarget.scrollTop = state.scrollTop
          }}
          onPointerUp={(event) => {
            if (panRef.current?.pointerId === event.pointerId) panRef.current = null
            setIsPanning(false)
            scheduleSettledAnchor()
          }}
          onPointerCancel={() => {
            panRef.current = null
            setIsPanning(false)
            scheduleSettledAnchor()
          }}
          onScroll={scheduleSettledAnchor}
          onClickCapture={(event) => {
            if (!suppressClickRef.current) return
            suppressClickRef.current = false
            event.preventDefault()
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            event.currentTarget.scrollBy({ left: event.key === 'ArrowRight' ? resolvedDayWidth : -resolvedDayWidth, behavior: 'smooth' })
            scheduleSettledAnchor()
          }}
        >
          <div className={`timeline-grid ${isSparse ? 'is-sparse' : 'is-dense'}`} style={gridStyle}>
            <div className="resource-head"><span>Resource / capacity</span><small>{resources.length} visible</small></div>
            <CalendarHeader days={days} dayColumns={dayColumns} dayOffset={resolvedCanvasRange.from} selectedPeriod={resolvedSelectedPeriod} />
            {groups.flatMap((group) => {
              const groupResources = resources.filter((resource) => resource.group === group)
              const isCollapsed = collapsed.has(group)
              const toggle = () => setCollapsed((previous) => {
                const next = new Set(previous)
                if (next.has(group)) next.delete(group)
                else next.add(group)
                return next
              })
              return [
                <GroupRow key={`group-${group}`} name={group} resources={groupResources} metrics={capacityMetrics} collapsed={isCollapsed} onToggle={toggle} />,
                <div key={`track-${group}`} className="group-track" style={{ gridTemplateColumns: dayColumns }}>
                  <i style={{ width: `${groupUtilization(group, groupResources, capacityMetrics)}%` }} />
                  {todayIndex >= 0 && <span className="today-line" style={{ gridColumn: `${todayIndex + 1}` }} />}
                </div>,
                ...(isCollapsed ? [] : groupResources.map((resource) => (
                   <ResourceRow key={resource.id} resource={resource} dayColumns={dayColumns} days={days} range={resolvedCanvasRange} selectedPeriod={resolvedSelectedPeriod} vendors={vendors} status={status} query={query} capacityMetrics={capacityMetrics} todayIndex={todayIndex} selectedJobId={selectedJobId} onSelect={onSelect} />
                ))),
              ]
            })}
          </div>
        </div>
      </div>
      <TimelineAgenda resources={resources} days={days} range={resolvedCanvasRange} vendors={vendors} status={status} query={query} selectedJobId={selectedJobId} onSelect={onSelect} />
    </section>
  )
}

function TimelineAgenda({ resources, days, range, vendors, status, query, selectedJobId, onSelect }: { resources: TimelineResource[]; days: TimelineDay[]; range: TimelineRange; vendors: string[]; status?: string; query?: string; selectedJobId?: string; onSelect: (jobId: string) => void }) {
  const items: AgendaItem[] = [
    ...days.flatMap((day, index) => (day.weather ?? []).map((observation) => ({ type: 'weather' as const, observation, start: range.from + index, dateRange: formatAgendaDate(day, day) }))),
    ...resources.flatMap((resource) => [
    ...getVisibleJobs(resource, { vendors, status, selectedJobId }).filter((job) => matchesAgendaQuery(resource, job, query)).flatMap((job) => {
      const placement = getJobGridPlacement(job, range)
      if (!placement) return []

      const startDay = days[placement.start - 1]
      const endDay = days[placement.start + placement.span - 2]
      if (!startDay || !endDay) return []

      return [{ type: 'job' as const, job, resource, start: job.start, dateRange: formatAgendaDate(startDay, endDay) }]
    }),
    ...(resource.unavailability ?? []).filter((_interval) => !query || matchesAgendaResource(resource, query)).flatMap((interval) => {
      const placement = getJobGridPlacement(interval, range)
      if (!placement) return []

      const startDay = days[placement.start - 1]
      const endDay = days[placement.start + placement.span - 2]
      if (!startDay || !endDay) return []

      return [{ type: 'unavailability' as const, interval, resource, start: interval.start, dateRange: formatAgendaDate(startDay, endDay) }]
    }),
    ]),
  ].sort((left, right) => left.start - right.start || (left.type === 'weather' ? left.observation.location : left.type === 'job' || left.type === 'unavailability' ? left.resource.name : '').localeCompare(right.type === 'weather' ? right.observation.location : right.type === 'job' || right.type === 'unavailability' ? right.resource.name : ''))

  return (
    <div className="timeline-agenda" role="region" aria-label="Timeline agenda">
      <div className="timeline-agenda-header">
        <div>
          <h2>Agenda view</h2>
          <p>Jobs and resource unavailability are listed by start date.</p>
        </div>
        <span>{items.length} entries</span>
      </div>
      {items.length ? (
        <ol className="timeline-agenda-list">
          {items.map((item) => item.type === 'job' ? (
            <AgendaJobItem key={`${item.resource.id}-${item.job.bookingId ?? item.job.id}`} item={item} selectedJobId={selectedJobId} onSelect={onSelect} />
          ) : item.type === 'unavailability' ? (
            <li key={`${item.resource.id}-${item.interval.id}`}>
              <div className={`timeline-agenda-unavailability ${item.interval.kind}`} role="status" aria-label={`${readableUnavailabilityKind(item.interval.kind)}, ${item.interval.reason}; ${item.dateRange}; ${item.resource.name}`}>
                <span className="timeline-agenda-item-heading"><b>{readableUnavailabilityKind(item.interval.kind)}</b><em>Unavailable</em></span>
                <strong>{item.interval.reason}</strong>
                <span className="timeline-agenda-meta">{item.dateRange} · {item.resource.name} ({item.resource.code})</span>
                <span className="timeline-agenda-context">{item.resource.group}</span>
              </div>
            </li>
          ) : (
            <li key={`weather-${item.observation.location}-${item.observation.day}`}>
              <div className="timeline-agenda-weather" role="status" aria-label={`Weather context, ${item.observation.location}, ${item.dateRange}, ${weatherLabel(item.observation)}, source ${item.observation.source}`}>
                <span className="timeline-agenda-item-heading"><b><CloudRain aria-hidden="true" /> Weather context</b><em>{item.observation.go === false ? 'No-go' : 'Observation'}</em></span>
                <strong>{item.observation.location}</strong>
                <span className="timeline-agenda-meta">{item.dateRange} · {weatherLabel(item.observation)}</span>
                <span className="timeline-agenda-context">Source: {item.observation.source}; context only, not resource unavailability.</span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="timeline-agenda-empty" role="status">No activities or unavailable intervals in this view.</p>
      )}
    </div>
  )
}

type AgendaJob = { type: 'job'; job: TimelineJob; resource: TimelineResource; start: number; dateRange: string }
type AgendaUnavailability = { type: 'unavailability'; interval: TimelineUnavailability; resource: TimelineResource; start: number; dateRange: string }
type AgendaWeather = { type: 'weather'; observation: TimelineWeather; start: number; dateRange: string }
type AgendaItem = AgendaJob | AgendaUnavailability | AgendaWeather

function AgendaJobItem({ item, selectedJobId, onSelect }: { item: AgendaJob; selectedJobId?: string; onSelect: (jobId: string) => void }) {
  const { job, resource, dateRange } = item
  const statusLabel = readableStatus(job.status)
  const accessibleName = `${job.id}, ${job.label}; ${dateRange}; ${resource.name}; status: ${statusLabel}${job.risk ? '; at risk' : ''}`

  return (
    <li>
      <button
        type="button"
        className={`timeline-agenda-item ${job.risk ? 'is-risky' : ''}`}
        aria-label={accessibleName}
        aria-pressed={selectedJobId === job.id}
        onClick={() => onSelect(job.id)}
      >
        <span className="timeline-agenda-item-heading"><b>{job.id}</b><em>{statusLabel}</em></span>
        <strong>{job.label}</strong>
        <span className="timeline-agenda-meta">{dateRange} · {resource.name} ({resource.code})</span>
        <span className="timeline-agenda-context">{resource.group}{job.conflict ? ' · Capacity conflict' : job.risk ? ' · At risk' : ''}</span>
      </button>
    </li>
  )
}

function formatAgendaDate(startDay: TimelineDay, endDay: TimelineDay) {
  if (!startDay.month || !endDay.month) return startDay.day === endDay.day ? startDay.day : `${startDay.day}–${endDay.day}`
  const sameMonth = startDay.month === endDay.month && startDay.year === endDay.year
  const startYear = startDay.year ? ` ${startDay.year}` : ''
  const endYear = endDay.year ? ` ${endDay.year}` : ''
  if (sameMonth) return startDay.day === endDay.day ? `${startDay.day} ${startDay.month}${startYear}` : `${startDay.day}–${endDay.day} ${startDay.month}${startYear}`
  return `${startDay.day} ${startDay.month}${startYear} – ${endDay.day} ${endDay.month}${endYear}`
}

function readableStatus(status: TimelineJob['status']) {
  if (status === 'progress') return 'In progress'
  if (status === 'complete') return 'Complete'
  if (status === 'hold') return 'Weather hold'
  return 'Planned'
}

function readableUnavailabilityKind(kind: TimelineUnavailability['kind']) {
  if (kind === 'maintenance') return 'Maintenance'
  return 'Unavailable'
}

function intervalsOverlap(left: { start: number; span: number }, right: { start: number; span: number }) {
  return left.start < right.start + right.span && right.start < left.start + left.span
}

type PanState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
  dragging: boolean
}

type TimelineScrollAnchor = {
  element: HTMLElement
  scrollTop: number
  rowTop: number
  rowHeight: number
  viewportTop: number
}

function isTimelinePanSurface(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('button, a, input, select, textarea, [contenteditable="true"], .empty')) return false
  return Boolean(target.closest('.track, .calendar-head, .days, .months, .group-track'))
}

function CalendarHeader({ days, dayColumns, dayOffset, selectedPeriod }: { days: TimelineDay[]; dayColumns: string; dayOffset: number; selectedPeriod: TimelineRange }) {
  const monthSegments = days.reduce<Array<{ month: TimelineDay['month']; year?: number; count: number }>>((segments, day) => {
    const last = segments.at(-1)
    if (last?.month === day.month && last.year === day.year) last.count += 1
    else segments.push({ month: day.month, year: day.year, count: 1 })
    return segments
  }, [])

  return (
    <div className="calendar-head">
      <div className="months" style={{ gridTemplateColumns: monthSegments.map((segment) => `${segment.count}fr`).join(' ') }}>
        {monthSegments.map((segment, index) => <b key={`${segment.month}-${segment.year ?? 'scenario'}-${index}`}>{segment.month ? `${segment.month}${segment.year ? ` ${segment.year}` : ''}` : 'Scenario days'}</b>)}
      </div>
      <div className="days" style={{ gridTemplateColumns: dayColumns }}>
        {days.map((day, index) => {
          const absoluteDay = dayOffset + index
          const classes = [
            day.monthStart ? 'month-start' : '',
            day.today ? 'today-date' : '',
            absoluteDay >= selectedPeriod.from && absoluteDay <= selectedPeriod.to ? 'selected-period' : '',
            day.weekday === 'Sat' || day.weekday === 'Sun' ? 'weekend' : '',
          ].filter(Boolean).join(' ')
          const noGo = day.weather?.some((observation) => observation.go === false) ?? false
          const dateLabel = `${day.day}${day.month ? ` ${day.month}` : ''}${day.year ? ` ${day.year}` : ''}`
          return <span className={classes} key={`${day.month}-${day.day}-${index}`} title={noGo ? undefined : `D+${absoluteDay}: ${dateLabel}`}>
            <b>{day.day}</b>
            <small>{day.weekday}</small>
            {noGo ? <WeatherDayMarker observations={day.weather ?? []} dateLabel={dateLabel} /> : null}
          </span>
        })}
      </div>
    </div>
  )
}

function weatherLabel(observation: TimelineWeather) {
  const value = observation.value === undefined ? '' : ` ${observation.value}`
  return `${observation.metric}${value} · ${observation.go === false ? 'No-go' : observation.go === true ? 'Go' : 'Observation'}`
}

function GroupRow({ name, resources, metrics, collapsed, onToggle }: { name: string; resources: TimelineResource[]; metrics?: CapacityMetrics; collapsed: boolean; onToggle: () => void }) {
  const utilization = groupUtilization(name, resources, metrics)
  return (
    <button type="button" className={`group-label ${collapsed ? 'collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
      <CaretDown aria-hidden="true" />
      <GroupIcon group={name} />
      <b>{name.toUpperCase()}</b>
      <span>{resources.length}</span>
      <i className="group-meter"><u style={{ width: `${utilization}%` }} /></i>
      <em>{metrics?.groups.find((metric) => metric.label === name)?.display ?? `${utilization}%`}</em>
    </button>
  )
}

function GroupIcon({ group }: { group: string }) {
  if (group === 'Barges') return <Boat weight="fill" aria-hidden="true" />
  if (group === 'Supply boats') return <SquaresFour weight="fill" aria-hidden="true" />
  if (group === 'Test bays') return <Wrench weight="fill" aria-hidden="true" />
  return <UsersThree weight="fill" aria-hidden="true" />
}

function ResourceRow({ resource, dayColumns, days, range, selectedPeriod, vendors, status, query, capacityMetrics, todayIndex, selectedJobId, onSelect }: { resource: TimelineResource; dayColumns: string; days: TimelineDay[]; range: TimelineRange; selectedPeriod: TimelineRange; vendors: string[]; status?: string; query?: string; capacityMetrics?: CapacityMetrics; todayIndex: number; selectedJobId?: string; onSelect: (jobId: string) => void }) {
  const jobs = getVisibleJobs(resource, { vendors, status, selectedJobId })
  const unavailability = (resource.unavailability ?? []).filter((interval) => Boolean(getJobGridPlacement(interval, range)))
  const [expanded, setExpanded] = useState(false)
  const resourceCellRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<TimelineScrollAnchor | null>(null)
  const bookingLayout = getTimelineOverflowLayout(jobs, range, selectedJobId, expanded)
  const hiddenBookingIds = getDistinctHiddenBookingIds(bookingLayout.hiddenDays, selectedPeriod)
  const hiddenBookingCount = hiddenBookingIds.length
  const selectedPeriodLabel = formatAbsoluteDateRange(selectedPeriod.from, selectedPeriod.to - selectedPeriod.from + 1, days, range)
  const bookingRowCount = bookingLayout.bookingLaneCount
  // Issue identity must survive visual filters so a filtered booking cannot make
  // a resource-day issue disappear or lose its linked-job action.
  const issues = buildTimelineIssues(resource.jobs, unavailability, range)
  const issueClusters = clusterTimelineIssues(issues, range)
  const totalTrackRows = bookingRowCount + 2
  const issueCells = issueClusters.flatMap((cluster, clusterIndex) => {
    const kind = cluster.issues.some((issue) => issue.kind === 'unavailable')
      ? 'unavailable'
      : cluster.issues.some((issue) => issue.kind === 'conflict') ? 'conflict' : 'maintenance'
    return Array.from({ length: cluster.span }, (_, offset) => ({
      absoluteDay: cluster.start + offset,
      severity: clusterSeverity(cluster),
      kind,
      startsRun: offset === 0,
      // At a touching boundary the next run owns the single separator.
      endsRun: offset === cluster.span - 1 && issueClusters[clusterIndex + 1]?.start !== cluster.start + cluster.span,
    }))
  })
  const hasHiddenBookingRuns = bookingLayout.hiddenSegments.length > 0
  const overflowBandHeight = hasHiddenBookingRuns ? 18 : 6
  const rowHeight = bookingRowCount * BOOKING_LANE_HEIGHT + MARKER_BAND_HEIGHT + overflowBandHeight
  const gridRows = [
    `${MARKER_BAND_HEIGHT}px`,
    ...Array.from({ length: bookingRowCount }, () => `${BOOKING_LANE_HEIGHT}px`),
    `${overflowBandHeight}px`,
  ].join(' ')
  const resourceMetric = capacityMetrics?.resources.find((entry) => entry.resourceId === resource.id)?.metric
  const resourceDisplay = resource.active === false ? '—' : resourceMetric?.display ?? `${resource.utilization}%`
  const resourceBar = resource.active === false ? 0 : resourceMetric?.barPercent ?? resource.utilization
  const showOverflowControl = expanded || hiddenBookingCount > 0
  const overflowControlLabel = expanded
    ? `Show fewer bookings for ${resource.name}, selected period ${selectedPeriodLabel}`
    : `Show ${hiddenBookingCount} hidden bookings for ${resource.name}, selected period ${selectedPeriodLabel}`

  const toggleExpanded = useCallback(() => {
    const resourceCell = resourceCellRef.current
    const scrollElement = resourceCell?.closest<HTMLElement>('.timeline-scroll')
    if (resourceCell && scrollElement) {
      const rowRect = resourceCell.getBoundingClientRect()
      const scrollRect = scrollElement.getBoundingClientRect()
      scrollAnchorRef.current = {
        element: scrollElement,
        scrollTop: scrollElement.scrollTop,
        rowTop: rowRect.top,
        rowHeight: rowRect.height,
        viewportTop: scrollRect.top,
      }
    } else {
      scrollAnchorRef.current = null
    }
    setExpanded((value) => !value)
  }, [])

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current
    scrollAnchorRef.current = null
    if (!anchor || !anchor.element.isConnected || !resourceCellRef.current) return

    const rowWasAboveViewport = anchor.rowTop + anchor.rowHeight <= anchor.viewportTop + 1
    if (!rowWasAboveViewport) return

    const nextRowHeight = resourceCellRef.current.getBoundingClientRect().height
    const heightDelta = nextRowHeight - anchor.rowHeight
    if (Math.abs(heightDelta) < 0.5) return
    anchor.element.scrollTop = anchor.scrollTop + heightDelta
  }, [expanded])

  return (
    <>
      <div ref={resourceCellRef} className={`resource-cell ${resource.active === false ? 'is-unavailable' : ''}`} style={{ height: `${rowHeight}px`, minHeight: `${rowHeight}px` }}>
        <span className="resource-icon"><ResourceIcon kind={resource.kind} /></span>
        <div>
          <b>{resource.name}</b>
          <small>{resource.code} <i /> {resource.location}</small>
          {resource.active === false ? <em className="resource-unavailable">Unavailable</em> : null}
          {showOverflowControl ? (
            <button type="button" className="timeline-more timeline-rail-more" aria-label={overflowControlLabel} aria-expanded={expanded} onClick={toggleExpanded}>
              {expanded ? <><Check aria-hidden="true" /> Show fewer</> : `+${hiddenBookingCount} hidden bookings`}
            </button>
          ) : null}
        </div>
        <div className="util"><span>{resourceDisplay}</span><i><em style={{ width: `${resourceBar}%` }} /></i></div>
      </div>
      <div className="track" style={{ gridTemplateColumns: dayColumns, gridTemplateRows: gridRows, minHeight: `${rowHeight}px`, height: `${rowHeight}px` }}>
        {days.map((day, index) => {
          const classes = [
            day.monthStart ? 'month-start' : '',
            day.weekday === 'Sat' || day.weekday === 'Sun' ? 'weekend' : '',
          ].filter(Boolean).join(' ')
          return <i className={classes} style={{ gridColumn: index + 1, gridRow: `1 / span ${totalTrackRows}` }} key={`${resource.id}-${day.month}-${day.day}-${index}`} />
        })}
        {issueCells.map((cell) => (
          <span
            key={`${resource.id}-issue-cell-${cell.absoluteDay}`}
            className={`timeline-issue-cell ${cell.severity} is-${cell.kind}${cell.startsRun ? ' is-run-start' : ''}${cell.endsRun ? ' is-run-end' : ''}`}
            style={{ gridColumn: cell.absoluteDay - range.from + 1, gridRow: `1 / span ${totalTrackRows}` }}
            aria-hidden="true"
          />
        ))}
        {todayIndex >= 0 && <span className="today-line" style={{ gridColumn: `${todayIndex + 1}`, gridRow: `1 / span ${totalTrackRows}` }} />}
        {jobs.length === 0 && unavailability.length === 0 && <span className="empty">No activities in this view</span>}
        {bookingLayout.fragments.map((fragment) => (
          <div className={`booking-lane is-whole ${fragment.continuesBefore ? 'continues-before' : ''} ${fragment.continuesAfter ? 'continues-after' : ''}`} key={`${fragment.job.id}-${fragment.bookingId}-${fragment.start}-${fragment.lane}`} style={{ gridColumn: `${fragment.start - range.from + 1} / span ${fragment.span}`, gridRow: fragment.lane + 2 }}>
            <TimelineBlock job={fragment.job} resourceName={resource.name} range={range} selected={selectedJobId === fragment.job.id} dimmed={Boolean(query && !matchesQuery(fragment.job, query))} onSelect={onSelect} />
          </div>
        ))}
        <div className="timeline-marker-band" style={{ gridColumn: '1 / -1', gridRow: 1, gridTemplateColumns: dayColumns }} aria-label={issueClusters.length ? 'Resource issue markers' : undefined}>
          {issueClusters.map((cluster) => <TimelineIssueMarker key={`${resource.id}-${cluster.start}-${cluster.span}`} cluster={cluster} resourceName={resource.name} resourceLocation={resource.location} days={days} range={range} onSelect={onSelect} />)}
        </div>
        {hasHiddenBookingRuns ? <div className="timeline-booking-overflow-layer" style={{ gridColumn: '1 / -1', gridRow: bookingRowCount + 2, gridTemplateColumns: dayColumns }} aria-label="Additional bookings">
          {bookingLayout.hiddenSegments.map((segment) => (
            <OverflowRunButton
              key={`${resource.id}-hidden-${segment.start}-${segment.span}`}
              segment={segment}
              jobs={jobs}
              resourceName={resource.name}
              days={days}
              range={range}
              onExpand={toggleExpanded}
            />
          ))}
        </div> : null}
      </div>
    </>
  )
}

function OverflowRunButton({ segment, jobs, resourceName, days, range, onExpand }: {
  segment: TimelineHiddenSegment
  jobs: TimelineJob[]
  resourceName: string
  days: TimelineDay[]
  range: TimelineRange
  onExpand: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const previewId = useId()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPosition, setPreviewPosition] = useState<{ top: number; left: number }>()
  const dateRange = formatAbsoluteDateRange(segment.start, segment.span, days, range)
  const hiddenJobs = segment.bookingIds.map((bookingId) => jobs.find((job) => (job.bookingId ?? job.id) === bookingId)).filter((job): job is TimelineJob => Boolean(job))
  const count = segment.bookingIds.length
  const label = `${count} additional booking${count === 1 ? '' : 's'} for ${resourceName}, ${dateRange}. Open resource row.`

  const positionPreview = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(300, window.innerWidth - 16)
    const estimatedHeight = 76 + Math.min(hiddenJobs.length, 4) * 25
    const top = rect.top - estimatedHeight - 8 >= 8 ? rect.top - estimatedHeight - 8 : Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 8)
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
    setPreviewPosition({ top: Math.max(8, top), left })
  }, [hiddenJobs.length])

  useEffect(() => {
    if (!previewOpen) return
    const update = () => positionPreview()
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [positionPreview, previewOpen])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="timeline-hidden-booking-run"
        style={{ gridColumn: `${segment.start - range.from + 1} / span ${segment.span}` }}
        aria-label={label}
        aria-describedby={previewOpen && previewPosition ? previewId : undefined}
        onMouseEnter={() => setPreviewOpen(true)}
        onMouseLeave={() => setPreviewOpen(false)}
        onFocus={() => setPreviewOpen(true)}
        onBlur={() => setPreviewOpen(false)}
        onClick={(event) => { event.stopPropagation(); setPreviewOpen(false); onExpand() }}
      >
        <span aria-hidden="true">{segment.span > 1 ? `+${count} bookings` : `+${count}`}</span>
      </button>
      {previewOpen && previewPosition && createPortal(
        <div id={previewId} className="timeline-overflow-preview" role="tooltip" style={{ top: previewPosition.top, left: previewPosition.left }}>
          <b>Additional bookings · {dateRange}</b>
          <small>{resourceName} · {count} distinct booking{count === 1 ? '' : 's'} in this range</small>
          {hiddenJobs.slice(0, 4).map((job) => <span key={job.bookingId ?? job.id}><strong>{job.id}</strong><em>{formatAbsoluteDateRange(job.start, job.span, days, range)}</em></span>)}
          {hiddenJobs.length > 4 ? <small>+{hiddenJobs.length - 4} more; open row for all</small> : <small>Open row for all bookings</small>}
        </div>,
        document.body,
      )}
    </>
  )
}

type TimelineIssueKind = TimelineUnavailability['kind'] | 'conflict'
type TimelineIssue = { id: string; start: number; span: number; detailStart?: number; detailSpan?: number; kind: TimelineIssueKind; reason: string; impact: string; jobIds?: string[] }
type TimelineIssueCluster = { start: number; span: number; issues: TimelineIssue[] }

function buildTimelineIssues(jobs: TimelineJob[], unavailability: TimelineUnavailability[], range: TimelineRange): TimelineIssue[] {
  const explicitIssues = unavailability.map((interval) => {
    const linkedJobIds = [...new Set(jobs.filter((job) => intervalsOverlap(job, interval)).map((job) => job.id))]
    return {
      id: `exception-${interval.id}`,
      start: interval.start,
      span: interval.span,
      kind: interval.kind,
      reason: interval.reason,
      impact: linkedJobIds.length ? 'Intersects a scheduled booking; review the linked job before acting.' : 'Explicit resource interval; capacity impact comes from the backend schedule contract.',
      jobIds: linkedJobIds,
    }
  })
  const conflictIssues = jobs.flatMap((job) => getVisibleDaySegments(job.conflictDays ?? [], range).map((segment) => ({
    id: `conflict-${job.bookingId ?? job.id}-${getFullConflictSegmentStart(job.conflictDays ?? [], segment.start)}`,
    start: segment.start,
    span: segment.span,
    detailStart: getFullConflictSegmentStart(job.conflictDays ?? [], segment.start),
    detailSpan: getFullConflictSegmentSpan(job.conflictDays ?? [], segment.start),
    kind: 'conflict' as const,
    reason: `Capacity overflow recorded for ${job.id}.`,
    impact: 'Only these overflow dates are marked; capacity-valid parallel bookings remain unflagged.',
    jobIds: [job.id],
  })))
  const deduped = new Map<string, TimelineIssue>()
  for (const issue of [...explicitIssues, ...conflictIssues]) {
    const current = deduped.get(issue.id)
    if (!current) {
      deduped.set(issue.id, issue)
      continue
    }
    current.jobIds = [...new Set([...(current.jobIds ?? []), ...(issue.jobIds ?? [])])]
  }
  return [...deduped.values()]
}

function clusterTimelineIssues(issues: TimelineIssue[], range: TimelineRange): TimelineIssueCluster[] {
  const byDay = new Map<number, TimelineIssue[]>()
  for (let day = range.from; day <= range.to; day += 1) {
    const active = issues.filter((issue) => issue.start <= day && issue.start + issue.span > day)
    if (active.length) byDay.set(day, active)
  }
  const clusters: TimelineIssueCluster[] = []
  let previousSignature = ''
  let current: TimelineIssueCluster | undefined
  for (const [day, active] of byDay) {
    const signature = active.map((issue) => issue.id).sort().join('|')
    if (current && day === current.start + current.span && signature === previousSignature) current.span += 1
    else {
      current = { start: day, span: 1, issues: active }
      clusters.push(current)
    }
    previousSignature = signature
  }
  return clusters
}

function TimelineIssueMarker({ cluster, resourceName, resourceLocation, days, range, onSelect }: { cluster: TimelineIssueCluster; resourceName: string; resourceLocation: string; days: TimelineDay[]; range: TimelineRange; onSelect: (jobId: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const suppressNextFocusPreviewRef = useRef(false)
  const detailAutoFocusedRef = useRef(false)
  const previewId = useId()
  const [open, setOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPosition, setPreviewPosition] = useState<{ top: number; left: number }>()
  const [detailPosition, setDetailPosition] = useState<{ top: number; left: number }>()
  const dateRange = formatAbsoluteDateRange(cluster.start, cluster.span, days, range)
  const issueCount = cluster.issues.length
  const summary = `${issueCount} issue${issueCount === 1 ? '' : 's'}`
  const kinds = [...new Set(cluster.issues.map((issue) => readableIssueKind(issue.kind)))].join(' and ')
  const label = `${summary} (${kinds}) on ${resourceName}, ${dateRange}. Open details.`

  const stopPreviewTimer = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = undefined
  }, [])

  const hidePreview = useCallback(() => {
    stopPreviewTimer()
    setPreviewOpen(false)
    setPreviewPosition(undefined)
  }, [stopPreviewTimer])

  const scheduleHidePreview = useCallback(() => {
    stopPreviewTimer()
    previewTimerRef.current = setTimeout(() => {
      setPreviewOpen(false)
      setPreviewPosition(undefined)
    }, 180)
  }, [stopPreviewTimer])

  const schedulePreview = useCallback((delay: number) => {
    if (open) return
    stopPreviewTimer()
    previewTimerRef.current = setTimeout(() => setPreviewOpen(true), delay)
  }, [open, stopPreviewTimer])

  useEffect(() => () => stopPreviewTimer(), [stopPreviewTimer])

  const updatePreviewPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(320, Math.max(220, window.innerWidth - 16))
    const height = previewRef.current?.offsetHeight ?? 190
    const top = rect.top - height - 8 >= 8 ? rect.top - height - 8 : Math.min(Math.max(8, window.innerHeight - height - 8), rect.bottom + 8)
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
    setPreviewPosition((current) => current?.top === top && current.left === left ? current : { top, left })
  }, [])

  useEffect(() => {
    if (!previewOpen || open) return
    const update = () => updatePreviewPosition()
    update()
    const frame = requestAnimationFrame(update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, previewOpen, updatePreviewPosition])

  const closeDetail = useCallback(() => {
    setOpen(false)
    setDetailPosition(undefined)
    hidePreview()
    suppressNextFocusPreviewRef.current = true
    requestAnimationFrame(() => buttonRef.current?.focus())
  }, [hidePreview])

  const updateDetailPosition = useCallback(() => {
    const trigger = buttonRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(320, Math.max(220, window.innerWidth - 16))
    const height = detailRef.current?.offsetHeight ?? 220
    const top = rect.bottom + 8 + height <= window.innerHeight - 8
      ? rect.bottom + 8
      : Math.max(8, rect.top - height - 8)
    const left = Math.min(Math.max(8, rect.left - 12), Math.max(8, window.innerWidth - width - 8))
    setDetailPosition((current) => current?.top === top && current.left === left ? current : { top, left })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeDetail()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (markerRef.current?.contains(target) || detailRef.current?.contains(target))) return
      closeDetail()
    }
    const update = () => updateDetailPosition()
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    update()
    const frame = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [closeDetail, open, updateDetailPosition])

  useLayoutEffect(() => {
    if (open && detailPosition) updateDetailPosition()
  }, [detailPosition, open, updateDetailPosition])

  useEffect(() => {
    if (!open) {
      detailAutoFocusedRef.current = false
      return
    }
    if (detailPosition && !detailAutoFocusedRef.current) {
      detailRef.current?.querySelector<HTMLButtonElement>('.timeline-marker-detail-close')?.focus()
      detailAutoFocusedRef.current = true
    }
  }, [detailPosition, open])

  return (
    <>
      <span ref={markerRef} className={`timeline-marker-cluster ${open ? 'is-open' : ''}`} style={{ gridColumn: `${cluster.start - range.from + 1} / span ${cluster.span}`, gridRow: 1 }}>
        <button ref={buttonRef} type="button" className={`timeline-marker-trigger ${cluster.issues.length > 1 ? 'is-cluster' : cluster.issues[0].kind} ${clusterSeverity(cluster)}`} aria-label={label} aria-describedby={previewOpen && !open && previewPosition ? previewId : undefined} aria-expanded={open} aria-haspopup="dialog" onMouseEnter={() => schedulePreview(150)} onMouseLeave={scheduleHidePreview} onFocus={() => { if (suppressNextFocusPreviewRef.current) { suppressNextFocusPreviewRef.current = false; return } schedulePreview(150) }} onBlur={scheduleHidePreview} onClick={(event) => { event.stopPropagation(); hidePreview(); setOpen((value) => !value) }}>
          {cluster.issues.length > 1 ? <b aria-hidden="true">{cluster.issues.length}</b> : <IssueIcon kind={cluster.issues[0].kind} />}
        </button>
      </span>
      {previewOpen && !open && previewPosition ? createPortal(
        <div ref={previewRef} id={previewId} className="timeline-issue-preview" role="tooltip" style={{ top: previewPosition.top, left: previewPosition.left }}>
          <strong>{summary} · {resourceName}</strong>
          <span>{dateRange} · {resourceLocation}</span>
          <div className="timeline-issue-preview-list">
            {cluster.issues.slice(0, 4).map((issue) => (
              <div key={issue.id} className={`timeline-issue-preview-item is-${issue.kind}`}>
                <div className="timeline-issue-preview-item-heading">
                  <b>{readableIssueKind(issue.kind)}</b>
                  <span>{formatAbsoluteDateRange(issue.detailStart ?? issue.start, issue.detailSpan ?? issue.span, days, range)}</span>
                </div>
                <span>{issue.reason}</span>
                <small>{issue.impact}</small>
              </div>
            ))}
          </div>
          <small>{cluster.issues.length > 4 ? `+${cluster.issues.length - 4} more in details. ` : ''}Open details for linked jobs.</small>
        </div>,
        document.body,
      ) : null}
      {renderDetail()}
    </>
  )

  // The detail is portalled so it is not clipped by the horizontally scrolling
  // timeline or hidden below the sticky header/legend.
  function renderDetail() {
    if (!open || !detailPosition) return null
    return createPortal(
      <div ref={detailRef} className="timeline-marker-detail" role="dialog" aria-label={`${summary} details`} style={{ top: detailPosition.top, left: detailPosition.left }}>
        <div className="timeline-marker-detail-heading"><b>{summary}</b><button type="button" className="timeline-marker-detail-close" aria-label="Close issue details" onClick={closeDetail}><X aria-hidden="true" /></button></div>
        <span>{resourceName} · {resourceLocation} · {dateRange}</span>
        {cluster.issues.map((issue) => (
          <span key={issue.id} className="timeline-marker-detail-item">
            <b>{readableIssueKind(issue.kind)} · {formatAbsoluteDateRange(issue.detailStart ?? issue.start, issue.detailSpan ?? issue.span, days, range)}</b>
            <small>{issue.reason}</small>
            <small>{issue.impact}</small>
            {issue.jobIds?.length ? issue.jobIds.map((jobId) => <button key={jobId} type="button" className="timeline-marker-job-link" onClick={(event) => { event.stopPropagation(); setOpen(false); setDetailPosition(undefined); hidePreview(); onSelect(jobId) }}>Open {jobId}</button>) : <small>No linked job</small>}
          </span>
        ))}
      </div>,
      document.body,
    )
  }
}

function IssueIcon({ kind }: { kind: TimelineIssueKind }) {
  if (kind === 'maintenance') return <Wrench aria-hidden="true" />
  if (kind === 'unavailable') return <Prohibit aria-hidden="true" />
  return <Warning weight="fill" aria-hidden="true" />
}

function clusterSeverity(cluster: TimelineIssueCluster) {
  return cluster.issues.some((issue) => issue.kind === 'unavailable' || issue.kind === 'conflict') ? 'is-danger' : 'is-warning'
}

function readableIssueKind(kind: TimelineIssueKind) {
  if (kind === 'maintenance') return 'Maintenance'
  if (kind === 'unavailable') return 'Unavailable'
  return 'Capacity conflict'
}

function formatAbsoluteDateRange(start: number, span: number, days: TimelineDay[], range: TimelineRange) {
  const end = start + span - 1
  const startDay = days[start - range.from]
  const endDay = days[end - range.from]
  if (startDay && endDay) return formatAgendaDate(startDay, endDay)

  const anchorIndex = days.findIndex((day) => day.year !== undefined && Boolean(day.month))
  const anchor = anchorIndex >= 0 ? days[anchorIndex] : undefined
  if (!anchor || anchor.year === undefined) return `D+${start} to D+${end}`

  const anchorMonth = monthNumber(anchor.month)
  if (anchorMonth < 0) return `D+${start} to D+${end}`
  const anchorDate = Date.UTC(anchor.year, anchorMonth, Number(anchor.day))
  const anchorAbsoluteDay = range.from + anchorIndex
  const makeDay = (absoluteDay: number): TimelineDay => {
    const date = new Date(anchorDate + (absoluteDay - anchorAbsoluteDay) * 86_400_000)
    return {
      day: String(date.getUTCDate()),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      month: date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
      year: date.getUTCFullYear(),
    }
  }
  return formatAgendaDate(makeDay(start), makeDay(end))
}

function monthNumber(month: string) {
  return ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(month.trim().toLowerCase())
}

function getFullConflictSegmentStart(dayIndexes: readonly number[], visibleStart: number) {
  const segment = getContiguousDaySegments(dayIndexes).find((candidate) => candidate.start <= visibleStart && visibleStart < candidate.start + candidate.span)
  return segment?.start ?? visibleStart
}

function getFullConflictSegmentSpan(dayIndexes: readonly number[], visibleStart: number) {
  const segment = getContiguousDaySegments(dayIndexes).find((candidate) => candidate.start <= visibleStart && visibleStart < candidate.start + candidate.span)
  return segment?.span ?? 1
}

function getContiguousDaySegments(dayIndexes: readonly number[]) {
  const sorted = [...new Set(dayIndexes)].sort((left, right) => left - right)
  if (!sorted.length) return []
  const segments: Array<{ start: number; span: number }> = []
  let start = sorted[0]
  let previous = sorted[0]
  for (const day of sorted.slice(1)) {
    if (day === previous + 1) {
      previous = day
      continue
    }
    segments.push({ start, span: previous - start + 1 })
    start = day
    previous = day
  }
  segments.push({ start, span: previous - start + 1 })
  return segments
}

function matchesQuery(job: TimelineJob, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  return !normalized || `${job.id} ${job.label}`.toLowerCase().includes(normalized)
}

function matchesAgendaQuery(resource: TimelineResource, job: TimelineJob, query?: string): boolean {
  const normalized = query?.trim().toLowerCase()
  if (!normalized) return true
  return `${resource.name} ${resource.code} ${resource.location} ${job.id} ${job.label}`.toLowerCase().includes(normalized)
}

function matchesAgendaResource(resource: TimelineResource, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  return !normalized || `${resource.name} ${resource.code} ${resource.location}`.toLowerCase().includes(normalized)
}

function ResourceIcon({ kind }: { kind: string }) {
  if (kind === 'barge') return <Boat aria-hidden="true" />
  if (kind === 'supply') return <SquaresFour aria-hidden="true" />
  if (kind === 'test') return <Factory aria-hidden="true" />
  return <UsersThree aria-hidden="true" />
}

function averageUtilization(resources: TimelineResource[]) {
  if (!resources.length) return 0
  return Math.round(resources.reduce((total, resource) => total + resource.utilization, 0) / resources.length)
}

function groupUtilization(name: string, resources: TimelineResource[], metrics?: CapacityMetrics): number {
  const value = metrics?.groups.find((metric) => metric.label === name)?.barPercent
  return value ?? averageUtilization(resources)
}

const responsiveTimelineStyles = `
  .timeline-desktop { height: 100%; }
  .timeline-shell.is-sparse .timeline-desktop { height: auto; }
  .timeline-shell.is-sparse .timeline-scroll { height: auto; min-height: 0; }
  .timeline-agenda { display: none; }
  .timeline-agenda h2 { margin: 0; color: var(--ds-color-text); font: 700 16px/1.2 var(--ds-font-sans, sans-serif); }
  .timeline-agenda p { margin: 5px 0 0; color: var(--ds-color-text-muted); font-size: 11px; line-height: 1.4; }
  .timeline-agenda-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--ds-color-border); background: var(--ds-color-surface); }
  .timeline-agenda-header > span { flex: none; padding: 5px 8px; border: 1px solid var(--ds-color-border); border-radius: 999px; color: var(--ds-color-text-muted); font: 600 10px var(--ds-font-mono, monospace); }
  .timeline-agenda-list { display: grid; gap: 8px; margin: 0; padding: 12px; list-style: none; }
  .timeline-agenda-item { width: 100%; min-height: 68px; display: grid; gap: 4px; padding: 11px 12px; border: 1px solid var(--ds-color-border); border-radius: 7px; color: var(--ds-color-text); background: var(--ds-color-surface); text-align: left; }
  .timeline-agenda-item:hover { border-color: var(--ds-color-border-strong); background: var(--ds-color-surface-subtle); }
  .timeline-agenda-item:focus-visible { outline: 2px solid var(--ds-color-primary); outline-offset: 2px; }
  .timeline-agenda-item[aria-pressed='true'] { border-color: var(--ds-color-primary); box-shadow: inset 3px 0 var(--ds-color-primary); }
  .timeline-agenda-item-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .timeline-agenda-item-heading b { font: 700 11px var(--ds-font-mono, monospace); }
  .timeline-agenda-item-heading em { padding: 3px 6px; border: 1px solid var(--ds-color-border); border-radius: 4px; color: var(--ds-color-text-muted); font: normal 600 9px var(--ds-font-mono, monospace); }
  .timeline-agenda-item strong { font-size: 12px; }
  .timeline-agenda-meta, .timeline-agenda-context { color: var(--ds-color-text-muted); font-size: 10px; line-height: 1.35; }
  .timeline-agenda-context { color: var(--ds-color-text-subtle); }
  .timeline-agenda-item.is-risky { border-left: 3px solid var(--ds-color-danger); }
  .timeline-agenda-unavailability { width: 100%; min-height: 68px; display: grid; gap: 4px; padding: 11px 12px; border: 1px dashed var(--ds-color-border-strong); border-radius: 7px; color: var(--ds-color-text); background: var(--ds-color-surface-subtle); text-align: left; }
  .timeline-agenda-unavailability.maintenance { border-color: var(--ds-color-warning); background: var(--ds-color-warning-subtle); }
  .timeline-agenda-unavailability.unavailable { border-color: var(--ds-color-danger); background: var(--ds-color-danger-subtle); }
  .timeline-agenda-empty { margin: 0; padding: 28px 16px; text-align: center; }
  @media (max-width: 700px) {
    .timeline-desktop { display: none; }
    .timeline-agenda { display: block; height: 100%; overflow-y: auto; background: var(--ds-color-surface); }
    .timeline-shell.is-sparse .timeline-agenda { height: auto; }
  }
`
