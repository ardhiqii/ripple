import type { TimelineJob, TimelineRange } from './types'

export const DAY_WIDTH = 48
export const BLOCK_MARGIN = 2

export function getDayPosition(dayIndex: number, from = 0, dayWidth = DAY_WIDTH) {
  return Math.max(0, dayIndex - from) * dayWidth
}

export function getBlockWidth(span: number, dayWidth = DAY_WIDTH, horizontalMargin = BLOCK_MARGIN) {
  return Math.max(0, span * dayWidth - horizontalMargin * 2)
}

export function shiftTimelineRange(range: TimelineRange, direction: -1 | 1, totalDays: number) {
  const lastDay = Math.max(0, totalDays - 1)
  const from = Math.max(0, Math.min(range.from, lastDay))
  const to = Math.max(from, Math.min(range.to, lastDay))
  const span = Math.max(1, to - from + 1)
  const maxFrom = Math.max(0, totalDays - span)
  const nextFrom = Math.max(0, Math.min(maxFrom, from + direction * span))

  return { from: nextFrom, to: nextFrom + span - 1 }
}

export function getJobGridPlacement(job: TimelineJob, range: TimelineRange) {
  const rangeEnd = range.to + 1
  const jobEnd = job.start + job.span
  const visibleStart = Math.max(job.start, range.from)
  const visibleEnd = Math.min(jobEnd, rangeEnd)

  if (visibleEnd <= visibleStart) return undefined

  return {
    start: visibleStart - range.from + 1,
    span: visibleEnd - visibleStart,
  }
}
