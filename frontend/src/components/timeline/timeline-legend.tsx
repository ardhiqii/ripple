import { Warning } from '@phosphor-icons/react'

export function TimelineLegend() {
  return (
    <footer className="legend" aria-label="Timeline legend">
      <strong>Vendor</strong>
      <span><i className="green" />Baker</span>
      <span><i className="red" />Powerlift</span>
      <span><i className="blue" />Schlumberger</span>
      <span><i className="gray" />No vendor</span>
      <u />
      <strong>Status</strong>
      <span><i className="progress-key" />In progress</span>
      <span><i className="hold-key" />Weather hold</span>
      <span><Warning weight="fill" aria-hidden="true" />Conflict</span>
      <span className="legend-note">Fixture schedule</span>
    </footer>
  )
}
