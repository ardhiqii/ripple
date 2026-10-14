import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { DecisionWorkspace } from '@/components/decision/decision-workspace'
import type { ApprovePayload, DecisionConflict, RejectPayload, ReplyPayload } from '@/components/decision/decision-actions'
import { createRun } from '@/api/agent-runs'
import { toast } from '@/components/ui'
import { planWorkspaceById } from '@/features/plans/plan-data'
import { changedObjectIdsFromResponse, PlanMutationError, usePlanMutations, type ApprovalResponse } from '@/features/plans/plan-mutations'
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
  const data = planWorkspaceById(planId)
  const mutations = usePlanMutations()
  const [actionError, setActionError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<DecisionConflict | null>(null)
  const [approvalResult, setApprovalResult] = useState<ApprovalResponse | null>(null)
  const [decisionCompleted, setDecisionCompleted] = useState(false)
  const compareIds = search.compare?.split(',').map((value) => value.trim()).filter(Boolean) ?? []

  const runLinkedEvent = async (eventId: string | undefined, action: 'reject' | 'reply') => {
    if (!eventId) {
      toast.success(action === 'reply' ? 'Reply recorded' : 'Plan rejected')
      return
    }
    try {
      await createRun(eventId, `ripple-${action}-${planId}`)
      toast.success(action === 'reply' ? 'New plan run started' : 'Replan run started', { description: 'The linked event is now being investigated.' })
      navigate({ to: '/changes/$eventId', params: { eventId } })
    } catch {
      toast.error('The linked run could not start', { description: 'The decision was recorded. Retry the investigation from the event.' })
    }
  }

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
      } else setActionError(error instanceof Error ? error.message : 'Approval could not be applied. Check the review and retry safely.')
    }
  }

  const handleReject = async (payload: RejectPayload) => {
    setActionError(null)
    try {
      const response = await mutations.reject.mutateAsync({ ...payload, planId, eventId: data.eventId })
      if (payload.replan) await runLinkedEvent(stringValue(response.event_id), 'reject')
      else {
        toast.success('Plan rejected', { description: 'The decision was preserved in history.' })
        navigate({ to: '/changes/$eventId', params: { eventId: data.eventId } })
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The plan could not be rejected. Retry when the server confirms it is safe.')
    }
  }

  const handleReply = async (payload: ReplyPayload) => {
    setActionError(null)
    try {
      const response = await mutations.reply.mutateAsync({ ...payload, planId, eventId: data.eventId })
      await runLinkedEvent(stringValue(response.event_id), 'reply')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The reply could not be sent. Retry when it is safe.')
    }
  }

  const recompute = () => {
    setConflict(null)
    setActionError(null)
    void createRun(data.eventId, `ripple-recompute-${planId}`)
      .then(() => toast.success('Recompute started', { description: 'Ripple is checking the latest schedule.' }))
      .catch(() => toast.error('Recompute could not start'))
  }

  const openTimeline = () => navigate({ to: '/timeline', search: { from: 0, to: 14, groups: [], vendors: [] }, state: { rippleChangedObjectIds: approvalResult ? changedObjectIdsFromResponse(approvalResult) : [] } })
  const openReadiness = () => navigate({ to: '/readiness', state: { rippleChangedObjectIds: approvalResult ? changedObjectIdsFromResponse(approvalResult) : [] } })

  return <DecisionWorkspace data={data} selectedOptionId={search.option} compareIds={compareIds} activeTab={search.tab ?? 'overview'} evidenceId={search.evidence} onSelectOption={(optionId) => navigate({ search: (previous) => ({ ...previous, option: optionId }) })} onCompareChange={(ids) => navigate({ search: (previous) => ({ ...previous, compare: ids.length ? ids.join(',') : undefined }) })} onTabChange={(tab) => navigate({ search: (previous) => ({ ...previous, tab }) })} onEvidenceChange={(evidence) => navigate({ search: (previous) => ({ ...previous, evidence }) })} onApprove={handleApprove} onReject={handleReject} onReply={handleReply} pendingAction={mutations.approve.isPending ? 'approve' : mutations.reject.isPending ? 'reject' : mutations.reply.isPending ? 'reply' : null} actionConflict={conflict} actionError={actionError} approvalResult={approvalResult} actionCanAct={!decisionCompleted} onRecompute={recompute} onReturnToReview={() => setConflict(null)} onOpenTimeline={openTimeline} onOpenReadiness={openReadiness} />
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
