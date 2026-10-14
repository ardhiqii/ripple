import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

import { createRun } from '@/api/agent-runs'
import { DemoLab } from '@/components/demo/demo-lab'
import { toast } from '@/components/ui'
import { useRunRegistry } from '@/features/agent/run-registry'
import { createDemoEvent, useDemoReset, useDemoScenarios } from '@/features/demo/demo-api'
import { a12ComparisonFixture, DEMO_SCENARIO_IDS, demoScenarioFixtures, findDemoScenario, type DemoMode, type DemoScenarioId, type DemoScenarioMetadata } from '@/features/demo/demo-data'
import { recordedDemoFixtures } from '@/features/demo/demo-recorded'
import { clearDemoLocalState } from '@/features/demo/demo-state'
import { demoSearchSchema } from './search-schemas'

export const Route = createFileRoute('/demo')({
  validateSearch: demoSearchSchema,
  component: DemoRoute,
})

function DemoRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const registry = useRunRegistry()
  const scenariosQuery = useDemoScenarios()
  const resetMutation = useDemoReset()
  const [runPending, setRunPending] = useState<'live' | 'recorded' | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const selectedId = findDemoScenario(search.scenario ?? '')?.id ?? DEMO_SCENARIO_IDS.base
  const selected = findDemoScenario(selectedId) ?? findDemoScenario(DEMO_SCENARIO_IDS.base)!
  const scenarios = useMemo(() => {
    const values = new Map<DemoScenarioId, DemoScenarioMetadata>(demoScenarioFixtures.map((scenario) => [scenario.id, scenario]))
    for (const scenario of scenariosQuery.data ?? []) values.set(scenario.id, scenario)
    return [...values.values()]
  }, [scenariosQuery.data])
  const mode: DemoMode = search.mode === 'live' || search.mode === 'recorded' || search.mode === 'full' ? search.mode : scenariosQuery.data?.[0]?.mode ?? 'recorded'
  const recordedFixture = mode === 'recorded' || mode === 'full' ? recordedDemoFixtures[selected.id] : undefined
  const error = runError ?? (scenariosQuery.isError ? scenariosQuery.error instanceof Error ? scenariosQuery.error.message : 'Demo metadata could not be loaded.' : null)

  const updateSearch = (patch: { scenario?: string; mode?: string; step?: string }) => navigate({ search: (previous) => ({ ...previous, ...patch }) })

  const runScenario = async (scenarioId: DemoScenarioId) => {
    const scenario = findDemoScenario(scenarioId)
    if (!scenario) return
    setRunError(null)
    setRunPending('live')
    try {
      const eventId = await createDemoEvent(scenario.message)
      const run = await createRun(eventId, `demo-${scenarioId}-${Date.now()}`)
      registry.registerRun({ runId: run.runId, eventId: run.eventId, status: 'queued', startedAt: new Date().toISOString() })
      updateSearch({ scenario: scenarioId, mode: 'live', step: 'running' })
      toast.success('Scenario started', { description: 'The production Change Inbox and run trace are ready.' })
      navigate({ to: '/changes/$eventId', params: { eventId } })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Scenario could not start.'
      setRunError(message)
      toast.error('Scenario could not start', { description: message })
    } finally {
      setRunPending(null)
    }
  }

  const runRecorded = (scenarioId: DemoScenarioId) => {
    setRunError(null)
    updateSearch({ scenario: scenarioId, mode: 'recorded', step: 'trace' })
    toast.success('Recorded scenario loaded', { description: 'The public trace uses the same production-facing run event shape.' })
  }

  const resetDemo = async () => {
    setRunError(null)
    const receipt = await resetMutation.mutateAsync(selected.backendScenarioId)
    queryClient.clear()
    clearDemoLocalState({ local: window.localStorage, session: window.sessionStorage })
    registry.clearRuns()
    toast.success('Demo reset complete', { description: `${receipt.seedVersion} · schedule v${receipt.scheduleVersion}` })
    navigate({ to: '/demo', search: { scenario: selected.id, mode: 'recorded' } })
  }

  return <DemoLab scenarios={scenarios} selectedScenarioId={selected.id} mode={mode} comparison={a12ComparisonFixture} recordedFixture={recordedFixture} runPending={runPending} resetPending={resetMutation.isPending} error={error} onSelectScenario={(scenarioId) => updateSearch({ scenario: scenarioId })} onRunScenario={(scenarioId) => void runScenario(scenarioId)} onRunRecorded={runRecorded} onComparePair={() => updateSearch({ scenario: DEMO_SCENARIO_IDS.base, mode: 'recorded', step: 'compare' })} onReset={resetDemo} onRetry={() => void scenariosQuery.refetch()} />
}
