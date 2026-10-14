// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PolicyWorkspaceData } from '@/features/policy/policy-data'
import { PolicyWorkspace } from './policy-workspace'

afterEach(() => cleanup())

const workspaceData: PolicyWorkspaceData = {
  levers: [
    { name: 'expedite_vendor_test', allowed: true, approvalOwner: 'planner', costWeight: '2' },
    { name: 'cancel_job', allowed: false, approvalOwner: 'never', costWeight: '100' },
  ],
  profiles: [{ name: 'balanced', delayWeight: '1', leverCostWeight: '2', movementWeight: '1', riskWeight: '3', isDefault: true }],
  freshnessPolicy: { asOf: '2026-10-13T10:00:00Z', staleAfterHours: 48 },
  sources: [{ name: 'vendor_update', lastSuccessfulUpdate: '2026-10-13T09:00:00Z', freshnessState: 'stale', affectedCount: 3, latestError: 'API timeout', staleCount: 1 }],
}

function renderWorkspace(search = {}) {
  return render(<PolicyWorkspace data={workspaceData} search={search} onSearchChange={vi.fn()} onOpenLever={vi.fn()} onExplainApprovalOwner={vi.fn()} onCopyPolicyLink={vi.fn()} onViewAffectedItems={vi.fn()} />)
}

describe('PolicyWorkspace', () => {
  it('keeps policy controls read-only and opens a lever definition sheet', async () => {
    const user = userEvent.setup()
    const onOpenLever = vi.fn()
    const onCopyPolicyLink = vi.fn()
    render(<PolicyWorkspace data={workspaceData} search={{}} onSearchChange={vi.fn()} onOpenLever={onOpenLever} onExplainApprovalOwner={vi.fn()} onCopyPolicyLink={onCopyPolicyLink} onViewAffectedItems={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /^(edit|reconnect|admin)$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Used in decisions')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'expedite_vendor_test' }))
    expect(onOpenLever).toHaveBeenCalledWith('expedite_vendor_test')
    expect(screen.getByRole('dialog')).toHaveTextContent('Action definition')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getAllByRole('button', { name: 'Copy policy link' })[0]!)
    expect(onCopyPolicyLink).toHaveBeenCalledWith('expedite_vendor_test')
  })

  it('treats forbidden levers as neutral locked policy constraints', () => {
    renderWorkspace()

    expect(screen.getByText('Forbidden')).toBeInTheDocument()
    expect(screen.getByText('Forbidden').className).toContain('bg-surface-subtle')
    expect(screen.getByText('Forbidden').className).not.toContain('bg-danger')
  })

  it('restores the selected section from controlled search state', () => {
    renderWorkspace({ section: 'data-sources' })

    expect(screen.getByRole('button', { name: 'Data sources' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Data sources' })).toBeInTheDocument()
  })

  it('renders freshness health and delegates affected-item navigation', async () => {
    const user = userEvent.setup()
    const onViewAffectedItems = vi.fn()
    render(<PolicyWorkspace data={workspaceData} search={{}} onSearchChange={vi.fn()} onOpenLever={vi.fn()} onExplainApprovalOwner={vi.fn()} onCopyPolicyLink={vi.fn()} onViewAffectedItems={onViewAffectedItems} />)

    expect(screen.getByText('Stale')).toBeInTheDocument()
    expect(screen.getByText('API timeout')).toBeInTheDocument()
    expect(screen.getAllByText('3')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'View affected items' }))
    expect(onViewAffectedItems).toHaveBeenCalledWith('vendor_update')
  })

  it('uses instant section navigation when reduced motion is preferred', () => {
    const scrollIntoView = vi.fn()
    const originalMatchMedia = window.matchMedia
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      renderWorkspace({ section: 'data-sources' })
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    } finally {
      window.matchMedia = originalMatchMedia
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })
})
