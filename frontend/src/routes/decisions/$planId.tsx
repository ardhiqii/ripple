import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ApiError, apiTransport } from '@/api/transport'
import { createRun } from '@/api/agent-runs'
import { toast } from '@/components/ui'
import { DecisionWorkspace } from '@/components/decision/decision-workspace'
import type { ApprovePayload, DecisionConflict, RejectPayload, ReplyPayload } from '@/components/decision/decision-actions'
import { usePlanDetail } from '@/features/plans/plan-api'
import { changedObjectIdsFromResponse, PlanMutationError, usePlanMutations, type ApprovalResponse, type DecisionMutationResponse } from '@/features/plans/plan-mutations'
import { useSchedule } from '@/features/schedule/schedule-api'
import { decisionSearchSchema } from '../search-schemas'

declare module '@tanstack/history' {
  interface HistoryState {
    rippleChangedObjectIds?: string[]
  }
}

export const Route = createFileRoute('/decisions/$planId')({
  validateSearch: decisionSearchSchema,
  component: DecisionPlanRoute,
})

function DecisionPlanRoute() {
  const { planId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const planQuery = usePlanDetail(planId)
  const scheduleQuery = useSchedule()
  const mutations = usePlanMutations({ scenarioId: apiTransport.scenarioId })
  const [actionError, setActionError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<DecisionConflict | null>(null)
  const [requiresRecompute, setRequiresRecompute] = useState(false)
  const [reviewEpoch, setReviewEpoch] = useState(0)
  const [approvalResult, setApprovalResult] = useState<ApprovalResponse | null>(null)
  const [decisionResult, setDecisionResult] = useState<DecisionMutationResponse | null>(null)
  const [decisionCompleted, setDecisionCompleted] = useState(false)
  const compareIds = search.compare?.split(',').map((value) => value.trim()).filter(Boolean) ?? []

  const runLinkedEvent = async (eventId: string | undefined, action: 'reject' | 'reply', decisionId?: string) => {
    if (!eventId) {
      toast.success(action === 'reply' ? 'Reply recorded' : 'Plan rejected', { description: decisionId ? `Decision ${decisionId} is recorded in History.` : undefined })
      return
    }
    try {
      const run = await createRun(eventId, `ripple-${action}-${planId}`)
      toast.success(action === 'reply' ? 'Reply recorded and run started' : 'Plan rejected and replan started', { description: `${decisionId ? `Decision ${decisionId}; ` : ''}Run ${run.runId} is now linked to the event.` })
      navigate({ to: '/changes/$eventId', params: { eventId } })
    } catch {
      toast.error('The linked run could not start', { description: 'The decision was recorded. Retry the investigation from the event.' })
    }
  }

  if (planQuery.isPending || scheduleQuery.isPending) return <DecisionStatus title="Loading decision workspace" message="Fetching the requested plan and current schedule version from the active scenario…" />
  if (planQuery.isError) return <DecisionStatus title={planQuery.error instanceof ApiError && planQuery.error.status === 404 ? 'Plan not found' : 'Plan could not be loaded'} message={errorMessage(planQuery.error, 'Check the plan ID and retry.')} onRetry={() => { void planQuery.refetch() }} />
  if (scheduleQuery.isError) return <DecisionStatus title="Current schedule could not be loaded" message={errorMessage(scheduleQuery.error, 'Approval is unavailable until the current schedule version is confirmed.')} onRetry={() => { void scheduleQuery.refetch() }} />
  if (!planQuery.data || !scheduleQuery.data) return <DecisionStatus title="Decision workspace unavailable" message="The server did not return the plan and current schedule required for review." />

  const data = { ...planQuery.data, currentScheduleVersion: scheduleQuery.data.version }

  const handleApprove = async (payload: ApprovePayload) => {
    setActionError(null)
    setConflict(null)
    try {
      const response = await mutations.approve.mutateAsync({ ...payload, planId, eventId: data.eventId })
      setApprovalResult(response)
      setDecisionCompleted(true)
      toast.success('Schedule changes applied', { description: `Schedule version ${String(response.schedule_version_after)} is now active.` })
    } catch (error) {
      if (error instanceof PlanMutationError && error.isScheduleVersionConflict) {
        setConflict({ currentScheduleVersion: error.scheduleVersionConflict?.currentVersion, changedObjectIds: error.scheduleVersionConflict?.changedObjectIds, message: error.message })
        setRequiresRecompute(true)
      } else setActionError(planMutationMessage(error, 'Approval could not be applied. Check the review and retry safely.'))
    }
  }

  const handleReject = async (payload: RejectPayload) => {
    setActionError(null)
    try {
      const response = await mutations.reject.mutateAsync({ ...payload, planId, eventId: data.eventId })
      setDecisionResult(response)
      if (payload.replan) await runLinkedEvent(stringValue(response.event_id), 'reject', stringValue(response.decision_id))
      else {
        toast.success('Plan rejected', { description: `Decision ${String(response.decision_id)} was preserved in History.` })
        navigate({ to: '/changes/$eventId', params: { eventId: data.eventId } })
      }
    } catch (error) {
      setActionError(planMutationMessage(error, 'The plan could not be rejected. Retry when the server confirms it is safe.'))
    }
  }

  const handleReply = async (payload: ReplyPayload) => {
    setActionError(null)
    try {
      const response = await mutations.reply.mutateAsync({ ...payload, planId, eventId: data.eventId })
      setDecisionResult(response)
      await runLinkedEvent(stringValue(response.event_id), 'reply', stringValue(response.decision_id))
    } catch (error) {
      setActionError(planMutationMessage(error, 'The reply could not be sent. Retry when it is safe.'))
    }
  }

  const recompute = async () => {
    setConflict(null)
    setActionError(null)
    const previousReview = { id: data.id, version: data.version, baseScheduleVersion: data.baseScheduleVersion }
    try {
      await createRun(data.eventId, `ripple-recompute-${planId}`)
      const [nextPlanResult, nextScheduleResult] = await Promise.all([planQuery.refetch(), scheduleQuery.refetch()])
      const nextPlan = nextPlanResult.data
      const nextSchedule = nextScheduleResult.data
      const freshPlan = Boolean(nextPlan && (nextPlan.id !== previousReview.id || nextPlan.version > previousReview.version))
      const aligned = Boolean(nextPlan && nextSchedule && nextPlan.baseScheduleVersion === nextSchedule.version)
      if (!freshPlan || !aligned) {
        setRequiresRecompute(true)
        setActionError('The server has not returned a new plan aligned to the current schedule. Approval remains locked; refresh and review again.')
        return
      }
      setReviewEpoch((current) => current + 1)
      setRequiresRecompute(false)
      toast.success('Recompute started', { description: 'Ripple refreshed the latest schedule and plan review.' })
    } catch (error) {
      setActionError(planMutationMessage(error, 'Recompute could not start.'))
    }
  }

  const changedObjectIds = approvalResult ? changedObjectIdsFromResponse(approvalResult) : []
  const openTimeline = () => navigate({ to: '/timeline', search: { from: 0, to: 14, groups: [], vendors: [] }, state: { rippleChangedObjectIds: changedObjectIds } })
  const openReadiness = () => navigate({ to: '/readiness', state: { rippleChangedObjectIds: changedObjectIds } })

  return <DecisionWorkspace key={`${data.id}:${data.version}:${reviewEpoch}`} data={data} selectedOptionId={search.option} compareIds={compareIds} activeTab={search.tab ?? 'overview'} evidenceId={search.evidence} onSelectOption={(optionId) => navigate({ search: (previous) => ({ ...previous, option: optionId }) })} onCompareChange={(ids) => navigate({ search: (previous) => ({ ...previous, compare: ids.length ? ids.join(',') : undefined }) })} onTabChange={(tab) => navigate({ search: (previous) => ({ ...previous, tab }) })} onEvidenceChange={(evidence) => navigate({ search: (previous) => ({ ...previous, evidence }) })} onApprove={handleApprove} onReject={handleReject} onReply={handleReply} pendingAction={mutations.approve.isPending ? 'approve' : mutations.reject.isPending ? 'reject' : mutations.reply.isPending ? 'reply' : null} actionConflict={conflict} actionError={actionError} approvalResult={approvalResult} decisionResult={decisionResult} recomputeRequired={requiresRecompute} actionCanAct={!decisionCompleted && !requiresRecompute && data.status.trim().toLowerCase() === 'proposed'} onRecompute={recompute} onReturnToReview={() => { setConflict(null); setRequiresRecompute(true); setActionError('Schedule changed. Recompute and review the current server plan before approving again.') }} onOpenTimeline={openTimeline} onOpenReadiness={openReadiness} />
}

function DecisionStatus({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <main className="ds-page"><section className="ds-content"><div className="ds-panel grid gap-3 p-8" role="status"><h1 className="m-0 text-xl font-extrabold text-ink">{title}</h1><p className="m-0 text-sm text-muted">{message}</p>{onRetry ? <button type="button" className="w-fit rounded-sm border border-border px-3 py-2 text-sm font-bold text-ink hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus" onClick={onRetry}>Retry</button> : null}</div></section></main>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? `${error.code}: ${error.message}` : error instanceof Error && error.message ? error.message : fallback
}

function planMutationMessage(error: unknown, fallback: string): string {
  if (error instanceof PlanMutationError) return `${error.code}: ${error.message}`
  return errorMessage(error, fallback)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
