import { createRootRouteWithContext, Outlet, retainSearchParams, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { DEFAULT_SCENARIO_ID } from '@/api/transport'
import { removeScenarioCache } from '@/app/query-client'
import { ScenarioProvider, useScenario } from '@/app/scenario-context'
import { defaultScenarioOption, useScenarioMetadata, type ScenarioOption } from '@/app/scenario-metadata'
import { AppShell } from '@/components/shell'
import { rootSearchSchema } from './search-schemas'

import type { QueryClient } from '@tanstack/react-query'

export interface AppRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  validateSearch: rootSearchSchema,
  search: {
    middlewares: [retainSearchParams(['scenario'])],
  },
  component: RootLayout,
  notFoundComponent: () => <ScenarioGate title="Route not found" description="The requested Ripple route does not exist." />,
})

function RootLayout() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const metadata = useScenarioMetadata()
  const options = metadata.data ?? []
  const requestedId = search.scenario
  const selected = requestedId === undefined
    ? defaultScenarioOption(options)
    : options.find((option) => option.id === requestedId)
  const selectedId = selected?.id
  const previousScenarioRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!selectedId) return

    const previousScenarioId = previousScenarioRef.current
    if (previousScenarioId && previousScenarioId !== selectedId) {
      removeScenarioCache(queryClient, previousScenarioId)
    }
    previousScenarioRef.current = selectedId
  }, [queryClient, selectedId])

  useEffect(() => {
    if (metadata.isPending || metadata.isError || search.scenario !== undefined || !selectedId) return
    void navigate({
      replace: true,
      search: (previous) => ({ ...previous, scenario: selectedId }),
    })
  }, [metadata.isError, metadata.isPending, navigate, search.scenario, selectedId])

  if (metadata.isPending) {
    return <ScenarioGate title="Loading environment" description="Checking the scenarios available in this synthetic environment." />
  }

  if (metadata.isError) {
    return <ScenarioGate title="Environment unavailable" description={metadata.error instanceof Error ? metadata.error.message : 'Scenario metadata could not be loaded.'} retry={metadata.refetch} />
  }

  if (!options.length) {
    return <ScenarioGate title="No scenarios available" description="This environment did not advertise a usable synthetic scenario." />
  }

  if (!selected) {
    const title = requestedId === undefined ? 'No compatible default scenario' : 'Unknown scenario'
    const description = requestedId === undefined
      ? `This environment must advertise ${DEFAULT_SCENARIO_ID} when fleet-scale is unavailable.`
      : `The scenario “${requestedId}” is not available in this environment.`
    return <ScenarioGate title={title} description={description} />
  }

  return (
    <ScenarioProvider key={selected.id} initialScenarioId={selected.id} availableScenarioIds={options.map((option) => option.id)}>
      <ScenarioShell options={options} selected={selected} />
    </ScenarioProvider>
  )
}

function ScenarioShell({ options, selected }: { options: readonly ScenarioOption[]; selected: ScenarioOption }) {
  const navigate = useNavigate({ from: Route.fullPath })
  const { scenarioId, selectScenario } = useScenario()

  const handleScenarioChange = (nextScenarioId: string) => {
    if (nextScenarioId === scenarioId) return
    if (!window.confirm('Switching scenarios clears the current page selection and unsaved Ripple draft. Continue?')) return
    if (!selectScenario(nextScenarioId)) return
    window.dispatchEvent(new CustomEvent('ripple:scenario-change', { detail: { scenarioId: nextScenarioId } }))
    void navigate({
      to: '/timeline',
      search: { scenario: nextScenarioId, from: 0, to: 14, groups: [], vendors: [] },
    })
  }

  const activeScenario = options.find((option) => option.id === scenarioId) ?? selected
  const activeLabel = scenarioId === DEFAULT_SCENARIO_ID ? 'A-12 / Offshore demo' : activeScenario.name

  return (
    <AppShell
      activeScenario={activeLabel}
      syntheticDataLabel="Synthetic data"
      scenarioId={scenarioId}
      scenarioOptions={options}
      onScenarioChange={handleScenarioChange}
    >
      <Outlet />
    </AppShell>
  )
}

function ScenarioGate({ title, description, retry }: { title: string; description: string; retry?: () => unknown }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 text-ink">
      <section className="grid w-full max-w-lg gap-3 rounded-sm border border-border bg-surface p-6 shadow-raised" aria-live="polite">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">Synthetic environment</span>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm leading-6 text-muted">{description}</p>
        {retry ? <button type="button" className="min-h-10 w-fit rounded-xs border border-border px-3 text-sm font-bold text-ink hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus" onClick={() => void retry()}>Retry</button> : null}
      </section>
    </main>
  )
}
