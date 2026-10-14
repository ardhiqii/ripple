import { describe, expect, it } from 'vitest'

import type { PolicyApiData } from './policy-data'
import { toPolicyWorkspaceData } from './policy-data'

describe('toPolicyWorkspaceData', () => {
  it('maps generated policy responses without inventing missing sections', () => {
    const data: PolicyApiData = {
      levers: {
        levers: [
          { name: 'expedite', allowed: true, approval: 'planner', cost_weight: 2 },
          { name: 'cancel_job', allowed: false, approval: 'never', cost_weight: 100 },
        ],
      },
      profiles: {
        default_profile: 'balanced',
        profiles: [{ name: 'balanced', delay_weight: 1, lever_cost_weight: 2, movement_weight: 3, risk_weight: 4 }],
      },
      dataHealth: {
        as_of: '2026-10-13T10:00:00Z',
        stale_after_hours: 48,
        sources: [{ source_type: 'vendor_update', item_count: 3, latest_updated_at: '2026-10-13T09:00:00Z', stale_count: 1, status: 'stale', latest_error: 'API timeout' }],
      },
    }

    expect(toPolicyWorkspaceData(data)).toEqual({
      levers: [
        { name: 'expedite', allowed: true, approvalOwner: 'planner', costWeight: '2' },
        { name: 'cancel_job', allowed: false, approvalOwner: 'never', costWeight: '100' },
      ],
      profiles: [{ name: 'balanced', delayWeight: '1', leverCostWeight: '2', movementWeight: '3', riskWeight: '4', isDefault: true }],
      freshnessPolicy: { asOf: '2026-10-13T10:00:00Z', staleAfterHours: 48 },
      sources: [{ name: 'vendor_update', lastSuccessfulUpdate: '2026-10-13T09:00:00Z', freshnessState: 'stale', affectedCount: 3, latestError: 'API timeout', staleCount: 1 }],
    })
  })

  it('normalizes absent optional health values to explicit read-only states', () => {
    const data: PolicyApiData = {
      levers: { levers: [] },
      profiles: { default_profile: 'balanced', profiles: [] },
      dataHealth: { as_of: 'not-a-date', stale_after_hours: undefined, sources: [{ source_type: 'unknown', item_count: undefined, latest_updated_at: null, stale_count: undefined, status: 'degraded' }] },
    }

    const mapped = toPolicyWorkspaceData(data)
    expect(mapped.freshnessPolicy.staleAfterHours).toBeNull()
    expect(mapped.sources[0]).toMatchObject({ freshnessState: 'unknown', affectedCount: 0, latestError: null, lastSuccessfulUpdate: null })
  })
})
