import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { components } from '@/api/generated/openapi'

import { DecisionHistory } from '@/components/history/decision-history'
import { Button, Skeleton, toast } from '@/components/ui'
import { createHistoryViewData, type HistoryFilters } from '@/features/history/history-data'
import { useDecisionAudit, useDecisionHistory } from '@/features/history/history-api'
import type { HistoryWorkspaceTarget, HistorySimilarChangeTarget, HistoryTimelineTarget, HistoryCopyTarget } from '@/components/history/audit-detail-sheet'
import { historySearchSchema } from './search-schemas'

export const Route = createFileRoute('/history')({
  validateSearch: historySearchSchema,
  component: HistoryRoute,
})

function HistoryRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const apiAction = search.action === 'approve' || search.action === 'reject' || search.action === 'reply' ? search.action as components['schemas']['DecisionAction'] : undefined
  const apiFilters = apiAction ? { action: apiAction } : {}
  const listQuery = useDecisionHistory(apiFilters)
  const detailQuery = useDecisionAudit(search.decision)
  const data = useMemo(() => createHistoryViewData(listQuery.data ?? { decisions: [], next_cursor: null }, detailQuery.data && search.decision ? { [search.decision]: detailQuery.data } : {}), [detailQuery.data, listQuery.data, search.decision])
  const filters: HistoryFilters = { ...search, conditional: search.conditional === 'conditional' || search.conditional === 'unconditional' ? search.conditional : undefined }

  if (listQuery.isPending) return <HistoryState message="Loading immutable decision history…" />
  if (listQuery.isError) return <HistoryState message={listQuery.error instanceof Error ? listQuery.error.message : 'Decision history could not be loaded.'} onRetry={() => void listQuery.refetch()} />

  const updateSearch = (patch: Partial<HistoryFilters>) => navigate({ search: (previous) => ({ ...previous, ...patch }) })
  const copyStableLink = async ({ url }: HistoryCopyTarget) => {
    try {
      await navigator.clipboard?.writeText(`${window.location.origin}${url}`)
      toast.success('Stable audit link copied')
    } catch {
      toast.error('Could not copy stable audit link')
    }
  }
  const openTimeline = (_target: HistoryTimelineTarget) => navigate({ to: '/timeline', search: { from: 0, to: 14, groups: [], vendors: [] } })
  const openSourceEvent = (eventId: string) => navigate({ to: '/changes/$eventId', params: { eventId } })
  const openDecisionWorkspace = ({ planId }: HistoryWorkspaceTarget) => navigate({ to: '/decisions/$planId', params: { planId }, search: {} })
  const startSimilarChange = ({ eventId }: HistorySimilarChangeTarget) => eventId ? navigate({ to: '/changes/$eventId', params: { eventId } }) : navigate({ to: '/changes', search: {} })

  return <DecisionHistory data={data} search={filters} onSearchChange={updateSearch} selectedDecisionId={search.decision} onSelectedDecisionChange={(decision) => navigate({ search: (previous) => ({ ...previous, decision }) })} onOpenTimeline={openTimeline} onOpenSourceEvent={openSourceEvent} onOpenDecisionWorkspace={openDecisionWorkspace} onStartSimilarChange={startSimilarChange} onCopyStableLink={copyStableLink} />
}

function HistoryState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <main className="ds-page"><section className="ds-content ds-stack"><header className="ds-section-header"><div className="ds-stack"><span className="ds-label">Governance</span><h1 className="ds-heading ds-heading--page">Decision history</h1></div></header><section className="ds-panel ds-stack" aria-live="polite" style={{ padding: 'var(--ds-space-4)' }}>{onRetry ? <><p className="m-0 text-sm text-danger">{message}</p><Button type="button" variant="secondary" onClick={onRetry}>Retry</Button></> : <><Skeleton className="h-5 w-56" /><span className="text-sm text-muted">{message}</span></>}</section></section></main>
}
