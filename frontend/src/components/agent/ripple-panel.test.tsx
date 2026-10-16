// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RunRegistryProvider } from '@/features/agent/run-registry'
import { setActiveScenarioContext } from '@/api/transport'
import { RipplePanel, type RippleContext } from './ripple-panel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
  setActiveScenarioContext('A-12-base', ['A-12-base'])
})

const context: RippleContext = { route: '/timeline', jobIds: ['A-12', 'D-07'], resourceIds: ['barge-01'], scheduleVersion: 4 }

function renderPanel(props: Partial<React.ComponentProps<typeof RipplePanel>> = {}) {
  const queryClient = new QueryClient()
  return render(<QueryClientProvider client={queryClient}><RunRegistryProvider><RipplePanel open mode="submit" context={context} onOpenChange={vi.fn()} {...props} /></RunRegistryProvider></QueryClientProvider>)
}

describe('RipplePanel', () => {
  it('keeps mode and context visible, and removes context from the submit payload', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => undefined)
    renderPanel({ onSubmit })

    expect(screen.getByRole('heading', { name: 'Submit change' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Submit change' }).find((button) => button.getAttribute('aria-pressed') === 'true')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Job A-12')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove Job A-12 context' }))
    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Protect the test window.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    expect(onSubmit).toHaveBeenCalledWith({ rawText: 'Protect the test window.', context: expect.objectContaining({ jobIds: ['D-07'], resourceIds: ['barge-01'] }) })
  })

  it('renders the read-only Ask answer without creating an event or run', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/v1/ask')
      expect(init?.method).toBe('POST')
      return new Response(JSON.stringify({
        scenario_id: 'A-12-base',
        answer: 'A-12 is backed by the persisted readiness record.',
        evidence: [{ entity_type: 'job', entity_id: 'A-12', label: 'Job A-12', source_updated_at: '2026-10-13T10:00:00Z' }],
        freshness: 'current',
        uncertainty: 'This answer is limited to persisted facts.',
        schedule_version: 4,
        answered_at: '2026-10-13T10:00:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetcher)
    renderPanel({ mode: 'ask', onOpenChange })

    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Why is A-12 at risk?')
    await user.click(screen.getByRole('button', { name: 'Ask Ripple' }))
    expect(await screen.findByRole('region', { name: 'Read-only Ask answer' })).toHaveTextContent('A-12 is backed by the persisted readiness record.')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/events'))).toBe(false)
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/runs'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(abort).not.toHaveBeenCalled()
    abort.mockRestore()
  })

  it('creates an event and starts extraction before any run can be started', async () => {
    const user = userEvent.setup()
    const onEventCreated = vi.fn()
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      calls.push(path)
      if (path.endsWith('/events')) return new Response(JSON.stringify({ id: 'event-1', state: 'received', extraction_version: 0, raw_text: 'Protect the test window.' }), { status: 201, headers: { 'Content-Type': 'application/json' } })
      if (path.endsWith('/events/event-1/extract')) return new Response(JSON.stringify({ event_id: 'event-1', state: 'planning', extraction_version: 0, status: 'queued' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      throw new Error(`Unexpected request: ${path}`)
    }))
    renderPanel({ onEventCreated })

    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Protect the test window.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    await waitFor(() => expect(onEventCreated).toHaveBeenCalledWith('event-1'))
    expect(calls.map((path) => path.split('?')[0])).toEqual(['/api/v1/events', '/api/v1/events/event-1/extract'])
    expect(calls.some((path) => path.includes('/runs'))).toBe(false)
  })

  it('registers a started run with the active scenario for refresh recovery', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => ({ eventId: 'event-1', runId: 'run-1' }))
    renderPanel({ onSubmit })

    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Protect the test window.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    await waitFor(() => expect(JSON.parse(window.sessionStorage.getItem('ripple.active-runs') ?? '[]')).toEqual([
      expect.objectContaining({ runId: 'run-1', eventId: 'event-1', scenarioId: 'A-12-base', status: 'queued' }),
    ]))
  })

  it('resumes an active run from its persisted last sequence', async () => {
    window.sessionStorage.setItem('ripple.active-runs', JSON.stringify([{ runId: 'run-1', eventId: 'event-1', status: 'streaming', startedAt: '2026-10-13T10:00:00Z', lastSeq: 2, scenarioId: 'A-12-base' }]))
    const body = 'id: 3\nevent: done\ndata: {"run_id":"run-1","seq":3,"type":"done","timestamp":"2026-10-13T10:00:03Z","phase":"complete","public":{"summary":"Run resumed."}}\n\n'
    const fetcher = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetcher)
    renderPanel()

    expect(await screen.findByText('Run resumed.')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledWith('/api/v1/runs/run-1/stream?after=2', expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('does not resume a run belonging to another scenario', async () => {
    window.sessionStorage.setItem('ripple.active-runs', JSON.stringify([{ runId: 'fleet-run', eventId: 'fleet-event', status: 'streaming', startedAt: '2026-10-13T10:00:00Z', lastSeq: 2, scenarioId: 'fleet-scale' }]))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    renderPanel()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not resume a run without a verified scenario', async () => {
    window.sessionStorage.setItem('ripple.active-runs', JSON.stringify([{ runId: 'unscoped-run', eventId: 'event-1', status: 'streaming', startedAt: '2026-10-13T10:00:00Z', lastSeq: 2 }]))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    renderPanel()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('disables Ask with an explanation after a truthful unavailable response', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'ask_unavailable', message: 'Ask is unavailable.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    renderPanel({ mode: 'ask' })

    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'What is current?')
    await user.click(screen.getByRole('button', { name: 'Ask Ripple' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ask is unavailable.')
    expect(screen.getByRole('button', { name: 'Ask Ripple' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Read-only Ask is unavailable')
    expect(screen.getByRole('button', { name: 'Submit change' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Retry Ask' })).toBeEnabled()
  })

  it('keeps submit failures visible and announces the loading phase', async () => {
    const user = userEvent.setup()
    let resolveSubmit!: () => void
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve }))
    const view = renderPanel({ onSubmit })

    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Protect the test window.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    expect(screen.getByRole('status')).toHaveTextContent(/starting change extraction/i)
    expect(screen.getByRole('button', { name: 'Starting...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Starting...' })).toHaveAttribute('aria-busy', 'true')
    resolveSubmit()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

    const failedSubmit = vi.fn(async () => { throw new Error('Network unavailable.') })
    view.rerender(<QueryClientProvider client={new QueryClient()}><RunRegistryProvider><RipplePanel open mode="submit" context={context} onOpenChange={vi.fn()} onSubmit={failedSubmit} /></RunRegistryProvider></QueryClientProvider>)
    await user.type(screen.getByRole('textbox', { name: 'Change request' }), 'Try again.')
    await user.click(screen.getAllByRole('button', { name: 'Submit change' }).at(-1)!)

    expect(await screen.findByRole('alert')).toHaveTextContent(/network unavailable/i)
  })
})
