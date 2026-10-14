export type TimelineTone = 'green' | 'red' | 'blue' | 'gray'

export type TimelineJobStatus = 'planned' | 'progress' | 'complete' | 'hold'

export interface TimelineJob {
  id: string
  label: string
  start: number
  span: number
  tone: TimelineTone
  delta?: number
  risk?: boolean
  status?: TimelineJobStatus
  progress?: number
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
}

export interface TimelineDay {
  day: string
  weekday: string
  month: 'September' | 'October'
  monthStart?: boolean
  today?: boolean
}

export interface TimelineRange {
  from: number
  to: number
}
