import { describe, expect, it } from 'vitest'

import type { components } from '@/api/generated/openapi'

import { adaptScheduleResponse } from './schedule-adapter'

type ScheduleResponse = components['schemas']['ScheduleResponse']

describe('schedule response adapter', () => {
  it('keeps empty resources, maps inclusive overlapping bookings, and preserves version', () => {
    const response: ScheduleResponse = {
      scenario_id: 'fleet-scale',
      from_day: 0,
      to_day: 3,
      version: 9,
      jobs: [
        { id: 'JOB-1', site: 'synthetic', job_type: 'repair', start_day: 1, duration_days: 2, shortfall_bopd: 40, locked: false, lock_reason: null, status: 'active', row_version: 1 },
      ],
      resources: [
        { id: 'EMPTY', type: 'barge', name: 'Empty resource', capacity: 1, unit: 'job', active: true, metadata: { location: 'yard' } },
        { id: 'BRG-1', type: 'barge', name: 'Barge one', capacity: 1, unit: 'job', active: true, metadata: { location: 'offshore' } },
      ],
      bookings: [
        { id: 'booking-1', resource_id: 'BRG-1', start_day: 1, end_day: 2, load: 1, status: 'planned', job_id: 'JOB-1', cargo_id: null, row_version: 1 },
        { id: 'booking-2', resource_id: 'BRG-1', start_day: 2, end_day: 3, load: 1, status: 'confirmed', job_id: null, cargo_id: 'cargo-2', row_version: 1 },
      ],
      unavailability: [],
      weather: [],
      capacity: [{ resource_id: 'BRG-1', unit: 'job', feasible: false, max_overflow: 1, points: [{ resource_id: 'BRG-1', day: 2, used: 2, capacity: 1, overflow: 1, utilization_percent: 200, booking_ids: ['booking-1', 'booking-2'] }] }],
    }

    const model = adaptScheduleResponse(response)
    expect(model.scenarioId).toBe('fleet-scale')
    expect(model.version).toBe(9)
    expect(model.resources.find((resource) => resource.id === 'EMPTY')?.jobs).toEqual([])
    expect(model.resources.find((resource) => resource.id === 'BRG-1')?.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'JOB-1', start: 1, span: 2, status: 'progress' }),
      expect.objectContaining({ id: 'cargo-2', start: 2, span: 2 }),
    ]))
    expect(model.resources.find((resource) => resource.id === 'BRG-1')?.utilization).toBe(200)
  })

  it('does not invent a selected job for an unknown URL ID', () => {
    const response: ScheduleResponse = {
      scenario_id: 'A-12-base', from_day: 0, to_day: 1, version: 1,
      jobs: [], resources: [], bookings: [], unavailability: [], weather: [], capacity: [],
    }
    const model = adaptScheduleResponse(response)
    expect(model.resources).toHaveLength(0)
  })

  it('preserves the server horizon for direct ranges and falls back to D+n without metadata', () => {
    const response: ScheduleResponse = {
      scenario_id: 'fleet-scale', from_day: 20, to_day: 30, version: 2,
      jobs: [], resources: [], bookings: [], unavailability: [], weather: [], capacity: [],
    }

    const model = adaptScheduleResponse(response)

    expect(model.days).toHaveLength(31)
    expect(model.days[20]).toMatchObject({ day: 'D+20', month: '' })
    expect(model.days[30]).toMatchObject({ day: 'D+30', month: '' })
  })

  it('uses the advertised scenario start date for calendar labels', () => {
    const response: ScheduleResponse = {
      scenario_id: 'A-12-base', from_day: 0, to_day: 1, version: 1,
      jobs: [], resources: [], bookings: [], unavailability: [], weather: [], capacity: [],
    }

    const model = adaptScheduleResponse(response, '2026-10-13')

    expect(model.days[0]).toMatchObject({ day: '13', month: 'October', year: 2026 })
  })
})
