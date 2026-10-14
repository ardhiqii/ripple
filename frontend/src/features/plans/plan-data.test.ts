import { describe, expect, it } from 'vitest'

import {
  findOption,
  isOptionSelectable,
  optionMetricValue,
  planWorkspaceById,
} from './plan-data'

const a12PlanId = '00000000-0000-0000-0000-000000000201'
const infeasiblePlanId = '00000000-0000-0000-0000-000000000202'
const fallbackPlanId = '00000000-0000-0000-0000-000000000203'

describe('plan workspace data helpers', () => {
  it('maps the recorded fixture variants into review data', () => {
    const a12 = planWorkspaceById(a12PlanId)
    const infeasible = planWorkspaceById(infeasiblePlanId)
    const fallback = planWorkspaceById(fallbackPlanId)

    expect(a12).toMatchObject({
      id: a12PlanId,
      eventId: '00000000-0000-0000-0000-000000000012',
      verdict: 'conditional',
      status: 'proposed',
    })
    expect(a12.options).toHaveLength(3)
    expect(infeasible.verdict).toBe('infeasible')
    expect(infeasible.recommendedOptionId).toBeNull()
    expect(fallback.explanation.numeric_check).toEqual({ status: 'fallback', mismatches: [] })
  })

  it('finds the selected option without creating child selection state', () => {
    const workspace = planWorkspaceById(a12PlanId)
    const option = findOption(workspace, '00000000-0000-0000-0000-000000000212')

    expect(option).toMatchObject({
      id: '00000000-0000-0000-0000-000000000212',
      label: 'Hold A-12 until D+7',
    })
    expect(findOption(workspace, 'missing-option')).toBeUndefined()
  })

  it('allows only feasible options without violations to be selected', () => {
    const workspace = planWorkspaceById(a12PlanId)
    const feasible = findOption(workspace, '00000000-0000-0000-0000-000000000211')
    const infeasible = findOption(workspace, '00000000-0000-0000-0000-000000000213')

    expect(feasible).toBeDefined()
    expect(infeasible).toBeDefined()
    expect(isOptionSelectable(feasible!)).toBe(true)
    expect(isOptionSelectable(infeasible!)).toBe(false)
  })

  it('returns option KPI and review metrics with safe null fallbacks', () => {
    const workspace = planWorkspaceById(a12PlanId)
    const option = workspace.options[0]
    const infeasible = workspace.options[2]

    expect(optionMetricValue(option, 'jobs_moved')).toBe(1)
    expect(optionMetricValue(option, 'objective_value')).toBe(12.5)
    expect(optionMetricValue(option, 'solver_status')).toBe('feasible')
    expect(optionMetricValue(option, 'conditions')).toBe(1)
    expect(optionMetricValue(infeasible, 'objective_value')).toBeNull()
    expect(optionMetricValue(option, 'unknown_metric')).toBeNull()
  })
})
