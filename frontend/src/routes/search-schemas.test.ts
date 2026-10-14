import { describe, expect, it } from 'vitest'

import {
  changesSearchSchema,
  decisionSearchSchema,
  demoSearchSchema,
  historySearchSchema,
  policySearchSchema,
  readinessSearchSchema,
  timelineSearchSchema,
} from './search-schemas'

describe('route search validation', () => {
  it('normalizes invalid timeline ranges and list values to safe defaults', () => {
    expect(timelineSearchSchema({ from: 'not-a-day', to: -1, groups: {}, vendors: 42 })).toEqual({
      from: 0,
      to: 14,
      groups: [],
      vendors: [],
      status: undefined,
      job: undefined,
      zoom: undefined,
    })
  })

  it('drops invalid scalar values without throwing on operational routes', () => {
    expect(readinessSearchSchema({ risk: 123, job: 'A-12' })).toEqual({ job: 'A-12' })
    expect(changesSearchSchema({ nature: {}, q: 'weather' })).toEqual({ q: 'weather' })
    expect(decisionSearchSchema({ tab: [], option: 'plan-1' })).toEqual({ option: 'plan-1' })
    expect(historySearchSchema({ action: true })).toEqual({})
    expect(demoSearchSchema({ step: {}, mode: 'guided' })).toEqual({ mode: 'guided' })
    expect(policySearchSchema({ section: [], source: 'policy-pack' })).toEqual({ source: 'policy-pack' })
  })
})
