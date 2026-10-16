export type TimelineTone = 'green' | 'red' | 'blue' | 'gray'

export type TimelineJobStatus = 'planned' | 'progress' | 'complete' | 'hold'

export interface TimelineJob {
  id: string
  label: string
  start: number
  span: number
  tone: TimelineTone
  bookingId?: string
  delta?: number
  risk?: boolean
  conflict?: boolean
  conflictDays?: number[]
  status?: TimelineJobStatus
  progress?: number
}

export type TimelineUnavailabilityKind = 'maintenance' | 'unavailable'

export interface TimelineUnavailability {
  id: string
  start: number
  span: number
  kind: TimelineUnavailabilityKind
  reason: string
}

export interface TimelineWeather {
  day: number
  location: string
  metric: string
  value?: number
  go?: boolean
  source: string
}

export interface TimelineResource {
  id: string
  name: string
  code: string
  group: string
  kind: string
  utilization: number
  location: string
  jobs: TimelineJob[]
  unavailability?: TimelineUnavailability[]
  active?: boolean
}

export interface TimelineDay {
  day: string
  weekday: string
  month: string
  year?: number
  monthStart?: boolean
  today?: boolean
  weather?: TimelineWeather[]
}

export interface TimelineRange {
  from: number
  to: number
}

export interface TimelineSchedule {
  scenarioId: string
  version: number
  scenarioStartDate?: string
  days: TimelineDay[]
  resources: TimelineResource[]
  capacity: TimelineCapacityReport[]
  weather?: TimelineWeather[]
}

export interface TimelineCapacityPoint {
  resourceId: string
  day: number
  used: number
  capacity: number
  overflow: number
  utilizationPercent: number
  bookingIds: string[]
}

export interface TimelineCapacityReport {
  resourceId: string
  unit: string
  points: TimelineCapacityPoint[]
}
