// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { timelineRangeFromDates } from '@/features/history/history-data'
import { historyDetailFixtures, historyFixtureIds, historyListFixture } from '@/features/history/history-fixtures'
import { routeTree } from './routeTree.gen'

describe('history route handoffs', () => {
  it('translates the audit target date range into the active Timeline day range', () => {
    expect(timelineRangeFromDates('2026-10-16', '2026-10-17', '2026-10-13')).toEqual({ from: 3, to: 4 })
    expect(timelineRangeFromDates('2026-10-16', '2026-10-17')).toBeUndefined()
  })

  describe('direct audit links and typed URL filters', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost')
        if (url.pathname.endsWith('/demo/scenarios')) return jsonResponse({ mode: 'live', scenarios: [{ scenario_id: 'A-12-base', name: 'A-12 base', description: 'Synthetic A-12', available: true, mode: 'live', seed_version: 'a12-v1', seed_checksum: 'a12', scenario_start_date: '2026-10-13', reset_allowed: true }] })
        if (url.pathname.endsWith(`/decisions/${historyFixtureIds.approved}`)) return jsonResponse(historyDetailFixtures[historyFixtureIds.approved])
        if (url.pathname.endsWith('/decisions')) return jsonResponse(historyListFixture)
        return jsonResponse({})
      }))
    })

    afterEach(() => {
      cleanup()
      vi.unstubAllGlobals()
    })

    it('keeps direct audit details open and preserves typed plan_id URL state', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const router = createRouter({ routeTree, context: { queryClient }, history: createMemoryHistory({ initialEntries: [`/history?plan_id=plan-a12&decision=${historyFixtureIds.approved}`] }) })
      render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>)

      expect(await screen.findByRole('dialog')).toHaveTextContent('Immutable record')
      expect(screen.getByLabelText('Plan ID')).toHaveValue('plan-a12')
      expect(router.state.location.search).toMatchObject({ plan_id: 'plan-a12', decision: historyFixtureIds.approved })
    })
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
