import { createFileRoute } from '@tanstack/react-router'

import { useScenario } from '@/app/scenario-context'
import { ReadinessBoard } from '@/components/readiness/readiness-board'
import { useReadiness, useUpdateReadiness } from '@/features/readiness/readiness-api'
import type { ReadinessRow } from '@/features/readiness/readiness-data'
import { readinessSearchSchema } from './search-schemas'

export const Route = createFileRoute('/readiness')({
  validateSearch: readinessSearchSchema,
  component: ReadinessRoute,
})

function ReadinessRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { scenarioId } = useScenario()
  const readinessQuery = useReadiness({ job: search.job, confidence: search.confidence, risk: search.risk, freshness: search.freshness, item: search.item, q: search.q })
  const updateMutation = useUpdateReadiness()

  if (readinessQuery.isPending) return <ReadinessState title="Loading readiness" description="Loading the active scenario readiness queue." />
  if (readinessQuery.isError) return <ReadinessState title="Readiness unavailable" description={readinessQuery.error instanceof Error ? readinessQuery.error.message : 'The readiness queue could not be loaded.'} onRetry={() => void readinessQuery.refetch()} />

  return <ReadinessBoard
    data={readinessQuery.data}
    scenarioId={scenarioId}
    search={search}
    updateStatus={(itemId, status, expectedRowVersion) => updateMutation.mutateAsync({ itemId, status, expectedRowVersion: expectedRowVersion ?? 0 })}
    onSearchChange={(patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) })}
    onOpenJob={(jobId) => {
      const range = timelineRangeForJob(readinessQuery.data.items, jobId)
      return navigate({ to: '/timeline', search: { ...range, groups: [], vendors: [], job: jobId } })
    }}
    onOpenSourceEvent={(eventId) => navigate({ to: '/changes', search: { event: eventId } })}
    onOpenPlan={(planId) => navigate({ to: '/decisions/$planId', params: { planId }, search: {} })}
  />
}

export function timelineRangeForJob(items: readonly ReadinessRow[], jobId: string): { from: number; to: number } {
  const row = items.find((item) => item.job_id === jobId)
  const anchor = row?.planned_day ?? row?.eta_earliest ?? row?.eta_latest ?? 0
  const from = Math.max(0, anchor - 7)
  return { from, to: from + 14 }
}

function ReadinessState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return <main className="ds-page"><section className="ds-content ds-stack" aria-live="polite"><header className="ds-section-header"><div className="ds-stack"><span className="ds-label">Operations</span><h1 className="ds-heading ds-heading--page">{title}</h1><p className="ds-copy">{description}</p></div></header>{onRetry ? <button type="button" className="w-fit rounded-xs border border-border px-3 py-2 text-sm font-bold text-ink hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus" onClick={onRetry}>Retry</button> : null}</section></main>
}
