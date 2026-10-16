import { describe, expect, it } from 'vitest'

import { eventsFixture, readinessFixture } from '@/mocks/fixtures'
import { createHistoryViewData } from '@/features/history/history-data'
import { historyDetailFixtures, historyListFixture } from '@/features/history/history-fixtures'

describe('generated-contract compatibility fixtures', () => {
  it('keeps list totals and linked decision detail metadata consistent', () => {
    expect(historyListFixture.total_count).toBe(historyListFixture.decisions.length)

    for (const decision of historyListFixture.decisions) {
      const detail = historyDetailFixtures[String(decision.id) as keyof typeof historyDetailFixtures]
      expect(detail).toBeDefined()
      expect(detail.event_id).toBe(decision.event_id)
      expect(detail.job_ids).toEqual(decision.job_ids)
      expect(detail.plan_version).toBe(decision.plan_version)
      expect(detail.event_nature).toBe(decision.event_nature)
    }
  })

  it('keeps event lifecycle and readiness counts scoped to their fixture results', () => {
    const lifecycleTotal = Object.values(eventsFixture.scenario_lifecycle_counts as Record<string, unknown>)
      .reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)

    expect(eventsFixture.total_count).toBe(eventsFixture.events.length)
    expect(lifecycleTotal).toBe(eventsFixture.events.length)
    expect(readinessFixture.total_count).toBe(readinessFixture.items.length)
  })

  it('preserves the explicit empty history fallback shape', () => {
    const empty = createHistoryViewData({ decisions: [], next_cursor: null, total_count: 0 }, {})

    expect(empty.decisions).toEqual([])
    expect(empty.details).toEqual({})
    expect(empty.summary.total).toBe(0)
  })
})
