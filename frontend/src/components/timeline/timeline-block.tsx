import { CheckCircle } from '@phosphor-icons/react'

import { getJobGridPlacement } from '@/features/schedule/timeline-layout'
import type { TimelineJob, TimelineRange } from '@/features/schedule/types'

interface TimelineBlockProps {
  job: TimelineJob
  resourceName: string
  range: TimelineRange
  selected: boolean
  onSelect: (jobId: string) => void
}

export function TimelineBlock({ job, resourceName, range, selected, onSelect }: TimelineBlockProps) {
  const placement = getJobGridPlacement(job, range)
  if (!placement) return null

  const status = job.status ?? 'planned'
  const description = `${job.id}, ${job.label}, ${resourceName}, day ${job.start + 1} to ${job.start + job.span}, ${status}`

  return (
    <button
      type="button"
      className={`job ${job.tone} status-${status} ${selected ? 'selected' : ''} ${job.risk ? 'risky' : ''}`}
      style={{ gridColumn: `${placement.start} / span ${placement.span}` }}
      title={description}
      aria-label={description}
      aria-pressed={selected}
      data-job-id={job.id}
      onClick={() => onSelect(job.id)}
    >
      {status === 'progress' && <span className="job-progress" style={{ width: `${job.progress ?? 0}%` }} />}
      <b>{job.id}{status === 'complete' && <CheckCircle weight="fill" aria-hidden="true" />}</b>
      <small>{job.label}{status === 'progress' && <em>{job.progress}%</em>}</small>
    </button>
  )
}
