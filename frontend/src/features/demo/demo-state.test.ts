import { describe, expect, it } from 'vitest'

import {
  clearDemoLocalState,
  describeDemoLocalState,
  demoResetCleanupPlan,
} from './demo-state'

function storage(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
    removeItem: (key: string) => { delete values[key] },
  }
}

describe('demo local state helpers', () => {
  it('describes local drafts, comparison state, highlights, and active runs', () => {
    const local = storage({ 'ripple.demo.draft': 'draft', 'ripple.demo.comparison': 'pair' })
    const session = storage({ 'ripple.active-runs': 'run' })

    expect(describeDemoLocalState({ local, session }).filter((item) => item.present).map((item) => item.key)).toEqual([
      'ripple.demo.draft',
      'ripple.demo.comparison',
      'ripple.active-runs',
    ])
  })

  it('clears only known state after a successful reset and preserves cleanup semantics on failure', () => {
    const local = storage({ 'ripple.demo.draft': 'draft', 'ripple.demo.highlights': 'highlight' })
    const session = storage({ 'ripple.active-runs': 'run' })
    const result = clearDemoLocalState({ local, session })

    expect(result.failed).toHaveLength(0)
    expect(result.cleared.map((item) => item.key)).toEqual([
      'ripple.demo.draft',
      'ripple.demo.highlights',
      'ripple.active-runs',
    ])
    expect(describeDemoLocalState({ local, session }).some((item) => item.present)).toBe(false)
    expect(demoResetCleanupPlan.clearQueryCache).toBe(true)
    expect(demoResetCleanupPlan.preserveUiOnFailure).toBe(true)
  })
})
