// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { eventInboxFixture, eventLifecycleMeta } from '@/features/events/events-data'
import type { ChangesSearch } from '@/routes/search-schemas'
import { ChangeInbox } from './change-inbox'

vi.mock('@tanstack/react-router', () => ({ useBlocker: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderInbox(initialSearch: ChangesSearch = {}) {
  const onOpenPlan = vi.fn()
  const view = render(<ChangeInbox search={initialSearch} onSearchChange={vi.fn()} onOpenPlan={onOpenPlan} />)
  return { ...view, onOpenPlan }
}

describe('ChangeInbox', () => {
  it('offers a clear reset when filters produce no results', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(<ChangeInbox search={{ q: 'does-not-exist' }} onSearchChange={onSearchChange} onOpenPlan={vi.fn()} />)

    expect(screen.getByText('No events match these filters.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onSearchChange).toHaveBeenCalledWith({ q: undefined, nature: undefined, state: undefined, job: undefined })
  })

  it('keeps action failure visible and exposes a retry action', async () => {
    const user = userEvent.setup()
    const readyItem = eventInboxFixture.find((item) => item.lifecycle === 'ready')
    expect(readyItem).toBeDefined()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    renderInbox()

    await user.click(screen.getByRole('button', { name: eventLifecycleMeta.ready.primaryAction }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/investigation could not start/i)
    expect(screen.getByRole('button', { name: 'Retry action' })).toBeInTheDocument()
  })

  it('returns focus to the event row after its preview closes', async () => {
    const user = userEvent.setup()
    const item = eventInboxFixture[0]!
    function Harness() {
      const [search, setSearch] = useState<ChangesSearch>({})
      return <ChangeInbox search={search} onSearchChange={(patch) => setSearch((current) => ({ ...current, ...patch }))} onOpenPlan={vi.fn()} />
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: new RegExp(item.id) })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
