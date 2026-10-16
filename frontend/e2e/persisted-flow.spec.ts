import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { openScenario } from './helpers'

const FLEET = 'fleet-scale'
const A12 = 'A-12-base'

type JsonRecord = Record<string, unknown>

async function apiJson<T extends JsonRecord>(request: APIRequestContext, path: string, scenarioId: string, options: Parameters<APIRequestContext['fetch']>[1] = {}): Promise<T> {
  const response = await request.fetch(path, {
    ...options,
    headers: {
      'X-Scenario-ID': scenarioId,
      ...(options.headers ?? {}),
    },
  })
  expect(response.ok(), `${options.method ?? 'GET'} ${path} should succeed`).toBeTruthy()
  return await response.json() as T
}

async function resetScenario(request: APIRequestContext, scenarioId: string): Promise<JsonRecord> {
  return apiJson<JsonRecord>(request, '/api/v1/demo/reset', scenarioId, {
    method: 'POST',
    data: { scenario_id: scenarioId },
  })
}

async function assertScenarioLabel(page: Page, label: string): Promise<void> {
  await expect(page.getByRole('link', { name: 'Ripple home' }).getByText(label)).toBeVisible()
}

test('fleet-scale mutations persist across pages and reset leaves A-12 isolated', async ({ page, request }) => {
  test.setTimeout(60_000)
  const scenarios = await apiJson<{ scenarios: JsonRecord[] }>(request, '/api/v1/demo/scenarios', A12)
  const fleetMetadata = scenarios.scenarios.find((scenario) => scenario.scenario_id === FLEET)
  const a12Metadata = scenarios.scenarios.find((scenario) => scenario.scenario_id === A12)
  expect(fleetMetadata?.seed_version).toBe('fleet-scale-v1')
  expect(a12Metadata?.seed_version).toBe('offshore-a12-v1')

  await resetScenario(request, FLEET)
  const a12Before = await apiJson<JsonRecord>(request, '/api/v1/schedule', A12)
  const fleetBefore = await apiJson<JsonRecord>(request, '/api/v1/schedule', FLEET)
  expect(fleetBefore.version).toBe(1)

  const readiness = await apiJson<{ items: JsonRecord[] }>(request, '/api/v1/readiness', FLEET)
  const readinessItem = readiness.items[0]
  expect(readinessItem?.id).toBe('FS-READY-001')
  await apiJson<JsonRecord>(request, `/api/v1/readiness/${readinessItem.id}`, FLEET, {
    method: 'PATCH',
    data: { status: 'ready', expected_row_version: readinessItem.row_version },
  })
  const fleetAfterMutation = await apiJson<JsonRecord>(request, '/api/v1/schedule', FLEET)
  expect(fleetAfterMutation.version).toBeGreaterThan(fleetBefore.version as number)

  await openScenario(page, '/readiness', FLEET, 'Fleet-scale synthetic')
  await expect(page.getByRole('heading', { name: 'Readiness board' })).toBeVisible()
  await expect(page.getByText('FS-READY-001')).toBeVisible()
  await page.reload()
  await assertScenarioLabel(page, 'Fleet-scale synthetic')
  await expect(page.getByText('FS-READY-001')).toBeVisible()

  const firstEvents = await apiJson<JsonRecord>(request, '/api/v1/events?limit=5', FLEET)
  expect(firstEvents.total_count).toBe(25)
  expect(firstEvents.next_cursor).toBeTruthy()
  const matchingEvents = await apiJson<JsonRecord>(request, '/api/v1/events?q=alpha-2', FLEET)
  expect(Number(matchingEvents.total_count)).toBeGreaterThan(0)

  const created = await apiJson<JsonRecord>(request, '/api/v1/events', FLEET, {
    method: 'POST',
    data: { raw_text: 'INT-15 browser event for fleet-scale persistence', nature: 'request' },
  })
  const eventId = String(created.id)
  expect(eventId).toMatch(/^[0-9a-f-]{36}$/)
  const corrected = await apiJson<JsonRecord>(request, `/api/v1/events/${eventId}/extraction`, FLEET, {
    method: 'PATCH',
    data: {
      expected_extraction_version: 0,
      extraction: {
        nature: 'request',
        cause: 'INT-15 browser run handoff',
        job_ids: ['FS-JOB-001'],
        objective: 'Protect the synthetic fleet test window.',
        requested_start: 6,
        eta_updates: [{ job_id: 'FS-JOB-001', stage: 'function_test', eta_earliest: 6, eta_latest: 6, source_excerpt: 'INT-15 browser event for fleet-scale persistence' }],
        hard_constraints: [],
        soft_preferences: [],
        risk_tags: [],
        levers_ruled_out: [],
        missing_info: [],
        source_excerpt: 'INT-15 browser event for fleet-scale persistence',
      },
    },
  })
  expect((corrected.event as JsonRecord).state).toBe('extracted')

  await openScenario(page, `/changes/${eventId}`, FLEET, 'Fleet-scale synthetic')
  await expect(page.getByRole('heading', { name: 'Change inbox' })).toBeVisible()
  await expect(page.getByRole('heading', { name: eventId })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: eventId })).toBeVisible()
  await page.getByRole('button', { name: 'Edit extraction' }).click()
  await expect(page.getByRole('heading', { name: 'Review extraction' })).toBeVisible()
  await page.getByRole('button', { name: 'Start investigation' }).click()
  await expect.poll(async () => page.evaluate((id) => {
    const runs = JSON.parse(window.sessionStorage.getItem('ripple.active-runs') ?? '[]') as Array<{ runId?: string; eventId?: string; scenarioId?: string }>
    return runs.find((run) => run.eventId === id)
  }, eventId)).toMatchObject({ eventId, scenarioId: FLEET })
  await page.reload()
  await openScenario(page, '/timeline?from=0&to=14&groups=&vendors=', FLEET, 'Fleet-scale synthetic')
  await page.getByRole('button', { name: 'Ask Ripple' }).first().click()
  await expect(page.getByRole('region', { name: 'Live Ripple trace' })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).last().click()

  const decisions = await apiJson<{ decisions: JsonRecord[] }>(request, '/api/v1/decisions', FLEET)
  const approvedDecision = decisions.decisions.find((decision) => decision.action === 'approve')
  expect(approvedDecision?.plan_id).toBeTruthy()
  expect(approvedDecision?.event_id).toBeTruthy()
  const planId = String(approvedDecision?.plan_id)

  await openScenario(page, `/decisions/${planId}`, FLEET, 'Fleet-scale synthetic')
  await expect(page.getByRole('heading', { name: 'Decision workspace' })).toBeVisible()
  await expect(page.getByText(`Plan ${planId}`)).toBeVisible()

  await openScenario(page, '/history', FLEET, 'Fleet-scale synthetic')
  await expect(page.getByRole('heading', { name: 'Decision history' })).toBeVisible()
  await expect(page.getByRole('button', { name: `Open plan ${planId} in audit mode` })).toBeVisible()

  // The readiness write above intentionally advanced the schedule. Replay the
  // exact synthetic baseline before exercising approval against a v1 plan.
  await resetScenario(request, FLEET)
  await page.evaluate(() => window.sessionStorage.removeItem('ripple.active-runs'))
  const fleetEventsForApproval = await apiJson<{ events: JsonRecord[] }>(request, '/api/v1/events?limit=50', FLEET)
  const proposedPlanId = String(fleetEventsForApproval.events.find((event) => event.latest_plan_status === 'proposed')?.latest_plan_id)
  expect(proposedPlanId).toMatch(/^[0-9a-f-]{36}$/)
  await openScenario(page, `/decisions/${proposedPlanId}`, FLEET, 'Fleet-scale synthetic')
  await expect(page.getByRole('heading', { name: 'Decision workspace' })).toBeVisible()
  await page.getByRole('button', { name: 'Approve option' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Approve option' }).click()
  await expect.poll(async () => Number((await apiJson<JsonRecord>(request, '/api/v1/schedule', FLEET)).version)).toBe(2)
  const approvedAfterBrowser = await apiJson<{ decisions: JsonRecord[] }>(request, `/api/v1/decisions?plan_id=${proposedPlanId}`, FLEET)
  expect(approvedAfterBrowser.decisions.some((decision) => decision.action === 'approve')).toBe(true)
  await openScenario(page, '/history', FLEET, 'Fleet-scale synthetic')
  await expect(page.getByRole('button', { name: `Open plan ${proposedPlanId} in audit mode` })).toBeVisible()

  await openScenario(page, '/timeline?from=0&to=14&groups=&vendors=', A12, 'A-12 / Offshore demo')
  await expect(page.getByRole('heading', { name: 'Fleet Timeline' })).toBeVisible()
  const a12BeforeReset = await apiJson<JsonRecord>(request, '/api/v1/schedule', A12)
  expect(a12BeforeReset.version).toBe(a12Before.version)
  expect(a12BeforeReset.jobs).toEqual(a12Before.jobs)

  const failedReset = await request.post('/api/v1/demo/reset', {
    headers: { 'X-Scenario-ID': 'missing-synthetic-scenario' },
    data: { scenario_id: 'missing-synthetic-scenario' },
  })
  expect(failedReset.status()).toBe(404)
  const fleetAfterFailedReset = await apiJson<JsonRecord>(request, '/api/v1/schedule', FLEET)
  expect(fleetAfterFailedReset.version).toBe(fleetAfterMutation.version)

  const reset = await resetScenario(request, FLEET)
  expect(reset.seed_version).toBe(fleetMetadata?.seed_version)
  expect(reset.seed_checksum).toBe(fleetMetadata?.seed_checksum)
  expect(reset.schedule_version).toBe(1)
  const fleetAfterReset = await apiJson<JsonRecord>(request, '/api/v1/schedule', FLEET)
  expect(fleetAfterReset.version).toBe(1)
  const readinessAfterReset = await apiJson<{ items: JsonRecord[] }>(request, '/api/v1/readiness', FLEET)
  expect(readinessAfterReset.items[0]?.status).toBe('pending')
  const eventsAfterReset = await apiJson<JsonRecord>(request, '/api/v1/events', FLEET)
  expect(eventsAfterReset.total_count).toBe(25)
  const a12AfterReset = await apiJson<JsonRecord>(request, '/api/v1/schedule', A12)
  expect(a12AfterReset.version).toBe(a12Before.version)
  expect(a12AfterReset.jobs).toEqual(a12Before.jobs)
})
