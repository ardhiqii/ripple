import { useQuery } from '@tanstack/react-query'

import type { components } from '@/api/generated/openapi'
import { ApiError, apiTransport } from '@/api/transport'

import { adaptScheduleResponse } from './schedule-adapter'
import { buildBufferedTimelineDays } from './timeline-horizon'
import type { TimelineSchedule } from './types'

type ScheduleResponse = components['schemas']['ScheduleResponse']

export interface ScheduleQuery {
  fromDay?: number
  toDay?: number
  groups?: readonly string[]
  startDate?: string
}

export class ScheduleApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ScheduleApiError'
    this.status = error.status
    this.code = error.code
  }
}

export async function fetchSchedule(query: ScheduleQuery = {}): Promise<TimelineSchedule> {
  const params = new URLSearchParams()
  if (query.fromDay !== undefined) params.set('from', String(query.fromDay))
  if (query.toDay !== undefined) params.set('to', String(query.toDay))
  for (const group of query.groups ?? []) {
    const normalized = normalizeGroup(group)
    if (normalized) params.append('groups', normalized)
  }
  const suffix = params.toString()
  try {
    const response = await apiTransport.get<ScheduleResponse>(`/api/v1/schedule${suffix ? `?${suffix}` : ''}`)
    if (query.fromDay === undefined || query.toDay === undefined) return adaptScheduleResponse(response, query.startDate)

    const schedule = adaptScheduleResponse(boundResponseToRange(response, query.fromDay, query.toDay), query.startDate)

    // The API range is absolute scenario-day space. Keep the canvas list bounded
    // to that range even when the adapter receives a far-future response.
    const fromDay = query.fromDay
    const toDay = query.toDay
    const days = buildBufferedTimelineDays(query.startDate, { from: fromDay, to: toDay })
    return {
      ...schedule,
      // Keep shared weather context attached when the bounded response is
      // projected onto its absolute canvas range. Without this, range fetches
      // silently lose header markers even though the API returned them.
      days: days.map((day, index) => ({
        ...day,
        weather: schedule.weather?.filter((observation) => observation.day === fromDay + index),
      })),
    }
  } catch (error) {
    if (error instanceof ScheduleApiError) throw error
    if (error instanceof ApiError) throw new ScheduleApiError(error)
    throw new Error(error instanceof Error ? error.message : 'Schedule could not be loaded.')
  }
}

function boundResponseToRange(response: ScheduleResponse, from: number, to: number): ScheduleResponse {
  const bookings = response.bookings.filter((booking) => intersects(booking.start_day, booking.end_day, from, to))
  const bookingJobIds = new Set(bookings.map((booking) => booking.job_id).filter((jobId): jobId is string => Boolean(jobId)))
  return {
    ...response,
    jobs: response.jobs.filter((job) => bookingJobIds.has(job.id) || intersects(job.start_day, job.start_day + Math.max(1, job.duration_days) - 1, from, to)),
    bookings,
    unavailability: response.unavailability.filter((interval) => intersects(interval.start_day, interval.end_day, from, to)),
    weather: response.weather.filter((observation) => observation.day >= from && observation.day <= to),
    capacity: response.capacity.map((report) => ({
      ...report,
      points: report.points.filter((point) => point.day >= from && point.day <= to),
    })),
  }
}

function intersects(start: number, end: number, from: number, to: number): boolean {
  return start <= to && end >= from
}

export function useSchedule(query: ScheduleQuery = {}) {
  const normalizedQuery = {
    fromDay: query.fromDay,
    toDay: query.toDay,
    startDate: query.startDate,
    groups: [...(query.groups ?? [])].map(normalizeGroup).filter((group): group is string => Boolean(group)),
  }
  return useQuery({
    queryKey: apiTransport.queryKey('schedule', normalizedQuery),
    queryFn: () => fetchSchedule(normalizedQuery),
  })
}

function normalizeGroup(group: string): string | undefined {
  const normalized = group.trim().toLowerCase()
  if (!normalized || normalized === 'all resources') return undefined
  if (normalized === 'supply boats') return 'supply_boat'
  if (normalized === 'test bays') return 'test_bay'
  if (normalized === 'lift crews') return 'lift_crew'
  if (normalized === 'barges') return 'barge'
  return normalized
}
