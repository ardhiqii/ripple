import { getJobGridPlacement, MAX_VISIBLE_BOOKING_LANES, packTimelineLanes } from './timeline-layout'
import type { TimelineJob, TimelineRange } from './types'

export interface TimelineBookingFragment {
  job: TimelineJob
  bookingId: string
  lane: number
  start: number
  span: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface TimelineHiddenDay {
  day: number
  lane: number
  bookingIds: string[]
}

export interface TimelineHiddenSegment {
  start: number
  span: number
  lane: number
  bookingIds: string[]
}

export interface TimelineOverflowLayout {
  fragments: TimelineBookingFragment[]
  hiddenDays: TimelineHiddenDay[]
  hiddenSegments: TimelineHiddenSegment[]
  hiddenBookingIds: string[]
  bookingLaneCount: number
}

interface BookingCandidate {
  job: TimelineJob
  bookingId: string
  start: number
  end: number
}

/** Compact mode selects whole bookings, never different winners each day. */
export function getTimelineOverflowLayout(
  jobs: readonly TimelineJob[],
  range: TimelineRange,
  selectedJobId?: string,
  expanded = false,
): TimelineOverflowLayout {
  const candidates = getBookingCandidates(jobs, range, selectedJobId)
  if (expanded) return getExpandedLayout(candidates, range)

  const laneBookings: BookingCandidate[][] = Array.from({ length: MAX_VISIBLE_BOOKING_LANES }, () => [])
  const visible: TimelineBookingFragment[] = []
  const hidden: BookingCandidate[] = []
  for (const candidate of [...candidates].sort((left, right) => compareBookings(left, right, selectedJobId))) {
    const lane = laneBookings.findIndex((bookings) => bookings.every((existing) => !overlap(existing, candidate)))
    if (lane < 0) {
      hidden.push(candidate)
      continue
    }
    laneBookings[lane].push(candidate)
    visible.push(createFragment(candidate.job, candidate.bookingId, lane, candidate.start, candidate.end - candidate.start, range))
  }

  const hiddenDays = getHiddenDays(hidden, range)
  return {
    fragments: visible.sort((left, right) => left.start - right.start || left.lane - right.lane || left.bookingId.localeCompare(right.bookingId)),
    hiddenDays,
    hiddenSegments: getHiddenSegments(hiddenDays),
    hiddenBookingIds: hidden.map(({ bookingId }) => bookingId).sort((left, right) => left.localeCompare(right)),
    bookingLaneCount: getBookingLaneCount(visible),
  }
}

export function getDistinctHiddenBookingIds(hiddenDays: readonly TimelineHiddenDay[], selectedPeriod: TimelineRange): string[] {
  return [...new Set(hiddenDays.filter(({ day }) => day >= selectedPeriod.from && day <= selectedPeriod.to).flatMap(({ bookingIds }) => bookingIds))]
    .sort((left, right) => left.localeCompare(right))
}

function getBookingCandidates(jobs: readonly TimelineJob[], range: TimelineRange, selectedJobId?: string): BookingCandidate[] {
  const byBookingId = new Map<string, BookingCandidate>()
  for (const job of jobs) {
    const placement = job.span > 0 ? getJobGridPlacement(job, range) : undefined
    if (!placement) continue
    const candidate = {
      job,
      bookingId: getBookingId(job),
      start: range.from + placement.start - 1,
      end: range.from + placement.start - 1 + placement.span,
    }
    const current = byBookingId.get(candidate.bookingId)
    if (!current || compareBookings(candidate, current, selectedJobId) < 0) byBookingId.set(candidate.bookingId, candidate)
  }
  return [...byBookingId.values()]
}

function getExpandedLayout(candidates: readonly BookingCandidate[], range: TimelineRange): TimelineOverflowLayout {
  const lanes = packTimelineLanes(candidates.map(({ job }) => job), range)
  const fragments = lanes.map(({ item: job, lane, placement }) => createFragment(job, getBookingId(job), lane, range.from + placement.start - 1, placement.span, range))
  return {
    fragments,
    hiddenDays: [],
    hiddenSegments: [],
    hiddenBookingIds: [],
    bookingLaneCount: getBookingLaneCount(fragments),
  }
}

function getHiddenDays(candidates: readonly BookingCandidate[], range: TimelineRange): TimelineHiddenDay[] {
  const byDay = new Map<number, Set<string>>()
  for (const { bookingId, start, end } of candidates) {
    for (let day = Math.max(start, range.from); day < Math.min(end, range.to + 1); day += 1) {
      const ids = byDay.get(day) ?? new Set<string>()
      ids.add(bookingId)
      byDay.set(day, ids)
    }
  }
  return [...byDay].sort(([left], [right]) => left - right)
    .map(([day, ids]) => ({ day, lane: 0, bookingIds: [...ids].sort((left, right) => left.localeCompare(right)) }))
}

/** Runs split only at an empty date, not when IDs or their count change. */
function getHiddenSegments(hiddenDays: readonly TimelineHiddenDay[]): TimelineHiddenSegment[] {
  const segments: TimelineHiddenSegment[] = []
  for (const hiddenDay of hiddenDays) {
    const previous = segments.at(-1)
    if (previous && previous.start + previous.span === hiddenDay.day) {
      previous.span += 1
      previous.bookingIds = [...new Set([...previous.bookingIds, ...hiddenDay.bookingIds])].sort((left, right) => left.localeCompare(right))
    } else {
      segments.push({ start: hiddenDay.day, span: 1, lane: 0, bookingIds: [...hiddenDay.bookingIds] })
    }
  }
  return segments
}

function createFragment(job: TimelineJob, bookingId: string, lane: number, start: number, span: number, range: TimelineRange): TimelineBookingFragment {
  return {
    job,
    bookingId,
    lane,
    start,
    span,
    continuesBefore: job.start < range.from,
    continuesAfter: job.start + job.span > range.to + 1,
  }
}

function getBookingLaneCount(fragments: readonly TimelineBookingFragment[]) {
  return Math.max(1, fragments.reduce((highest, fragment) => Math.max(highest, fragment.lane + 1), 0))
}

function getBookingId(job: TimelineJob) {
  return job.bookingId ?? job.id
}

function overlap(left: BookingCandidate, right: BookingCandidate) {
  return left.start < right.end && right.start < left.end
}

function compareBookings(left: BookingCandidate, right: BookingCandidate, selectedJobId?: string) {
  const leftSelected = left.job.id === selectedJobId ? 0 : 1
  const rightSelected = right.job.id === selectedJobId ? 0 : 1
  if (leftSelected !== rightSelected) return leftSelected - rightSelected
  const leftProgress = left.job.status === 'progress' ? 0 : 1
  const rightProgress = right.job.status === 'progress' ? 0 : 1
  if (leftProgress !== rightProgress) return leftProgress - rightProgress
  return left.start - right.start || left.bookingId.localeCompare(right.bookingId) || left.job.id.localeCompare(right.job.id)
}
