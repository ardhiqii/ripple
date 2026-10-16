import type { components } from '@/api/generated/openapi'

import { timelineDays, timelineResources } from './fixture-adapter'
import type {
  TimelineCapacityReport,
  TimelineDay,
  TimelineJob,
  TimelineResource,
  TimelineSchedule,
  TimelineTone,
  TimelineUnavailability,
  TimelineWeather,
} from './types'

type ScheduleResponse = components['schemas']['ScheduleResponse']
type ResourceResponse = components['schemas']['ResourceResponse']
type BookingResponse = components['schemas']['BookingResponse']
type JobResponse = components['schemas']['JobResponse']
type UnavailabilityResponse = components['schemas']['UnavailabilityResponse']
type WeatherResponse = components['schemas']['WeatherResponse']

export function adaptScheduleResponse(response: ScheduleResponse, startDate?: string): TimelineSchedule {
  const jobs = new Map(response.jobs.map((job) => [job.id, job]))
  const bookingsByResource = groupBy(response.bookings, (booking) => booking.resource_id)
  const unavailability = response.unavailability ?? []
  const unavailabilityByResource = groupBy(unavailability, (interval) => interval.resource_id)
  const weather = (response.weather ?? []).map(mapWeather)
  const conflictDaysByBooking = findConflictDays(response.capacity)

  const resources = response.resources.map((resource) => mapResource(
    resource,
    bookingsByResource.get(resource.id) ?? [],
    unavailabilityByResource.get(resource.id) ?? [],
    jobs,
    conflictDaysByBooking,
    response.capacity,
  ))

  const maxDay = Math.max(
    14,
    response.to_day ?? 0,
    ...response.jobs.map((job) => job.start_day + Math.max(1, job.duration_days) - 1),
    ...response.bookings.map((booking) => booking.end_day),
    ...unavailability.map((interval) => interval.end_day),
    ...weather.map((observation) => observation.day),
  )

  const days = buildTimelineDays(startDate, maxDay + 1).map((day, index) => ({
    ...day,
    weather: weather.filter((observation) => observation.day === index),
  }))

  return {
    scenarioId: response.scenario_id,
    version: response.version,
    scenarioStartDate: startDate,
    days,
    resources,
    capacity: response.capacity.map(mapCapacityReport),
    weather,
  }
}

/** Explicitly test-only data; production routes never use this value. */
export const fixtureTimelineSchedule: TimelineSchedule = {
  scenarioId: 'fixture',
  version: 0,
  days: timelineDays,
  resources: timelineResources,
  capacity: [],
  weather: [],
}

export function buildTimelineDays(startDate: string | undefined, count: number): TimelineDay[] {
  const start = new Date(`${startDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) {
    return Array.from({ length: Math.max(1, count) }, (_, index) => ({ day: `D+${index}`, weekday: '', month: '' }))
  }
  const today = new Date().toISOString().slice(0, 10)
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return {
      day: String(date.getUTCDate()),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      month: date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
      year: date.getUTCFullYear(),
      monthStart: index > 0 && date.getUTCDate() === 1,
      today: date.toISOString().slice(0, 10) === today,
    }
  })
}

function mapResource(
  resource: ResourceResponse,
  bookings: BookingResponse[],
  unavailable: UnavailabilityResponse[],
  jobs: Map<string, JobResponse>,
  conflictDaysByBooking: ReadonlyMap<string, readonly number[]>,
  capacity: components['schemas']['CapacityResponse'][],
): TimelineResource {
  return {
    id: resource.id,
    name: resource.name,
    code: resource.id,
    group: resourceGroup(resource.type),
    kind: resourceKind(resource.type),
    utilization: utilizationFor(resource.id, capacity),
    location: locationFor(resource),
    jobs: bookings
      .filter((booking) => booking.status !== 'cancelled')
      .sort((left, right) => left.start_day - right.start_day || left.id.localeCompare(right.id))
      .map((booking) => mapBooking(booking, jobs.get(booking.job_id ?? ''), resource, conflictDaysByBooking)),
    unavailability: unavailable.map(mapUnavailability)
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)),
    active: resource.active,
  }
}

function mapBooking(
  booking: BookingResponse,
  job: JobResponse | undefined,
  resource: ResourceResponse,
  conflictDaysByBooking: ReadonlyMap<string, readonly number[]>,
): TimelineJob {
  const start = booking.start_day
  const end = Math.max(start, booking.end_day)
  const jobId = job?.id ?? booking.cargo_id ?? booking.id
  const status = timelineStatus(job?.status ?? booking.status)
  const conflictDays = [...(conflictDaysByBooking.get(booking.id) ?? [])]

  return {
    id: jobId,
    bookingId: booking.id,
    label: job?.job_type ?? (booking.cargo_id ? 'Cargo movement' : 'Scheduled activity'),
    start,
    span: end - start + 1,
    // The live schedule contract has no persisted vendor assignment. Keep all
    // API-backed bookings neutral until that field exists in OpenAPI.
    tone: toneFor(status),
    status,
    risk: Boolean(job?.locked || conflictDays.length),
    conflict: conflictDays.length > 0,
    conflictDays,
  }
}

function mapUnavailability(interval: UnavailabilityResponse): TimelineUnavailability {
  return {
    id: interval.id,
    start: interval.start_day,
    span: Math.max(1, interval.end_day - interval.start_day + 1),
    kind: interval.kind,
    reason: interval.reason,
  }
}

function mapWeather(observation: WeatherResponse): TimelineWeather {
  return {
    day: observation.day,
    location: observation.location,
    metric: observation.metric,
    value: observation.value === null ? undefined : numberValue(observation.value),
    go: observation.go ?? undefined,
    source: observation.source,
  }
}

function mapCapacityReport(report: components['schemas']['CapacityResponse']): TimelineCapacityReport {
  return {
    resourceId: report.resource_id,
    unit: report.unit,
    points: report.points.map((point) => ({
      resourceId: point.resource_id,
      day: point.day,
      used: numberValue(point.used),
      capacity: numberValue(point.capacity),
      overflow: numberValue(point.overflow),
      utilizationPercent: numberValue(point.utilization_percent),
      bookingIds: point.booking_ids,
    })),
  }
}

function findConflictDays(reports: components['schemas']['CapacityResponse'][]): Map<string, number[]> {
  const conflicts = new Map<string, number[]>()
  for (const report of reports) {
    for (const point of report.points) {
      if (numberValue(point.overflow) <= 0) continue
      for (const bookingId of point.booking_ids) {
        const days = conflicts.get(bookingId) ?? []
        days.push(point.day)
        conflicts.set(bookingId, days)
      }
    }
  }
  for (const [bookingId, days] of conflicts) conflicts.set(bookingId, [...new Set(days)].sort((left, right) => left - right))
  return conflicts
}

function utilizationFor(resourceId: string, reports: components['schemas']['CapacityResponse'][]): number {
  const report = reports.find((candidate) => candidate.resource_id === resourceId)
  return Math.round(Math.max(0, ...((report?.points ?? []).map((point) => Math.max(0, numberValue(point.utilization_percent))))))
}

function locationFor(resource: ResourceResponse): string {
  const location = resource.metadata.location
  return typeof location === 'string' && location.trim() ? location : resource.unit || 'Synthetic environment'
}

function resourceGroup(type: ResourceResponse['type']): string {
  if (type === 'supply_boat') return 'Supply boats'
  if (type === 'test_bay') return 'Test bays'
  if (type === 'lift_crew' || type === 'crane') return 'Lift crews'
  return 'Barges'
}

function resourceKind(type: ResourceResponse['type']): string {
  if (type === 'supply_boat') return 'supply'
  if (type === 'test_bay') return 'test'
  if (type === 'lift_crew' || type === 'crane') return 'crew'
  return 'barge'
}

function timelineStatus(status: string): TimelineJob['status'] {
  if (status === 'complete' || status === 'closed') return 'complete'
  if (status === 'hold' || status === 'blocked') return 'hold'
  if (status === 'active' || status === 'confirmed' || status === 'in_progress' || status === 'planning') return 'progress'
  return 'planned'
}

function toneFor(status: TimelineJob['status']): TimelineTone {
  if (status === 'hold') return 'gray'
  return 'gray'
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>()
  for (const value of values) {
    const group = result.get(key(value))
    if (group) group.push(value)
    else result.set(key(value), [value])
  }
  return result
}

function numberValue(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
