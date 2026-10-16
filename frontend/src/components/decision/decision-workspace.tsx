import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Check, GitDiff, Info, LockSimple, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'

import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { findOption, isOptionSelectable, optionMetricValue, type PlanOptionView, type PlanWorkspaceData } from '@/features/plans/plan-adapter'
import { DecisionActions, type ApprovePayload, type DecisionAction, type DecisionConflict, type RejectPayload, type ReplyPayload } from './decision-actions'
import type { ApprovalResponse, DecisionMutationResponse } from '@/features/plans/plan-mutations'

interface DecisionWorkspaceProps {
  data: PlanWorkspaceData
  selectedOptionId?: string
  compareIds: string[]
  activeTab: string
  evidenceId?: string
  onSelectOption: (optionId: string) => void
  onCompareChange: (ids: string[]) => void
  onTabChange: (tab: string) => void
  onEvidenceChange: (evidenceId?: string) => void
  onApprove?: (payload: ApprovePayload) => void | Promise<void>
  onReject?: (payload: RejectPayload) => void | Promise<void>
  onReply?: (payload: ReplyPayload) => void | Promise<void>
  pendingAction?: DecisionAction | null
  actionConflict?: DecisionConflict | null
  actionError?: string | null
  actionCanAct?: boolean
  approvalResult?: ApprovalResponse | null
  decisionResult?: DecisionMutationResponse | null
  recomputeRequired?: boolean
  onRecompute?: () => void
  onReturnToReview?: () => void
  onOpenTimeline?: () => void
  onOpenReadiness?: () => void
}

export function DecisionWorkspace({ data, selectedOptionId, compareIds, activeTab, evidenceId, onSelectOption, onCompareChange, onTabChange, onEvidenceChange, onApprove, onReject, onReply, pendingAction, actionConflict, actionError, actionCanAct = true, approvalResult, decisionResult, recomputeRequired, onRecompute, onReturnToReview, onOpenTimeline, onOpenReadiness }: DecisionWorkspaceProps) {
  const selected = selectedOptionId
    ? findOption(data, selectedOptionId)
    : (data.recommendedOptionId ? findOption(data, data.recommendedOptionId) : undefined) ?? data.options[0]
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  useEffect(() => setAcknowledged([]), [selected?.id])
  const compareOptions = compareIds.map((id) => findOption(data, id)).filter((option): option is PlanOptionView => Boolean(option))
  const selectedEvidence = evidenceId ? data.evidence.find((evidence) => evidence.claimId === evidenceId) : undefined
  const evidenceButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  const closeEvidence = () => {
    const claimId = selectedEvidence?.claimId
    onEvidenceChange(undefined)
    if (claimId) window.setTimeout(() => evidenceButtonRefs.current.get(claimId)?.focus(), 0)
  }

  const toggleCompare = (optionId: string) => {
    if (compareIds.includes(optionId)) onCompareChange(compareIds.filter((id) => id !== optionId))
    else if (compareIds.length < 3) onCompareChange([...compareIds, optionId])
  }

  return <main className="ds-page">
    <section className="ds-content ds-stack" aria-label="Decision workspace">
      <header className="ds-section-header"><div className="ds-stack"><span className="ds-label">Review</span><h1 className="ds-heading ds-heading--page">Decision workspace</h1><p className="ds-copy">Review evidence, trade-offs, and conditions before a separate approval action.</p><span className="font-mono text-[10px] text-muted">Plan {data.id} · Event {data.eventId} · Run {data.runId} · v{data.version} · {data.status}</span></div><div className="flex flex-wrap items-center gap-2"><Badge variant={data.verdict === 'infeasible' ? 'destructive' : 'warning'}>{data.verdict}</Badge><Badge variant="default">Plan base v{data.baseScheduleVersion}</Badge><Badge variant="default">Current v{data.currentScheduleVersion ?? 'checking'}</Badge></div></header>

      <div className="grid gap-3 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2fr)]">
        <EventRail data={data} />
        <div className="ds-stack">
          <section className="ds-panel ds-stack" aria-label="Plan options" style={{ padding: 'var(--ds-space-4)' }}><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Plan options</span><h2 className="m-0 mt-1 text-lg font-extrabold text-ink">Select one feasible option</h2></div><span className="font-mono text-xs text-muted">v{data.version} · {data.status}</span></div><div className="grid gap-2">{data.options.map((option) => <OptionCard key={option.id} option={option} selected={option.id === selected?.id} compared={compareIds.includes(option.id)} onSelect={() => onSelectOption(option.id)} onToggleCompare={() => toggleCompare(option.id)} onConditions={() => onTabChange('overview')} onEvidence={() => data.evidence.length ? onEvidenceChange(data.evidence[0]?.claimId) : undefined} hasEvidence={data.evidence.length > 0} />)}</div></section>

          {selectedOptionId && !selected ? <div className="flex gap-2 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink" role="alert"><WarningCircle aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-warning" /><span>The option in this link is no longer available in plan v{data.version}. No option was selected; choose an available option to continue.</span></div> : null}

          <Tabs value={activeTab || 'overview'} onValueChange={onTabChange} className="ds-panel" style={{ padding: 'var(--ds-space-4)' }}><TabsList aria-label="Decision review sections"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="compare">Compare</TabsTrigger><TabsTrigger value="trace">Trace</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger></TabsList><TabsContent value="overview"><Overview selected={selected} data={data} acknowledged={acknowledged} onAcknowledge={(id) => setAcknowledged((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} /></TabsContent><TabsContent value="compare"><CompareTable options={compareOptions.length ? compareOptions : data.options.slice(0, 2)} onRemove={(id) => onCompareChange(compareIds.filter((value) => value !== id))} /></TabsContent><TabsContent value="trace"><TracePanel data={data} /></TabsContent><TabsContent value="evidence"><EvidencePanel data={data} onEvidenceChange={onEvidenceChange} buttonRefs={evidenceButtonRefs} /></TabsContent></Tabs>
          {onApprove && onReject && onReply ? <DecisionActions data={data} selectedOption={selected} currentScheduleVersion={data.currentScheduleVersion} acknowledgedConditionIds={acknowledged} canAct={actionCanAct} pendingAction={pendingAction} conflict={actionConflict} error={actionError} approvalResult={approvalResult} decisionResult={decisionResult} recomputeRequired={recomputeRequired} onApprove={onApprove} onReject={onReject} onReply={onReply} onRecompute={onRecompute} onReturnToReview={onReturnToReview} onOpenTimeline={onOpenTimeline} onOpenReadiness={onOpenReadiness} /> : null}
        </div>
      </div>
    </section>

    <Sheet open={Boolean(selectedEvidence)} onOpenChange={(open) => { if (!open) closeEvidence() }}><SheetContent side="right" className="w-full gap-5 sm:max-w-md"><SheetHeader><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Evidence</span><SheetTitle>{selectedEvidence?.claimId}</SheetTitle><SheetDescription>Public evidence is linked to a tool result, not hidden model reasoning.</SheetDescription></SheetHeader>{selectedEvidence ? <div className="grid gap-3 text-sm"><p className="m-0 text-ink">{selectedEvidence.claimText}</p><div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3 text-xs"><span className="font-bold text-muted">Tool result</span><span className="font-mono text-ink">{selectedEvidence.toolCallId}</span><span className="text-muted">{selectedEvidence.evidenceType}</span></div></div> : null}<SheetFooter><Button type="button" variant="quiet" onClick={closeEvidence}>Close</Button></SheetFooter></SheetContent></Sheet>
  </main>
}

function EventRail({ data }: { data: PlanWorkspaceData }) {
  return <aside className="ds-panel ds-stack self-start lg:sticky lg:top-4" aria-label="Event context rail" style={{ padding: 'var(--ds-space-4)' }}><div className="flex items-center gap-2"><Info aria-hidden="true" size={16} className="text-primary" /><h2 className="m-0 text-sm font-bold text-ink">Event context</h2></div><div className="grid gap-2 text-xs"><InfoItem label="Event" value={data.eventId} /><InfoItem label="Run" value={data.runId} /><InfoItem label="Plan" value={`${data.id} · v${data.version}`} /></div><section className="grid gap-2 border-t border-border pt-3"><h3 className="m-0 text-xs font-bold text-ink">Lineage</h3><p className="m-0 text-xs text-muted">This plan is linked to the server event and run above. Evidence and conditions below are read-only until an explicit decision.</p></section><section className="grid gap-2 border-t border-border pt-3"><h3 className="m-0 text-xs font-bold text-ink">Data freshness</h3><Badge variant="success">Server plan loaded</Badge><span className="text-[10px] text-muted">Schedule version is checked before approval.</span></section></aside>
}

function OptionCard({ option, selected, compared, onSelect, onToggleCompare, onConditions, onEvidence, hasEvidence }: { option: PlanOptionView; selected: boolean; compared: boolean; onSelect: () => void; onToggleCompare: () => void; onConditions: () => void; onEvidence: () => void; hasEvidence: boolean }) {
  const selectable = isOptionSelectable(option)
  return <article className={`grid gap-3 rounded-sm border p-3 ${selected ? 'border-primary bg-primary-subtle/30' : 'border-border bg-surface'} ${!selectable ? 'opacity-75' : ''}`}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><span className="grid size-7 place-items-center rounded-xs bg-surface-subtle font-mono text-xs font-bold text-muted">{option.rank}</span><div><h3 className="m-0 text-sm font-bold text-ink">{option.label}</h3><div className="mt-1 flex flex-wrap gap-1.5"><Badge variant={selectable ? 'success' : 'destructive'}>{option.solverStatus}</Badge>{option.isRecommended ? <Badge variant="warning">Recommended</Badge> : null}</div></div></div>{selected ? <Check aria-label="Selected option" size={18} className="text-primary" weight="bold" /> : null}</div>{option.violations.length ? <div className="flex gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-2 text-xs text-ink"><WarningCircle aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-danger" /><span>{option.violations.map((violation) => violation.summary).join(' ')}</span></div> : null}<div className="grid grid-cols-3 gap-2 text-xs"><Metric label="Jobs moved (count)" value={optionMetricValue(option, 'jobs_moved')} /><Metric label="Delay (days)" value={optionMetricValue(option, 'total_delay_days')} /><Metric label="Shortfall (bopd·days)" value={optionMetricValue(option, 'shortfall_bopd_days')} /></div><div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2"><Button type="button" variant="quiet" aria-pressed={compared} onClick={onToggleCompare} aria-label={`${compared ? 'Remove' : 'Add'} ${option.label} ${compared ? 'from' : 'to'} comparison`}><GitDiff aria-hidden="true" size={15} />{compared ? 'Remove compare' : 'Add to compare'}</Button><Button type="button" variant="quiet" onClick={onConditions} disabled={!option.conditions.length}>View conditions</Button>{hasEvidence ? <Button type="button" variant="quiet" onClick={onEvidence}>View evidence</Button> : null}<Button type="button" variant={selectable ? 'primary' : 'quiet'} onClick={onSelect} disabled={!selectable}>{selectable ? selected ? 'Selected' : 'Use this option' : 'Infeasible'}</Button></div></article>
}

function Overview({ selected, data, acknowledged, onAcknowledge }: { selected?: PlanOptionView; data: PlanWorkspaceData; acknowledged: string[]; onAcknowledge: (id: string) => void }) {
  if (!selected) return <p className="text-sm text-muted">Select a feasible option to review its impact.</p>
  return <div className="grid gap-4"><section className="grid gap-2"><div className="flex items-center gap-2"><MagnifyingGlass aria-hidden="true" size={16} className="text-primary" /><h2 className="m-0 text-sm font-bold text-ink">Schedule diff</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[32rem] border-collapse text-left text-xs"><thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-2 py-2">Change</th><th className="px-2 py-2">Target</th><th className="px-2 py-2">Proposed</th></tr></thead><tbody>{selected.changes.map((change) => <tr key={`${change.kind}-${change.target}`} className="border-b border-border"><td className="px-2 py-2 text-ink">{change.kind}</td><td className="px-2 py-2 font-mono text-muted">{change.target}</td><td className="px-2 py-2 font-mono font-bold text-primary">D+{change.value}</td></tr>)}</tbody></table></div></section><section className="grid gap-2 border-t border-border pt-3"><h2 className="m-0 text-sm font-bold text-ink">Conditions</h2>{selected.conditions.length ? selected.conditions.map((condition) => <label key={condition.id} className="flex gap-2 rounded-sm border border-border bg-surface-subtle p-2 text-xs"><input type="checkbox" checked={acknowledged.includes(condition.id)} onChange={() => onAcknowledge(condition.id)} className="mt-0.5 size-4 accent-primary" /><span><strong className="block text-ink">{condition.text}</strong><span className="text-muted">{condition.source} · approver {condition.approver} · {condition.outsideModel ? 'outside model' : 'inside model'}</span></span></label>) : <p className="m-0 text-xs text-muted">No additional conditions for this option.</p>}</section><section className="grid gap-2 border-t border-border pt-3"><h2 className="m-0 text-sm font-bold text-ink">Explanation</h2><p className="m-0 text-sm leading-relaxed text-ink">{String(data.explanation.planner ?? 'Verified planner explanation is attached to this plan.')}</p><p className="m-0 text-xs text-muted">{String(data.explanation.management ?? '')}</p></section><div className="flex items-center gap-2 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink"><LockSimple aria-hidden="true" size={16} />Approval actions are intentionally not rendered in review state.</div></div>
}

function CompareTable({ options, onRemove }: { options: PlanOptionView[]; onRemove: (id: string) => void }) {
  const metrics = [['jobs_moved', 'Jobs moved (count)'], ['total_delay_days', 'Delay (days)'], ['shortfall_bopd_days', 'Shortfall (bopd·days)']] as const
  return <div className="grid gap-3"><div className="flex items-center gap-2"><GitDiff aria-hidden="true" size={16} className="text-primary" /><h2 className="m-0 text-sm font-bold text-ink">Compare options</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[42rem] border-collapse text-left text-xs"><thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted"><tr><th className="sticky left-0 bg-surface px-2 py-2">Metric</th>{options.map((option) => <th key={option.id} className="px-2 py-2"><span className="block max-w-44 text-ink">{option.label}</span><button type="button" aria-label={`Remove ${option.label} from compare`} className="mt-1 text-[10px] font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onRemove(option.id)}>Remove</button></th>)}</tr></thead><tbody>{metrics.map(([metric, label]) => <tr key={metric} className="border-b border-border"><th className="sticky left-0 bg-surface px-2 py-2 font-bold text-muted">{label}</th>{options.map((option) => <td key={option.id} className="px-2 py-2 font-mono text-ink">{String(optionMetricValue(option, metric) ?? 'Not reported')}</td>)}</tr>)}</tbody></table></div></div>
}

function TracePanel({ data }: { data: PlanWorkspaceData }) {
  return <div className="grid gap-2"><div className="flex items-center gap-2"><WarningCircle aria-hidden="true" size={16} className="text-primary" /><h2 className="m-0 text-sm font-bold text-ink">Plan lineage</h2></div>{data.lineage.length ? <ol className="m-0 grid list-none gap-2 p-0">{data.lineage.map((entry) => <li key={`${entry.id}-${entry.version}`} className="grid gap-1 border-l-2 border-border pl-3 text-xs"><span className="font-mono text-[10px] text-muted">Plan v{entry.version} · {entry.status}</span><span className="text-ink">{entry.verdict} plan linked to event {entry.eventId} and run {entry.runId}.</span></li>)}</ol> : <p className="m-0 text-xs text-muted">The server did not return plan lineage for this record.</p>}</div>
}

function EvidencePanel({ data, onEvidenceChange, buttonRefs }: { data: PlanWorkspaceData; onEvidenceChange: (evidenceId?: string) => void; buttonRefs: MutableRefObject<Map<string, HTMLButtonElement>> }) {
  return <div className="grid gap-2"><h2 className="m-0 text-sm font-bold text-ink">Evidence links</h2>{data.evidence.map((evidence) => <button key={evidence.claimId} ref={(node) => { if (node) buttonRefs.current.set(evidence.claimId, node); else buttonRefs.current.delete(evidence.claimId) }} type="button" className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={() => onEvidenceChange(evidence.claimId)}><strong className="text-xs text-ink">{evidence.claimText}</strong><span className="font-mono text-[10px] text-muted">{evidence.toolCallId}</span></button>)}</div>
}

function InfoItem({ label, value }: { label: string; value: string }) { return <div className="grid gap-1"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="break-all text-xs text-ink">{value}</strong></div> }
function Metric({ label, value }: { label: string; value: number|string|null }) { return <div className="grid gap-1 rounded-xs bg-surface-subtle p-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="font-mono text-xs text-ink">{value ?? 'Not reported'}</strong></div> }
