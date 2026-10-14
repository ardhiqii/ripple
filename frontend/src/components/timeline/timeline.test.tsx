// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { TimelineWorkspace } from './timeline-workspace'
import { timelineDays, timelineResources } from '@/features/schedule/fixture-adapter'

afterEach(cleanup)

describe('timeline route state', () => {
  it('restores a deep-linked job selection after the fixture is rendered', () => {
    render(<App search={{ from: 0, to: 14, groups: [], vendors: [], job: 'RAMG-01' }} onSearchChange={vi.fn()} />)

    const gantt = screen.getByRole('region', { name: 'Timeline Gantt chart' })
    expect(within(gantt).getByRole('button', { name: /RAMG-01, ESP changeout/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('provides keyboard-accessible agenda entries with job, date, resource, and status names', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<TimelineWorkspace resources={timelineResources} days={timelineDays} range={{ from: 0, to: 23 }} vendors={[]} selectedJobId="RAMG-01" onSelect={onSelect} />)

    const agenda = document.querySelector<HTMLElement>('.timeline-agenda')
    if (!agenda) throw new Error('Mobile agenda was not rendered')
    agenda.style.display = 'block'
    const job = agenda.querySelector<HTMLButtonElement>('button[aria-label^="RAMG-01"]')
    if (!job) throw new Error('RAMG-01 agenda entry was not rendered')
    expect(job).toHaveAttribute('aria-label', expect.stringMatching(/RAMG-01.*23–27 September 2026.*SAMUDRA 225.*status: Planned.*at risk/i))
    expect(job).toHaveAttribute('aria-pressed', 'true')

    job.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('RAMG-01')
  })

  it('keeps the fixed-width Gantt and switches to the agenda at the mobile breakpoint', () => {
    render(<TimelineWorkspace resources={timelineResources} days={timelineDays} range={{ from: 0, to: 23 }} vendors={[]} onSelect={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'Timeline Gantt chart' })).toBeInTheDocument()
    expect(document.querySelector('.timeline-agenda')).toBeInTheDocument()

    const responsiveStyle = document.querySelector('style[data-timeline-responsive]')
    expect(responsiveStyle?.textContent).toContain('@media (max-width: 700px)')
    expect(responsiveStyle?.textContent).toContain('.timeline-desktop { display: none; }')
    expect(responsiveStyle?.textContent).toContain('.timeline-agenda { display: block;')
  })
})
