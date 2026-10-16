import type { components } from './generated/openapi'
import { apiTransport } from './transport'
import type { PublicRunEvent } from '@/features/agent/run-reducer'

export type CreateRunResult = {
  runId: string
  eventId: string
  streamUrl: string
  state: string
}

export type AskFreshness = components['schemas']['AskResponse']['freshness']
export type AskContextPayload = components['schemas']['AskContext']
type AskResponsePayload = components['schemas']['AskResponse']

export interface AskEvidence {
  entityType: string
  entityId: string
  label: string
  sourceUpdatedAt: string | null
}

export interface AskAnswer {
  scenarioId: string
  answer: string
  evidence: AskEvidence[]
  freshness: AskFreshness
  uncertainty: string | null
  scheduleVersion: number
  answeredAt: string
}

type RunCreateResponse = components['schemas']['RunCreateResponse']

export async function createRun(eventId: string, idempotencyKey?: string): Promise<CreateRunResult> {
  const headers = new Headers({ Accept: 'application/json' })
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  const payload = await apiTransport.post<RunCreateResponse>(
    `/api/v1/events/${encodeURIComponent(eventId)}/runs`,
    undefined,
    { headers },
  )
  const data = payload as unknown as Record<string, unknown>
  const runId = stringValue(data.run_id)
  if (!runId) throw new Error('Run creation response did not include a run id.')
  return {
    runId,
    eventId: stringValue(data.event_id) ?? eventId,
    streamUrl: stringValue(data.stream_url) ?? `/api/v1/runs/${encodeURIComponent(runId)}/stream`,
    state: stringValue(data.state) ?? 'queued',
  }
}

export async function askRipple(question: string, context?: AskContextPayload): Promise<AskAnswer> {
  const trimmed = question.trim()
  if (!trimmed || trimmed.length > 2000) {
    throw new Error('Question must be between 1 and 2000 characters.')
  }
  const payload = await apiTransport.post<AskResponsePayload>('/api/v1/ask', {
    question: trimmed,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  })
  return adaptAskAnswer(payload)
}

export interface StreamRunOptions {
  after?: number
  signal?: AbortSignal
  onEvent: (event: PublicRunEvent) => void
  onOpen?: () => void
  onError?: (error: Error) => void
}

export async function streamRun(runId: string, options: StreamRunOptions): Promise<void> {
  const after = options.after !== undefined && options.after > 0 ? Math.floor(options.after) : undefined
  const query = after === undefined ? '' : `?after=${after}`
  const headers = new Headers({ Accept: 'text/event-stream' })
  if (after !== undefined) headers.set('Last-Event-ID', String(after))

  try {
    const response = await apiTransport.openSse(
      `/api/v1/runs/${encodeURIComponent(runId)}/stream${query}`,
      { headers, signal: options.signal },
    )
    options.onOpen?.()
    if (!response.body) throw new Error('Run stream did not include a readable body.')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let reading = true
    while (reading) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) emitFrame(frame, runId, options.onEvent)
      if (chunk.done) {
        if (buffer.trim()) emitFrame(buffer, runId, options.onEvent)
        reading = false
      }
    }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Run stream failed.')
    options.onError?.(error)
    throw error
  }
}

function emitFrame(frame: string, fallbackRunId: string, onEvent: (event: PublicRunEvent) => void) {
  let id: string | undefined
  let eventType: string | undefined
  const dataLines: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const value = (separator === -1 ? '' : line.slice(separator + 1)).trimStart()
    if (field === 'id') id = value
    if (field === 'event') eventType = value
    if (field === 'data') dataLines.push(value)
  }
  if (!dataLines.length) return

  let payload: unknown
  try {
    payload = JSON.parse(dataLines.join('\n'))
  } catch {
    return
  }
  if (!payload || typeof payload !== 'object') return
  const raw = payload as Record<string, unknown>
  const publicPayload = raw.public
  if (!publicPayload || typeof publicPayload !== 'object' || Array.isArray(publicPayload)) return
  const seq = numberValue(raw.seq) ?? numberValue(id)
  if (seq === undefined) return
  onEvent({
    run_id: stringValue(raw.run_id) ?? fallbackRunId,
    seq,
    type: eventType ?? stringValue(raw.type) ?? 'message',
    timestamp: stringValue(raw.timestamp) ?? new Date().toISOString(),
    phase: stringValue(raw.phase) ?? 'unknown',
    public: publicPayload as Record<string, unknown>,
  })
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function adaptAskAnswer(value: AskResponsePayload): AskAnswer {
  const root = asRecord(value)
  const scenarioId = stringValue(root?.scenario_id)
  const answer = stringValue(root?.answer)
  const freshness = freshnessValue(root?.freshness)
  const scheduleVersion = numberValue(root?.schedule_version)
  const answeredAt = stringValue(root?.answered_at)
  if (!scenarioId || !answer || !freshness || scheduleVersion === undefined || !answeredAt) {
    throw new Error('Ask response did not include a complete read-only answer.')
  }
  const evidence = Array.isArray(root?.evidence)
    ? root.evidence.map(adaptAskEvidence)
    : []
  return {
    scenarioId,
    answer,
    evidence,
    freshness,
    uncertainty: nullableString(root?.uncertainty),
    scheduleVersion,
    answeredAt,
  }
}

function adaptAskEvidence(value: unknown): AskEvidence {
  const row = asRecord(value)
  const entityType = stringValue(row?.entity_type)
  const entityId = stringValue(row?.entity_id)
  const label = stringValue(row?.label)
  if (!entityType || !entityId || !label) throw new Error('Ask evidence was missing a canonical identity.')
  return { entityType, entityId, label, sourceUpdatedAt: nullableString(row?.source_updated_at) }
}

function freshnessValue(value: unknown): AskFreshness | undefined {
  return value === 'current' || value === 'stale' || value === 'unknown' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function nullableString(value: unknown): string | null {
  return value === null ? null : stringValue(value) ?? null
}
