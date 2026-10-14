// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { planWorkspaceById } from '@/features/plans/plan-data'
import { DecisionWorkspace } from './decision-workspace'

afterEach(() => cleanup())

describe('DecisionWorkspace', () => {
  it('keeps every review section tied to the route-owned selected option', async () => {
    const user = userEvent.setup()
    const data = planWorkspaceById('00000000-0000-0000-0000-000000000201')
    const onSelectOption = vi.fn()
    render(<DecisionWorkspace data={data} selectedOptionId={data.options[1]?.id} compareIds={[]} activeTab="overview" onSelectOption={onSelectOption} onCompareChange={vi.fn()} onTabChange={vi.fn()} onEvidenceChange={vi.fn()} />)

    expect(screen.getAllByText('Hold A-12 until D+7').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('D+7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add Hold A-12 until D\+7 to comparison/ })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Use this option' }))
    expect(onSelectOption).toHaveBeenCalledWith(data.options[0]!.id)
  })

  it('allows inspection but never selection of an infeasible option', () => {
    const data = planWorkspaceById('00000000-0000-0000-0000-000000000202')
    render(<DecisionWorkspace data={data} selectedOptionId={undefined} compareIds={[]} activeTab="overview" onSelectOption={vi.fn()} onCompareChange={vi.fn()} onTabChange={vi.fn()} onEvidenceChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Infeasible' })).toBeDisabled()
    expect(screen.getByText('Test bay is not ready.')).toBeInTheDocument()
  })

  it('returns focus to the evidence trigger after the evidence sheet closes', async () => {
    const user = userEvent.setup()
    const data = planWorkspaceById('00000000-0000-0000-0000-000000000201')
    const evidence = data.evidence[0]
    expect(evidence).toBeDefined()
    const onEvidenceChange = vi.fn()
    const view = render(<DecisionWorkspace data={data} selectedOptionId={data.options[0]?.id} compareIds={[]} activeTab="evidence" evidenceId={evidence?.claimId} onSelectOption={vi.fn()} onCompareChange={vi.fn()} onTabChange={vi.fn()} onEvidenceChange={onEvidenceChange} />)

    const trigger = screen.getByRole('button', { name: new RegExp(evidence!.claimText) })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    view.rerender(<DecisionWorkspace data={data} selectedOptionId={data.options[0]?.id} compareIds={[]} activeTab="evidence" evidenceId={undefined} onSelectOption={vi.fn()} onCompareChange={vi.fn()} onTabChange={vi.fn()} onEvidenceChange={onEvidenceChange} />)

    expect(onEvidenceChange).toHaveBeenCalledWith(undefined)
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
