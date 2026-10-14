import { describe, expect, it } from 'vitest'

import { getBlockWidth, getDayPosition, getJobGridPlacement, shiftTimelineRange } from '@/features/schedule/timeline-layout'

describe('timeline layout helpers', () => {
  it('positions a day relative to the visible range', () => {
    expect(getDayPosition(11, 3)).toBe(384)
    expect(getDayPosition(2, 3)).toBe(0)
  })

  it('calculates the usable block width from a day span', () => {
    expect(getBlockWidth(5)).toBe(236)
    expect(getBlockWidth(1, 40, 2)).toBe(36)
  })

  it('clips a job placement to the visible range', () => {
    expect(getJobGridPlacement({ id: 'job', label: 'Task', start: 2, span: 6, tone: 'blue' }, { from: 4, to: 6 })).toEqual({ start: 1, span: 3 })
    expect(getJobGridPlacement({ id: 'job', label: 'Task', start: 10, span: 2, tone: 'blue' }, { from: 0, to: 6 })).toBeUndefined()
  })

  it('keeps the visible range length stable when shifting at the dataset boundaries', () => {
    expect(shiftTimelineRange({ from: 0, to: 14 }, -1, 24)).toEqual({ from: 0, to: 14 })
    expect(shiftTimelineRange({ from: 0, to: 14 }, 1, 24)).toEqual({ from: 9, to: 23 })
    expect(shiftTimelineRange({ from: 9, to: 23 }, -1, 24)).toEqual({ from: 0, to: 14 })
  })
})
