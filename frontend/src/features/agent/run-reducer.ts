export type RunStatus = 'idle' | 'queued' | 'streaming' | 'reconnecting' | 'completed' | 'failed'

export type PublicRunEvent = {
  run_id: string
  seq: number
  type: string
  timestamp: string
  phase: string
  public: Record<string, unknown>
}

export interface RunState {
  runId: string | null
  eventId: string | null
  status: RunStatus
  lastSeq: number
  events: PublicRunEvent[]
  error: string | null
}

type RunAction =
  | { type: 'created'; runId: string; eventId: string }
  | { type: 'stream_open' }
  | { type: 'event'; event: PublicRunEvent }
  | { type: 'reconnect' }
  | { type: 'stream_error'; error: string }
  | { type: 'done' }
  | { type: 'reset' }

function emptyRunState(): RunState {
  return {
    runId: null,
    eventId: null,
    status: 'idle',
    lastSeq: 0,
    events: [],
    error: null,
  }
}

export const initialRunState: RunState = emptyRunState()

export function createRunState(runId: string, eventId: string, lastSeq = 0): RunState {
  return {
    runId,
    eventId,
    status: 'queued',
    lastSeq,
    events: [],
    error: null,
  }
}

function publicErrorMessage(payload: Record<string, unknown>): string {
  for (const key of ['message', 'summary', 'error', 'detail']) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return 'The agent run failed.'
}

function reduceEvent(state: RunState, event: PublicRunEvent): RunState {
  if (event.seq <= state.lastSeq) return state

  const expectedSeq = state.lastSeq + 1
  if (event.seq > expectedSeq) {
    return {
      ...state,
      status: 'reconnecting',
      error: `Missing run event sequence: expected ${expectedSeq}, received ${event.seq}.`,
    }
  }

  const events = [...state.events, event]
  if (event.type === 'error') {
    return {
      ...state,
      status: 'failed',
      lastSeq: event.seq,
      events,
      error: publicErrorMessage(event.public),
    }
  }

  if (event.type === 'done') {
    return {
      ...state,
      status: 'completed',
      lastSeq: event.seq,
      events,
      error: null,
    }
  }

  return {
    ...state,
    status: 'streaming',
    lastSeq: event.seq,
    events,
    error: null,
  }
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'created':
      return createRunState(action.runId, action.eventId)
    case 'stream_open':
      return { ...state, status: 'streaming', error: null }
    case 'event':
      return reduceEvent(state, action.event)
    case 'reconnect':
      return { ...state, status: 'streaming', error: null }
    case 'stream_error':
      return { ...state, status: 'reconnecting', error: action.error }
    case 'done':
      return { ...state, status: 'completed', error: null }
    case 'reset':
      return emptyRunState()
  }
}
