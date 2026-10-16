import type { CSSProperties } from 'react'

import type { CapacityMetrics, CapacityMetric } from '@/features/schedule/capacity-metrics'

export function TimelineMetricStrip({ metrics }: { metrics: CapacityMetrics }) {
  return (
    <div className="capacity-summary" aria-label="Fleet capacity summary">
      <MetricCell metric={metrics.fleet} total />
      {metrics.groups.map((metric) => <MetricCell key={metric.label} metric={metric} />)}
    </div>
  )
}

function MetricCell({ metric, total = false }: { metric: CapacityMetric; total?: boolean }) {
  const overflow = metric.overflow > 0 ? ` Conflict: ${metric.overflow} capacity overflow.` : ''
  return (
    <div className={total ? 'total' : undefined} title={`${metric.explanation} Visible range: ${metric.visibleRange}. Scope: ${metric.scope}. Eligible resource-days: ${metric.eligiblePointCount}.${overflow}`}>
      <span>{metric.label}</span>
      <b>{metric.display}{metric.overflow > 0 ? <span className="ml-1 text-danger" aria-label="Capacity conflict">!</span> : null}</b>
      <i style={{ '--fill': `${metric.barPercent}%` } as CSSProperties}><em /></i>
    </div>
  )
}
