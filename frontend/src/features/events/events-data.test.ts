import { describe, expect, it } from 'vitest'

import {
  createCorrectionPayload,
  eventInboxFixture,
  eventLifecycleMeta,
  filterEventInbox,
  getEventById,
  type EventLifecycle,
} from './events-data'

const lifecycles: EventLifecycle[] = [
  'draft',
  'extracting',
  'needs_info',
  'ready',
  'running',
  'options_ready',
  'pending_decision',
  'approved',
  'rejected',
  'superseded',
  'failed',
]

describe('event inbox data helpers', () => {
  it('gives every lifecycle a user-facing label and primary action', () => {
    for (const lifecycle of lifecycles) {
      const meta = eventLifecycleMeta[lifecycle]

      expect(meta.label.trim()).not.toBe('')
      expect(meta.primaryAction.trim()).not.toBe('')
    }
  })

  it('filters the inbox by nature, job, and query', () => {
    const natureTarget = eventInboxFixture[0]
    const natureMatches = filterEventInbox(eventInboxFixture, { nature: natureTarget.nature })
    expect(natureMatches.length).toBeGreaterThan(0)
    expect(natureMatches.every((item) => item.nature === natureTarget.nature)).toBe(true)

    const jobTarget = eventInboxFixture.find((item) => item.jobs.length > 0)
    expect(jobTarget).toBeDefined()
    const job = jobTarget?.jobs[0]
    const jobMatches = filterEventInbox(eventInboxFixture, { job })
    expect(jobMatches).toContain(jobTarget)

    const queryTarget = eventInboxFixture.find((item) => item.cause || item.rawTextPreview) ?? natureTarget
    const searchableText = queryTarget.cause || queryTarget.rawTextPreview
    const query = searchableText.split(/\s+/)[0]
    const queryMatches = filterEventInbox(eventInboxFixture, { q: query })
    expect(queryMatches).toContain(queryTarget)
  })

  it('looks up an event by id and returns undefined for an unknown id', () => {
    const event = eventInboxFixture[0]

    expect(getEventById(eventInboxFixture, event.id)).toBe(event)
    expect(getEventById(eventInboxFixture, 'event-does-not-exist')).toBeUndefined()
  })

  it('creates a generated correction payload with the current version and extraction', () => {
    const event = eventInboxFixture.find((item) => item.lifecycle !== 'failed') ?? eventInboxFixture[0]
    const payload = createCorrectionPayload(event)

    expect(payload).toMatchObject({
      expected_extraction_version: event.extractionVersion,
      extraction: expect.any(Object),
    })
  })

  it('keeps failed extraction on retry or error handling, never plan review', () => {
    const failedAction = eventLifecycleMeta.failed.primaryAction

    expect(failedAction).not.toMatch(/review\s+(plan|options)/i)
    expect(failedAction).toMatch(/retry|error/i)
  })
})
