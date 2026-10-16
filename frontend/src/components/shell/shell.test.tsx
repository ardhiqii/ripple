// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routeTree } from '@/routes/routeTree.gen'

function renderRoute(initialEntry = '/readiness') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })

  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  }
}

describe('global application shell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      mode: 'live',
      scenarios: [
        { scenario_id: 'A-12-base', name: 'A-12 base disruption', description: 'Synthetic A-12', available: true, mode: 'live', seed_version: 'offshore-a12-v1', seed_checksum: 'a12', scenario_start_date: '2026-10-13', reset_allowed: true },
        { scenario_id: 'fleet-scale', name: 'Fleet-scale synthetic', description: 'Synthetic fleet', available: true, mode: 'live', seed_version: 'fleet-v1', seed_checksum: 'fleet', scenario_start_date: '2026-10-13', reset_allowed: true },
      ],
    }), { status: 200 })))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the four primary destinations with a non-color active state', async () => {
    renderRoute('/readiness')

    const header = await screen.findByRole('banner', { name: 'Global application header' })
    expect(header).toBeInTheDocument()
    expect(screen.getByText('A-12 / Offshore demo')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /alerts/i })).not.toBeInTheDocument()

    const primaryNavs = screen.getAllByRole('navigation', { name: 'Primary navigation' })
    expect(primaryNavs).toHaveLength(2)
    const desktopNavLinks = within(primaryNavs[0]).getAllByRole('link')
    expect(desktopNavLinks.map((link) => link.textContent)).toEqual(['Timeline', 'Readiness', 'Changes', 'History'])
    const activeLink = within(primaryNavs[0]).getByRole('link', { name: 'Readiness' })
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    expect(activeLink).toHaveClass('no-underline', 'focus-visible:outline-2', 'data-[status=active]:bg-surface-subtle')
    expect(screen.getByRole('link', { name: 'Ripple home' })).toHaveClass('no-underline', 'focus-visible:outline-2')
  })

  it('opens page navigation from the button and Control-K shortcut with focus in the dialog', async () => {
    const user = userEvent.setup()
    renderRoute('/readiness')

    await user.click(await screen.findByRole('button', { name: 'Find a page' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Find a page' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Search pages' })).toHaveFocus()
    expect(screen.getByLabelText('Page results')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fleet Timeline/ })).toHaveClass('no-underline', 'focus-visible:outline-2')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('keeps policy and demo in the environment menu and exposes no alert link', async () => {
    const user = userEvent.setup()
    renderRoute('/readiness')

    await user.click(await screen.findByLabelText('Open environment menu'))
    expect(screen.getByRole('link', { name: 'Policy and data health' })).toHaveClass('no-underline', 'focus-visible:outline-2')
    expect(screen.getByRole('link', { name: 'Demo Lab' })).toHaveClass('no-underline', 'focus-visible:outline-2')
    expect(screen.queryByRole('link', { name: /alert/i })).not.toBeInTheDocument()
  })
})
