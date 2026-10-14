// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

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
  afterEach(() => {
    cleanup()
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
    expect(within(primaryNavs[0]).getByRole('link', { name: 'Readiness' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens command search from the button and Control-K shortcut with focus in the dialog', async () => {
    const user = userEvent.setup()
    renderRoute('/readiness')

    await user.click(await screen.findByRole('button', { name: 'Open command search' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Search command results' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('keeps policy and demo in the environment menu and exposes no alert link', async () => {
    const user = userEvent.setup()
    renderRoute('/readiness')

    await user.click(await screen.findByLabelText('Open environment menu'))
    expect(screen.getByRole('link', { name: 'Policy and data health' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Demo Lab' })).toBeVisible()
    expect(screen.queryByRole('link', { name: /alert/i })).not.toBeInTheDocument()
  })
})
