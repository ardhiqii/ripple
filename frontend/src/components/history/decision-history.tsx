import { useMemo } from 'react'
import { ClipboardText, Copy, Funnel, MagnifyingGlass, Plus, UserCircle } from '@phosphor-icons/react'

import { Badge, Button, Input, Label } from '@/components/ui'
import { filterHistoryDecisions, type HistoryFilters, type HistoryViewData } from '@/features/history/history-data'
import { AuditDetailSheet, type HistoryCopyTarget, type HistorySimilarChangeTarget, type HistoryTimelineTarget, type HistoryWorkspaceTarget } from './audit-detail-sheet'

export interface DecisionHistoryProps {
  data: HistoryViewData
  search: HistoryFilters
  onSearchChange: (patch: Partial<HistoryFilters>) => void
  selectedDecisionId?: string
  onSelectedDecisionChange: (decisionId?: string) => void
  onOpenTimeline: (target: HistoryTimelineTarget) => void
  onOpenSourceEvent: (eventId: string) => void
  onOpenDecisionWorkspace: (target: HistoryWorkspaceTarget) => void
  onStartSimilarChange: (target: HistorySimilarChangeTarget) => void
  onCopyStableLink: (target: HistoryCopyTarget) => void
}

const selectClass = 'h-9 rounded-sm border border-border bg-surface px-2.5 text-xs text-ink outline-none transition-colors hover:border-border-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus max-[700px]:min-h-11'

export function DecisionHistory({ data, search, onSearchChange, selectedDecisionId, onSelectedDecisionChange, onOpenTimeline, onOpenSourceEvent, onOpenDecisionWorkspace, onStartSimilarChange, onCopyStableLink }: DecisionHistoryProps) {
  const filtered = useMemo(() => filterHistoryDecisions(data.decisions, search), [data.decisions, search])
  const selected = data.decisions.find((decision) => decision.id === selectedDecisionId)
  const detail = selected ? data.details[selected.id] : undefined
  const setFilter = (key: keyof HistoryFilters, value: string) => onSearchChange({ [key]: value || undefined })
  const clearFilters = () => onSearchChange({ from: undefined, to: undefined, action: undefined, nature: undefined, job: undefined, actor: undefined, conditional: undefined, q: undefined })
  const values = {
    actions: [...new Set(data.decisions.map((decision) => decision.action))],
    natures: [...new Set(data.decisions.flatMap((decision) => decision.eventNature ? [decision.eventNature] : []))],
    jobs: [...new Set(data.decisions.flatMap((decision) => decision.jobs))],
    actors: [...new Set(data.decisions.map((decision) => decision.actor))],
  }

  return <main className="ds-page">
    <section className="ds-content ds-stack" aria-label="Decision history">
      <header className="ds-section-header">
        <div className="ds-stack"><span className="ds-label">Governance</span><h1 className="ds-heading ds-heading--page">Decision history</h1><p className="ds-copy">Immutable decisions, source context, and the audit trail behind every schedule change.</p></div>
        <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-subtle px-3 py-2 text-xs text-muted"><ClipboardText aria-hidden="true" size={16} /><span>Audit records are read only</span></div>
      </header>

      <SummaryMetrics summary={data.summary} />

      <section className="ds-panel ds-stack" aria-label="Decision history filters" style={{ padding: 'var(--ds-space-3)' }}>
        <div className="flex items-center gap-2 text-xs font-bold text-muted"><Funnel aria-hidden="true" size={15} />Filter decisions</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-52 flex-1 gap-1.5"><Label htmlFor="history-search">Search decisions</Label><div className="relative"><MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 text-muted" size={15} /><Input id="history-search" value={search.q ?? ''} onChange={(event) => setFilter('q', event.target.value)} placeholder="Search ID, summary, actor..." className="pl-8 max-[700px]:min-h-11" /></div></div>
          <FilterSelect label="From" value={search.from ?? ''} type="date" onChange={(value) => setFilter('from', value)} options={[]} />
          <FilterSelect label="To" value={search.to ?? ''} type="date" onChange={(value) => setFilter('to', value)} options={[]} />
          <FilterSelect label="Action" value={search.action ?? ''} onChange={(value) => setFilter('action', value)} options={[['', 'All actions'], ...values.actions.map((action) => [action, action])]} />
          <FilterSelect label="Nature" value={search.nature ?? ''} onChange={(value) => setFilter('nature', value)} options={[['', 'All nature'], ...values.natures.map((nature) => [nature, nature])]} />
          <FilterSelect label="Job" value={search.job ?? ''} onChange={(value) => setFilter('job', value)} options={[['', 'All jobs'], ...values.jobs.map((job) => [job, job])]} />
          <FilterSelect label="Actor" value={search.actor ?? ''} onChange={(value) => setFilter('actor', value)} options={[['', 'All actors'], ...values.actors.map((actor) => [actor, actor])]} />
          <FilterSelect label="Conditional" value={search.conditional ?? ''} onChange={(value) => setFilter('conditional', value)} options={[['', 'All states'], ['conditional', 'Conditional'], ['unconditional', 'Unconditional']]} />
        </div>
      </section>

      <section className="ds-panel overflow-hidden" aria-label="Decision list">
        <div className="overflow-x-auto"><table className="w-full min-w-[1040px] border-collapse text-left text-xs"><caption className="sr-only">Immutable decision history</caption><thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-3 font-bold">Decision</th><th className="px-3 py-3 font-bold">Action</th><th className="px-3 py-3 font-bold">Event / jobs</th><th className="px-3 py-3 font-bold">Actor</th><th className="px-3 py-3 font-bold">Plan</th><th className="px-3 py-3 font-bold">Recorded</th><th className="px-3 py-3 font-bold">Links</th></tr></thead><tbody>{filtered.map((decision) => <DecisionRow key={decision.id} decision={decision} onSelect={() => onSelectedDecisionChange(decision.id)} onOpenTimeline={onOpenTimeline} onOpenSourceEvent={onOpenSourceEvent} onOpenDecisionWorkspace={onOpenDecisionWorkspace} onStartSimilarChange={onStartSimilarChange} onCopyStableLink={onCopyStableLink} />)}</tbody></table></div>
        {!filtered.length ? <div className="grid place-items-center gap-2 p-10 text-center"><MagnifyingGlass aria-hidden="true" size={24} className="text-muted" />{data.decisions.length ? <><p className="m-0 text-sm text-muted">No decisions match these filters.</p><Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button></> : <><p className="m-0 text-sm text-muted">No decisions recorded yet.</p><p className="m-0 max-w-prose text-xs text-muted">Run the guided A-12 scenario to create the first audit record.</p><a href="/demo" className="inline-flex min-h-9 items-center rounded-sm border border-border bg-surface px-3 text-xs font-bold text-ink outline-none hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Open Demo Lab</a></>}</div> : null}
      </section>
    </section>

    <AuditDetailSheet detail={detail} onOpenChange={(open) => { if (!open) onSelectedDecisionChange(undefined) }} onOpenTimeline={onOpenTimeline} onOpenSourceEvent={onOpenSourceEvent} onOpenDecisionWorkspace={onOpenDecisionWorkspace} onStartSimilarChange={onStartSimilarChange} onCopyStableLink={onCopyStableLink} />
  </main>
}

function SummaryMetrics({ summary }: { summary: HistoryViewData['summary'] }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Decision history summary"><Metric label="Decisions" value={summary.total} /><Metric label="Approved" value={summary.approvals} tone="success" /><Metric label="Rejected" value={summary.rejections} tone="danger" /><Metric label="Replies" value={summary.replies} tone="info" /><Metric label="Conditional" value={summary.conditional} tone="warning" /></div>
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'danger' | 'info' | 'warning' }) {
  const toneClass = { neutral: 'bg-surface-subtle text-muted', success: 'bg-success-subtle text-success', danger: 'bg-danger-subtle text-danger', info: 'bg-info-subtle text-info', warning: 'bg-warning-subtle text-warning' }[tone]
  return <div className="ds-panel grid gap-1" style={{ padding: 'var(--ds-space-3)' }}><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className={`font-mono text-xl ${toneClass}`}>{value}</strong></div>
}

function FilterSelect({ label, value, onChange, options, type = 'select' }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; type?: 'select' | 'date' }) {
  if (type === 'date') return <label className="grid min-w-32 gap-1.5 text-xs font-bold text-muted"><span>{label}</span><input aria-label={label} type="date" className={selectClass} value={value} onChange={(event) => onChange(event.target.value)} /></label>
  return <label className="grid min-w-32 gap-1.5 text-xs font-bold text-muted"><span>{label}</span><select aria-label={label} className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function DecisionRow({ decision, onSelect, onOpenTimeline, onOpenSourceEvent, onOpenDecisionWorkspace, onStartSimilarChange, onCopyStableLink }: { decision: HistoryViewData['decisions'][number]; onSelect: () => void; onOpenTimeline: (target: HistoryTimelineTarget) => void; onOpenSourceEvent: (eventId: string) => void; onOpenDecisionWorkspace: (target: HistoryWorkspaceTarget) => void; onStartSimilarChange: (target: HistorySimilarChangeTarget) => void; onCopyStableLink: (target: HistoryCopyTarget) => void }) {
  const date = decision.createdAt.slice(0, 10)
  return <tr className="border-b border-border align-top transition-colors hover:bg-surface-subtle"><td className="max-w-xs px-3 py-3"><button type="button" className="grid gap-1 text-left font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={onSelect}><span className="truncate">{decision.summary}</span><span className="font-mono text-[10px] text-muted">{decision.id}</span></button></td><td className="px-3 py-3"><Badge variant={decision.action === 'approve' ? 'success' : decision.action === 'reject' ? 'destructive' : 'info'}>{decision.action}</Badge>{decision.conditionalState === 'conditional' ? <span className="mt-1 block text-[10px] text-warning">Conditional</span> : null}</td><td className="px-3 py-3"><span className="block text-ink">{decision.eventNature ?? 'Event context unavailable'}</span>{decision.jobs.length ? <div className="mt-1 flex flex-wrap gap-1">{decision.jobs.map((job) => <button key={job} type="button" className="font-mono text-[10px] font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenTimeline({ decisionId: decision.id, from: date, to: date })} aria-label={`Open ${job} in Timeline`}>{job}</button>)}</div> : <span className="mt-1 block text-[10px] text-muted">No job linked</span>}{decision.eventId ? <button type="button" className="mt-1 block text-[10px] font-bold text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenSourceEvent(decision.eventId!)}>Open source event</button> : null}</td><td className="px-3 py-3"><span className="flex items-center gap-1 text-ink"><UserCircle aria-hidden="true" size={14} className="text-muted" />{decision.actor}</span></td><td className="px-3 py-3"><button type="button" className="flex items-center gap-1 font-mono font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenDecisionWorkspace({ decisionId: decision.id, planId: decision.planId, mode: 'audit' })} aria-label={`Open plan ${decision.planId} in audit mode`}><ClipboardText aria-hidden="true" size={14} />v{decision.planVersion ?? '—'}</button></td><td className="px-3 py-3"><time dateTime={decision.createdAt} className="font-mono text-[11px] text-ink">{decision.dateLabel}</time><span className="mt-1 block text-[10px] text-muted">v{decision.scheduleVersionBefore ?? '—'} → v{decision.scheduleVersionAfter ?? '—'}</span></td><td className="px-3 py-3"><div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="quiet" onClick={onSelect}>Audit</Button><Button type="button" size="sm" variant="quiet" onClick={() => onCopyStableLink({ decisionId: decision.id, url: decision.stableLink })} aria-label={`Copy stable link for ${decision.id}`}><Copy aria-hidden="true" size={14} /></Button><Button type="button" size="sm" variant="quiet" onClick={() => onStartSimilarChange({ decisionId: decision.id, planId: decision.planId, ...(decision.eventId ? { eventId: decision.eventId } : {}), context: decision.summary })} aria-label={`Start similar change from ${decision.id}`}><Plus aria-hidden="true" size={14} /></Button></div></td></tr>
}
