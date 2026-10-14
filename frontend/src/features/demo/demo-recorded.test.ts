import { describe, expect, it } from 'vitest'

import {
  DEMO_SCENARIO_IDS,
} from './demo-data'
import {
  mapRecordedSseFrameToEvent,
  recordedDemoFixtures,
  recordedEventToSseFrame,
  recordedEventsAfter,
  recordedSseFixture,
} from './demo-recorded'

describe('recorded demo fixtures', () => {
  it('provides ordered public events for both A-12 paths', () => {
    for (const scenarioId of Object.values(DEMO_SCENARIO_IDS)) {
      const events = recordedEventsAfter(scenarioId)
      expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4])
      expect(recordedDemoFixtures[scenarioId].events.at(-1)?.type).toBe('done')
    }
    expect(recordedDemoFixtures[DEMO_SCENARIO_IDS.constrained].modelOutput.levers_ruled_out).toEqual([
      { lever: 'expedite_vendor_test', target: 'A-12 test bay' },
    ])
  })

  it('maps a generated public event to resumable SSE and back', () => {
    const event = recordedEventsAfter(DEMO_SCENARIO_IDS.base)[1]
    const frame = recordedEventToSseFrame(event)
    expect(frame).not.toBeNull()
    const raw = `id: ${frame?.id}\nevent: ${frame?.event}\ndata: ${frame?.data}\n\n`
    expect(mapRecordedSseFrameToEvent(raw, 'fallback')).toMatchObject({
      run_id: '11111111-1111-4111-8111-111111111101',
      seq: 2,
      type: 'step',
    })
  })

  it('supports replay after a sequence and ignores malformed frames', () => {
    const fixture = recordedSseFixture(DEMO_SCENARIO_IDS.constrained, 2)
    expect(fixture).toContain('id: 3')
    expect(fixture).toContain('id: 4')
    expect(fixture).not.toContain('id: 2')
    expect(mapRecordedSseFrameToEvent('event: broken\ndata: {"seq":', 'fallback')).toBeNull()
  })
})
