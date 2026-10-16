import type { TimelineRange } from './types'

export const DAY_WIDTH = 48
export const BLOCK_MARGIN = 2
export const BOOKING_LANE_HEIGHT = 44
export const MARKER_BAND_HEIGHT = 18
export const MAX_VISIBLE_BOOKING_LANES = 2

export interface TimelineLane<T> {
  item: T
  lane: number
  placement: { start: number; span: number }
}

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

type TimelineSpan = { start: number; span: number }

export function getJobGridPlacement<T extends TimelineSpan>(span: T, range: TimelineRange) {
  const rangeEnd = range.to + 1
  const spanEnd = span.start + span.span
  const visibleStart = Math.max(span.start, range.from)
  const visibleEnd = Math.min(spanEnd, rangeEnd)

  if (visibleEnd <= visibleStart) return undefined

  return {
    start: visibleStart - range.from + 1,
    span: visibleEnd - visibleStart,
  }
}

/**
 * Pack inclusive booking dates into stable, non-overlapping visual lanes.
 * `start + span` is the exclusive end used by the API adapter, so a booking
 * ending on the previous day can safely share a lane with the next booking.
 */
export function packTimelineLanes<T extends { id: string; start: number; span: number }>(items: readonly T[], range: TimelineRange): TimelineLane<T>[] {
  const candidates = items
    .map((item) => ({ item, placement: getJobGridPlacement(item, range) }))
    .filter((candidate): candidate is { item: T; placement: { start: number; span: number } } => Boolean(candidate.placement))
    .sort((left, right) => (
      left.item.start - right.item.start
      || (left.item.start + left.item.span) - (right.item.start + right.item.span)
      || left.item.id.localeCompare(right.item.id)
    ))

  const laneEnds: number[] = []
  return candidates.map(({ item, placement }) => {
    const lane = laneEnds.findIndex((end) => end <= item.start)
    const assignedLane = lane === -1 ? laneEnds.length : lane
    laneEnds[assignedLane] = item.start + item.span
    return { item, lane: assignedLane, placement }
  })
}

export interface TimelineDaySegment {
  start: number
  span: number
}

/** Return sorted, contiguous absolute-day segments clipped to the canvas range. */
export function getVisibleDaySegments(dayIndexes: readonly number[], range: TimelineRange): TimelineDaySegment[] {
  const days = [...new Set(dayIndexes)]
    .filter((day) => day >= range.from && day <= range.to)
    .sort((left, right) => left - right)
  if (!days.length) return []

  const segments: TimelineDaySegment[] = []
  let start = days[0]
  let previous = days[0]
  for (const day of days.slice(1)) {
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

export function getTimelineMonthValue(days: readonly { day: string; month: string; year?: number }[], range: TimelineRange): string | undefined {
  const index = Math.max(0, Math.min(range.from, Math.max(0, days.length - 1)))
  const day = days[index]
  const month = day ? monthNumber(day.month) : undefined
  if (month === undefined) return undefined
  return `${String(day?.year ?? 2000).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

export function getRangeForMonth(
  days: readonly { day: string; month: string; year?: number }[],
  range: TimelineRange,
  monthValue: string,
): TimelineRange {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue)
  const firstDay = days[0]
  if (!match || !firstDay || monthNumber(firstDay.month) === undefined) return range

  const targetYear = Number(match[1])
  const targetMonth = Number(match[2]) - 1
  if (targetMonth < 0 || targetMonth > 11) return range
  const baseDate = dateForDay(firstDay)
  const targetStart = Date.UTC(targetYear, targetMonth, 1)
  const targetEnd = Date.UTC(targetYear, targetMonth + 1, 1)
  const baseMonthStart = Date.UTC(firstDay.year ?? 2000, monthNumber(firstDay.month) ?? 0, 1)
  if (targetStart < baseMonthStart) return range
  const from = Math.max(0, differenceInDays(targetStart, baseDate))
  const to = Math.max(from, differenceInDays(targetEnd, baseDate) - 1)
  return { from, to }
}

export function shiftTimelineMonth(range: TimelineRange, days: readonly { day: string; month: string; year?: number }[], direction: -1 | 1): TimelineRange {
  const currentValue = getTimelineMonthValue(days, range)
  if (!currentValue) return range
  const [year, month] = currentValue.split('-').map(Number)
  return getRangeForMonth(days, range, toMonthValue(year, month - 1 + direction))
}

export function canShiftTimelineMonth(range: TimelineRange, days: readonly { day: string; month: string; year?: number }[], direction: -1 | 1): boolean {
  const currentValue = getTimelineMonthValue(days, range)
  const firstDay = days[0]
  if (!currentValue || !firstDay) return false
  if (direction > 0) return true
  const [year, month] = currentValue.split('-').map(Number)
  const targetStart = Date.UTC(year, month - 1 + direction, 1)
  return targetStart >= dateForDay(firstDay)
}

export function getTodayTimelineRange(days: readonly { day: string; month: string; year?: number; today?: boolean }[], range: TimelineRange): TimelineRange {
  const explicitToday = days.findIndex((day) => day.today)
  const todayIndex = explicitToday >= 0 ? explicitToday : getTodayIndex(days)
  if (todayIndex < 0) return { from: 0, to: Math.max(0, Math.min(range.to - range.from, days.length - 1)) }
  const span = Math.max(1, range.to - range.from + 1)
  const from = Math.max(0, todayIndex - Math.floor(span / 2))
  return { from, to: from + span - 1 }
}

function monthNumber(month: string): number | undefined {
  const normalized = month.trim().toLowerCase()
  const index = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(normalized)
  return index >= 0 ? index : undefined
}

function dateForDay(day: { day: string; month: string; year?: number }): number {
  const month = monthNumber(day.month) ?? 0
  return Date.UTC(day.year ?? 2000, month, Number(day.day))
}

function differenceInDays(later: number, earlier: number): number {
  return Math.round((later - earlier) / 86_400_000)
}

function getTodayIndex(days: readonly { day: string; month: string; year?: number }[]): number {
  const firstDay = days[0]
  if (!firstDay || firstDay.year === undefined) return -1
  const today = new Date()
  const todayValue = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const index = differenceInDays(todayValue, dateForDay(firstDay))
  return index >= 0 ? index : -1
}

function toMonthValue(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
