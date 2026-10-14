import { z } from 'zod'

const optionalString = z.string().trim().min(1).optional().catch(undefined)
const searchString = z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1))
const stringList = z.preprocess(
  (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
  z.array(searchString),
).catch([])
const nonNegativeInteger = (fallback: number) => z.preprocess(
  (value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value),
  z.number().int().min(0),
).catch(fallback)

function parseSafely<T>(schema: z.ZodType<T>, search: Record<string, unknown>, fallback: T): T {
  const result = schema.safeParse(search)
  return result.success ? result.data : fallback
}

export type TimelineSearch = {
  from: number
  to: number
  groups: string[]
  vendors: string[]
  status?: string
  q?: string
  job?: string
  zoom?: string
}

const timelineDefaults: TimelineSearch = { from: 0, to: 14, groups: [], vendors: [], status: undefined, job: undefined, zoom: undefined }
const timelineSchema = z.object({
  from: nonNegativeInteger(timelineDefaults.from),
  to: nonNegativeInteger(timelineDefaults.to),
  groups: stringList,
  vendors: stringList,
  status: optionalString,
  q: optionalString,
  job: optionalString,
  zoom: optionalString,
}).transform((value) => value.to >= value.from ? value : timelineDefaults)

export const timelineSearchSchema = (search: Record<string, unknown>): TimelineSearch => {
  const result = timelineSchema.safeParse(search)
  return result.success ? result.data : timelineDefaults
}

export type ReadinessSearch = {
  risk?: string
  job?: string
  vendor?: string
  stage?: string
  confidence?: string
  freshness?: string
  item?: string
  group?: string
  q?: string
}

const readinessSchema = z.object({
  risk: optionalString,
  job: optionalString,
  vendor: optionalString,
  stage: optionalString,
  confidence: optionalString,
  freshness: optionalString,
  item: optionalString,
  group: optionalString,
  q: optionalString,
})
export const readinessSearchSchema = (search: Record<string, unknown>): ReadinessSearch => parseSafely(readinessSchema, search, {})

export type ChangesSearch = { nature?: string; state?: string; job?: string; q?: string; event?: string }
const changesSchema = z.object({ nature: optionalString, state: optionalString, job: optionalString, q: optionalString, event: optionalString })
export const changesSearchSchema = (search: Record<string, unknown>): ChangesSearch => parseSafely(changesSchema, search, {})

export type DecisionSearch = { tab?: string; run?: string; option?: string; compare?: string; evidence?: string }
const decisionSchema = z.object({ tab: optionalString, run: optionalString, option: optionalString, compare: optionalString, evidence: optionalString })
export const decisionSearchSchema = (search: Record<string, unknown>): DecisionSearch => parseSafely(decisionSchema, search, {})

export type HistorySearch = { action?: string; nature?: string; job?: string; actor?: string; conditional?: string; from?: string; to?: string; q?: string; decision?: string }
const historySchema = z.object({ action: optionalString, nature: optionalString, job: optionalString, actor: optionalString, conditional: optionalString, from: optionalString, to: optionalString, q: optionalString, decision: optionalString })
export const historySearchSchema = (search: Record<string, unknown>): HistorySearch => parseSafely(historySchema, search, {})

export type DemoSearch = { scenario?: string; mode?: string; step?: string }
const demoSchema = z.object({ scenario: optionalString, mode: optionalString, step: optionalString })
export const demoSearchSchema = (search: Record<string, unknown>): DemoSearch => parseSafely(demoSchema, search, {})

export type PolicySearch = { section?: string; lever?: string; source?: string }
const policySchema = z.object({ section: optionalString, lever: optionalString, source: optionalString })
export const policySearchSchema = (search: Record<string, unknown>): PolicySearch => parseSafely(policySchema, search, {})
