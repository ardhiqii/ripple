import type { components } from '@/api/generated/openapi'

type ChangeEventExtraction = components['schemas']['ChangeEventExtraction']

export type EventLifecycle =
  | 'draft'
  | 'extracting'
  | 'needs_info'
  | 'ready'
  | 'running'
  | 'options_ready'
  | 'pending_decision'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'failed'

export interface EventInboxItem {
  id: string
  lifecycle: EventLifecycle
  nature: components['schemas']['EventNature']
  cause: string
  rawTextPreview: string
  createdAt: string
  updatedAt: string
  extractionVersion: number
  jobs: string[]
  requestedDate: number | null
  missingInfo: string[]
  sourceSentences: string[]
  extraction: ChangeEventExtraction
  planId?: string
}

export const eventLifecycleMeta: Record<
  EventLifecycle,
  { label: string; primaryAction: string; tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
> = {
  draft: { label: 'Draft', primaryAction: 'Continue', tone: 'neutral' },
  extracting: { label: 'Reading input', primaryAction: 'Open live status', tone: 'info' },
  needs_info: { label: 'Needs clarification', primaryAction: 'Add missing information', tone: 'warning' },
  ready: { label: 'Ready to investigate', primaryAction: 'Start analysis', tone: 'info' },
  running: { label: 'Investigating', primaryAction: 'View live trace', tone: 'info' },
  options_ready: { label: 'Options ready', primaryAction: 'Review plan', tone: 'success' },
  pending_decision: { label: 'Awaiting decision', primaryAction: 'Decide', tone: 'warning' },
  approved: { label: 'Approved', primaryAction: 'View applied changes', tone: 'success' },
  rejected: { label: 'Rejected', primaryAction: 'View reason', tone: 'danger' },
  superseded: { label: 'Superseded', primaryAction: 'Open latest plan', tone: 'neutral' },
  failed: { label: 'Needs attention', primaryAction: 'Retry', tone: 'danger' },
}

const matchesFilter = (value: string | undefined, filter: string | undefined) => {
  if (!filter || filter === 'all') return true
  return value === filter
}

export function filterEventInbox(
  items: EventInboxItem[],
  filters: { nature?: string; state?: string; job?: string; q?: string },
): EventInboxItem[] {
  const query = filters.q?.trim().toLowerCase()

  return items.filter((item) => {
    const matchesNature = matchesFilter(item.nature, filters.nature)
    const matchesState = matchesFilter(item.lifecycle, filters.state)
    const matchesJob = !filters.job || filters.job === 'all' || item.jobs.includes(filters.job)
    const haystack = [
      item.id,
      item.lifecycle,
      eventLifecycleMeta[item.lifecycle].label,
      item.nature,
      item.cause,
      item.rawTextPreview,
      ...item.jobs,
      ...item.missingInfo,
      ...item.sourceSentences,
    ].join(' ').toLowerCase()

    return matchesNature && matchesState && matchesJob && (!query || haystack.includes(query))
  })
}

export function getEventById(items: EventInboxItem[], id: string | undefined): EventInboxItem | undefined {
  if (!id) return undefined
  return items.find((item) => item.id === id)
}

export function createCorrectionPayload(item: EventInboxItem): components['schemas']['ExtractionCorrectionRequest'] {
  // The API uses snake_case for the version field while the inbox view-model uses camelCase.
  return {
    expected_extraction_version: item.extractionVersion,
    extraction: item.extraction,
  }
}

export { eventInboxFixture } from './events-fixtures'
