import { describe, expect, it } from 'vitest'

import {
  createRunState,
  initialRunState,
  runReducer,
  type PublicRunEvent,
  type RunState,
} from './run-reducer'

const event = (seq: number, type = 'step', publicPayload: Record<string, unknown> = {}): PublicRunEvent => ({
  run_id: 'run-1',
  seq,
  type,
  timestamp: `2026-10-13T10:00:0${seq}Z`,
  phase: 'investigation',
  public: publicPayload,
})

describe('runReducer', () => {
  it('starts idle and creates a queued run', () => {
    expect(initialRunState).toEqual({
      runId: null,
      eventId: null,
      status: 'idle',
      lastSeq: 0,
      events: [],
      error: null,
    })
    expect(createRunState('run-1', 'event-1')).toEqual({
      runId: 'run-1',
      eventId: 'event-1',
      status: 'queued',
      lastSeq: 0,
      events: [],
      error: null,
    })
  })

  it('appends ordered events and advances the sequence', () => {
    let state = createRunState('run-1', 'event-1')
    state = runReducer(state, { type: 'stream_open' })
    state = runReducer(state, { type: 'event', event: event(1) })
    state = runReducer(state, { type: 'event', event: event(2) })

    expect(state.status).toBe('streaming')
    expect(state.lastSeq).toBe(2)
    expect(state.events.map((item) => item.seq)).toEqual([1, 2])
    expect(state.error).toBeNull()
  })

  it('ignores duplicate and older events without changing state', () => {
    let state = runReducer(createRunState('run-1', 'event-1'), { type: 'event', event: event(1) })
    const afterFirstEvent = state

    state = runReducer(state, { type: 'event', event: event(1, 'tool_result') })
    state = runReducer(state, { type: 'event', event: event(0, 'run_started') })

    expect(state).toBe(afterFirstEvent)
    expect(state.events).toHaveLength(1)
  })

  it('does not append a future event and enters reconnecting on a sequence gap', () => {
    const state = runReducer(createRunState('run-1', 'event-1'), {
      type: 'event',
      event: event(3),
    })

    expect(state.status).toBe('reconnecting')
    expect(state.lastSeq).toBe(0)
    expect(state.events).toEqual([])
    expect(state.error).toContain('expected 1')
    expect(state.error).toContain('received 3')
  })

  it('normalizes an ordered error event to failed using only public error details', () => {
    const state = runReducer(createRunState('run-1', 'event-1'), {
      type: 'event',
      event: event(1, 'error', {
        summary: 'Capacity check failed.',
        chain_of_thought: 'private reasoning must not be derived',
      }),
    })

    expect(state.status).toBe('failed')
    expect(state.lastSeq).toBe(1)
    expect(state.events).toHaveLength(1)
    expect(state.error).toBe('Capacity check failed.')
    expect(state.error).not.toContain('private reasoning')
  })

  it('reconnects without clearing the sequence or event buffer', () => {
    let state = runReducer(createRunState('run-1', 'event-1'), { type: 'event', event: event(1) })
    state = runReducer(state, { type: 'event', event: event(3) })
    const bufferedEvents = state.events

    state = runReducer(state, { type: 'reconnect' })

    expect(state.status).toBe('streaming')
    expect(state.lastSeq).toBe(1)
    expect(state.events).toBe(bufferedEvents)
    expect(state.error).toBeNull()
  })

  it('normalizes done events and explicit done actions to completed', () => {
    let state: RunState = createRunState('run-1', 'event-1')
    state = runReducer(state, { type: 'event', event: event(1, 'done') })
    expect(state.status).toBe('completed')
    expect(state.lastSeq).toBe(1)

    state = runReducer(state, { type: 'done' })
    expect(state.status).toBe('completed')
    expect(state.error).toBeNull()
  })

  it('records a stream error as reconnectable and reset returns an idle state', () => {
    let state = runReducer(createRunState('run-1', 'event-1'), {
      type: 'stream_error',
      error: 'Connection lost.',
    })
    expect(state).toMatchObject({ status: 'reconnecting', error: 'Connection lost.' })

    state = runReducer(state, { type: 'reset' })
    expect(state).toEqual(initialRunState)
    expect(state).not.toBe(initialRunState)
  })
})
