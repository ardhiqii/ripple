import type { components } from '@/api/generated/openapi'

export type PolicySectionId =
  | 'action-registry'
  | 'weight-profiles'
  | 'risk-rules'
  | 'freshness-policy'
  | 'data-sources'
  | 'scenario-assumptions'

export type PolicySearchState = {
  section?: string
  lever?: string
  source?: string
}

export type PolicyApiData = {
  levers: components['schemas']['PolicyLeversResponse']
  profiles: components['schemas']['PolicyProfilesResponse']
  dataHealth: components['schemas']['PolicyDataHealthResponse']
}

export type PolicyLeverView = {
  name: string
  allowed: boolean
  approvalOwner: string | null
  costWeight: string
}

export type WeightProfileView = {
  name: string
  delayWeight: string
  leverCostWeight: string
  movementWeight: string
  riskWeight: string
  isDefault: boolean
}

export type FreshnessPolicyView = {
  asOf: string | null
  staleAfterHours: number | null
}

export type FreshnessState = 'fresh' | 'stale' | 'unknown'

export type DataSourceHealthView = {
  name: string
  lastSuccessfulUpdate: string | null
  freshnessState: FreshnessState
  affectedCount: number
  latestError: string | null
  staleCount: number
}

export type PolicyWorkspaceData = {
  levers: PolicyLeverView[]
  profiles: WeightProfileView[]
  freshnessPolicy: FreshnessPolicyView
  sources: DataSourceHealthView[]
}

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
)

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []

const asString = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

const asBoolean = (value: unknown): boolean => value === true

const freshnessState = (value: unknown): FreshnessState => {
  const state = asString(value)?.toLowerCase()
  return state === 'fresh' || state === 'stale' ? state : 'unknown'
}

const suppliedError = (record: Record<string, unknown>): string | null => (
  asString(record.latest_error ?? record.latestError ?? record.error)
)

export function toPolicyWorkspaceData(data: PolicyApiData): PolicyWorkspaceData {
  const levers = asRecord(data.levers)
  const profiles = asRecord(data.profiles)
  const dataHealth = asRecord(data.dataHealth)

  return {
    levers: asArray(levers.levers).map((rawLever) => {
      const lever = asRecord(rawLever)
      return {
        name: asString(lever.name) ?? 'Unnamed action',
        allowed: asBoolean(lever.allowed),
        approvalOwner: asString(lever.approval),
        costWeight: asString(lever.cost_weight ?? lever.costWeight) ?? '—',
      }
    }),
    profiles: asArray(profiles.profiles).map((rawProfile) => {
      const profile = asRecord(rawProfile)
      const name = asString(profile.name) ?? 'Unnamed profile'
      return {
        name,
        delayWeight: asString(profile.delay_weight ?? profile.delayWeight) ?? '—',
        leverCostWeight: asString(profile.lever_cost_weight ?? profile.leverCostWeight) ?? '—',
        movementWeight: asString(profile.movement_weight ?? profile.movementWeight) ?? '—',
        riskWeight: asString(profile.risk_weight ?? profile.riskWeight) ?? '—',
        isDefault: name === (asString(profiles.default_profile) ?? ''),
      }
    }),
    freshnessPolicy: {
      asOf: asString(dataHealth.as_of ?? dataHealth.asOf),
      staleAfterHours: asNumber(dataHealth.stale_after_hours ?? dataHealth.staleAfterHours),
    },
    sources: asArray(dataHealth.sources).map((rawSource) => {
      const source = asRecord(rawSource)
      return {
        name: asString(source.source_type ?? source.source_name ?? source.sourceName) ?? 'Unknown source',
        lastSuccessfulUpdate: asString(source.latest_updated_at ?? source.latestSuccessfulUpdate ?? source.latest_successful_update),
        freshnessState: freshnessState(source.status ?? source.freshness_state ?? source.freshnessState),
        affectedCount: asNumber(source.item_count ?? source.affected_count ?? source.affectedCount) ?? 0,
        latestError: suppliedError(source),
        staleCount: asNumber(source.stale_count ?? source.staleCount) ?? 0,
      }
    }),
  }
}

export const policySections: ReadonlyArray<{ id: PolicySectionId; label: string }> = [
  { id: 'action-registry', label: 'Action registry' },
  { id: 'weight-profiles', label: 'Weight profiles' },
  { id: 'risk-rules', label: 'Risk rules' },
  { id: 'freshness-policy', label: 'Freshness policy' },
  { id: 'data-sources', label: 'Data sources' },
  { id: 'scenario-assumptions', label: 'Scenario assumptions' },
]

export function isPolicySection(value: string | undefined): value is PolicySectionId {
  return policySections.some((section) => section.id === value)
}
