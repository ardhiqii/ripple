import { useQuery } from '@tanstack/react-query'

import { ApiError, apiTransport } from '@/api/transport'
import type { components } from '@/api/generated/openapi'

import { adaptPlanDetail, type PlanWorkspaceData } from './plan-adapter'

export async function fetchPlanDetail(planId: string): Promise<PlanWorkspaceData> {
  try {
    const payload = await apiTransport.get<components['schemas']['PlanDetailResponse']>(`/api/v1/plans/${encodeURIComponent(planId)}`)
    return adaptPlanDetail(payload)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new Error(error instanceof Error && error.message ? error.message : 'Plan could not be loaded.')
  }
}

export function usePlanDetail(planId?: string) {
  return useQuery({
    queryKey: apiTransport.queryKey('plans', planId),
    queryFn: () => fetchPlanDetail(planId!),
    enabled: Boolean(planId),
  })
}
