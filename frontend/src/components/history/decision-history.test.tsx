// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { historyFixture, historyFixtureIds } from '@/features/history/history-fixtures'
import { DecisionHistory, type DecisionHistoryProps } from './decision-history'

afterEach(() => cleanup())

function renderHistory(overrides: Partial<DecisionHistoryProps> = {}) {
  const props: DecisionHistoryProps = {
    data: historyFixture,
    search: {},
    onSearchChange: vi.fn(),
    onSelectedDecisionChange: vi.fn(),
    onOpenTimeline: vi.fn(),
    onOpenSourceEvent: vi.fn(),
    onOpenDecisionWorkspace: vi.fn(),
    onStartSimilarChange: vi.fn(),
    onCopyStableLink: vi.fn(),
    ...overrides,
  }
  return { ...render(<DecisionHistory {...props} />), props }
}

describe('DecisionHistory', () => {
  afterEach(() => vi.useRealTimers())

  it('renders server-scoped summary metrics and sends route-ready search callbacks', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const view = renderHistory({ onSearchChange })

    expect(screen.getByText('Server decisions')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Action'), 'approve')
    expect(onSearchChange).toHaveBeenCalledWith({ action: 'approve' })
    view.rerender(<DecisionHistory {...view.props} search={{ action: 'approve' }} />)
    expect(screen.getByText('D-07 vendor delay and seal finding')).toBeInTheDocument()
  })

  it('has no edit controls and opens an immutable audit detail with the required sequence', async () => {
    const user = userEvent.setup()
    renderHistory({ selectedDecisionId: historyFixtureIds.approved })

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Immutable record')
    expect(screen.getByRole('region', { name: 'Audit timeline' })).toHaveTextContent('Source received')
    expect(screen.getByRole('region', { name: 'Audit timeline' })).toHaveTextContent('Applied changes')
    await user.click(screen.getByRole('button', { name: 'Close' }))
  })

  it('sends stable callback targets for Timeline, source, workspace, copy, and similar change', async () => {
    const user = userEvent.setup()
    const onOpenTimeline = vi.fn()
    const onOpenSourceEvent = vi.fn()
    const onOpenDecisionWorkspace = vi.fn()
    const onCopyStableLink = vi.fn()
    const onStartSimilarChange = vi.fn()
    renderHistory({ selectedDecisionId: historyFixtureIds.approved, onOpenTimeline, onOpenSourceEvent, onOpenDecisionWorkspace, onCopyStableLink, onStartSimilarChange })

    await user.click(screen.getByRole('button', { name: 'Open Timeline' }))
    await user.click(screen.getByRole('button', { name: 'Source event' }))
    await user.click(screen.getByRole('button', { name: 'Decision Workspace' }))
    await user.click(screen.getByRole('button', { name: 'Copy stable link' }))
    await user.click(screen.getByRole('button', { name: 'Start similar change' }))

    expect(onOpenTimeline).toHaveBeenCalledWith({ decisionId: historyFixtureIds.approved, from: '2026-09-29', to: '2026-09-29', jobId: 'A-12' })
    expect(onOpenSourceEvent).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000012')
    expect(onOpenDecisionWorkspace).toHaveBeenCalledWith({ decisionId: historyFixtureIds.approved, planId: '00000000-0000-0000-0000-000000000201', mode: 'audit' })
    expect(onCopyStableLink).toHaveBeenCalledWith({ decisionId: historyFixtureIds.approved, url: `/history?decision=${historyFixtureIds.approved}` })
    expect(onStartSimilarChange).toHaveBeenCalledWith({ decisionId: historyFixtureIds.approved, planId: '00000000-0000-0000-0000-000000000201', eventId: '00000000-0000-0000-0000-000000000012', context: 'A-12 vendor ETA moved to D+6' })
  })

  it('separates a truly empty history from an active filter with no matches', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const emptyData = { ...historyFixture, decisions: [], details: {}, summary: { total: 0, approvals: 0, rejections: 0, replies: 0, conditional: 0 } }
    const emptyView = renderHistory({ data: emptyData, onSearchChange })

    expect(screen.getByText('No decisions recorded yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Demo Lab' })).toHaveAttribute('href', '/demo')
    emptyView.unmount()

    const view = renderHistory({ onSearchChange, search: { q: 'does-not-exist' } })
    const filteredEmptyData = { ...historyFixture, decisions: [], details: {}, summary: { total: 0, approvals: 0, rejections: 0, replies: 0, conditional: 0 } }
    view.rerender(<DecisionHistory {...view.props} data={filteredEmptyData} />)
    expect(screen.getByText('No decisions match these server filters.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onSearchChange).toHaveBeenCalledWith({ from: undefined, to: undefined, action: undefined, planId: undefined, nature: undefined, job: undefined, actor: undefined, conditional: undefined, q: undefined })
    view.unmount()
  })

  it('debounces free-text search before notifying the server-backed route', () => {
    vi.useFakeTimers()
    const onSearchChange = vi.fn()
    renderHistory({ onSearchChange })

    fireEvent.change(screen.getByLabelText('Search decisions'), { target: { value: 'vendor' } })
    expect(onSearchChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(219))
    expect(onSearchChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSearchChange).toHaveBeenCalledWith({ q: 'vendor' })
  })

  it('keeps Clear filters available while filtered records are still visible', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    renderHistory({ onSearchChange, search: { actor: 'planner.demo' } })

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onSearchChange).toHaveBeenCalledWith({ from: undefined, to: undefined, action: undefined, planId: undefined, nature: undefined, job: undefined, actor: undefined, conditional: undefined, q: undefined })
  })
})
