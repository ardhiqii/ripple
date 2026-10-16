// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { calculateCapacityMetrics } from '@/features/schedule/capacity-metrics'
import type { TimelineResource } from '@/features/schedule/types'
import { TimelineMetricStrip } from './timeline-metric-strip'

describe('TimelineMetricStrip', () => {
  it('labels the visible range and denominator scope in the metric tooltip', () => {
    const resource: TimelineResource = { id: 'barge-1', name: 'Barge', code: 'B1', group: 'Barges', kind: 'barge', utilization: 0, location: 'synthetic', jobs: [], active: true }
    const metrics = calculateCapacityMetrics([resource], [{ resourceId: 'barge-1', unit: 'job', points: [{ resourceId: 'barge-1', day: 2, used: 1, capacity: 1, overflow: 0, utilizationPercent: 100, bookingIds: [] }] }], { from: 2, to: 2 })
    render(<TimelineMetricStrip metrics={metrics} />)

    const fleet = screen.getByText('Average planned load across resources').parentElement
    expect(fleet).toHaveAttribute('title', expect.stringContaining('Visible range: D+2–D+2'))
    expect(fleet).toHaveAttribute('title', expect.stringContaining('Scope: all active resources; normalized resource-days'))
    expect(fleet).toHaveAttribute('title', expect.stringContaining('Eligible resource-days: 1'))
  })
})
