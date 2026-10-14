import { ArrowSquareOut, CalendarBlank, CheckCircle, ClipboardText, Copy, GitBranch, LockKey } from '@phosphor-icons/react'

import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui'
import type { HistoryAuditDetail } from '@/features/history/history-data'

export type HistoryTimelineTarget = Readonly<{ decisionId: string; from: string; to: string }>
export type HistoryWorkspaceTarget = Readonly<{ decisionId: string; planId: string; mode: 'audit' }>
export type HistorySimilarChangeTarget = Readonly<{ decisionId: string; planId: string; eventId?: string; context: string }>
export type HistoryCopyTarget = Readonly<{ decisionId: string; url: string }>

interface AuditDetailSheetProps {
  detail?: HistoryAuditDetail
  onOpenChange: (open: boolean) => void
  onOpenTimeline: (target: HistoryTimelineTarget) => void
  onOpenSourceEvent: (eventId: string) => void
  onOpenDecisionWorkspace: (target: HistoryWorkspaceTarget) => void
  onStartSimilarChange: (target: HistorySimilarChangeTarget) => void
  onCopyStableLink: (target: HistoryCopyTarget) => void
}

export function AuditDetailSheet({ detail, onOpenChange, onOpenTimeline, onOpenSourceEvent, onOpenDecisionWorkspace, onStartSimilarChange, onCopyStableLink }: AuditDetailSheetProps) {
  const decision = detail?.decision
  const date = decision ? dateOnly(decision.createdAt) : ''
  return <Sheet open={Boolean(detail)} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-xl">
      {detail && decision ? <>
        <SheetHeader className="border-b border-border pb-4 pr-8">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Decision history</span><Badge variant="default"><LockKey aria-hidden="true" size={13} />Immutable record</Badge></div>
          <SheetTitle>{decision.summary}</SheetTitle>
          <SheetDescription>{decision.id} · recorded {decision.dateLabel} · no edit operations are available.</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Info label="Action" value={decision.action} />
          <Info label="Actor" value={decision.actor} />
          <Info label="Plan" value={decision.planId} />
          <Info label="Conditions" value={String(decision.acknowledgedConditionIds.length)} />
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Audit links">
          <Button type="button" size="sm" variant="secondary" onClick={() => onOpenTimeline({ decisionId: decision.id, from: date, to: date })}><CalendarBlank aria-hidden="true" size={15} />Open Timeline</Button>
          {decision.eventId ? <Button type="button" size="sm" variant="secondary" onClick={() => onOpenSourceEvent(decision.eventId!)}><ArrowSquareOut aria-hidden="true" size={15} />Source event</Button> : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => onOpenDecisionWorkspace({ decisionId: decision.id, planId: decision.planId, mode: 'audit' })}><ClipboardText aria-hidden="true" size={15} />Decision Workspace</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onCopyStableLink({ decisionId: decision.id, url: decision.stableLink })}><Copy aria-hidden="true" size={15} />Copy stable link</Button>
          <Button type="button" size="sm" variant="primary" onClick={() => onStartSimilarChange({ decisionId: decision.id, planId: decision.planId, ...(decision.eventId ? { eventId: decision.eventId } : {}), context: decision.summary })}><GitBranch aria-hidden="true" size={15} />Start similar change</Button>
        </div>

        <section className="grid gap-3" aria-label="Audit timeline">
          <div className="flex items-center justify-between gap-3"><h3 className="m-0 text-sm font-bold text-ink">Chronological audit timeline</h3><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Read only</span></div>
          <ol className="m-0 grid list-none gap-0 border-l border-border pl-5">
            {detail.timeline.map((item) => <li key={item.id} className="relative grid gap-1 border-b border-border pb-4 pt-1 last:border-b-0">
              <span className={`absolute -left-[25px] top-1 grid size-4 place-items-center rounded-full border-2 bg-surface ${item.recorded ? 'border-success text-success' : 'border-border text-muted'}`} aria-hidden="true">{item.recorded ? <CheckCircle weight="fill" size={11} /> : <span className="size-1.5 rounded-full bg-border" />}</span>
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-ink">{item.label}</strong><time className="font-mono text-[10px] text-muted" dateTime={item.timestamp}>{formatTime(item.timestamp)}</time></div>
              <p className="m-0 text-xs leading-relaxed text-muted">{item.detail}</p>
            </li>)}
          </ol>
        </section>

        <section className="grid gap-3 border-t border-border pt-4" aria-label="Applied change records">
          <div className="flex items-center justify-between gap-3"><h3 className="m-0 text-sm font-bold text-ink">Applied changes</h3><span className="text-xs text-muted">{detail.changes.length} record{detail.changes.length === 1 ? '' : 's'}</span></div>
          {detail.changes.length ? <div className="grid gap-2">{detail.changes.map((change) => <div key={change.id} className="grid gap-2 rounded-sm border border-border bg-surface-subtle p-3 text-xs"><div className="flex flex-wrap items-center gap-2"><Badge variant="default">{change.entityType}</Badge><strong className="text-ink">{change.entityId}</strong><span className="text-muted">{change.field} · {change.changeKind}</span></div><div className="grid gap-2 sm:grid-cols-2"><ChangeValue label="Before" value={change.before} /><ChangeValue label="After" value={change.after} /></div></div>)}</div> : <p className="m-0 rounded-sm border border-border bg-surface-subtle p-3 text-xs text-muted">No schedule changes were applied by this decision.</p>}
        </section>

        <SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>Close</Button></SheetFooter>
      </> : null}
    </SheetContent>
  </Sheet>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="truncate text-ink" title={value}>{value}</strong></div>
}

function ChangeValue({ label, value }: { label: string; value: Readonly<Record<string, unknown>> }) {
  return <div className="grid gap-1 rounded-sm border border-border bg-surface p-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><code className="break-words font-mono text-[11px] text-ink">{JSON.stringify(value)}</code></div>
}

function dateOnly(value: string): string {
  return value.slice(0, 10)
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)
}
