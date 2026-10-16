import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { components } from '@/api/generated/openapi'

import { useScenario } from '@/app/scenario-context'
import { useScenarioMetadata } from '@/app/scenario-metadata'
import { DecisionHistory } from '@/components/history/decision-history'
import { Button, Skeleton, toast } from '@/components/ui'
import { NewChangeSheet } from '@/components/changes/new-change-sheet'
import { startEventRun } from '@/features/events/events-api'
import { createHistoryViewData, timelineRangeFromDates, type HistoryFilters } from '@/features/history/history-data'
import { useDecisionAudit, useDecisionHistory } from '@/features/history/history-api'
import { usePlanDetail } from '@/features/plans/plan-api'
import { useSchedule } from '@/features/schedule/schedule-api'
import type { HistoryWorkspaceTarget, HistorySimilarChangeTarget, HistoryTimelineTarget, HistoryCopyTarget } from '@/components/history/audit-detail-sheet'
import { historySearchSchema } from './search-schemas'

type HistoryRouteSearch = ReturnType<typeof historySearchSchema> & { plan_id?: string }

function validateHistorySearch(search: Record<string, unknown>): HistoryRouteSearch {
  const parsed = historySearchSchema(search)
  const planId = typeof search.plan_id === 'string' && search.plan_id.trim() ? search.plan_id.trim() : undefined
  return planId ? { ...parsed, plan_id: planId } : parsed
}

export const Route = createFileRoute('/history')({
  validateSearch: validateHistorySearch,
  component: HistoryRoute,
})

function HistoryRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { scenarioId } = useScenario()
  const metadata = useScenarioMetadata()
  const scenario = metadata.data?.find((option) => option.id === scenarioId)
  const scenarioStartDate = scenario?.scenarioStartDate
  const planId = search.plan_id
  const [cursorStack, setCursorStack] = useState<readonly string[]>([])
  const activeCursor = cursorStack[cursorStack.length - 1]
  useEffect(() => setCursorStack([]), [search.action, search.actor, search.from, search.job, search.nature, search.plan_id, search.q, search.to])
  const apiAction = search.action === 'approve' || search.action === 'reject' || search.action === 'reply' ? search.action as components['schemas']['DecisionAction'] : undefined
  const apiFilters = { ...(apiAction ? { action: apiAction } : {}), planId, jobId: search.job, actor: search.actor, nature: search.nature, from: search.from, to: search.to, q: search.q, after: activeCursor, limit: 50 }
  const listQuery = useDecisionHistory(apiFilters)
  const detailQuery = useDecisionAudit(search.decision)
  const planQuery = usePlanDetail(detailQuery.data?.plan_id)
  const scheduleQuery = useSchedule({ fromDay: 0, toDay: 31, startDate: scenarioStartDate })
  const resourceNamesByJob = useMemo(() => {
    const byJob = new Map<string, string[]>()
    for (const resource of scheduleQuery.data?.resources ?? []) {
      for (const job of resource.jobs) {
        const names = byJob.get(job.id) ?? []
        if (!names.includes(resource.name)) names.push(resource.name)
        byJob.set(job.id, names)
      }
    }
    return byJob
  }, [scheduleQuery.data])
  const listContexts = useMemo(() => Object.fromEntries((listQuery.data?.decisions ?? []).map((decision) => [decision.id, { resources: resourceNamesForJobs(decision.job_ids, resourceNamesByJob) }])), [listQuery.data, resourceNamesByJob])
  const detailContext = useMemo(() => detailQuery.data && search.decision ? { [search.decision]: { runId: planQuery.data?.runId, resources: resourceNamesForJobs(detailQuery.data.job_ids, resourceNamesByJob) } } : {}, [detailQuery.data, planQuery.data?.runId, resourceNamesByJob, search.decision])
  const historyContexts = useMemo(() => ({ ...listContexts, ...detailContext }), [detailContext, listContexts])
  const data = useMemo(() => createHistoryViewData(listQuery.data ?? { decisions: [], next_cursor: null, total_count: 0 }, detailQuery.data && search.decision ? { [search.decision]: detailQuery.data } : {}, historyContexts, scenarioId), [detailQuery.data, historyContexts, listQuery.data, scenarioId, search.decision])
  const filters: HistoryFilters = { ...search, planId, conditional: search.conditional === 'conditional' || search.conditional === 'unconditional' ? search.conditional : undefined }
  const [similarDraftText, setSimilarDraftText] = useState<string>()
  const [similarComposerOpen, setSimilarComposerOpen] = useState(false)

  if (listQuery.isPending) return <HistoryState message="Loading immutable decision history…" />
  if (listQuery.isError) return <HistoryState message={listQuery.error instanceof Error ? listQuery.error.message : 'Decision history could not be loaded.'} onRetry={() => void listQuery.refetch()} />
  if (search.decision && detailQuery.isPending) return <HistoryState message="Loading the requested audit record…" />
  if (search.decision && detailQuery.isError) return <HistoryState message={detailQuery.error instanceof Error ? detailQuery.error.message : 'Audit detail could not be loaded.'} onRetry={() => void detailQuery.refetch()} />

  const updateSearch = (patch: Partial<HistoryFilters>) => {
    setCursorStack([])
    return navigate({ search: (previous) => {
    const { planId: planIdPatch, ...rest } = patch
    const next = { ...previous, ...rest }
    if ('planId' in patch) {
      next.plan_id = planIdPatch
    }
    return next
    } })
  }
  const copyStableLink = async ({ url }: HistoryCopyTarget) => {
    try {
      await navigator.clipboard?.writeText(`${window.location.origin}${url}`)
      toast.success('Stable audit link copied')
    } catch {
      toast.error('Could not copy stable audit link')
    }
  }
  const openTimeline = (target: HistoryTimelineTarget) => {
    const range = timelineRangeFromDates(target.from, target.to, scenarioStartDate)
    if (!range) {
      toast.error('Timeline range is unavailable for this audit record')
      return
    }
    return navigate({ to: '/timeline', search: { ...range, groups: [], vendors: [], ...(target.jobId ? { job: target.jobId } : {}) } })
  }
  const openSourceEvent = (eventId: string) => navigate({ to: '/changes/$eventId', params: { eventId }, search: { event: eventId } })
  const openDecisionWorkspace = ({ planId, runId }: HistoryWorkspaceTarget) => navigate({ to: '/decisions/$planId', params: { planId }, search: runId ? { run: runId } : {} })
  const openDemo = () => navigate({ to: '/demo', search: { scenario: scenarioId } })
  const exploreFleetHistory = () => navigate({ to: '/history', search: { scenario: 'fleet-scale' } })
  const startSimilarChange = ({ context }: HistorySimilarChangeTarget) => { setSimilarDraftText(context); setSimilarComposerOpen(true) }

  const handleSimilarChangeCreated = (item: Parameters<NonNullable<ComponentProps<typeof NewChangeSheet>['onCreated']>>[0]) => {
    setSimilarComposerOpen(false)
    setSimilarDraftText(undefined)
    void navigate({ to: '/changes/$eventId', params: { eventId: item.id }, search: { event: item.id } })
  }

  return <><DecisionHistory data={data} search={filters} scenarioId={scenarioId} scenarioLabel={scenario?.name ?? scenarioId} onSearchChange={updateSearch} selectedDecisionId={search.decision} onSelectedDecisionChange={(decision) => navigate({ search: (previous) => ({ ...previous, decision }) })} onOpenTimeline={openTimeline} onOpenSourceEvent={openSourceEvent} onOpenDecisionWorkspace={openDecisionWorkspace} onStartSimilarChange={startSimilarChange} onCopyStableLink={copyStableLink} onOpenDemo={openDemo} onExploreFleetHistory={exploreFleetHistory} onNextPage={data.nextCursor ? () => setCursorStack((current) => [...current, data.nextCursor!]) : undefined} onPreviousPage={cursorStack.length ? () => setCursorStack((current) => current.slice(0, -1)) : undefined} /><NewChangeSheet open={similarComposerOpen} initialText={similarDraftText} onOpenChange={(open) => { setSimilarComposerOpen(open); if (!open) setSimilarDraftText(undefined) }} onDirtyChange={() => undefined} onCreated={handleSimilarChangeCreated} onCorrectionSaved={() => undefined} onEventUpdated={() => undefined} onStartInvestigation={async (item) => { if (item.lifecycle !== 'ready') throw new Error('Investigation is not available until extraction is server-ready.'); await startEventRun(item.id) }} /></>
}

function HistoryState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <main className="ds-page"><section className="ds-content ds-stack"><header className="ds-section-header"><div className="ds-stack"><span className="ds-label">Governance</span><h1 className="ds-heading ds-heading--page">Decision history</h1></div></header><section className="ds-panel ds-stack" aria-live="polite" style={{ padding: 'var(--ds-space-4)' }}>{onRetry ? <><p className="m-0 text-sm text-danger">{message}</p><Button type="button" variant="secondary" onClick={onRetry}>Retry</Button></> : <><Skeleton className="h-5 w-56" /><span className="text-sm text-muted">{message}</span></>}</section></section></main>
}

function resourceNamesForJobs(jobIds: readonly string[], resourcesByJob: ReadonlyMap<string, readonly string[]>): readonly string[] {
  return [...new Set(jobIds.flatMap((jobId) => resourcesByJob.get(jobId) ?? []))]
}
