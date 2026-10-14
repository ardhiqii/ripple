// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { streamRun } from '@/api/agent-runs'
import { DecisionActions } from '@/components/decision/decision-actions'
import { DecisionWorkspace } from '@/components/decision/decision-workspace'
import { DemoLab } from '@/components/demo/demo-lab'
import { a12ComparisonFixture, a12ScenarioFixtures, DEMO_SCENARIO_IDS } from '@/features/demo/demo-data'
import { resetDemo } from '@/features/demo/demo-api'
import { recordedDemoFixtures, recordedEventToSseFrame, serializeRecordedSseFrame } from '@/features/demo/demo-recorded'
import { createRunState, runReducer, type PublicRunEvent, type RunState } from '@/features/agent/run-reducer'
import { planWorkspaceById } from '@/features/plans/plan-data'
import { apiErrorFixture } from '@/mocks/fixtures'
import { infeasiblePlanFixture, numericFallbackPlanFixture, recordedEventsAfter, recordedRunEvents } from '@/mocks/plan-fixtures'
import { server } from '@/mocks/server'

beforeAll(() => server.listen())
afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

const runId = '00000000-0000-0000-0000-000000000101'
const eventId = '00000000-0000-0000-0000-000000000012'
type RecordedEvent = Parameters<typeof recordedEventToSseFrame>[0]

describe('INT-06 failure-path integration', () => {
  it('shows the engine-unavailable state while keeping the recorded fallback inspectable', () => {
    render(
      <DemoLab
        scenarios={Object.values(a12ScenarioFixtures)}
        selectedScenarioId={DEMO_SCENARIO_IDS.base}
        mode="recorded"
        comparison={a12ComparisonFixture}
        recordedFixture={recordedDemoFixtures[DEMO_SCENARIO_IDS.base]}
        error="Agent unavailable. Showing the cached recorded scenario result."
        onSelectScenario={vi.fn()}
        onRunScenario={vi.fn()}
        onRunRecorded={vi.fn()}
        onComparePair={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Agent unavailable')
    expect(screen.getByRole('region', { name: 'Recorded public trace' })).toHaveTextContent(
      'Recorded A-12 base run completed.',
    )
    expect(screen.queryByText('Schedule changes applied')).not.toBeInTheDocument()
  })

  it('preserves the partial trace and resumes the recorded SSE stream after disconnect', async () => {
    const toSse = (events: readonly RecordedEvent[]) => events
      .map((event) => recordedEventToSseFrame(event, runId))
      .filter((frame): frame is NonNullable<typeof frame> => frame !== null)
      .map(serializeRecordedSseFrame)
      .join('')
    const partialBody = toSse(recordedRunEvents.slice(0, 2))
    const resumedBody = toSse(recordedEventsAfter(2))
    let emitted = false
    const disconnectedStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted) {
          controller.error(new Error('recorded stream disconnected'))
          return
        }
        emitted = true
        controller.enqueue(new TextEncoder().encode(partialBody))
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(disconnectedStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(resumedBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)

    let state: RunState = createRunState(runId, eventId)
    const onEvent = (event: PublicRunEvent) => {
      state = runReducer(state, { type: 'event', event })
    }
    const onError = vi.fn((error: Error) => {
      state = runReducer(state, { type: 'stream_error', error: error.message })
    })

    await expect(streamRun(runId, { onEvent, onError })).rejects.toThrow()
    expect(onError).toHaveBeenCalledOnce()
    expect(state).toMatchObject({ status: 'reconnecting', lastSeq: 2 })
    expect(state.events.map((event) => event.seq)).toEqual([1, 2])
    expect(state.events[1]?.public).toMatchObject({ summary: 'Readiness checks completed.' })
    expect(state).not.toMatchObject({ status: 'completed' })

    await streamRun(runId, { after: state.lastSeq, onEvent })

    expect(state.status).toBe('completed')
    expect(state.lastSeq).toBe(4)
    expect(state.events.map((event) => event.seq)).toEqual([1, 2, 3, 4])
    expect(state.events[2]?.public).toMatchObject({ summary: 'Verified plan options are ready for review.' })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/runs/00000000-0000-0000-0000-000000000101/stream?after=2', expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('keeps an infeasible solver option visible but not selectable', () => {
    const data = planWorkspaceById(infeasiblePlanFixture.id)
    render(
      <DecisionWorkspace
        data={data}
        compareIds={[]}
        activeTab="overview"
        onSelectOption={vi.fn()}
        onCompareChange={vi.fn()}
        onTabChange={vi.fn()}
        onEvidenceChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Infeasible' })).toBeDisabled()
    expect(screen.getByText('Test bay is not ready.')).toBeInTheDocument()
    expect(screen.queryByText('Schedule changes applied')).not.toBeInTheDocument()
  })

  it('retains the numeric mismatch fallback marker instead of reporting a passed check', async () => {
    const response = await fetch(`http://localhost/api/v1/plans/${numericFallbackPlanFixture.id}`)
    const plan = await response.json()
    const data = planWorkspaceById(numericFallbackPlanFixture.id)

    expect(response.status).toBe(200)
    expect(plan.explanation.numeric_check).toEqual({ status: 'fallback', mismatches: [] })
    expect(data.explanation.numeric_check).toEqual({ status: 'fallback', mismatches: [] })
    expect(data.explanation.numeric_check).not.toEqual({ status: 'passed' })

    render(
      <DecisionWorkspace
        data={data}
        selectedOptionId={data.options[0]?.id}
        compareIds={[]}
        activeTab="overview"
        onSelectOption={vi.fn()}
        onCompareChange={vi.fn()}
        onTabChange={vi.fn()}
        onEvidenceChange={vi.fn()}
      />,
    )
    expect(screen.getByText('The engine returned a verified schedule result.')).toBeInTheDocument()
    expect(screen.queryByText(/numeric check passed/i)).not.toBeInTheDocument()
  })

  it('surfaces offline and server database failures as failures, never successful data', async () => {
    await expect(fetch('http://localhost/api/v1/events?scenario=offline')).rejects.toThrow()

    const databaseFailure = await fetch('http://localhost/api/v1/policy/data-health?scenario=server-error')
    expect(databaseFailure.status).toBe(500)
    expect(await databaseFailure.json()).toMatchObject({
      error: { code: 'internal_error', message: 'Fixture server error.' },
    })
  })

  it('keeps stale approval in conflict review and offers recompute without force apply', async () => {
    const user = userEvent.setup()
    const data = planWorkspaceById('00000000-0000-0000-0000-000000000201')
    const selectedOption = data.options[0]!
    const onApprove = vi.fn()
    const onRecompute = vi.fn()

    render(
      <DecisionActions
        data={data}
        selectedOption={selectedOption}
        acknowledgedConditionIds={selectedOption.conditions.map((condition) => condition.id)}
        conflict={{
          currentScheduleVersion: data.baseScheduleVersion + 1,
          changedObjectIds: ['A-12'],
          message: 'Schedule changed since this plan was created.',
        }}
        onApprove={onApprove}
        onReject={vi.fn()}
        onReply={vi.fn()}
        onRecompute={onRecompute}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Approve option' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Schedule changed since this plan was created.')
    expect(screen.getByRole('dialog')).toHaveTextContent('Changed objects: A-12')
    expect(screen.getByRole('button', { name: 'Recompute with latest schedule' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Force apply' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recompute with latest schedule' }))

    expect(onRecompute).toHaveBeenCalledOnce()
    expect(onApprove).not.toHaveBeenCalled()
    expect(screen.queryByText('Schedule changes applied')).not.toBeInTheDocument()
  })

  it('keeps reset failure open and does not claim the demo reset succeeded', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/demo/reset', () => HttpResponse.json(
        apiErrorFixture('internal_error', 'Database reset unavailable.'),
        { status: 503 },
      )),
    )

    const onReset = vi.fn(async () => { await resetDemo('A-12-base') })
    render(
      <DemoLab
        scenarios={Object.values(a12ScenarioFixtures)}
        selectedScenarioId={DEMO_SCENARIO_IDS.base}
        mode="recorded"
        comparison={a12ComparisonFixture}
        recordedFixture={recordedDemoFixtures[DEMO_SCENARIO_IDS.base]}
        onSelectScenario={vi.fn()}
        onRunScenario={vi.fn()}
        onRunRecorded={vi.fn()}
        onComparePair={vi.fn()}
        onReset={onReset}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Reset all demo data' }))
    await user.click(screen.getAllByRole('button', { name: 'Reset all demo data' }).at(-1)!)
    await waitFor(() => expect(onReset).toHaveBeenCalledOnce())

    const resetRequest = onReset.mock.results[0]?.value
    await expect(resetRequest).rejects.toMatchObject({
      name: 'DemoApiError',
      status: 503,
      message: 'Database reset unavailable.',
    })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recorded public trace' })).toHaveTextContent(
      'Recorded A-12 base run completed.',
    )
    expect(screen.queryByText('Reset complete')).not.toBeInTheDocument()
  })
})
