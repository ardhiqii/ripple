// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { TimelineBlock } from './timeline-block'
import { TimelineWorkspace } from './timeline-workspace'
import { timelineDays, timelineResources } from '@/features/schedule/fixture-adapter'
import { fixtureTimelineSchedule } from '@/features/schedule/schedule-adapter'

afterEach(cleanup)

describe('timeline route state', () => {
  it('renders an active server activity without inventing a numeric progress value', () => {
    const view = render(<TimelineBlock job={{ id: 'ACTIVE-1', label: 'Active job', start: 1, span: 2, tone: 'blue', status: 'progress' }} resourceName="Barge one" range={{ from: 0, to: 3 }} selected={false} onSelect={vi.fn()} />)

    expect(view.getByRole('button', { name: /ACTIVE-1.*progress/ })).toHaveTextContent('In progress')
    expect(view.container.querySelector('.job-progress')).not.toBeInTheDocument()
    expect(view.container).not.toHaveTextContent('undefined%')
  })

  it('does not select a fallback job when the URL has no job parameter', () => {
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [] }} onSearchChange={vi.fn()} />)

    const gantt = screen.getByRole('region', { name: 'Timeline Gantt chart' })
    expect(within(gantt).getByRole('button', { name: /RAMG-01, ESP changeout/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores a deep-linked job selection after the fixture is rendered', () => {
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [], job: 'RAMG-01' }} onSearchChange={vi.fn()} />)

    const gantt = screen.getByRole('region', { name: 'Timeline Gantt chart' })
    const selectedBlock = within(gantt).getByRole('button', { name: /RAMG-01, ESP changeout/ })
    expect(selectedBlock).toHaveAttribute('aria-pressed', 'true')
    expect(selectedBlock).toHaveClass('selected')
  })

  it('opens the inspector selection from a Timeline block click', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [] }} onSearchChange={onSearchChange} />)

    const block = within(screen.getByRole('region', { name: 'Timeline Gantt chart' })).getByRole('button', { name: /RAMG-01, ESP changeout/ })
    await user.click(block)

    expect(onSearchChange).toHaveBeenCalledWith({ job: 'RAMG-01' })
  })

  it('keeps a visible keyboard focus indicator when the selected block is focused', () => {
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [], job: 'RAMG-01' }} onSearchChange={vi.fn()} />)

    const selectedBlock = within(screen.getByRole('region', { name: 'Timeline Gantt chart' })).getByRole('button', { name: /RAMG-01, ESP changeout/ })
    selectedBlock.focus()

    expect(selectedBlock).toHaveClass('selected')
    expect(selectedBlock).toHaveFocus()
  })

  it('clears an invalid deep link and leaves the inspector closed', async () => {
    const onSearchChange = vi.fn()
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [], job: 'missing-job' }} onSearchChange={onSearchChange} />)

    expect(await screen.findByRole('status')).toHaveTextContent('Job missing-job is no longer available')
    await waitFor(() => expect(onSearchChange).toHaveBeenCalledWith({ job: undefined }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the matching count and clears URL-backed filters', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [], q: 'RAMG' }} onSearchChange={onSearchChange} />)

    expect(screen.getByRole('status')).toHaveTextContent('1 matching activity')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onSearchChange).toHaveBeenCalledWith({ q: undefined, groups: [], vendors: [], status: undefined })
  })

  it('counts only jobs inside active filters when a selected job is outside the scope', () => {
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: ['Supply boats'], vendors: [], job: 'RAMG-01' }} onSearchChange={vi.fn()} />)

    expect(screen.getByText('7 matching activities')).toBeInTheDocument()
  })

  it('counts all filtered jobs when a resource name matches the search', () => {
    render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [], q: 'SAMUDRA 225' }} onSearchChange={vi.fn()} />)

    expect(screen.getByText('5 matching activities')).toBeInTheDocument()
  })

  it('round-trips group and status controls through URL-owned state', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const view = render(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: [], vendors: [] }} onSearchChange={onSearchChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Resource group' }), 'Barges')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Activity status' }), 'progress')
    expect(onSearchChange).toHaveBeenNthCalledWith(1, { groups: ['Barges'] })
    expect(onSearchChange).toHaveBeenNthCalledWith(2, { status: 'progress' })

    view.rerender(<App schedule={fixtureTimelineSchedule} search={{ from: 0, to: 14, groups: ['Barges'], vendors: [], status: 'progress' }} onSearchChange={onSearchChange} />)
    expect(screen.getByRole('combobox', { name: 'Resource group' })).toHaveValue('Barges')
    expect(screen.getByRole('combobox', { name: 'Activity status' })).toHaveValue('progress')
  })

  it('removes the selected treatment when the inspector closes and restores focus', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const search = { from: 0, to: 14, groups: [], vendors: [], job: 'RAMG-01' as string | undefined }
    const view = render(<App schedule={fixtureTimelineSchedule} search={search} onSearchChange={onSearchChange} />)

    const selectedBlock = within(screen.getByRole('region', { name: 'Timeline Gantt chart' })).getByRole('button', { name: /RAMG-01, ESP changeout/ })
    await user.click(screen.getByRole('button', { name: 'Close inspector' }))
    expect(onSearchChange).toHaveBeenCalledWith({ job: undefined })

    view.rerender(<App schedule={fixtureTimelineSchedule} search={{ ...search, job: undefined }} onSearchChange={onSearchChange} />)
    expect(selectedBlock).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(selectedBlock).toHaveFocus())
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
    expect(job).toHaveAttribute('aria-label', expect.stringMatching(/RAMG-01.*23–27 September.*SAMUDRA 225.*status: Planned.*at risk/i))
    expect(job).toHaveAttribute('aria-pressed', 'true')

    job.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('RAMG-01')
  })

  it('applies text search to the mobile agenda as well as the desktop rows', () => {
    render(<TimelineWorkspace resources={timelineResources} days={timelineDays} range={{ from: 0, to: 23 }} vendors={[]} query="RAMG" onSelect={vi.fn()} />)

    const agenda = document.querySelector<HTMLElement>('.timeline-agenda')
    if (!agenda) throw new Error('Mobile agenda was not rendered')
    agenda.style.display = 'block'
    expect(agenda).toHaveTextContent('RAMG-01')
    expect(agenda).not.toHaveTextContent('WID-32')
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
