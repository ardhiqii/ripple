import { CalendarBlank, CheckCircle, CloudRain, Prohibit, Warning, Wrench } from '@phosphor-icons/react'

const swatchStyle = {
  display: 'inline-block',
  flex: '0 0 14px',
} as const

const countStyle = {
  display: 'grid',
  width: '18px',
  height: '18px',
  flex: '0 0 18px',
  placeItems: 'center',
  border: '2px solid var(--ds-color-border-strong)',
  borderRadius: '3px',
  color: 'var(--ds-color-text)',
  font: '700 9px var(--ds-font-mono, monospace)',
  fontStyle: 'normal',
} as const

const moreBandStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '22px',
  minHeight: '16px',
  padding: '0 2px',
  border: '1px solid var(--ds-color-border-strong)',
  borderRadius: '3px',
  color: 'var(--ds-color-text-muted)',
  background: 'var(--ds-color-surface-subtle)',
  font: '700 8px var(--ds-font-mono, monospace)',
  fontStyle: 'normal',
} as const

export function TimelineLegend() {
  return (
    <footer className="legend timeline-legend" aria-label="Timeline legend">
      <div className="legend-group">
        <strong>Schedule</strong>
        <span><i className="booking-key" style={swatchStyle} aria-hidden="true" />Booking</span>
        <span><i className="progress-key" style={swatchStyle} aria-hidden="true" />In progress</span>
        <span className="legend-complete"><CheckCircle size={14} weight="fill" aria-hidden="true" />Complete</span>
        <span className="legend-hidden-bookings" aria-label="More bookings band opens the resource row">
          <em style={moreBandStyle} aria-hidden="true">+N</em>
          More bookings
        </span>
      </div>

      <div className="legend-group">
        <strong>Resource issues</strong>
        <span className="legend-maintenance"><i className="maintenance-key" style={swatchStyle} aria-hidden="true" /><Wrench size={14} aria-hidden="true" />Maintenance</span>
        <span className="legend-unavailable"><i className="unavailable-key" style={swatchStyle} aria-hidden="true" /><Prohibit size={14} aria-hidden="true" />Unavailable</span>
        <span className="legend-conflict"><i className="conflict-key" style={swatchStyle} aria-hidden="true" /><Warning size={14} weight="fill" aria-hidden="true" />Capacity conflict</span>
        <span className="legend-multi-issue" aria-label="N issues: open details"><i className="issue-count-key" style={countStyle} aria-hidden="true">2</i>issues</span>
      </div>

      <div className="legend-group">
        <strong>Day context</strong>
        <span className="legend-weather-no-go" aria-label="Weather no-go: date cell"><i className="weather-key" style={swatchStyle} aria-hidden="true" /><CloudRain size={14} aria-hidden="true" />Weather no-go</span>
        <span className="legend-today"><CalendarBlank size={14} aria-hidden="true" />Today</span>
        <span><i className="selected-key" style={swatchStyle} aria-hidden="true" />Selected</span>
      </div>
    </footer>
  )
}
