import type { TimelineDay, TimelineRange } from './types'

export type TimelineHorizon = '2w' | 'month'

export const DEFAULT_TIMELINE_HORIZON: TimelineHorizon = '2w'
export const HORIZON_BUFFER_PERIODS = 3
export const SYNTHETIC_PREVIEW_MONTHS = 12
export const ROLLING_HORIZON_DAYS = 14

const DAY_MS = 86_400_000
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export interface HorizonPeriod extends TimelineRange {
  horizon: TimelineHorizon
  key: string
}

export interface TodayTarget {
  period: HorizonPeriod
  label: 'Today' | 'Scenario start'
}

export interface TimelineHorizonState {
  horizon: TimelineHorizon
  selectedPeriod: HorizonPeriod
  canvasRange: TimelineRange
  periodLabel: string
  compactPeriodLabel: string
  monthValue: string
  monthMin: string
  monthMax: string
  today: TodayTarget
  canPrevious: boolean
  canNext: boolean
}

export function normalizeTimelineHorizon(value: unknown): TimelineHorizon {
  return value === 'month' ? 'month' : DEFAULT_TIMELINE_HORIZON
}

export function getTimelineHorizonState(
  horizon: unknown,
  from: number,
  _to: number,
  scenarioStartDate?: string,
): TimelineHorizonState {
  const normalizedHorizon = normalizeTimelineHorizon(horizon)
  const start = parseIsoDate(scenarioStartDate)
  const selectedPeriod = getPeriodForAnchor(normalizedHorizon, Number.isFinite(from) ? from : 0, start)
  const canvasRange = getBufferedCanvasRange(selectedPeriod, start)
  const today = getTodayTarget(normalizedHorizon, start)
  const previous = shiftTimelinePeriod(selectedPeriod, normalizedHorizon, -1, start)
  const next = shiftTimelinePeriod(selectedPeriod, normalizedHorizon, 1, start)
  const monthStart = start ? monthValue(start) : ''
  const monthEnd = start ? monthValue(dateAt(start, getMaximumDayForHorizon('month', start))) : ''

  return {
    horizon: normalizedHorizon,
    selectedPeriod,
    canvasRange,
    periodLabel: formatPeriodLabel(selectedPeriod, start),
    compactPeriodLabel: formatCompactPeriodLabel(selectedPeriod, start),
    monthValue: monthValue(dateAt(start, selectedPeriod.from)),
    monthMin: monthStart,
    monthMax: monthEnd,
    today,
    canPrevious: previous !== undefined,
    canNext: next !== undefined,
  }
}

export function getPeriodForAnchor(horizon: TimelineHorizon, anchorDay: number, start: Date | undefined): HorizonPeriod {
  const safeStart = start ?? fallbackScenarioStart()
  const maximumDay = getMaximumDayForHorizon(horizon, safeStart)
  const safeAnchor = clamp(Math.floor(anchorDay), 0, maximumDay)

  if (horizon === '2w') {
    const from = Math.floor(safeAnchor / ROLLING_HORIZON_DAYS) * ROLLING_HORIZON_DAYS
    return period(horizon, from, Math.min(maximumDay, from + ROLLING_HORIZON_DAYS - 1))
  }

  const anchorDate = dateAt(safeStart, safeAnchor)
  const monthStart = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1)
  const nextMonthStart = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() + 1, 1)
  const from = Math.max(0, daysBetween(safeStart, monthStart))
  const to = Math.min(maximumDay, daysBetween(safeStart, nextMonthStart) - 1)
  return period(horizon, from, Math.max(from, to))
}

export function getPeriodForMonthValue(month: string, start: Date | undefined): HorizonPeriod | undefined {
  const safeStart = start ?? fallbackScenarioStart()
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return undefined
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return undefined

  const requestedStart = Date.UTC(year, monthIndex, 1)
  const scenarioMonthStart = Date.UTC(safeStart.getUTCFullYear(), safeStart.getUTCMonth(), 1)
  if (requestedStart < scenarioMonthStart) return undefined
  const anchor = daysBetween(safeStart, requestedStart)
  if (anchor > getMaximumDayForHorizon('month', safeStart)) return undefined
  return getPeriodForAnchor('month', anchor, safeStart)
}

export function shiftTimelinePeriod(
  selectedPeriod: TimelineRange,
  horizon: TimelineHorizon,
  direction: -1 | 1,
  start: Date | undefined,
): HorizonPeriod | undefined {
  const safeStart = start ?? fallbackScenarioStart()
  const maximumDay = getMaximumDayForHorizon(horizon, safeStart)
  if (horizon === '2w') {
    const anchor = selectedPeriod.from + direction * ROLLING_HORIZON_DAYS
    if (anchor < 0 || anchor > maximumDay) return undefined
    return getPeriodForAnchor(horizon, anchor, safeStart)
  }

  const selectedStart = dateAt(safeStart, selectedPeriod.from)
  const targetMonth = Date.UTC(selectedStart.getUTCFullYear(), selectedStart.getUTCMonth() + direction, 1)
  const scenarioMonthStart = Date.UTC(safeStart.getUTCFullYear(), safeStart.getUTCMonth(), 1)
  if (targetMonth < scenarioMonthStart) return undefined
  const anchor = daysBetween(safeStart, targetMonth)
  if (anchor > maximumDay) return undefined
  return getPeriodForAnchor(horizon, anchor, safeStart)
}

export function getBufferedCanvasRange(selectedPeriod: HorizonPeriod, start: Date | undefined): TimelineRange {
  const safeStart = start ?? fallbackScenarioStart()
  const previous = shiftTimelinePeriod(selectedPeriod, selectedPeriod.horizon, -1, safeStart)
  const next = shiftTimelinePeriod(selectedPeriod, selectedPeriod.horizon, 1, safeStart)
  return {
    from: previous?.from ?? selectedPeriod.from,
    to: next?.to ?? selectedPeriod.to,
  }
}

export function getTodayTarget(horizon: TimelineHorizon, start: Date | undefined): TodayTarget {
  const safeStart = start ?? fallbackScenarioStart()
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const todayDay = daysBetween(safeStart, todayUtc)
  const maximumDay = getMaximumDayForHorizon(horizon, safeStart)
  if (todayDay >= 0 && todayDay <= maximumDay) {
    return { period: getPeriodForAnchor(horizon, todayDay, safeStart), label: 'Today' }
  }
  return { period: getPeriodForAnchor(horizon, 0, safeStart), label: 'Scenario start' }
}

export function containsRange(outer: TimelineRange, inner: TimelineRange): boolean {
  return outer.from <= inner.from && outer.to >= inner.to
}

export function sameRange(left: TimelineRange, right: TimelineRange): boolean {
  return left.from === right.from && left.to === right.to
}

export function buildBufferedTimelineDays(startDate: string | undefined, range: TimelineRange): TimelineDay[] {
  const start = parseIsoDate(startDate)
  if (!start) {
    return Array.from({ length: Math.max(1, range.to - range.from + 1) }, (_, index) => ({
      day: `D+${range.from + index}`,
      weekday: '',
      month: '',
    }))
  }

  const today = new Date()
  const todayValue = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
  return Array.from({ length: Math.max(1, range.to - range.from + 1) }, (_, index) => {
    const absoluteDay = range.from + index
    const date = dateAt(start, absoluteDay)
    const value = isoDate(date)
    return {
      day: String(date.getUTCDate()),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      month: MONTH_NAMES[date.getUTCMonth()] ?? '',
      year: date.getUTCFullYear(),
      monthStart: date.getUTCDate() === 1,
      today: value === todayValue,
    }
  })
}

export function formatPeriodLabel(selectedPeriod: TimelineRange, start: Date | undefined): string {
  const safeStart = start ?? fallbackScenarioStart()
  const periodStart = dateAt(safeStart, selectedPeriod.from)
  const periodEnd = dateAt(safeStart, selectedPeriod.to)
  const monthLabel = `${MONTH_NAMES[periodStart.getUTCMonth()]} ${periodStart.getUTCFullYear()}`
  const partial = selectedPeriod.from === 0 && periodStart.getUTCDate() > 1
    ? ` · from ${periodStart.getUTCDate()} ${shortMonth(periodStart)}`
    : ''
  return `${monthLabel}${partial} · ${formatDateRange(periodStart, periodEnd)}`
}

export function formatCompactPeriodLabel(selectedPeriod: TimelineRange, start: Date | undefined): string {
  const safeStart = start ?? fallbackScenarioStart()
  const periodStart = dateAt(safeStart, selectedPeriod.from)
  const periodEnd = dateAt(safeStart, selectedPeriod.to)
  return formatDateRange(periodStart, periodEnd)
}

export function getMaximumDay(start: Date): number {
  return Math.max(0, daysBetween(start, Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + SYNTHETIC_PREVIEW_MONTHS, start.getUTCDate())) - 1)
}

function getMaximumDayForHorizon(horizon: TimelineHorizon, start: Date): number {
  if (horizon === '2w') return getMaximumDay(start)
  return Math.max(0, daysBetween(start, Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + SYNTHETIC_PREVIEW_MONTHS, 1)) - 1)
}

export function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(timestamp)) return undefined
  const date = new Date(timestamp)
  return isoDate(date) === value ? date : undefined
}

function period(horizon: TimelineHorizon, from: number, to: number): HorizonPeriod {
  return { horizon, from, to, key: `${horizon}:${from}:${to}` }
}

function fallbackScenarioStart(): Date {
  return new Date(Date.UTC(2026, 9, 13))
}

function dateAt(start: Date | undefined, day: number): Date {
  const safeStart = start ?? fallbackScenarioStart()
  const date = new Date(safeStart.getTime())
  date.setUTCDate(date.getUTCDate() + day)
  return date
}

function daysBetween(start: Date, target: number): number {
  return Math.round((target - start.getTime()) / DAY_MS)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function monthValue(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function shortMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

function formatDateRange(start: Date, end: Date): string {
  const startMonth = shortMonth(start)
  const endMonth = shortMonth(end)
  const sameDate = isoDate(start) === isoDate(end)
  if (sameDate) return `${start.getUTCDate()} ${startMonth} ${start.getUTCFullYear()}`
  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${startMonth} ${start.getUTCFullYear()}`
  }
  return `${start.getUTCDate()} ${startMonth} ${start.getUTCFullYear()} – ${end.getUTCDate()} ${endMonth} ${end.getUTCFullYear()}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
