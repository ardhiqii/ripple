import type { components } from '@/api/generated/openapi'

import type { EventInboxItem, EventLifecycle } from './events-data'

type ChangeEventExtraction = components['schemas']['ChangeEventExtraction']

const receivedAt = '2026-10-13T08:00:00Z'

const extraction = (values: Partial<ChangeEventExtraction> & Pick<ChangeEventExtraction, 'source_excerpt'>): ChangeEventExtraction => ({
  ...values,
})

const makeEvent = (values: Omit<EventInboxItem, 'extraction'> & { extraction?: ChangeEventExtraction }): EventInboxItem => ({
  ...values,
  extraction: values.extraction ?? extraction({
    nature: values.nature,
    cause: values.cause,
    job_ids: values.jobs,
    requested_start: values.requestedDate ?? undefined,
    missing_info: values.missingInfo,
    source_excerpt: values.sourceSentences[0] ?? values.rawTextPreview,
  }),
})

const common = {
  createdAt: receivedAt,
  updatedAt: receivedAt,
  extractionVersion: 1,
  requestedDate: 6,
  missingInfo: [],
  sourceSentences: ['Synthetic fixture message for the Change Inbox.'],
}

export const eventInboxFixture: EventInboxItem[] = [
  makeEvent({
    ...common,
    id: 'event-draft-a12',
    lifecycle: 'draft',
    nature: 'request',
    cause: 'Planner has started a new schedule change request.',
    rawTextPreview: 'Please move the A-12 test window to D+6.',
    jobs: ['A-12'],
  }),
  makeEvent({
    ...common,
    id: 'event-extracting-weather',
    lifecycle: 'extracting',
    nature: 'disruption',
    cause: 'Weather message is being read.',
    rawTextPreview: 'Wave conditions may delay the West Alpha transfer.',
    jobs: ['D-07'],
    requestedDate: null,
  }),
  makeEvent({
    ...common,
    id: 'event-needs-info-vendor',
    lifecycle: 'needs_info',
    nature: 'disruption',
    cause: 'The vendor update does not include a confirmed ETA.',
    rawTextPreview: 'Vendor can mobilize soon, but the exact arrival day is unclear.',
    jobs: ['A-12'],
    missingInfo: ['Confirmed arrival day'],
  }),
  makeEvent({
    ...common,
    id: 'event-ready-a12',
    lifecycle: 'ready',
    nature: 'request',
    cause: 'Requested test-window change is ready for investigation.',
    rawTextPreview: 'Move the A-12 test window to D+6 if the barge remains available.',
    jobs: ['A-12'],
  }),
  makeEvent({
    ...common,
    id: 'event-running-d07',
    lifecycle: 'running',
    nature: 'disruption',
    cause: 'Vendor reported a three-day slip and a seal finding on the D-07 pump test.',
    rawTextPreview: 'Vendor email: D-07 pump test slips three days; ETA is D+9 to D+10 with medium confidence, and the vendor reports a seal finding.',
    jobs: ['D-07'],
    requestedDate: 9,
    sourceSentences: ['ETA is D+9 to D+10 with medium confidence; the vendor reports a seal finding.'],
    extraction: extraction({
      nature: 'disruption',
      cause: 'vendor delay and seal finding',
      job_ids: ['D-07'],
      objective: 'Replan D-07 around the vendor delay',
      requested_start: 9,
      eta_updates: [{
        job_id: 'D-07',
        stage: 'function_test',
        eta_earliest: 9,
        eta_latest: 10,
        source_excerpt: 'ETA is D+9 to D+10 with medium confidence',
      }],
      risk_tags: [{
        tag: 'quality_finding',
        source_excerpt: 'the vendor reports a seal finding',
        object_id: 'D-07-function-test',
      }],
      source_excerpt: 'Vendor email: D-07 pump test slips three days; ETA is D+9 to D+10 with medium confidence, and the vendor reports a seal finding.',
    }),
  }),
  makeEvent({
    ...common,
    id: 'event-options-a12',
    lifecycle: 'options_ready',
    nature: 'request',
    cause: 'The solver produced schedule options for A-12.',
    rawTextPreview: 'Review options for moving the A-12 test window.',
    jobs: ['A-12'],
    planId: 'plan-a12-001',
  }),
  makeEvent({
    ...common,
    id: 'event-pending-d07',
    lifecycle: 'pending_decision',
    nature: 'disruption',
    cause: 'A recovery option is waiting for planner confirmation.',
    rawTextPreview: 'Choose how to handle the D-07 transfer delay.',
    jobs: ['D-07'],
    planId: 'plan-d07-001',
  }),
  makeEvent({
    ...common,
    id: 'event-approved-a12',
    lifecycle: 'approved',
    nature: 'request',
    cause: 'The selected A-12 schedule option was applied.',
    rawTextPreview: 'A-12 test window moved after planner approval.',
    jobs: ['A-12'],
    planId: 'plan-a12-approved',
  }),
  makeEvent({
    ...common,
    id: 'event-rejected-d07',
    lifecycle: 'rejected',
    nature: 'disruption',
    cause: 'The proposed recovery option was rejected; the vendor disruption remains active.',
    rawTextPreview: 'D-07 vendor delay and seal finding remain recorded after the recovery option was rejected.',
    jobs: ['D-07'],
    planId: 'plan-d07-rejected',
  }),
  makeEvent({
    ...common,
    id: 'event-superseded-a12',
    lifecycle: 'superseded',
    nature: 'request',
    cause: 'A newer A-12 request replaced this event.',
    rawTextPreview: 'This earlier A-12 request has a newer plan.',
    jobs: ['A-12'],
    planId: 'plan-a12-latest',
  }),
  makeEvent({
    ...common,
    id: 'event-failed-weather',
    lifecycle: 'failed',
    nature: 'disruption',
    cause: 'Extraction could not identify a usable operating date.',
    rawTextPreview: 'Weather note could not be interpreted for planning.',
    jobs: ['D-07'],
    missingInfo: ['Operating date or ETA'],
  }),
]

export type { EventLifecycle }
