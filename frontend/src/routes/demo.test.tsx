// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO_ID, setActiveScenarioContext } from '@/api/transport'
import { RunRegistryProvider } from '@/features/agent/run-registry'
import { routeTree } from './routeTree.gen'

const scenarios = [
  {
    scenario_id: 'A-12-base',
    name: 'A-12 base disruption',
    description: 'Synthetic A-12',
    available: true,
    mode: 'recorded',
    seed_version: 'offshore-a12-v1',
    seed_checksum: 'a12-checksum',
    scenario_start_date: '2026-10-13',
    reset_allowed: true,
  },
  {
    scenario_id: 'fleet-scale',
    name: 'Fleet-scale synthetic',
    description: 'Synthetic fleet',
    available: true,
    mode: 'live',
    seed_version: 'fleet-scale-v1',
    seed_checksum: 'fleet-checksum',
    scenario_start_date: '2026-10-13',
    reset_allowed: true,
  },
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
    ...render(<QueryClientProvider client={queryClient}><RunRegistryProvider><RouterProvider router={router} /></RunRegistryProvider></QueryClientProvider>),
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setActiveScenarioContext(DEFAULT_SCENARIO_ID, [DEFAULT_SCENARIO_ID])
})

describe('Demo route live flow', () => {
  it('navigates with the server-created event ID after extraction starts', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init])
      const path = new URL(String(input), 'http://localhost').pathname
      if (path === '/api/v1/demo/scenarios') return new Response(JSON.stringify({ mode: 'live', scenarios }), { status: 200 })
      if (path === '/api/v1/events' && init?.method === 'POST') return new Response(JSON.stringify({ id: 'server-event-id', raw_text: 'Fleet disruption', state: 'received' }), { status: 200 })
      if (path === '/api/v1/events/server-event-id/extract') return new Response(JSON.stringify({ event_id: 'server-event-id', state: 'extracted', extraction_version: 1, status: 'completed' }), { status: 200 })
      return new Response(JSON.stringify({ events: [], total_count: 0, scenario_lifecycle_counts: {} }), { status: 200 })
    }))

    const { router } = renderRoute('/demo?scenario=fleet-scale')
    const user = userEvent.setup()
    const fleetCard = (await screen.findByRole('heading', { name: 'Fleet-scale synthetic' })).closest('article')
    expect(fleetCard).not.toBeNull()

    await user.click(within(fleetCard!).getByRole('button', { name: 'Run live' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/changes/server-event-id'))
    expect(calls.filter(([input]) => String(input).includes('/api/v1/events')).map(([input]) => String(input))).toContain('/api/v1/events')
    const eventRequest = calls.find(([input]) => String(input) === '/api/v1/events')
    const extractRequest = calls.find(([input]) => String(input).endsWith('/api/v1/events/server-event-id/extract'))
    expect(new Headers(eventRequest?.[1]?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
    expect(new Headers(extractRequest?.[1]?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
  })

  it('shows the successful reset receipt and refetches scenario metadata', async () => {
    const scenarioCalls: Array<RequestInfo | URL> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname
      if (path === '/api/v1/demo/scenarios') {
        scenarioCalls.push(input)
        return new Response(JSON.stringify({ mode: 'live', scenarios }), { status: 200 })
      }
      if (path === '/api/v1/demo/reset') return new Response(JSON.stringify({
        scenario_id: 'fleet-scale',
        seed_version: 'fleet-scale-v1',
        seed_checksum: 'restored-checksum',
        schedule_version: 9,
        reset_at: '2026-10-15T10:00:00Z',
      }), { status: 200 })
      return new Response(JSON.stringify({ events: [], total_count: 0, scenario_lifecycle_counts: {} }), { status: 200 })
    }))

    renderRoute('/demo?scenario=fleet-scale')
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Fleet-scale synthetic' })
    await user.click(screen.getByRole('button', { name: 'Reset selected scenario' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset selected scenario' }))

    const receipt = await screen.findByRole('region', { name: 'Last reset receipt' })
    expect(receipt).toHaveTextContent('restored-checksum')
    expect(receipt).toHaveTextContent('fleet-scale-v1')
    expect(receipt).toHaveTextContent('v9')
    expect(scenarioCalls.length).toBeGreaterThanOrEqual(3)
  })
})
