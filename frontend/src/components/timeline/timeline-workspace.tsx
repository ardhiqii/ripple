import { Boat, CaretDown, Factory, SquaresFour, UsersThree, Wrench } from '@phosphor-icons/react'
import { useState } from 'react'

import { getVisibleJobs } from '@/features/schedule/fixture-adapter'
import { DAY_WIDTH, getJobGridPlacement } from '@/features/schedule/timeline-layout'
import type { TimelineDay, TimelineJob, TimelineRange, TimelineResource } from '@/features/schedule/types'
import { TimelineBlock } from './timeline-block'

interface TimelineWorkspaceProps {
  resources: TimelineResource[]
  days: TimelineDay[]
  range: TimelineRange
  selectedJobId?: string
  vendors: string[]
  status?: string
  onSelect: (jobId: string) => void
}

export function TimelineWorkspace({ resources, days, range, selectedJobId, vendors, status, onSelect }: TimelineWorkspaceProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const groups = [...new Set(resources.map((resource) => resource.group))]
  const dayColumns = `repeat(${days.length}, minmax(${DAY_WIDTH}px, 1fr))`
  const gridStyle = { gridTemplateColumns: `270px minmax(${days.length * DAY_WIDTH}px, 1fr)`, minWidth: `${270 + days.length * DAY_WIDTH}px` }
  const todayIndex = days.findIndex((day) => day.today)

  return (
    <section className="timeline-shell" aria-label="Fleet timeline workspace">
      <style data-timeline-responsive>{responsiveTimelineStyles}</style>
      <div className="timeline-desktop" role="region" aria-label="Timeline Gantt chart">
        <div className="timeline-scroll">
          <div className="timeline-grid" style={gridStyle}>
            <div className="resource-head"><span>Resource / capacity</span><small>{resources.length} visible</small></div>
            <CalendarHeader days={days} dayColumns={dayColumns} />
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
                <GroupRow key={`group-${group}`} name={group} resources={groupResources} collapsed={isCollapsed} onToggle={toggle} />,
                <div key={`track-${group}`} className="group-track" style={{ gridTemplateColumns: dayColumns }}>
                  <i style={{ width: `${averageUtilization(groupResources)}%` }} />
                  {todayIndex >= 0 && <span className="today-line" style={{ gridColumn: `${todayIndex + 1}` }} />}
                </div>,
                ...(isCollapsed ? [] : groupResources.map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} dayColumns={dayColumns} days={days} range={range} vendors={vendors} status={status} todayIndex={todayIndex} selectedJobId={selectedJobId} onSelect={onSelect} />
                ))),
              ]
            })}
          </div>
        </div>
      </div>
      <TimelineAgenda resources={resources} days={days} range={range} vendors={vendors} status={status} selectedJobId={selectedJobId} onSelect={onSelect} />
    </section>
  )
}

function TimelineAgenda({ resources, days, range, vendors, status, selectedJobId, onSelect }: { resources: TimelineResource[]; days: TimelineDay[]; range: TimelineRange; vendors: string[]; status?: string; selectedJobId?: string; onSelect: (jobId: string) => void }) {
  const items = resources.flatMap((resource) => getVisibleJobs(resource, { vendors, status }).flatMap((job) => {
    const placement = getJobGridPlacement(job, range)
    if (!placement) return []

    const startDay = days[placement.start - 1]
    const endDay = days[placement.start + placement.span - 2]
    if (!startDay || !endDay) return []

    return [{ job, resource, dateRange: formatAgendaDate(startDay, endDay) }]
  })).sort((left, right) => left.job.start - right.job.start || left.resource.name.localeCompare(right.resource.name))

  return (
    <div className="timeline-agenda" role="region" aria-label="Timeline agenda">
      <div className="timeline-agenda-header">
        <div>
          <h2>Agenda view</h2>
          <p>Jobs are listed by start date. Select one to open its details.</p>
        </div>
        <span>{items.length} activities</span>
      </div>
      {items.length ? (
        <ol className="timeline-agenda-list">
          {items.map(({ job, resource, dateRange }) => {
            const statusLabel = readableStatus(job.status)
            const accessibleName = `${job.id}, ${job.label}; ${dateRange}; ${resource.name}; status: ${statusLabel}${job.risk ? '; at risk' : ''}`
            return (
              <li key={`${resource.id}-${job.id}`}>
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
                  <span className="timeline-agenda-context">{resource.group}{job.risk ? ' · At risk' : ''}</span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="timeline-agenda-empty" role="status">No activities scheduled in this view.</p>
      )}
    </div>
  )
}

function formatAgendaDate(startDay: TimelineDay, endDay: TimelineDay) {
  if (startDay.month === endDay.month) {
    return startDay.day === endDay.day
      ? `${startDay.day} ${startDay.month} 2026`
      : `${startDay.day}–${endDay.day} ${startDay.month} 2026`
  }
  return `${startDay.day} ${startDay.month} 2026 – ${endDay.day} ${endDay.month} 2026`
}

function readableStatus(status: TimelineJob['status']) {
  if (status === 'progress') return 'In progress'
  if (status === 'complete') return 'Complete'
  if (status === 'hold') return 'On hold'
  return 'Planned'
}

function CalendarHeader({ days, dayColumns }: { days: TimelineDay[]; dayColumns: string }) {
  const monthSegments = days.reduce<Array<{ month: TimelineDay['month']; count: number }>>((segments, day) => {
    const last = segments.at(-1)
    if (last?.month === day.month) last.count += 1
    else segments.push({ month: day.month, count: 1 })
    return segments
  }, [])

  return (
    <div className="calendar-head">
      <div className="months" style={{ gridTemplateColumns: monthSegments.map((segment) => `${segment.count}fr`).join(' ') }}>
        {monthSegments.map((segment) => <b key={segment.month}>{segment.month} 2026</b>)}
      </div>
      <div className="days" style={{ gridTemplateColumns: dayColumns }}>
        {days.map((day) => <span className={day.monthStart ? 'month-start' : ''} key={`${day.month}-${day.day}`}><b>{day.day}</b><small>{day.weekday}</small></span>)}
      </div>
    </div>
  )
}

function GroupRow({ name, resources, collapsed, onToggle }: { name: string; resources: TimelineResource[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`group-label ${collapsed ? 'collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
      <CaretDown aria-hidden="true" />
      <GroupIcon group={name} />
      <b>{name.toUpperCase()}</b>
      <span>{resources.length}</span>
      <i className="group-meter"><u style={{ width: `${averageUtilization(resources)}%` }} /></i>
      <em>{averageUtilization(resources)}%</em>
    </button>
  )
}

function GroupIcon({ group }: { group: string }) {
  if (group === 'Barges') return <Boat weight="fill" aria-hidden="true" />
  if (group === 'Supply boats') return <SquaresFour weight="fill" aria-hidden="true" />
  if (group === 'Test bays') return <Wrench weight="fill" aria-hidden="true" />
  return <UsersThree weight="fill" aria-hidden="true" />
}

function ResourceRow({ resource, dayColumns, days, range, vendors, status, todayIndex, selectedJobId, onSelect }: { resource: TimelineResource; dayColumns: string; days: TimelineDay[]; range: TimelineRange; vendors: string[]; status?: string; todayIndex: number; selectedJobId?: string; onSelect: (jobId: string) => void }) {
  const jobs = getVisibleJobs(resource, { vendors, status })
  return (
    <>
      <div className="resource-cell">
        <span className="resource-icon"><ResourceIcon kind={resource.kind} /></span>
        <div><b>{resource.name}</b><small>{resource.code} <i /> {resource.location}</small></div>
        <div className="util"><span>{resource.utilization}%</span><i><em style={{ width: `${resource.utilization}%` }} /></i></div>
      </div>
      <div className="track" style={{ gridTemplateColumns: dayColumns }}>
        {days.map((day, index) => <i className={day.monthStart ? 'month-start' : ''} style={{ gridColumn: index + 1, gridRow: '1' }} key={`${resource.id}-${day.month}-${day.day}`} />)}
        {todayIndex >= 0 && <span className="today-line" style={{ gridColumn: `${todayIndex + 1}` }} />}
        {resource.jobs.length === 0 && <span className="empty">No activities scheduled</span>}
        {jobs.map((job) => <TimelineBlock key={job.id} job={job} resourceName={resource.name} range={range} selected={selectedJobId === job.id} onSelect={onSelect} />)}
      </div>
    </>
  )
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

const responsiveTimelineStyles = `
  .timeline-desktop { height: 100%; }
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
  .timeline-agenda-empty { margin: 0; padding: 28px 16px; text-align: center; }
  @media (max-width: 700px) {
    .timeline-desktop { display: none; }
    .timeline-agenda { display: block; height: 100%; overflow-y: auto; background: var(--ds-color-surface); }
  }
`
