import type { components } from '@/api/generated/openapi'

type ChangeEventExtraction = components['schemas']['ChangeEventExtraction']

export type EventLifecycle =
  | 'draft'
  | 'extracting'
  | 'needs_info'
  | 'ready'
  | 'running'
  | 'pending_plan'
  | 'options_ready'
  | 'pending_decision'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'stale'
  | 'integrity_error'
  | 'failed'

export interface EventInboxItem {
  id: string
  lifecycle: EventLifecycle
  nature: components['schemas']['EventNature'] | null
  cause: string | null
  rawTextPreview: string
  createdAt: string
  updatedAt: string
  extractionVersion: number
  jobs: string[]
  requestedDate: number | null
  missingInfo: string[]
  sourceSentences: string[]
  extraction?: ChangeEventExtraction
  planId?: string
  pendingPlan?: boolean
  serverState?: string
  runId?: string
}

export const eventLifecycleMeta: Record<
  EventLifecycle,
  { label: string; primaryAction: string; tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
> = {
  draft: { label: 'Draft', primaryAction: 'Continue', tone: 'neutral' },
  extracting: { label: 'Reading input', primaryAction: 'Open live status', tone: 'info' },
  needs_info: { label: 'Needs clarification', primaryAction: 'Add missing information', tone: 'warning' },
  ready: { label: 'Ready to investigate', primaryAction: 'Start analysis', tone: 'info' },
  running: { label: 'Investigating', primaryAction: 'Open live status', tone: 'info' },
  pending_plan: { label: 'Plan pending', primaryAction: 'Open event', tone: 'info' },
  options_ready: { label: 'Options ready', primaryAction: 'Review plan', tone: 'success' },
  pending_decision: { label: 'Awaiting decision', primaryAction: 'Decide', tone: 'warning' },
  approved: { label: 'Approved', primaryAction: 'View applied changes', tone: 'success' },
  rejected: { label: 'Rejected', primaryAction: 'View reason', tone: 'danger' },
  superseded: { label: 'Superseded', primaryAction: 'Open latest plan', tone: 'neutral' },
  stale: { label: 'Stale plan', primaryAction: 'Review latest plan', tone: 'warning' },
  integrity_error: { label: 'Integrity issue', primaryAction: 'Open event', tone: 'danger' },
  failed: { label: 'Needs attention', primaryAction: 'Retry', tone: 'danger' },
}

export type EventState = components['schemas']['EventState']

export const eventStateMeta: Record<EventState, { label: string; lifecycle: EventLifecycle }> = {
  received: { label: 'Draft', lifecycle: 'draft' },
  planning: { label: 'Reading input', lifecycle: 'extracting' },
  clarification_needed: { label: 'Needs clarification', lifecycle: 'needs_info' },
  extracted: { label: 'Ready to investigate', lifecycle: 'ready' },
  closed: { label: 'Closed', lifecycle: 'integrity_error' },
}

const matchesFilter = (value: string | null | undefined, filter: string | null | undefined) => {
  if (!filter || filter === 'all') return true
  return value === filter
}

export function filterEventInbox(
  items: EventInboxItem[],
  filters: { nature?: string | null; state?: string; job?: string; q?: string },
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
      item.nature ?? '',
      item.cause ?? '',
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
  if (!item.extraction) throw new Error('This event does not have a server extraction to correct.')
  return {
    expected_extraction_version: item.extractionVersion,
    extraction: item.extraction,
  }
}

export { eventInboxFixture } from './events-fixtures'
