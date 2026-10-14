import type { CSSProperties } from 'react'

export function TimelineMetricStrip() {
  const metrics = [['Barges', '72%'], ['Supply boats', '61%'], ['Test bays', '54%'], ['Lift crews', '78%']] as const

  return (
    <div className="capacity-summary" aria-label="Fleet capacity summary">
      <div className="total">
        <span>Total fleet utilization</span>
        <b>68%</b>
        <i><em /></i>
      </div>
      {metrics.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
          <i style={{ '--fill': value } as CSSProperties}><em /></i>
        </div>
      ))}
    </div>
  )
}
