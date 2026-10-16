import { useEffect, useState } from 'react'
import { ClipboardText, Copy, Funnel, MagnifyingGlass, Plus, UserCircle } from '@phosphor-icons/react'

import { DEFAULT_SCENARIO_ID } from '@/api/transport'
import { Badge, Button, Input, Label } from '@/components/ui'
import { actionLabel, filterHistoryDecisions, humanizeHistoryLabel, type HistoryFilters, type HistoryViewData } from '@/features/history/history-data'
import { AuditDetailSheet, type HistoryCopyTarget, type HistorySimilarChangeTarget, type HistoryTimelineTarget, type HistoryWorkspaceTarget } from './audit-detail-sheet'

export interface DecisionHistoryProps {
  data: HistoryViewData
  search: HistoryFilters
  scenarioId?: string
  scenarioLabel?: string
  onSearchChange: (patch: Partial<HistoryFilters>) => void
  selectedDecisionId?: string
  onSelectedDecisionChange: (decisionId?: string) => void
  onOpenTimeline: (target: HistoryTimelineTarget) => void
  onOpenSourceEvent: (eventId: string) => void
  onOpenDecisionWorkspace: (target: HistoryWorkspaceTarget) => void
  onStartSimilarChange: (target: HistorySimilarChangeTarget) => void
  onCopyStableLink: (target: HistoryCopyTarget) => void
  onOpenDemo?: () => void
  onExploreFleetHistory?: () => void
  onNextPage?: () => void
  onPreviousPage?: () => void
}

const selectClass = 'h-9 rounded-sm border border-border bg-surface px-2.5 text-xs text-ink outline-none transition-colors hover:border-border-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus max-[700px]:min-h-11'

export function DecisionHistory({ data, search, scenarioId, scenarioLabel, onSearchChange, selectedDecisionId, onSelectedDecisionChange, onOpenTimeline, onOpenSourceEvent, onOpenDecisionWorkspace, onStartSimilarChange, onCopyStableLink, onOpenDemo, onExploreFleetHistory, onNextPage, onPreviousPage }: DecisionHistoryProps) {
  const selected = data.decisions.find((decision) => decision.id === selectedDecisionId)
  const detail = selected ? data.details[selected.id] : undefined
  const [queryDraft, setQueryDraft] = useState(search.q ?? '')
  useEffect(() => setQueryDraft(search.q ?? ''), [search.q])
  useEffect(() => {
    if (queryDraft === (search.q ?? '')) return
    const timeout = window.setTimeout(() => onSearchChange({ q: queryDraft.trim() || undefined }), 220)
    return () => window.clearTimeout(timeout)
  }, [onSearchChange, queryDraft, search.q])

  const setFilter = (key: keyof HistoryFilters, value: string) => onSearchChange({ [key]: value || undefined })
  const hasActiveFilters = Boolean(search.from || search.to || search.action || search.planId || search.nature || search.job || search.actor || search.conditional || search.q)
  const clearFilters = () => onSearchChange({ from: undefined, to: undefined, action: undefined, planId: undefined, nature: undefined, job: undefined, actor: undefined, conditional: undefined, q: undefined })
  const filtered = search.conditional && search.conditional !== 'all'
    ? filterHistoryDecisions(data.decisions, { conditional: search.conditional })
    : data.decisions
  const values = {
    actions: [...new Set(data.decisions.map((decision) => decision.action))],
    natures: [...new Set(data.decisions.flatMap((decision) => decision.eventNature ? [decision.eventNature] : []))],
    jobs: [...new Set(data.decisions.flatMap((decision) => decision.jobs))],
    actors: [...new Set(data.decisions.map((decision) => decision.actor))],
  }
  const goldenScenario = scenarioId === DEFAULT_SCENARIO_ID

  return <main className="ds-page">
    <section className="ds-content ds-stack" aria-label="Decision history">
      <header className="ds-section-header">
        <div className="ds-stack"><span className="ds-label">Governance · {scenarioLabel ?? 'Active scenario'}</span><h1 className="ds-heading ds-heading--page">Decision history</h1><p className="ds-copy">Immutable schedule decisions with the event, plan, jobs, and audit trail that explain each change.</p></div>
        <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-subtle px-3 py-2 text-xs text-muted"><ClipboardText aria-hidden="true" size={16} /><span>Audit records are read only</span></div>
      </header>

      <SummaryMetrics summary={data.summary} />

      <section className="ds-panel ds-stack" aria-label="Decision history filters" style={{ padding: 'var(--ds-space-3)' }}>
        <div className="flex items-center gap-2 text-xs font-bold text-muted"><Funnel aria-hidden="true" size={15} />Filter decisions <span className="font-normal">Server filters keep totals and pages in the active scenario; conditions refine the visible page.</span></div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-52 flex-1 gap-1.5"><Label htmlFor="history-search">Search decisions</Label><div className="relative"><MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 text-muted" size={15} /><Input id="history-search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Search cause, job, actor, or ID…" className="pl-8 max-[700px]:min-h-11" /></div></div>
          <div className="grid min-w-52 gap-1.5"><Label htmlFor="history-plan">Plan ID</Label><Input id="history-plan" value={search.planId ?? ''} onChange={(event) => setFilter('planId', event.target.value)} placeholder="Paste a plan ID" className="max-[700px]:min-h-11" /></div>
          <FilterSelect label="From" value={search.from ?? ''} type="date" onChange={(value) => setFilter('from', value)} options={[]} />
          <FilterSelect label="To" value={search.to ?? ''} type="date" onChange={(value) => setFilter('to', value)} options={[]} />
          <FilterSelect label="Action" value={search.action ?? ''} onChange={(value) => setFilter('action', value)} options={[['', 'All actions'], ...values.actions.map((action) => [action, actionLabel(action)])]} />
          <FilterSelect label="Nature" value={search.nature ?? ''} onChange={(value) => setFilter('nature', value)} options={[['', 'All event types'], ...values.natures.map((nature) => [nature, humanizeHistoryLabel(nature)])]} />
          <FilterSelect label="Job" value={search.job ?? ''} onChange={(value) => setFilter('job', value)} options={[['', 'All jobs'], ...values.jobs.map((job) => [job, job])]} />
          <FilterSelect label="Actor" value={search.actor ?? ''} onChange={(value) => setFilter('actor', value)} options={[['', 'All actors'], ...values.actors.map((actor) => [actor, actor])]} />
          <FilterSelect label="Conditions · page" value={search.conditional ?? ''} onChange={(value) => setFilter('conditional', value)} options={[['', 'All decisions'], ['conditional', 'Conditional'], ['unconditional', 'Unconditional']]} />
          {hasActiveFilters ? <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}
        </div>
      </section>

      <section className="ds-panel overflow-hidden" aria-label="Decision list">
        {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1120px] border-collapse text-left text-xs"><caption className="sr-only">Immutable decision history for {scenarioLabel ?? 'the active scenario'}</caption><thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-3 font-bold">Decision / cause</th><th className="px-3 py-3 font-bold">Action</th><th className="px-3 py-3 font-bold">Event / jobs / resources</th><th className="px-3 py-3 font-bold">Actor / recorded</th><th className="px-3 py-3 font-bold">Plan / versions</th><th className="px-3 py-3 font-bold">Audit links</th></tr></thead><tbody>{filtered.map((decision) => <DecisionRow key={decision.id} decision={decision} onSelect={() => onSelectedDecisionChange(decision.id)} onOpenTimeline={onOpenTimeline} onOpenSourceEvent={onOpenSourceEvent} onOpenDecisionWorkspace={onOpenDecisionWorkspace} onStartSimilarChange={onStartSimilarChange} onCopyStableLink={onCopyStableLink} />)}</tbody></table></div> : <HistoryEmpty hasActiveFilters={hasActiveFilters} goldenScenario={goldenScenario} onClearFilters={clearFilters} onOpenDemo={onOpenDemo} onExploreFleetHistory={onExploreFleetHistory} hasServerRecords={data.summary.total > 0} />}
        <HistoryPagination showing={filtered.length} total={data.summary.total} canPrevious={Boolean(onPreviousPage)} canNext={Boolean(onNextPage)} onPrevious={onPreviousPage} onNext={onNextPage} />
      </section>
    </section>

    <AuditDetailSheet detail={detail} onOpenChange={(open) => { if (!open) onSelectedDecisionChange(undefined) }} onOpenTimeline={onOpenTimeline} onOpenSourceEvent={onOpenSourceEvent} onOpenDecisionWorkspace={onOpenDecisionWorkspace} onStartSimilarChange={onStartSimilarChange} onCopyStableLink={onCopyStableLink} />
  </main>
}

function SummaryMetrics({ summary }: { summary: HistoryViewData['summary'] }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Decision history summary"><Metric label="Filtered decisions" value={summary.total} scope="Server total" /><Metric label="Approved on page" value={summary.approvals} tone="success" scope="Visible page" /><Metric label="Rejected on page" value={summary.rejections} tone="danger" scope="Visible page" /><Metric label="Replies on page" value={summary.replies} tone="info" scope="Visible page" /><Metric label="Conditional on page" value={summary.conditional} tone="warning" scope="Visible page" /></div>
}

function Metric({ label, value, scope, tone = 'neutral' }: { label: string; value: number; scope: string; tone?: 'neutral' | 'success' | 'danger' | 'info' | 'warning' }) {
  const toneClass = { neutral: 'text-ink', success: 'text-success', danger: 'text-danger', info: 'text-info', warning: 'text-warning' }[tone]
  return <div className="ds-panel grid gap-1" style={{ padding: 'var(--ds-space-3)' }}><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className={`font-mono text-xl ${toneClass}`}>{value}</strong><span className="text-[10px] text-muted">{scope}</span></div>
}

function FilterSelect({ label, value, onChange, options, type = 'select' }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; type?: 'select' | 'date' }) {
  if (type === 'date') return <label className="grid min-w-32 gap-1.5 text-xs font-bold text-muted"><span>{label}</span><input aria-label={label} type="date" className={selectClass} value={value} onChange={(event) => onChange(event.target.value)} /></label>
  return <label className="grid min-w-32 gap-1.5 text-xs font-bold text-muted"><span>{label}</span><select aria-label={label} className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function DecisionRow({ decision, onSelect, onOpenTimeline, onOpenSourceEvent, onOpenDecisionWorkspace, onStartSimilarChange, onCopyStableLink }: { decision: HistoryViewData['decisions'][number]; onSelect: () => void; onOpenTimeline: (target: HistoryTimelineTarget) => void; onOpenSourceEvent: (eventId: string) => void; onOpenDecisionWorkspace: (target: HistoryWorkspaceTarget) => void; onStartSimilarChange: (target: HistorySimilarChangeTarget) => void; onCopyStableLink: (target: HistoryCopyTarget) => void }) {
  const date = decision.createdAt.slice(0, 10)
  const cause = decision.eventCause ?? decision.reason ?? 'No cause summary supplied by the server.'
  return <tr className="border-b border-border align-top transition-colors hover:bg-surface-subtle"><td className="max-w-xs px-3 py-3"><button type="button" className="grid gap-1 text-left font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={onSelect}><span className="truncate">{decision.summary}</span><span className="line-clamp-2 text-[11px] font-normal leading-4 text-muted">{cause}</span><span className="font-mono text-[10px] font-normal text-muted">Decision {shortId(decision.id)}</span></button></td><td className="px-3 py-3"><Badge variant={decision.action === 'approve' ? 'success' : decision.action === 'reject' ? 'destructive' : 'info'}>{actionLabel(decision.action)}</Badge>{decision.conditionalState === 'conditional' ? <span className="mt-1 block text-[10px] text-warning">Conditional approval</span> : null}</td><td className="px-3 py-3"><span className="block text-ink">{decision.eventNature ? humanizeHistoryLabel(decision.eventNature) : 'Event context unavailable'}</span>{decision.jobs.length ? <div className="mt-1 flex flex-wrap gap-1">{decision.jobs.map((job) => <button key={job} type="button" className="font-mono text-[10px] font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenTimeline({ decisionId: decision.id, from: date, to: date, jobId: job })} aria-label={`Open job ${job} in Timeline`}>Job {job}</button>)}</div> : <span className="mt-1 block text-[10px] text-muted">No job linked</span>}{decision.resources.length ? <span className="mt-1 block text-[10px] text-muted">Resources: {decision.resources.join(', ')}</span> : null}{decision.eventId ? <button type="button" className="mt-1 block text-[10px] font-bold text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenSourceEvent(decision.eventId!)}>Open source event</button> : <span className="mt-1 block text-[10px] text-muted">Source event unavailable</span>}</td><td className="px-3 py-3"><span className="flex items-center gap-1 text-ink"><UserCircle aria-hidden="true" size={14} className="text-muted" />{decision.actor}</span><time dateTime={decision.createdAt} className="mt-1 block text-[11px] text-muted">{decision.dateLabel}</time></td><td className="px-3 py-3"><button type="button" className="grid gap-1 text-left font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenDecisionWorkspace({ decisionId: decision.id, planId: decision.planId, ...(decision.runId ? { runId: decision.runId } : {}), mode: 'audit' })} aria-label={`Open plan ${shortId(decision.planId)} in audit mode`}><span className="flex items-center gap-1"><ClipboardText aria-hidden="true" size={14} />Plan v{decision.planVersion ?? '—'}</span><span className="font-mono text-[10px] font-normal text-muted">{shortId(decision.planId)}</span></button><span className="mt-1 block text-[10px] text-muted">Schedule v{decision.scheduleVersionBefore ?? '—'} → v{decision.scheduleVersionAfter ?? '—'}</span></td><td className="px-3 py-3"><div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="quiet" onClick={onSelect}>Audit</Button><Button type="button" size="sm" variant="quiet" onClick={() => onCopyStableLink({ decisionId: decision.id, url: decision.stableLink })} aria-label={`Copy stable link for decision ${shortId(decision.id)}`}><Copy aria-hidden="true" size={14} /></Button><Button type="button" size="sm" variant="quiet" onClick={() => onStartSimilarChange({ decisionId: decision.id, planId: decision.planId, ...(decision.eventId ? { eventId: decision.eventId } : {}), context: decision.summary })} aria-label={`Start similar change from decision ${shortId(decision.id)}`}><Plus aria-hidden="true" size={14} />Similar</Button></div></td></tr>
}

function HistoryEmpty({ hasActiveFilters, goldenScenario, hasServerRecords, onClearFilters, onOpenDemo, onExploreFleetHistory }: { hasActiveFilters: boolean; goldenScenario: boolean; hasServerRecords: boolean; onClearFilters: () => void; onOpenDemo?: () => void; onExploreFleetHistory?: () => void }) {
  if (hasActiveFilters) return <div className="grid place-items-center gap-2 p-10 text-center"><MagnifyingGlass aria-hidden="true" size={24} className="text-muted" /><p className="m-0 text-sm text-muted">No persisted decisions match these server filters.</p><p className="m-0 max-w-prose text-xs text-muted">Clear the filters to return to the current scenario history.</p><Button type="button" variant="secondary" onClick={onClearFilters}>Clear filters</Button></div>
  if (hasServerRecords) return <div className="grid place-items-center gap-2 p-10 text-center"><MagnifyingGlass aria-hidden="true" size={24} className="text-muted" /><p className="m-0 text-sm text-muted">No decisions are on this page.</p><p className="m-0 max-w-prose text-xs text-muted">Use the previous page control or clear the current cursor.</p></div>
  return <div className="grid place-items-center gap-2 p-10 text-center"><MagnifyingGlass aria-hidden="true" size={24} className="text-muted" /><p className="m-0 text-sm text-muted">{goldenScenario ? 'Golden A-12 has no persisted decisions yet.' : 'No persisted decisions in this scenario yet.'}</p><p className="m-0 max-w-prose text-xs text-muted">{goldenScenario ? 'That is expected until a planner approves, rejects, or replies to a plan. The audit surface will appear here without fabricated records.' : 'The server has not recorded an immutable decision for this scenario.'}</p><div className="flex flex-wrap justify-center gap-2">{goldenScenario && onExploreFleetHistory ? <Button type="button" variant="secondary" onClick={onExploreFleetHistory}>Explore fleet history</Button> : null}{onOpenDemo ? <Button type="button" variant="primary" onClick={onOpenDemo}>Open Demo Lab</Button> : null}</div></div>
}

function HistoryPagination({ showing, total, canPrevious, canNext, onPrevious, onNext }: { showing: number; total: number; canPrevious: boolean; canNext: boolean; onPrevious?: () => void; onNext?: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-subtle px-3 py-3 text-xs text-muted"><span>Showing {showing} of {total} server-filtered decision{total === 1 ? '' : 's'}</span><div className="flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={!canPrevious} onClick={onPrevious}>Previous</Button><Button type="button" size="sm" variant="secondary" disabled={!canNext} onClick={onNext}>Next</Button></div></div>
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}
