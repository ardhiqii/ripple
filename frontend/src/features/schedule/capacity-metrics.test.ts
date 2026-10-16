import { describe, expect, it } from 'vitest'

import { calculateCapacityMetrics } from './capacity-metrics'
import type { TimelineCapacityReport, TimelineResource } from './types'

const resources: TimelineResource[] = [
  { id: 'barge-1', name: 'Barge', code: 'B1', group: 'Barges', kind: 'barge', utilization: 0, location: 'synthetic', jobs: [], active: true },
  { id: 'deck-1', name: 'Supply', code: 'S1', group: 'Supply boats', kind: 'supply', utilization: 0, location: 'synthetic', jobs: [], active: true },
  { id: 'inactive', name: 'Inactive', code: 'I1', group: 'Barges', kind: 'barge', utilization: 0, location: 'synthetic', jobs: [], active: false },
]

const reports: TimelineCapacityReport[] = [
  { resourceId: 'barge-1', unit: 'job', points: [
    { resourceId: 'barge-1', day: 0, used: 1, capacity: 1, overflow: 0, utilizationPercent: 100, bookingIds: [] },
    { resourceId: 'barge-1', day: 1, used: 2, capacity: 1, overflow: 1, utilizationPercent: 200, bookingIds: [] },
  ] },
  { resourceId: 'deck-1', unit: 'deck_units', points: [
    { resourceId: 'deck-1', day: 0, used: 50, capacity: 100, overflow: 0, utilizationPercent: 50, bookingIds: [] },
  ] },
  { resourceId: 'inactive', unit: 'job', points: [
    { resourceId: 'inactive', day: 0, used: 1, capacity: 1, overflow: 0, utilizationPercent: 100, bookingIds: [] },
  ] },
]

describe('planned capacity metrics', () => {
  it('uses average normalized resource-days for the fleet and unit ratios for groups', () => {
    const metrics = calculateCapacityMetrics(resources, reports, { from: 0, to: 1 })

    expect(metrics.fleet.display).toBe('116.7%')
    expect(metrics.fleet.eligiblePointCount).toBe(3)
    expect(metrics.fleet.overflow).toBe(1)
    expect(metrics.groups.find((metric) => metric.label === 'Barges')).toMatchObject({ display: '150%', overflow: 1 })
    expect(metrics.groups.find((metric) => metric.label === 'Supply boats')).toMatchObject({ display: '50%' })
    expect(metrics.resources.find((entry) => entry.resourceId === 'barge-1')?.metric).toMatchObject({ display: '150%', visibleRange: 'D+0–D+1', scope: 'Barge; resource denominator' })
  })

  it('recalculates the visible-range denominator when the range or server points change', () => {
    const dayZero = calculateCapacityMetrics(resources, reports, { from: 0, to: 0 })
    const dayOne = calculateCapacityMetrics(resources, reports, { from: 1, to: 1 })
    expect(dayZero.resources.find((entry) => entry.resourceId === 'barge-1')?.metric.display).toBe('100%')
    expect(dayOne.resources.find((entry) => entry.resourceId === 'barge-1')?.metric.display).toBe('200%')

    const refreshed = reports.map((report) => report.resourceId === 'barge-1'
      ? { ...report, points: report.points.map((point) => point.day === 0 ? { ...point, used: 0 } : point) }
      : report)
    expect(calculateCapacityMetrics(resources, refreshed, { from: 0, to: 0 }).fleet.display).toBe('25%')
  })

  it('labels a group-scoped fleet metric with the selected scope', () => {
    const metrics = calculateCapacityMetrics(resources.slice(0, 1), reports, { from: 0, to: 1 }, 'selected groups: Barges')
    expect(metrics.fleet.scope).toContain('selected groups: Barges')
  })

  it('returns an honest empty value and handles a mixed-unit group without summing unlike units', () => {
    const mixed = resources.map((resource) => resource.group === 'Supply boats' ? { ...resource, group: 'Barges' } : resource)
    const metrics = calculateCapacityMetrics(mixed, reports, { from: 8, to: 9 })
    expect(metrics.fleet).toMatchObject({ display: '—', eligiblePointCount: 0, barPercent: 0 })

    const mixedRange = calculateCapacityMetrics(mixed, reports, { from: 0, to: 1 })
    expect(mixedRange.groups.find((metric) => metric.label === 'Barges')).toMatchObject({ display: '—', units: ['job', 'deck_units'] })
  })

  it('treats explicit zero-capacity points as unavailable observations', () => {
    const zeroCapacity: TimelineCapacityReport[] = [{ resourceId: 'barge-1', unit: 'job', points: [{ resourceId: 'barge-1', day: 0, used: 0, capacity: 0, overflow: 0, utilizationPercent: 0, bookingIds: [] }] }]

    const metrics = calculateCapacityMetrics(resources, zeroCapacity, { from: 0, to: 0 })

    expect(metrics.fleet).toMatchObject({ display: '—', eligiblePointCount: 0, explanation: 'No capacity data for this range.' })
  })
})
