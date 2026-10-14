import type { components } from './generated/openapi'
import { apiUrl } from './url'
import type { PublicRunEvent } from '@/features/agent/run-reducer'

export type CreateRunResult = {
  runId: string
  eventId: string
  streamUrl: string
  state: string
}

type RunCreateResponse = components['schemas']['RunCreateResponse']

export async function createRun(eventId: string, idempotencyKey?: string): Promise<CreateRunResult> {
  const headers = new Headers({ Accept: 'application/json' })
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  const response = await fetch(apiUrl(`/api/v1/events/${encodeURIComponent(eventId)}/runs`), { method: 'POST', headers })
  if (!response.ok) throw new Error(`Run creation failed with status ${response.status}.`)

  const payload = await response.json() as RunCreateResponse
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
    const response = await fetch(apiUrl(`/api/v1/runs/${encodeURIComponent(runId)}/stream${query}`), { headers, signal: options.signal })
    if (!response.ok) throw new Error(`Run stream failed with status ${response.status}.`)
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
