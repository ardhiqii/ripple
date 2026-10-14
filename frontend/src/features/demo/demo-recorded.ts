import type { components } from '@/api/generated/openapi'

import {
  DEMO_SCENARIO_IDS,
  type DemoScenarioId,
} from './demo-data'

type PublicRunEventResponse = components['schemas']['PublicRunEventResponse']

export interface RecordedToolCall {
  tool: string
  summary: string
}

export interface RecordedDemoFixture {
  schemaVersion: string
  promptVersion: string
  modelFamily: string
  scenarioId: DemoScenarioId
  seedVersion: string
  modelOutput: Record<string, unknown>
  toolCalls: readonly RecordedToolCall[]
  events: readonly PublicRunEventResponse[]
}

const baseEvents = [
  event('11111111-1111-4111-8111-111111111101', 1, 'run_started', 'intake', { summary: 'Recorded A-12 base run started.' }),
  event('11111111-1111-4111-8111-111111111101', 2, 'step', 'investigation', { summary: 'Readiness, capacity, and policy checks completed.' }),
  event('11111111-1111-4111-8111-111111111101', 3, 'plan', 'complete', { summary: 'Verified conditional recovery options are ready for review.', option_count: 3 }),
  event('11111111-1111-4111-8111-111111111101', 4, 'done', 'complete', { status: 'completed', summary: 'Recorded A-12 base run completed.' }),
] satisfies PublicRunEventResponse[]

const constrainedEvents = [
  event('22222222-2222-4222-8222-222222222202', 1, 'run_started', 'intake', { summary: 'Recorded A-12 constrained run started.' }),
  event('22222222-2222-4222-8222-222222222202', 2, 'step', 'investigation', { summary: 'The constrained vendor sentence ruled out expedite_vendor_test.' }),
  event('22222222-2222-4222-8222-222222222202', 3, 'plan', 'complete', { summary: 'No earlier feasible recovery option is available.', option_count: 1 }),
  event('22222222-2222-4222-8222-222222222202', 4, 'done', 'complete', { status: 'completed', summary: 'Recorded A-12 constrained run completed.' }),
] satisfies PublicRunEventResponse[]

export const recordedDemoFixtures: Record<DemoScenarioId, RecordedDemoFixture> = {
  [DEMO_SCENARIO_IDS.base]: {
    schemaVersion: '1',
    promptVersion: 'intake-v1',
    modelFamily: 'gemini-recorded',
    scenarioId: DEMO_SCENARIO_IDS.base,
    seedVersion: 'offshore-a12-v1',
    modelOutput: {
      nature: 'disruption',
      cause: 'vendor delay',
      job_ids: ['A-12'],
      requested_start: 3,
      hard_constraints: [{ type: 'lock_job', target: 'B-05' }],
      levers_ruled_out: [],
    },
    toolCalls: [
      { tool: 'get_schedule', summary: 'Loaded the A-12 schedule snapshot.' },
      { tool: 'check_readiness', summary: 'A-12 can start no earlier than D+7 under current evidence.' },
      { tool: 'optimize', summary: 'Compared verified recovery options.' },
    ],
    events: baseEvents,
  },
  [DEMO_SCENARIO_IDS.constrained]: {
    schemaVersion: '1',
    promptVersion: 'intake-v1',
    modelFamily: 'gemini-recorded',
    scenarioId: DEMO_SCENARIO_IDS.constrained,
    seedVersion: 'offshore-a12-v1',
    modelOutput: {
      nature: 'disruption',
      cause: 'vendor delay',
      job_ids: ['A-12'],
      requested_start: 3,
      hard_constraints: [{ type: 'lock_job', target: 'B-05' }],
      levers_ruled_out: [{ lever: 'expedite_vendor_test', target: 'A-12 test bay' }],
    },
    toolCalls: [
      { tool: 'get_schedule', summary: 'Loaded the same A-12 schedule snapshot.' },
      { tool: 'check_readiness', summary: 'The vendor sentence blocks the expedite path.' },
      { tool: 'optimize', summary: 'Compared remaining verified recovery options.' },
    ],
    events: constrainedEvents,
  },
}

export function recordedEventsAfter(scenarioId: DemoScenarioId, sequence = 0): PublicRunEventResponse[] {
  return recordedDemoFixtures[scenarioId].events.filter((event) => (numberValue(event.seq) ?? -1) > sequence)
}

export interface RecordedSseFrame {
  id: string
  event: string
  data: string
}

export function recordedEventToSseFrame(event: PublicRunEventResponse, fallbackRunId?: string): RecordedSseFrame | null {
  const sequence = numberValue(event.seq)
  const runId = stringValue(event.run_id) ?? fallbackRunId
  const type = stringValue(event.type)
  if (sequence === undefined || !runId || !type) return null

  const payload = {
    run_id: runId,
    seq: sequence,
    type,
    timestamp: stringValue(event.timestamp) ?? '',
    phase: stringValue(event.phase) ?? null,
    public: recordValue(event.public),
  }
  return { id: String(sequence), event: type, data: JSON.stringify(payload) }
}

export function serializeRecordedSseFrame(frame: RecordedSseFrame): string {
  return `id: ${frame.id}\nevent: ${frame.event}\ndata: ${frame.data}\n\n`
}

export function recordedSseFixture(scenarioId: DemoScenarioId, sequence = 0): string {
  return recordedEventsAfter(scenarioId, sequence)
    .map((event) => recordedEventToSseFrame(event))
    .filter((frame): frame is RecordedSseFrame => frame !== null)
    .map(serializeRecordedSseFrame)
    .join('')
}

export function mapRecordedSseFrameToEvent(frame: string, fallbackRunId: string): PublicRunEventResponse | null {
  const fields = new Map<string, string[]>()
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const key = separator === -1 ? line : line.slice(0, separator)
    const value = (separator === -1 ? '' : line.slice(separator + 1)).trimStart()
    fields.set(key, [...(fields.get(key) ?? []), value])
  }

  const data = fields.get('data')?.join('\n')
  if (!data) return null
  try {
    const payload: unknown = JSON.parse(data)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const candidate = payload as Record<string, unknown>
    const sequence = numberValue(candidate.seq) ?? numberValue(fields.get('id')?.[0])
    const runId = stringValue(candidate.run_id) ?? fallbackRunId
    const type = stringValue(candidate.type) ?? fields.get('event')?.[0]
    const publicPayload = candidate.public
    if (sequence === undefined || !runId || !type || !publicPayload || typeof publicPayload !== 'object' || Array.isArray(publicPayload)) return null
    return {
      run_id: runId,
      seq: sequence,
      type,
      timestamp: stringValue(candidate.timestamp) ?? '',
      phase: stringValue(candidate.phase) ?? null,
      public: publicPayload,
    }
  } catch {
    return null
  }
}

function event(runId: string, seq: number, type: string, phase: string, publicPayload: Record<string, unknown>): PublicRunEventResponse {
  return { run_id: runId, seq, type, timestamp: `2026-10-13T12:00:0${seq - 1}Z`, phase, public: publicPayload }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
