import { describe, expect, it } from 'vitest'

import { filterHistoryDecisions, stableHistoryLink } from './history-data'
import { historyFixture, historyFixtureIds } from './history-fixtures'

describe('history data mapper', () => {
  it('filters by available action, nature, job, conditional state, date, actor, and search data', () => {
    const filtered = filterHistoryDecisions(historyFixture.decisions, {
      action: 'approve',
      nature: 'disruption',
      job: 'A-12',
      actor: 'planner.demo',
      conditional: 'conditional',
      from: '2026-09-29',
      to: '2026-09-29',
      q: 'vendor ETA',
    })

    expect(filtered.map((decision) => decision.id)).toEqual([historyFixtureIds.approved])
  })

  it('freezes mapped decisions, details, changes, and timeline records', () => {
    const detail = historyFixture.details[historyFixtureIds.approved]
    expect(Object.isFrozen(historyFixture.decisions[0])).toBe(true)
    expect(Object.isFrozen(detail)).toBe(true)
    expect(Object.isFrozen(detail.changes[0])).toBe(true)
    expect(Object.isFrozen(detail.timeline[0])).toBe(true)
    expect(detail.timeline.map((item) => item.kind)).toEqual([
      'source_received',
      'extraction',
      'agent_run',
      'plans_proposed',
      'reply_or_rejection',
      'selected_option',
      'approval_revalidation',
      'applied_changes',
      'notification_drafts',
    ])
  })

  it('creates a stable route-ready audit link', () => {
    expect(stableHistoryLink('decision/a12')).toBe('/history?decision=decision%2Fa12')
  })
})
