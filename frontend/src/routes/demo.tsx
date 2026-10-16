import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

import { apiTransport } from '@/api/transport'
import { DemoLab } from '@/components/demo/demo-lab'
import { toast } from '@/components/ui'
import { useRunRegistry } from '@/features/agent/run-registry'
import { createDemoEventAndStartExtraction, useDemoReset, useDemoScenarios } from '@/features/demo/demo-api'
import { a12ComparisonFixture, DEMO_SCENARIO_IDS, type DemoMode, type DemoResetReceipt, type DemoScenarioId } from '@/features/demo/demo-data'
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
  const [lastResetReceipt, setLastResetReceipt] = useState<DemoResetReceipt | null>(null)
  const scenarios = useMemo(() => {
    return (scenariosQuery.data ?? []).filter((scenario) => scenario.available)
  }, [scenariosQuery.data])
  const selected = scenarios.find((scenario) => scenario.id === search.scenario) ?? scenarios[0]
  const selectedId = selected?.id ?? DEMO_SCENARIO_IDS.base
  const mode: DemoMode = selected?.mode ?? 'recorded'
  const recordedFixture = selected && (mode === 'recorded' || mode === 'full') ? recordedDemoFixtures[selected.id] : undefined
  const error = runError ?? (scenariosQuery.isError ? scenariosQuery.error instanceof Error ? scenariosQuery.error.message : 'Demo metadata could not be loaded.' : null)

  const updateSearch = (patch: { scenario?: string; mode?: string; step?: string }) => navigate({ search: (previous) => ({ ...previous, ...patch }) })

  const runScenario = async (scenarioId: DemoScenarioId) => {
    const scenario = scenarios.find((item) => item.id === scenarioId)
    if (!scenario || (scenario.mode !== 'live' && scenario.mode !== 'full')) return
    setRunError(null)
    setRunPending('live')
    try {
      const eventId = await createDemoEventAndStartExtraction(scenario.message, scenario.backendScenarioId)
      updateSearch({ scenario: scenarioId, mode: 'live', step: 'running' })
      toast.success('Scenario event created', { description: 'Extraction started. Review the server extraction before investigation.' })
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
    if (!selected?.resetAllowed) return
    setRunError(null)
    try {
      const receipt = await resetMutation.mutateAsync(selected.backendScenarioId)
      queryClient.removeQueries({ predicate: ({ queryKey }) => Array.isArray(queryKey) && queryKey[0] === 'scenario' && queryKey[1] === selected.backendScenarioId })
      clearDemoLocalState({ local: window.localStorage, session: window.sessionStorage }, selected.backendScenarioId)
      for (const run of registry.activeRuns) if (run.scenarioId === selected.backendScenarioId) registry.removeRun(run.runId)
      await queryClient.invalidateQueries({ queryKey: apiTransport.queryKey('demo', 'scenarios') })
      await scenariosQuery.refetch()
      setLastResetReceipt(receipt)
      toast.success('Demo reset complete', { description: `${selected.name} · ${receipt.seedVersion} · schedule v${receipt.scheduleVersion}` })
      navigate({ to: '/demo', search: { scenario: selected.id, mode: 'recorded' } })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Demo reset could not be completed.'
      setRunError(message)
      toast.error('Demo reset failed', { description: message })
      throw caught
    }
  }

  if (!selected) return <DemoLab scenarios={[]} selectedScenarioId={selectedId} mode={mode} comparison={a12ComparisonFixture} runPending={runPending} resetPending={resetMutation.isPending} error={error ?? 'No backend-available demo scenarios were advertised.'} onSelectScenario={() => undefined} onRunScenario={() => undefined} onRunRecorded={() => undefined} onComparePair={() => undefined} onReset={resetDemo} onRetry={() => void scenariosQuery.refetch()} />

  return <DemoLab scenarios={scenarios} selectedScenarioId={selected.id} mode={mode} comparison={a12ComparisonFixture} recordedFixture={recordedFixture} runPending={runPending} resetPending={resetMutation.isPending} lastResetReceipt={lastResetReceipt?.scenarioId === selected.backendScenarioId ? lastResetReceipt : undefined} error={error} onSelectScenario={(scenarioId) => updateSearch({ scenario: scenarioId })} onRunScenario={(scenarioId) => void runScenario(scenarioId)} onRunRecorded={runRecorded} onComparePair={() => updateSearch({ scenario: DEMO_SCENARIO_IDS.base, mode: 'recorded', step: 'compare' })} onReset={resetDemo} onRetry={() => void scenariosQuery.refetch()} />
}
