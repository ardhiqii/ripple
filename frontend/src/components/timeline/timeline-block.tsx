import { CalendarBlank, CheckCircle, PauseCircle, PlayCircle, Warning } from '@phosphor-icons/react'

import { getJobGridPlacement, getVisibleDaySegments } from '@/features/schedule/timeline-layout'
import type { TimelineJob, TimelineRange } from '@/features/schedule/types'

interface TimelineBlockProps {
  job: TimelineJob
  resourceName: string
  range: TimelineRange
  selected: boolean
  dimmed?: boolean
  onSelect: (jobId: string) => void
}

export function TimelineBlock({ job, resourceName, range, selected, dimmed = false, onSelect }: TimelineBlockProps) {
  const placement = getJobGridPlacement(job, range)
  if (!placement) return null

  const status = job.status ?? 'planned'
  const hasProgress = typeof job.progress === 'number' && Number.isFinite(job.progress)
  const progressValue = hasProgress ? Math.max(0, Math.min(100, job.progress ?? 0)) : undefined
  const statusLabel = readableStatus(status)
  const conflictSegments = getVisibleDaySegments(job.conflictDays ?? [], range).filter((segment) => segment.start < job.start + job.span && segment.start + segment.span > job.start)
  const visibleStart = Math.max(job.start, range.from)
  const visibleEnd = Math.min(job.start + job.span, range.to + 1)
  const visibleSpan = visibleEnd - visibleStart
  const description = `${job.id}, ${job.label}, ${resourceName}, day ${job.start + 1} to ${job.start + job.span}, status: ${statusLabel}${progressValue === undefined ? '' : `, progress: ${Math.round(progressValue)} percent`}${conflictSegments.length ? `, capacity conflict on day${conflictSegments.length === 1 ? '' : 's'} ${conflictSegments.map((segment) => `${segment.start + 1}${segment.span > 1 ? `–${segment.start + segment.span}` : ''}`).join(', ')}` : ''}${selected ? ', selected' : ''}`

  return (
    <button
      type="button"
      className={`job ${job.tone} status-${status} ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${job.risk ? 'risky' : ''} ${conflictSegments.length ? 'has-conflict' : ''}`}
      style={{ gridColumn: `${placement.start} / span ${placement.span}`, opacity: dimmed ? 0.32 : undefined }}
      title={description}
      aria-label={description}
      aria-pressed={selected}
      data-job-id={job.id}
      onClick={() => onSelect(job.id)}
    >
      {status === 'progress' && progressValue !== undefined && <span className="job-progress" style={{ width: `${progressValue}%` }} aria-hidden="true" />}
      {conflictSegments.map((segment) => {
        const start = Math.max(segment.start, visibleStart)
        const end = Math.min(segment.start + segment.span, visibleEnd)
        if (end <= start) return null
        return <span key={`${job.id}-conflict-${segment.start}`} className="job-conflict-underline" style={{ left: `${((start - visibleStart) / visibleSpan) * 100}%`, width: `${((end - start) / visibleSpan) * 100}%` }} aria-hidden="true" />
      })}
      <b>{job.id}{status === 'complete' && <CheckCircle weight="fill" aria-hidden="true" />}</b>
      <small>
        <span className="job-activity">{job.label}</span>
        <span className="job-status" aria-hidden="true">
          <StatusIcon status={status} />
          {statusLabel}
          {progressValue !== undefined ? ` ${Math.round(progressValue)}%` : null}
          {job.conflict ? <><Warning weight="fill" /> Conflict</> : null}
        </span>
      </small>
    </button>
  )
}

function readableStatus(status: TimelineJob['status']) {
  if (status === 'progress') return 'In progress'
  if (status === 'complete') return 'Complete'
  if (status === 'hold') return 'Weather hold'
  return 'Planned'
}

function StatusIcon({ status }: { status: TimelineJob['status'] }) {
  if (status === 'progress') return <PlayCircle aria-hidden="true" />
  if (status === 'complete') return <CheckCircle weight="fill" aria-hidden="true" />
  if (status === 'hold') return <PauseCircle aria-hidden="true" />
  return <CalendarBlank aria-hidden="true" />
}
