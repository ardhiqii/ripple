import * as React from 'react'
import { ArrowClockwise, CheckCircle, Info, WarningCircle } from '@phosphor-icons/react'

import type { components } from '@/api/generated/openapi'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Textarea } from '@/components/ui'
import { isOptionSelectable, optionMetricValue, type PlanOptionView, type PlanWorkspaceData } from '@/features/plans/plan-adapter'
import type { ApprovalResponse, DecisionMutationResponse } from '@/features/plans/plan-mutations'

export type ApprovePayload = components['schemas']['ApprovePlanRequest']
export type RejectPayload = components['schemas']['RejectPlanRequest']
export type ReplyPayload = components['schemas']['ReplyPlanRequest']

export type DecisionAction = 'approve' | 'reject' | 'reply'

export interface DecisionConflict {
  currentScheduleVersion?: number
  changedObjectIds?: string[]
  message?: string
}

export interface DecisionActionsProps {
  data: PlanWorkspaceData
  selectedOption: PlanOptionView | null | undefined
  acknowledgedConditionIds?: string[]
  currentScheduleVersion?: number
  canAct?: boolean
  isStale?: boolean
  pending?: boolean
  pendingAction?: DecisionAction | null
  conflict?: DecisionConflict | null
  error?: string | null
  onApprove: (payload: ApprovePayload) => void | Promise<void>
  onReject: (payload: RejectPayload) => void | Promise<void>
  onReply: (payload: ReplyPayload) => void | Promise<void>
  onRecompute?: () => void
  onReturnToReview?: () => void
  approvalResult?: ApprovalResponse | null
  decisionResult?: DecisionMutationResponse | null
  recomputeRequired?: boolean
  onOpenTimeline?: () => void
  onOpenReadiness?: () => void
}

const rejectCategories = [
  ['unacceptable impact', 'Unacceptable impact'],
  ['missing information', 'Missing information'],
  ['wrong constraint', 'Wrong constraint'],
  ['operational preference', 'Operational preference'],
  ['other', 'Other'],
] as const

export function DecisionActions({
  data,
  selectedOption,
  acknowledgedConditionIds = [],
  currentScheduleVersion = data.baseScheduleVersion,
  canAct = true,
  isStale,
  pending = false,
  pendingAction = null,
  conflict = null,
  error = null,
  onApprove,
  onReject,
  onReply,
  onRecompute,
  onReturnToReview,
  approvalResult = null,
  decisionResult = null,
  recomputeRequired = false,
  onOpenTimeline,
  onOpenReadiness,
}: DecisionActionsProps) {
  const [approvalOpen, setApprovalOpen] = React.useState(false)
  const [approvalSubmitted, setApprovalSubmitted] = React.useState(false)
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectReason, setRejectReason] = React.useState('')
  const [rejectCategory, setRejectCategory] = React.useState('')
  const [rejectReplan, setRejectReplan] = React.useState(false)
  const [rejectSubmitted, setRejectSubmitted] = React.useState(false)
  const [replyOpen, setReplyOpen] = React.useState(false)
  const [replyContext, setReplyContext] = React.useState('')
  const [replySubmitted, setReplySubmitted] = React.useState(false)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)

  const requiredConditionIds = selectedOption?.conditions.map((condition) => condition.id).filter(Boolean) ?? []
  const missingConditionIds = requiredConditionIds.filter((id) => !acknowledgedConditionIds.includes(id))
  const stale = isStale ?? currentScheduleVersion !== data.baseScheduleVersion
  const planIsProposed = data.status.trim().toLowerCase() === 'proposed'
  const optionIsValid = Boolean(selectedOption && isOptionSelectable(selectedOption))
  const approvalReady = Boolean(selectedOption && canAct && planIsProposed && optionIsValid && !stale && missingConditionIds.length === 0)

  const actionIsPending = (action: DecisionAction) => pending || pendingAction === action
  const approvalPending = actionIsPending('approve')
  const rejectPending = actionIsPending('reject')
  const replyPending = actionIsPending('reply')
  const approvalConflict = approvalOpen && Boolean(conflict)
  const hasApprovalError = approvalOpen && Boolean(error) && !approvalConflict
  const approvalButtonLocked = approvalPending || (approvalSubmitted && !hasApprovalError)

  const closeApproval = (open: boolean) => {
    if (approvalPending) return
    setApprovalOpen(open)
    if (!open) setApprovalSubmitted(false)
  }

  const openApproval = () => {
    if (!approvalReady || approvalPending) return
    setApprovalSubmitted(false)
    setApprovalOpen(true)
  }

  const submitApproval = () => {
    if (!approvalReady || !selectedOption || approvalButtonLocked || conflict) return
    setApprovalSubmitted(true)
    const payload: ApprovePayload = {
      option_id: selectedOption.id,
      expected_schedule_version: currentScheduleVersion,
      acknowledged_condition_ids: [...acknowledgedConditionIds],
    }
    void onApprove(payload)
  }

  const closeReject = (open: boolean) => {
    if (rejectPending) return
    setRejectOpen(open)
    if (!open) resetReject()
  }

  const resetReject = () => {
    setRejectReason('')
    setRejectCategory('')
    setRejectReplan(false)
    setRejectSubmitted(false)
  }

  const submitReject = () => {
    const reason = rejectReason.trim()
    if (!reason || rejectPending || rejectSubmitted) {
      setRejectSubmitted(true)
      return
    }
    setRejectSubmitted(true)
    const payload: RejectPayload = {
      reason,
      ...(rejectCategory ? { category: rejectCategory } : {}),
      replan: rejectReplan,
    }
    void onReject(payload)
    if (!rejectPending) setRejectOpen(false)
  }

  const closeReply = (open: boolean) => {
    if (replyPending) return
    setReplyOpen(open)
    if (!open) resetReply()
  }

  const resetReply = () => {
    setReplyContext('')
    setReplySubmitted(false)
    setConfirmDiscard(false)
  }

  const submitReply = () => {
    const context = replyContext.trim()
    if (!context || replyPending || replySubmitted) {
      setReplySubmitted(true)
      return
    }
    setReplySubmitted(true)
    void onReply({ context })
    if (!replyPending) setReplyOpen(false)
  }

  const discardReply = () => {
    if (replyContext.trim()) {
      setConfirmDiscard(true)
      return
    }
    setReplyOpen(false)
    resetReply()
  }

  return (
    <section className="ds-panel grid gap-3" aria-label="Decision actions" style={{ padding: 'var(--ds-space-4)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Decision action</span>
          <h2 className="m-0 text-base font-extrabold text-ink">Approve, reject, or replan</h2>
          <p className="m-0 max-w-2xl text-xs leading-relaxed text-muted">The server revalidates the selected option before any schedule change is committed.</p>
        </div>
        <Badge variant={approvalReady ? 'success' : 'warning'}>{approvalReady ? 'Ready for review' : 'Review required'}</Badge>
      </div>

      {!approvalReady ? <PreconditionSummary planIsProposed={planIsProposed} optionIsValid={optionIsValid} missingConditionIds={missingConditionIds} stale={stale} canAct={canAct} /> : null}
      {approvalResult ? <AppliedSummary result={approvalResult} onOpenTimeline={onOpenTimeline} onOpenReadiness={onOpenReadiness} /> : null}
      {decisionResult ? <DecisionRecordedSummary result={decisionResult} /> : null}
      {recomputeRequired ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink" role="status"><span><strong className="block">Manual re-review required</strong>The schedule changed. Recompute and review a current server plan before approving again.</span><Button type="button" size="sm" variant="primary" onClick={onRecompute} disabled={!onRecompute || approvalPending}> <ArrowClockwise aria-hidden="true" size={15} />Recompute with latest schedule</Button></div> : null}
      {error && !approvalOpen ? <InlineError message={error} /> : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" variant="primary" onClick={openApproval} disabled={!approvalReady || approvalPending}>
          <CheckCircle aria-hidden="true" size={16} />Approve option
        </Button>
        <Button type="button" variant="destructive" onClick={() => { setRejectSubmitted(false); setRejectOpen(true) }} disabled={!canAct || rejectPending}>
          Reject plan
        </Button>
        <Button type="button" variant="secondary" onClick={() => { setReplySubmitted(false); setReplyOpen(true) }} disabled={!canAct || replyPending}>
          Reply and replan
        </Button>
      </div>

      <Dialog open={approvalOpen} onOpenChange={closeApproval}>
        <DialogContent onEscapeKeyDown={(event) => { if (approvalPending) event.preventDefault() }}>
          {approvalConflict ? (
            <ConflictView conflict={conflict} onRecompute={() => { onRecompute?.(); closeApproval(false) }} onReturnToReview={() => { onReturnToReview?.(); closeApproval(false) }} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Approve option</DialogTitle>
                <DialogDescription>Confirm the selected option. The server will revalidate the schedule version and conditions before applying it.</DialogDescription>
              </DialogHeader>
              <ApprovalSummary data={data} option={selectedOption} acknowledgedConditionIds={acknowledgedConditionIds} />
              {hasApprovalError ? <InlineError message={error ?? 'Approval could not be applied.'} /> : null}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => closeApproval(false)} disabled={approvalPending}>Back to review</Button>
                <Button type="button" variant="primary" onClick={submitApproval} disabled={!approvalReady || approvalButtonLocked || approvalPending} aria-busy={approvalPending}>
                  {approvalPending ? 'Validating and approving...' : 'Approve option'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={closeReject}>
        <DialogContent onEscapeKeyDown={(event) => { if (rejectPending) event.preventDefault() }}>
          <DialogHeader>
            <DialogTitle>Reject plan</DialogTitle>
            <DialogDescription>Preserve this plan in history and record why it should not be applied.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label htmlFor="reject-reason" className="grid gap-1.5 text-sm font-bold text-ink">Reason<span className="text-danger" aria-hidden="true"> *</span></label>
            <Textarea id="reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} aria-invalid={rejectSubmitted && !rejectReason.trim()} placeholder="Explain what makes this plan unacceptable." disabled={rejectPending} />
            {rejectSubmitted && !rejectReason.trim() ? <p className="m-0 text-xs text-danger" role="alert">A rejection reason is required.</p> : null}
            <label htmlFor="reject-category" className="grid gap-1.5 text-sm font-bold text-ink">Category<span className="text-xs font-normal text-muted"> (optional)</span></label>
            <select id="reject-category" value={rejectCategory} onChange={(event) => setRejectCategory(event.target.value)} disabled={rejectPending} className="h-9 rounded-sm border border-border bg-surface-raised px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus">
              <option value="">Select a category</option>
              {rejectCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="flex items-start gap-2 rounded-sm border border-border bg-surface-subtle p-3 text-sm text-ink">
              <input type="checkbox" checked={rejectReplan} onChange={(event) => setRejectReplan(event.target.checked)} disabled={rejectPending} className="mt-0.5 size-4 accent-primary" />
              <span><strong className="block">Generate new options using this reason</strong><span className="text-xs text-muted">Reject the current plan, create a linked reply event, and start a new run.</span></span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => closeReject(false)} disabled={rejectPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={submitReject} disabled={rejectPending || !rejectReason.trim() || rejectSubmitted} aria-busy={rejectPending}>{rejectPending ? 'Rejecting plan...' : 'Reject plan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={replyOpen} onOpenChange={closeReply}>
        <DialogContent onEscapeKeyDown={(event) => { if (replyPending) event.preventDefault() }}>
          <DialogHeader>
            <DialogTitle>Reply and replan</DialogTitle>
            <DialogDescription>Your reply will be linked to this event and produce a new plan version. The current plan is not superseded until that plan is created successfully.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3 text-xs"><span className="font-bold uppercase tracking-wider text-muted">Inherited context</span><span className="text-ink">Event {data.eventId} · plan v{data.version}{selectedOption ? ` · ${selectedOption.label}` : ''}</span></div>
            <label htmlFor="reply-context" className="grid gap-1.5 text-sm font-bold text-ink">Reply context<span className="text-danger" aria-hidden="true"> *</span></label>
            <Textarea id="reply-context" value={replyContext} onChange={(event) => setReplyContext(event.target.value)} aria-invalid={replySubmitted && !replyContext.trim()} placeholder="Add the changed constraint or operational context." disabled={replyPending} />
            {replySubmitted && !replyContext.trim() ? <p className="m-0 text-xs text-danger" role="alert">Reply context is required.</p> : null}
            {confirmDiscard ? <div className="grid gap-2 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink" role="alert"><span>Discard this reply context?</span><div className="flex gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</Button><Button type="button" size="sm" variant="destructive" onClick={() => { setReplyOpen(false); resetReply() }}>Confirm discard</Button></div></div> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="quiet" onClick={discardReply} disabled={replyPending}>Discard</Button>
            <Button type="button" variant="secondary" onClick={() => closeReply(false)} disabled={replyPending}>Cancel</Button>
            <Button type="button" variant="primary" onClick={submitReply} disabled={replyPending || replySubmitted || !replyContext.trim()} aria-busy={replyPending}>{replyPending ? 'Replying and replanning...' : 'Reply and replan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function PreconditionSummary({ planIsProposed, optionIsValid, missingConditionIds, stale, canAct }: { planIsProposed: boolean; optionIsValid: boolean; missingConditionIds: string[]; stale: boolean; canAct: boolean }) {
  const reasons: string[] = []
  if (!canAct) reasons.push('You do not have planner approval capability.')
  if (!planIsProposed) reasons.push('The plan is no longer proposed.')
  if (!optionIsValid) reasons.push('Select a feasible option with no violations.')
  if (missingConditionIds.length) reasons.push(`Acknowledge ${missingConditionIds.length} required condition${missingConditionIds.length === 1 ? '' : 's'}.`)
  if (stale) reasons.push('The known schedule version is stale; recompute before approving.')
  return <div className="flex gap-2 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink" role="status"><Info aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-warning" /><span>{reasons.join(' ')}</span></div>
}

function ApprovalSummary({ data, option, acknowledgedConditionIds }: { data: PlanWorkspaceData; option: PlanOptionView | null | undefined; acknowledgedConditionIds: string[] }) {
  if (!option) return <p className="text-sm text-muted">No option is selected.</p>
  return <div className="grid gap-3 text-sm">
    <section className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Selected option</span><strong className="text-ink">{option.label}</strong><span className="text-xs text-muted">{option.solverStatus} · schedule v{data.baseScheduleVersion}</span></section>
    <ImpactList option={option} />
    <section className="grid gap-2"><h3 className="m-0 text-xs font-bold uppercase tracking-wider text-muted">Conditions being accepted</h3>{option.conditions.length ? option.conditions.map((condition) => <div key={condition.id} className="flex items-start gap-2 text-xs text-ink"><CheckCircle aria-hidden="true" size={15} className={acknowledgedConditionIds.includes(condition.id) ? 'mt-0.5 shrink-0 text-success' : 'mt-0.5 shrink-0 text-muted'} /><span>{condition.text}</span></div>) : <span className="text-xs text-muted">No additional conditions.</span>}</section>
    <div className="flex gap-2 rounded-sm border border-primary/30 bg-primary-subtle p-3 text-xs text-ink"><Info aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-primary" /><span>The server will revalidate this option, its conditions, and schedule version before applying it.</span></div>
  </div>
}

function ImpactList({ option }: { option: PlanOptionView }) {
  const metric = (key: string) => {
    const value = optionMetricValue(option, key)
    return value === null ? 'Not reported' : String(value)
  }
  return <section className="grid gap-2"><h3 className="m-0 text-xs font-bold uppercase tracking-wider text-muted">Proposed impact</h3><div className="grid gap-2 sm:grid-cols-3"><ImpactItem label="Jobs moved" value={metric('jobs_moved')} /><ImpactItem label="Readiness dates changed" value={metric('readiness_dates_changed')} /><ImpactItem label="Cargo/resource changes" value={metric('resource_changes')} /></div><div className="flex items-center gap-2 text-xs text-muted"><span className="font-bold text-ink">Estimated model impact</span><span>{option.objectiveValue === null ? 'Not reported' : String(option.objectiveValue)}</span></div></section>
}

function ImpactItem({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 rounded-sm border border-border p-2"><span className="text-[10px] uppercase tracking-wider text-muted">{label}</span><strong className="text-xs text-ink">{value}</strong></div> }

function ConflictView({ conflict, onRecompute, onReturnToReview }: { conflict: DecisionConflict | null | undefined; onRecompute: () => void; onReturnToReview: () => void }) {
  return <>
    <DialogHeader>
      <DialogTitle>Schedule changed</DialogTitle>
      <DialogDescription>Ripple could not safely apply this plan because the schedule changed after the review.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-3 text-sm">
      <div className="flex gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink" role="alert"><WarningCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-danger" /><span>{conflict?.message ?? 'The schedule version no longer matches this plan.'}</span></div>
      <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3 text-xs"><span className="font-bold text-muted">Current schedule version</span><strong className="font-mono text-ink">v{conflict?.currentScheduleVersion ?? 'unknown'}</strong>{conflict?.changedObjectIds?.length ? <span className="text-muted">Changed objects: {conflict.changedObjectIds.join(', ')}</span> : <span className="text-muted">Objects changed since plan creation were not included.</span>}</div>
      <p className="m-0 text-xs text-ink">Recompute with the latest schedule to produce a new reviewable plan. Force apply is not available.</p>
    </div>
    <DialogFooter><Button type="button" variant="secondary" onClick={onReturnToReview}>Return to review</Button><Button type="button" variant="primary" onClick={onRecompute}><ArrowClockwise aria-hidden="true" size={16} />Recompute with latest schedule</Button></DialogFooter>
  </>
}

function InlineError({ message }: { message: string }) { return <div className="flex gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-danger" role="alert"><WarningCircle aria-hidden="true" size={15} className="mt-0.5 shrink-0" /><span>{message}</span></div> }

function AppliedSummary({ result, onOpenTimeline, onOpenReadiness }: { result: ApprovalResponse; onOpenTimeline?: () => void; onOpenReadiness?: () => void }) {
  return <div className="grid gap-2 rounded-sm border border-success/30 bg-success-subtle p-3" role="status">
    <div className="flex items-start gap-2 text-sm font-bold text-ink"><CheckCircle aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-success" />Schedule changes applied</div>
    <p className="m-0 text-xs text-muted">Schedule v{String(result.schedule_version_before)} → v{String(result.schedule_version_after)}. The approval and affected objects are now recorded.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={onOpenTimeline} disabled={!onOpenTimeline}>Open Timeline</Button><Button type="button" size="sm" variant="secondary" onClick={onOpenReadiness} disabled={!onOpenReadiness}>Open Readiness</Button></div>
  </div>
}

function DecisionRecordedSummary({ result }: { result: DecisionMutationResponse }) {
  return <div className="grid gap-1 rounded-sm border border-success/30 bg-success-subtle p-3 text-xs text-ink" role="status"><strong>Decision recorded</strong><span className="font-mono">Decision {String(result.decision_id)}</span>{result.event_id ? <span>Linked event: <span className="font-mono">{String(result.event_id)}</span></span> : null}<span>{result.replan_requested ? 'A replan was requested; the linked run is shown after it starts.' : 'The server-confirmed decision is now available in History.'}</span></div>
}
