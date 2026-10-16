import { describe, expect, it } from 'vitest'

import { timelineRangeForJob } from './readiness'
import { readinessTestRows } from '@/features/readiness/readiness-test-fixtures'

describe('readiness timeline handoff', () => {
  it('centers the timeline range around the server readiness day', () => {
    expect(timelineRangeForJob(readinessTestRows, 'A-12')).toEqual({ from: 0, to: 14 })
    expect(timelineRangeForJob([{ ...readinessTestRows[0]!, job_id: 'FS-JOB-005', planned_day: 15 }], 'FS-JOB-005')).toEqual({ from: 8, to: 22 })
  })

  it('uses the server ETA when no planned day is available', () => {
    expect(timelineRangeForJob([{ ...readinessTestRows[0]!, job_id: 'FS-JOB-005', planned_day: null, eta_earliest: 18 }], 'FS-JOB-005')).toEqual({ from: 11, to: 25 })
  })
})
