// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { JobInspector } from './JobInspector'
import { timelineResources } from '@/features/schedule/fixture-adapter'

const resource = timelineResources.find((candidate) => candidate.id === 'samudra')!
const job = resource.jobs.find((candidate) => candidate.id === 'RAMG-01')!
const range = { from: 0, to: 14 }

afterEach(() => cleanup())

describe('JobInspector handoff actions', () => {
  it('passes exact selection context and emits Ripple modes', async () => {
    const user = userEvent.setup()
    const onOpenReadiness = vi.fn()
    const onViewDecision = vi.fn()
    const onRipple = vi.fn()
    window.addEventListener('ripple:open', onRipple)

    render(<JobInspector job={job} resource={resource} range={range} scheduleVersion={12} decisionId="P-01" onClose={vi.fn()} onOpenReadiness={onOpenReadiness} onViewDecision={onViewDecision} />)
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('RAMG-01 · ESP changeout')

    await user.click(screen.getByRole('button', { name: 'Open readiness' }))
    expect(onOpenReadiness).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'RAMG-01',
      resourceId: 'samudra',
      startDay: 5,
      endDay: 10,
      scheduleVersion: 12,
      dateRange: range,
    }))

    await user.click(screen.getByRole('button', { name: 'Ask Ripple' }))
    await user.click(screen.getByRole('button', { name: 'Submit change' }))
    expect(onRipple).toHaveBeenNthCalledWith(1, expect.objectContaining({ detail: { mode: 'ask', context: expect.objectContaining({ jobIds: ['RAMG-01'], resourceIds: ['samudra'], scheduleVersion: 12, dates: { startDay: 5, endDay: 10 } }) } }))
    expect(onRipple).toHaveBeenNthCalledWith(2, expect.objectContaining({ detail: { mode: 'submit', context: expect.objectContaining({ jobIds: ['RAMG-01'], resourceIds: ['samudra'], scheduleVersion: 12 }) } }))

    await user.click(screen.getByRole('button', { name: 'View decision' }))
    expect(onViewDecision).toHaveBeenCalledWith(expect.objectContaining({ decisionId: 'P-01' }))
    window.removeEventListener('ripple:open', onRipple)
  })

  it('restores focus to the selected timeline block when closed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const block = document.createElement('button')
    block.dataset.jobId = job.id
    document.body.append(block)

    render(<JobInspector job={job} resource={resource} range={range} scheduleVersion={0} onClose={onClose} />)
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Close inspector' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(block).toHaveFocus())
    block.remove()
  })
})
