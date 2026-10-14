// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EventPreview } from '@/components/changes/event-preview'
import { eventInboxFixture, eventLifecycleMeta, filterEventInbox, getEventById } from '@/features/events/events-data'
import { historyFixture, historyFixtureIds } from '@/features/history/history-fixtures'
import { initialReadinessRows, riskForRow } from '@/features/readiness/readiness-data'

afterEach(() => cleanup())

describe('INT-05 D-07 disruption frontend fixtures', () => {
  it('keeps the underlying vendor disruption visible after a recovery option is rejected', () => {
    const source = getEventById(eventInboxFixture, 'event-running-d07')

    expect(source).toMatchObject({
      id: 'event-running-d07',
      nature: 'disruption',
      jobs: ['D-07'],
    })
    expect(source?.rawTextPreview).toMatch(/D-07|delay/i)
    expect(filterEventInbox(eventInboxFixture, { nature: 'disruption', job: 'D-07' })).toContainEqual(source)
    expect(source ? eventLifecycleMeta[source.lifecycle].label : '').not.toMatch(/deleted/i)

    render(<EventPreview item={source} onClose={vi.fn()} onPrimaryAction={vi.fn()} onEditExtraction={vi.fn()} onOpenPlan={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'event-running-d07' })).toBeInTheDocument()
    expect(screen.getByText(source!.rawTextPreview)).toBeInTheDocument()
    expect(screen.queryByText(/deleted/i)).not.toBeInTheDocument()
  })

  it('preserves the D-07 vendor disruption nature and source evidence in the rejected recovery record', () => {
    const d07Disruptions = filterEventInbox(eventInboxFixture, { nature: 'disruption', job: 'D-07' })
    const rejectedRecovery = getEventById(eventInboxFixture, 'event-rejected-d07')
    const rejectedDecision = historyFixture.details[historyFixtureIds.rejected]?.decision

    expect(d07Disruptions.some((event) => event.sourceSentences.some((sentence) => /vendor/i.test(sentence)))).toBe(true)
    expect(rejectedRecovery).toMatchObject({ nature: 'disruption', jobs: ['D-07'] })
    expect(rejectedDecision).toMatchObject({ eventNature: 'disruption', jobs: ['D-07'] })
  })

  it('represents the disruption ETA range, risk context, and stale-data state in readiness data', () => {
    const d07 = initialReadinessRows.find((row) => row.job_id === 'D-07')

    expect(d07).toBeDefined()
    expect(d07).toMatchObject({
      eta_earliest: expect.any(Number),
      eta_latest: expect.any(Number),
      confidence: 'low',
      stale: true,
    })
    expect(riskForRow(d07!)).not.toBe('on_track')
  })

  it('links D-07 rejection and reply to the same replan lineage instead of deleting the disruption', () => {
    const d07Decisions = historyFixture.decisions.filter((decision) => decision.jobs.includes('D-07'))
    const rejected = historyFixture.details[historyFixtureIds.rejected]?.decision
    const reply = d07Decisions.find((decision) => decision.action === 'reply')

    expect(d07Decisions).toHaveLength(2)
    expect(rejected).toMatchObject({
      action: 'reject',
      eventId: expect.any(String),
      planId: expect.any(String),
    })
    expect(reply).toMatchObject({
      action: 'reply',
      eventId: expect.any(String),
      planId: expect.any(String),
      planVersion: expect.any(Number),
    })
    expect(reply?.eventId).not.toBe(rejected?.eventId)
    expect(reply?.planId).not.toBe(rejected?.planId)
    expect(reply?.planVersion).toBeGreaterThan(rejected?.planVersion ?? 0)
    expect(historyFixture.details[historyFixtureIds.rejected]?.timeline.some((event) => event.kind === 'reply_or_rejection' && event.recorded)).toBe(true)
  })
})
