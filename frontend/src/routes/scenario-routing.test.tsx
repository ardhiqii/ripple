// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiTransport, DEFAULT_SCENARIO_ID, setActiveScenarioContext } from '@/api/transport'
import { routeTree } from './routeTree.gen'

const scenarios = [
  { scenario_id: 'A-12-base', name: 'A-12 base disruption', description: 'Synthetic A-12', available: true, mode: 'live', seed_version: 'offshore-a12-v1', seed_checksum: 'a12', scenario_start_date: '2026-10-13', reset_allowed: true },
  { scenario_id: 'fleet-scale', name: 'Fleet-scale synthetic', description: 'Synthetic fleet', available: true, mode: 'live', seed_version: 'fleet-v1', seed_checksum: 'fleet', scenario_start_date: '2026-10-13', reset_allowed: true },
]

function renderRoute(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  return {
    router,
    ...render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>),
  }
}

describe('scenario URL and selector continuity', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).includes('/demo/scenarios')) return Promise.resolve(new Response(JSON.stringify({ mode: 'live', scenarios }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    setActiveScenarioContext(DEFAULT_SCENARIO_ID, [DEFAULT_SCENARIO_ID])
  })

  it('honors a fleet deep link and keeps the scenario on a primary navigation change', async () => {
    const { router } = renderRoute('/readiness?scenario=fleet-scale')

    expect(await screen.findByRole('heading', { name: 'Readiness board' })).toBeInTheDocument()
    expect(screen.getAllByText('Fleet-scale synthetic').length).toBeGreaterThan(0)

    await userEvent.setup().click(within(screen.getAllByRole('navigation', { name: 'Primary navigation' })[0]).getByRole('link', { name: 'Timeline' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ scenario: 'fleet-scale' }))
    expect(router.state.location.pathname).toBe('/timeline')
  })

  it('switches only to advertised scenarios, confirms the switch, and updates transport headers', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    const { router } = renderRoute('/readiness?scenario=A-12-base&item=readiness-1&q=stale-selection')

    await screen.findByRole('heading', { name: 'Readiness board' })
    await user.click(screen.getByLabelText('Open environment menu'))
    const selector = screen.getByRole('combobox', { name: 'Select environment scenario' })
    await user.selectOptions(selector, 'fleet-scale')

    await waitFor(() => expect(router.state.location.search).toMatchObject({ scenario: 'fleet-scale' }))
    expect(router.state.location.search).not.toHaveProperty('item')
    expect(router.state.location.search).not.toHaveProperty('q')
    expect(selector).toHaveValue('fleet-scale')
    expect(screen.getAllByText('Fleet-scale synthetic').length).toBeGreaterThan(0)
    expect(confirm).toHaveBeenCalledTimes(1)

    await apiTransport.get('/api/v1/schedule')
    const calls = vi.mocked(globalThis.fetch).mock.calls
    expect(new Headers(calls.at(-1)?.[1]?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
  })

  it('does not enter an unknown scenario from a crafted URL', async () => {
    renderRoute('/readiness?scenario=not-advertised')

    expect(await screen.findByRole('heading', { name: 'Unknown scenario' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Readiness board' })).not.toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('does not turn an explicit blank scenario into the default scenario', async () => {
    renderRoute('/readiness?scenario=')

    expect(await screen.findByRole('heading', { name: 'Unknown scenario' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Readiness board' })).not.toBeInTheDocument()
  })

  it('keeps the compact selector keyboard-addressable in the environment menu', async () => {
    const user = userEvent.setup()
    renderRoute('/readiness')

    await screen.findByRole('heading', { name: 'Readiness board' })
    await user.click(screen.getByLabelText('Open environment menu'))
    const menu = screen.getByLabelText('Open environment menu').parentElement
    expect(menu ? within(menu).getByRole('combobox', { name: 'Select environment scenario' }) : null).toBeInTheDocument()
  })
})
