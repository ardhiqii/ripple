// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { planWorkspaceById } from '@/features/plans/plan-data'
import { DecisionActions, type DecisionActionsProps } from './decision-actions'

afterEach(() => cleanup())

const data = planWorkspaceById('00000000-0000-0000-0000-000000000201')
const selectedOption = data.options[0]!

function renderActions(overrides: Partial<DecisionActionsProps> = {}) {
  const props: DecisionActionsProps = {
    data,
    selectedOption,
    acknowledgedConditionIds: [selectedOption.conditions[0]!.id],
    currentScheduleVersion: data.baseScheduleVersion,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onReply: vi.fn(),
    ...overrides,
  }
  return { ...render(<DecisionActions {...props} />), props }
}

describe('DecisionActions', () => {
  it('gates approval on feasible, proposed, current, and acknowledged state', () => {
    renderActions({ acknowledgedConditionIds: [] })
    expect(screen.getByRole('button', { name: 'Approve option' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Acknowledge 1 required condition.')
  })

  it('requires a rejection reason and emits the generated reject payload', async () => {
    const user = userEvent.setup()
    const onReject = vi.fn()
    renderActions({ onReject })

    await user.click(screen.getByRole('button', { name: 'Reject plan' }))
    const rejectButtons = screen.getAllByRole('button', { name: 'Reject plan' })
    expect(rejectButtons.at(-1)).toBeDisabled()
    await user.type(screen.getByLabelText(/Reason/), 'The cargo window is no longer available.')
    await user.click(screen.getAllByRole('button', { name: 'Reject plan' }).at(-1)!)

    expect(onReject).toHaveBeenCalledWith({ reason: 'The cargo window is no longer available.', replan: false })
  })

  it('shows the selected option and condition acknowledgement in approval confirmation', async () => {
    const user = userEvent.setup()
    renderActions()

    await user.click(screen.getByRole('button', { name: 'Approve option' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(selectedOption.label)
    expect(screen.getByRole('dialog')).toHaveTextContent(selectedOption.conditions[0]!.text)
    expect(screen.getByRole('dialog')).toHaveTextContent('The server will revalidate')
  })

  it('does not invent impact metrics that the server did not report', async () => {
    const user = userEvent.setup()
    const optionWithoutMetrics = { ...selectedOption, kpi: {}, objectiveValue: null }
    renderActions({ selectedOption: optionWithoutMetrics })

    await user.click(screen.getByRole('button', { name: 'Approve option' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Jobs movedNot reported')
    expect(screen.getByRole('dialog')).toHaveTextContent('Readiness dates changedNot reported')
    expect(screen.getByRole('dialog')).toHaveTextContent('Cargo/resource changesNot reported')
    expect(screen.getByRole('dialog')).toHaveTextContent('Estimated model impactNot reported')
  })

  it('locks the approval dialog while pending and sends only one request', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn()
    const first = renderActions({ onApprove })

    await user.click(screen.getAllByRole('button', { name: 'Approve option' })[0]!)
    first.rerender(<DecisionActions {...first.props} pendingAction="approve" />)
    expect(screen.getByRole('button', { name: 'Validating and approving...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to review' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onApprove).not.toHaveBeenCalled()

    first.unmount()
    const second = renderActions({ onApprove })
    await user.click(screen.getAllByRole('button', { name: 'Approve option' })[0]!)
    await user.click(screen.getAllByRole('button', { name: 'Approve option' }).at(-1)!)
    expect(onApprove).toHaveBeenCalledTimes(1)
    second.unmount()
  })

  it('keeps review state in 409 conflict mode with recompute and return actions', async () => {
    const user = userEvent.setup()
    const onRecompute = vi.fn()
    const onReturnToReview = vi.fn()
    renderActions({ conflict: { currentScheduleVersion: 4, changedObjectIds: ['job-a12'], message: 'Schedule changed since review.' }, onRecompute, onReturnToReview })

    await user.click(screen.getByRole('button', { name: 'Approve option' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Schedule changed since review.')
    expect(screen.getByRole('button', { name: 'Recompute with latest schedule' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Force apply' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recompute with latest schedule' }))
    expect(onRecompute).toHaveBeenCalledOnce()
    expect(onReturnToReview).not.toHaveBeenCalled()
  })

  it('keeps a recompute affordance after the conflict dialog is closed', async () => {
    const user = userEvent.setup()
    const onRecompute = vi.fn()
    renderActions({ canAct: false, recomputeRequired: true, onRecompute })

    const button = screen.getByRole('button', { name: 'Recompute with latest schedule' })
    expect(button).toBeInTheDocument()
    await user.click(button)
    expect(onRecompute).toHaveBeenCalledOnce()
  })

  it('shows the server decision ID for a recorded reject or reply', () => {
    renderActions({ decisionResult: { action: 'reject', decision_id: 'decision-42', event_id: 'event-9', plan_id: data.id, replan_requested: false } })

    expect(screen.getByRole('status')).toHaveTextContent('Decision decision-42')
    expect(screen.getByRole('status')).toHaveTextContent('Linked event: event-9')
  })
})
