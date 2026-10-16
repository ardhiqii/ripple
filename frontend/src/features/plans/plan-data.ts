import { a12PlanFixture, infeasiblePlanFixture, numericFallbackPlanFixture } from '@/mocks/plan-fixtures'

import { adaptPlanDetail, type PlanWorkspaceData } from './plan-adapter'

export {
  findOption,
  isOptionSelectable,
  optionMetricValue,
} from './plan-adapter'
export type {
  PlanChange,
  PlanCondition,
  PlanEvidenceView,
  PlanLineageView,
  PlanOptionView,
  PlanWorkspaceData,
} from './plan-adapter'

function fixtureForPlan(planId: string) {
  if (planId === infeasiblePlanFixture.id) return infeasiblePlanFixture
  if (planId === numericFallbackPlanFixture.id) return numericFallbackPlanFixture
  return a12PlanFixture
}

/** Test-only compatibility helper. Live routes use fetchPlanDetail instead. */
export function planWorkspaceById(planId: string): PlanWorkspaceData {
  return adaptPlanDetail(fixtureForPlan(planId))
}
