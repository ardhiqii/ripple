import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowSquareOut, ArrowUpRight, Check, Clock, Copy, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'

import { Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, toast } from '@/components/ui'
import { useReadinessDetail, type ReadinessDetailData, type ReadinessListData } from '@/features/readiness/readiness-api'
import type { ReadinessSearch } from '@/routes/search-schemas'
import {
  filterReadinessRows,
  riskForRow,
  type ReadinessRow,
  type ReadinessStatus,
  type ReadinessUpdate,
} from '@/features/readiness/readiness-data'

interface ReadinessBoardProps {
  data: ReadinessListData
  scenarioId?: string
  search: ReadinessSearch
  onSearchChange: (patch: Partial<ReadinessSearch>) => void
  onOpenJob: (jobId: string) => void
  onOpenSourceEvent?: (eventId: string) => void
  onOpenPlan?: (planId: string) => void
  updateStatus: ReadinessUpdate
}

const selectClass = 'h-9 rounded-sm border border-border bg-surface px-2.5 text-xs text-ink outline-none transition-colors hover:border-border-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus max-[700px]:min-h-11'

type ActionErrors = Record<string, string>

export function ReadinessBoard({ data, scenarioId = 'A-12-base', search, onSearchChange, onOpenJob, onOpenSourceEvent = () => undefined, onOpenPlan = () => undefined, updateStatus }: ReadinessBoardProps) {
  const [rows, setRows] = useState(data.items)
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(() => new Set())
  const [actionErrors, setActionErrors] = useState<ActionErrors>({})
  const selected = rows.find((row) => row.id === search.item)
  const filteredRows = useMemo(() => filterReadinessRows(rows, search), [rows, search])
  const groupedRows = useMemo(() => {
    const groups = new Map<string, ReadinessRow[]>()
    for (const row of filteredRows) {
      const key = search.group === 'job' ? row.job_id : search.group === 'stage' ? row.stage : riskForRow(row)
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return [...groups.entries()]
  }, [filteredRows, search.group])

  useEffect(() => setRows(data.items), [data.items])

  const changeStatus = async (row: ReadinessRow) => {
    const nextStatus = nextStatusFor(row)
    if (!nextStatus) return

    const previousRow = rows.find((item) => item.id === row.id) ?? row
    clearActionError(row.id)
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: nextStatus } : item))
    setPendingItemIds((current) => new Set(current).add(row.id))

    try {
      const updated = await updateStatus(row.id, nextStatus, row.row_version)
      if (updated) setRows((current) => current.map((item) => item.id === updated.id ? updated : item))
      toast.success(nextStatus === 'ready' ? 'Readiness marked ready' : 'Readiness reopened', {
        description: `${humanizeJob(row.job_id)} · ${humanizeStage(row.stage)} was saved on the server.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The server rejected this readiness update.'
      setRows((current) => current.map((item) => item.id === previousRow.id ? previousRow : item))
      setActionErrors((current) => ({ ...current, [row.id]: message }))
      toast.error('Readiness update rolled back', { description: message })
    } finally {
      setPendingItemIds((current) => {
        const next = new Set(current)
        next.delete(row.id)
        return next
      })
    }
  }

  const setFilter = (key: keyof ReadinessSearch, value: string) => onSearchChange({ [key]: value || undefined })
  const scenarioLabel = scenarioId === 'A-12-base' ? 'Golden A-12' : scenarioId

  return (
    <main className="ds-page">
      <section className="ds-content ds-stack" aria-label="Readiness review queue">
        <header className="ds-section-header">
          <div className="ds-stack">
            <span className="ds-label">Operations · Synthetic · {scenarioLabel}</span>
            <h1 className="ds-heading ds-heading--page">Readiness review queue</h1>
            <p className="ds-copy">Inspect each readiness item before changing its server status. Review actions affect one item at a time.</p>
          </div>
        </header>

        <SummaryStrip summary={data.summary} totalCount={data.totalCount} filteredCount={filteredRows.length} scenarioLabel={scenarioLabel} />

        <section className="ds-panel ds-stack" aria-label="Readiness filters" style={{ padding: 'var(--ds-space-3)' }}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-52 flex-1 gap-1.5">
              <Label htmlFor="readiness-search">Search item, job, or source</Label>
              <div className="relative">
                <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 text-muted" size={15} />
                <Input id="readiness-search" value={search.q ?? ''} onChange={(event) => setFilter('q', event.target.value)} placeholder="Search readiness…" className="pl-8 max-[700px]:min-h-11" />
              </div>
            </div>
            <FilterSelect label="Risk" value={search.risk ?? ''} onChange={(value) => setFilter('risk', value)} options={[['', 'All risk'], ['critical', 'Critical'], ['due', 'Due soon'], ['on_track', 'On track']]} />
            <FilterSelect label="Job" value={search.job ?? ''} onChange={(value) => setFilter('job', value)} options={[['', 'All jobs'], ...[...new Set(rows.map((row) => row.job_id))].map((job) => [job, humanizeJob(job)])]} />
            <FilterSelect label="Stage" value={search.stage ?? ''} onChange={(value) => setFilter('stage', value)} options={[['', 'All stages'], ...[...new Set(rows.map((row) => row.stage))].map((stage) => [stage, humanizeStage(stage)])]} />
            <FilterSelect label="Confidence" value={search.confidence ?? ''} onChange={(value) => setFilter('confidence', value)} options={[['', 'All confidence'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
            <FilterSelect label="Freshness" value={search.freshness ?? ''} onChange={(value) => setFilter('freshness', value)} options={[['', 'All freshness'], ['fresh', 'Fresh'], ['stale', 'Stale']]} />
            <FilterSelect label="Group by" value={search.group ?? 'urgency'} onChange={(value) => setFilter('group', value)} options={[['urgency', 'Urgency'], ['job', 'Job'], ['stage', 'Stage']]} />
          </div>
        </section>

        <section className="ds-panel overflow-hidden" aria-label="Readiness work queue">
          {!data.items.length ? <EmptyState title="No readiness items in this scenario" description="The active scenario returned an empty review queue. Try another scenario or refresh the environment." /> : null}
          {data.items.length > 0 && !filteredRows.length ? <EmptyState title="No readiness items match" description="Clear a filter or search for another job, stage, or source." /> : null}
          {filteredRows.length ? <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] border-collapse text-left text-xs">
                <caption className="sr-only">Readiness review queue grouped by {groupLabel(search.group, 'urgency')}</caption>
                <thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted">
                  <tr><th className="px-3 py-3 font-bold">Status</th><th className="px-3 py-3 font-bold">Job / asset source</th><th className="px-3 py-3 font-bold">Stage / task</th><th className="px-3 py-3 font-bold">Required by</th><th className="px-3 py-3 font-bold">ETA</th><th className="px-3 py-3 font-bold">Effective slack</th><th className="px-3 py-3 font-bold">Freshness</th><th className="px-3 py-3 font-bold">Confidence</th><th className="px-3 py-3 font-bold">Review</th></tr>
                </thead>
                <tbody>
                  {groupedRows.map(([group, groupItems]) => (
                    <ReadinessGroup key={group} title={groupLabel(search.group, group)} rows={groupItems} selectedId={search.item} pendingItemIds={pendingItemIds} actionErrors={actionErrors} onSelect={(itemId) => setFilter('item', itemId)} onOpenJob={onOpenJob} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 p-2 md:hidden">
              {groupedRows.map(([group, groupItems]) => <ReadinessMobileGroup key={group} title={groupLabel(search.group, group)} rows={groupItems} selectedId={search.item} pendingItemIds={pendingItemIds} actionErrors={actionErrors} onSelect={(itemId) => setFilter('item', itemId)} onOpenJob={onOpenJob} />)}
            </div>
          </> : null}
        </section>
      </section>

      <ItemDetailSheet
        row={selected}
        scenarioLabel={scenarioLabel}
        pending={selected ? pendingItemIds.has(selected.id) : false}
        actionError={selected ? actionErrors[selected.id] : undefined}
        onStatusChange={changeStatus}
        onOpenChange={(open) => { if (!open) setFilter('item', '') }}
        onOpenJob={onOpenJob}
        onOpenSourceEvent={onOpenSourceEvent}
        onOpenPlan={onOpenPlan}
        onSourceHandoff={(sourceReference) => onSearchChange({ q: sourceReference, item: undefined })}
      />
    </main>
  )

  function clearActionError(itemId: string) {
    setActionErrors((current) => {
      if (!current[itemId]) return current
      const next = { ...current }
      delete next[itemId]
      return next
    })
  }
}

function SummaryStrip({ summary, totalCount, filteredCount, scenarioLabel }: { summary: ReadinessListData['summary']; totalCount: number; filteredCount: number; scenarioLabel: string }) {
  return <section className="grid gap-2" aria-label="Readiness summary">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="m-0 text-xs font-bold uppercase tracking-wider text-muted">Scenario-wide summary · {scenarioLabel}</h2>
      <p className="m-0 text-xs text-muted">{filteredCount} visible · {totalCount} server-filtered {totalCount === 1 ? 'item' : 'items'}</p>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Metric label="Scenario items" value={summary.total} icon={<Check aria-hidden="true" />} tone="neutral" />
      <Metric label="At risk" value={summary.at_risk} icon={<WarningCircle aria-hidden="true" />} tone="danger" />
      <Metric label="Blocked" value={summary.blocked} icon={<WarningCircle aria-hidden="true" />} tone="danger" />
      <Metric label="Stale" value={summary.stale} icon={<Clock aria-hidden="true" />} tone="warning" />
      <Metric label="Low confidence" value={summary.low_confidence} icon={<ArrowUpRight aria-hidden="true" />} tone="info" />
    </div>
  </section>
}

const metricToneClasses = {
  neutral: 'bg-surface-subtle text-muted',
  danger: 'bg-danger-subtle text-danger',
  warning: 'bg-warning-subtle text-warning',
  info: 'bg-info-subtle text-info',
} as const

function Metric({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: keyof typeof metricToneClasses }) {
  return <div className="ds-panel flex items-center gap-3" style={{ padding: 'var(--ds-space-3)' }}><span className={`grid size-8 place-items-center rounded-xs ${metricToneClasses[tone]}`}>{icon}</span><span><span className="block text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="block font-mono text-lg text-ink">{value}</strong></span></div>
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="grid min-w-28 gap-1.5 text-xs font-bold text-muted"><span>{label}</span><select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function ReadinessGroup({ title, rows, selectedId, pendingItemIds, actionErrors, onSelect, onOpenJob }: { title: string; rows: ReadinessRow[]; selectedId?: string; pendingItemIds: ReadonlySet<string>; actionErrors: ActionErrors; onSelect: (itemId: string) => void; onOpenJob: (jobId: string) => void }) {
  return <>
    <tr className="border-y border-border bg-surface-subtle"><th colSpan={9} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted">{title} <span className="font-mono">{rows.length}</span><span className="ml-2 font-normal normal-case tracking-normal">visible items</span></th></tr>
    {rows.map((row) => <ReadinessTableRow key={row.id} row={row} selected={selectedId === row.id} pending={pendingItemIds.has(row.id)} error={actionErrors[row.id]} onSelect={onSelect} onOpenJob={onOpenJob} />)}
  </>
}

function ReadinessTableRow({ row, selected, pending, error, onSelect, onOpenJob }: { row: ReadinessRow; selected: boolean; pending: boolean; error?: string; onSelect: (itemId: string) => void; onOpenJob: (jobId: string) => void }) {
  return <tr className={`border-b border-border align-top transition-colors hover:bg-surface-subtle ${selected ? 'bg-primary-subtle/40' : ''}`}>
    <td className="px-3 py-3"><StatusBadge row={row} /></td>
    <td className="px-3 py-3"><button type="button" className="grid gap-0.5 text-left font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onSelect(row.id)}><span>{humanizeJob(row.job_id)}</span><span className="text-[10px] text-muted">{sourceLabel(row)}</span></button><button type="button" className="mt-1 text-[10px] font-bold text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenJob(row.job_id)}>Open job timeline →</button></td>
    <td className="px-3 py-3 text-ink"><span className="font-semibold">{humanizeStage(row.stage)}</span><span className="mt-1 block text-[10px] text-muted">Task step {row.step_order}</span></td>
    <td className="px-3 py-3 font-mono text-ink">D+{row.required_by}</td>
    <td className="px-3 py-3 font-mono text-ink"><span>{formatEffectiveEta(row)}</span><span className="mt-1 block text-[10px] text-muted">range {formatEta(row)}</span></td>
    <td className="px-3 py-3"><span className={`font-mono font-bold ${(row.effective_slack ?? 0) <= 0 ? 'text-danger' : 'text-ink'}`}>{row.effective_slack ?? '—'}d</span><span className="mt-1 block text-[10px] text-muted">raw {row.slack ?? '—'}d</span></td>
    <td className="px-3 py-3"><Freshness value={row.freshness_hours} stale={row.stale} /></td>
    <td className="px-3 py-3"><Badge variant={row.confidence === 'high' ? 'success' : row.confidence === 'low' ? 'destructive' : 'warning'}>{humanizeStatus(row.confidence)}</Badge></td>
    <td className="px-3 py-3"><ReviewAction row={row} pending={pending} error={error} onSelect={onSelect} /></td>
  </tr>
}

function ReadinessMobileGroup({ title, rows, selectedId, pendingItemIds, actionErrors, onSelect, onOpenJob }: { title: string; rows: ReadinessRow[]; selectedId?: string; pendingItemIds: ReadonlySet<string>; actionErrors: ActionErrors; onSelect: (itemId: string) => void; onOpenJob: (jobId: string) => void }) {
  return <section className="grid gap-2" aria-label={`${title} readiness items`}><div className="flex items-center justify-between border-b border-border px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-muted"><span>{title}</span><span className="font-mono">{rows.length}</span></div>{rows.map((row) => <article key={row.id} className={`grid gap-3 rounded-sm border p-3 ${selectedId === row.id ? 'border-primary bg-primary-subtle/30' : 'border-border bg-surface'}`}><div className="flex items-start justify-between gap-3"><div className="grid gap-1"><strong className="text-sm text-ink">{humanizeJob(row.job_id)}</strong><span className="text-xs font-semibold text-ink">{humanizeStage(row.stage)}</span><span className="text-[10px] text-muted">{sourceLabel(row)} · step {row.step_order}</span></div><StatusBadge row={row} /></div><dl className="grid grid-cols-2 gap-2 text-xs"><Info label="Required by" value={`D+${row.required_by}`} /><Info label="ETA" value={formatEffectiveEta(row)} /><Info label="Effective slack" value={`${row.effective_slack ?? '—'}d`} /><Info label="Freshness" value={formatFreshness(row.freshness_hours)} /></dl><div className="flex flex-wrap justify-between gap-2"><Button type="button" size="sm" variant="quiet" onClick={() => onOpenJob(row.job_id)}>Open job timeline</Button><ReviewAction row={row} pending={pendingItemIds.has(row.id)} error={actionErrors[row.id]} onSelect={onSelect} /></div></article>)}</section>
}

function ReviewAction({ row, pending, error, onSelect }: { row: ReadinessRow; pending: boolean; error?: string; onSelect: (itemId: string) => void }) {
  return <div className="grid justify-items-start gap-1"><Button type="button" size="sm" variant="primary" loading={pending} onClick={() => onSelect(row.id)}>{pending ? 'Saving…' : 'Review'}</Button>{error ? <span className="max-w-48 text-[10px] leading-4 text-danger" role="alert">Update failed: {error}</span> : null}</div>
}

function StatusBadge({ row }: { row: ReadinessRow }) {
  const variant = row.status === 'ready' ? 'success' : row.status === 'blocked' || row.status === 'waived' || !row.feasible_for_target ? 'destructive' : 'default'
  return <div className="grid justify-items-start gap-1"><Badge variant={variant}>{humanizeStatus(row.status)}</Badge><span className="text-[10px] text-muted">{nextActionForRow(row)}</span></div>
}

function Freshness({ value, stale }: { value: number | null; stale: boolean }) {
  return <div className="grid justify-items-start gap-1"><Badge variant={stale ? 'warning' : 'success'}>{formatFreshness(value)}</Badge>{stale ? <span className="text-[10px] text-warning">Source stale</span> : null}</div>
}

function ItemDetailSheet({ row, scenarioLabel, pending, actionError, onStatusChange, onOpenChange, onOpenJob, onOpenSourceEvent, onOpenPlan, onSourceHandoff }: { row?: ReadinessRow; scenarioLabel: string; pending: boolean; actionError?: string; onStatusChange: (row: ReadinessRow) => void; onOpenChange: (open: boolean) => void; onOpenJob: (jobId: string) => void; onOpenSourceEvent: (eventId: string) => void; onOpenPlan: (planId: string) => void; onSourceHandoff: (sourceReference: string) => void }) {
  const detailQuery = useReadinessDetail(row?.id)
  const detail = detailQuery.data
  const detailItem = detail?.item && row ? { ...detail.item, status: row.status, row_version: row.row_version } : detail?.item ?? row
  const transition = detail && detailItem ? transitionFor(detailItem) : undefined
  const linkedPlanId = detail?.suggestion ? planIdFromSuggestion(detail.suggestion) : null

  return <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-lg">
      {row && detailQuery.isPending ? <p className="text-sm text-muted" role="status">Loading readiness detail…</p> : null}
      {row && detailQuery.isError ? <div className="grid gap-2" role="alert"><p className="m-0 text-sm text-danger">{detailQuery.error instanceof Error ? detailQuery.error.message : 'Readiness detail could not be loaded.'}</p><Button type="button" size="sm" variant="secondary" onClick={() => void detailQuery.refetch()}>Retry detail</Button></div> : null}
      {row && detailItem ? <>
        <SheetHeader className="border-b border-border pb-4 pr-8"><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Review · {scenarioLabel}</span><SheetTitle>{humanizeJob(detailItem.job_id)} · {humanizeStage(detailItem.stage)}</SheetTitle><SheetDescription>Inspect the source and freshness before applying a single-item readiness status change.</SheetDescription></SheetHeader>

        <section className="grid gap-2" aria-label="Readiness status action"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Current status</span><div className="mt-1"><StatusBadge row={detailItem} /></div></div><div className="text-right"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Row version</span><strong className="mt-1 block font-mono text-sm text-ink">v{detailItem.row_version}</strong></div></div>{detailQuery.isPending ? <p className="m-0 rounded-sm border border-border bg-surface-subtle p-3 text-xs text-muted">Loading the current server row before showing its action.</p> : detailQuery.isError ? <p className="m-0 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink">Retry the detail request before changing this item.</p> : transition ? <Button type="button" variant={transition.nextStatus === 'ready' ? 'primary' : 'secondary'} loading={pending} onClick={() => onStatusChange(detailItem)}>{pending ? 'Saving…' : transition.label}</Button> : <p className="m-0 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink">{unavailableActionReason(detailItem)}</p>}{actionError ? <p className="m-0 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-danger" role="alert">{actionError} The previous status was restored; refresh the detail before retrying.</p> : null}</section>

        <div className="grid grid-cols-2 gap-2 text-xs"><Info label="Required by" value={`D+${detailItem.required_by}`} /><Info label="Effective ETA" value={formatEffectiveEta(detailItem)} /><Info label="ETA range" value={formatEta(detailItem)} /><Info label="Effective slack" value={`${detailItem.effective_slack ?? '—'} days`} /><Info label="Freshness" value={formatFreshness(detailItem.freshness_hours)} /><Info label="Confidence" value={humanizeStatus(detailItem.confidence)} /></div>

        <section className="grid gap-2 border-t border-border pt-4" aria-label="Readiness source chain"><h3 className="m-0 text-sm font-bold text-ink">Source and freshness</h3>{detail ? <dl className="grid gap-2 text-xs"><Info label="Source type" value={humanizeStatus(detail.source.sourceType)} /><Info label="Source reference" value={detail.source.sourceReference ?? 'Not supplied'} /><Info label="Source updated" value={formatAuditTimestamp(detail.source.lastUpdated)} /><Info label="Source freshness" value={formatFreshness(detail.source.freshnessHours)} /></dl> : <p className="m-0 text-xs text-muted">Source detail is unavailable until the server detail request completes.</p>}<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => onOpenJob(detailItem.job_id)}>Open job timeline</Button>{detail?.source.sourceReference ? <Button type="button" variant="quiet" onClick={() => onSourceHandoff(detail.source.sourceReference!)}>Find items from this source</Button> : null}</div></section>

        <section className="grid gap-2 border-t border-border pt-4" aria-label="Readiness identifiers and handoffs"><h3 className="m-0 text-sm font-bold text-ink">Connected context</h3><div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-subtle p-2"><div className="grid gap-1"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Readiness item ID</span><code className="break-all text-[11px] text-ink">{detailItem.id}</code></div><Button type="button" size="icon" variant="quiet" aria-label={`Copy readiness item ID ${detailItem.id}`} onClick={() => void copyItemId(detailItem.id)}><Copy aria-hidden="true" size={15} /></Button></div>{detail?.suggestion?.eventId ? <Button type="button" variant="quiet" className="justify-start px-0 text-primary" onClick={() => onOpenSourceEvent(detail.suggestion!.eventId)}><ArrowSquareOut aria-hidden="true" size={15} />Open source change</Button> : null}{linkedPlanId ? <Button type="button" variant="quiet" className="justify-start px-0 text-primary" onClick={() => onOpenPlan(linkedPlanId)}><ArrowSquareOut aria-hidden="true" size={15} />Open linked plan</Button> : null}{!detail?.suggestion?.eventId && !linkedPlanId ? <p className="m-0 text-xs text-muted">No source change or plan is linked to this readiness item.</p> : null}</section>

        {detail ? <section className="grid gap-2 border-t border-border pt-4" aria-label="Readiness detail history"><h3 className="m-0 text-sm font-bold text-ink">Review history</h3>{detail.history.length ? <ol className="grid gap-2">{detail.history.map((entry) => <li key={entry.id || `${entry.eventId}-${entry.createdAt}`} className="rounded-sm border border-border bg-surface-subtle p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong className="text-ink">{humanizeStatus(entry.state)}</strong><span className="text-muted">{formatAuditTimestamp(entry.createdAt)}</span></div><p className="mt-1 text-muted">{entry.sourceExcerpt ?? 'No source excerpt supplied.'}</p><p className="m-0 font-mono text-[10px] text-muted">event {entry.eventId || 'not linked'} · base row v{entry.baseRowVersion}</p>{entry.reviewNote ? <p className="mt-1 text-muted">Review: {entry.reviewNote}</p> : null}</li>)}</ol> : <p className="m-0 text-xs text-muted">No prior suggestion or review events are recorded for this item.</p>}</section> : null}

        <SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>Close</Button></SheetFooter>
      </> : null}
    </SheetContent>
  </Sheet>
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-44 place-items-center p-8 text-center"><div className="grid max-w-md gap-2"><h2 className="m-0 text-base font-bold text-ink">{title}</h2><p className="m-0 text-sm leading-6 text-muted">{description}</p></div></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="break-words text-ink">{value}</strong></div>
}

function nextStatusFor(row: ReadinessRow): ReadinessStatus | null {
  if (row.status === 'ready') return 'pending'
  if (row.status === 'pending' && row.feasible_for_target) return 'ready'
  return null
}

function transitionFor(row: ReadinessRow): { nextStatus: ReadinessStatus; label: string } | null {
  const nextStatus = nextStatusFor(row)
  if (!nextStatus) return null
  return { nextStatus, label: nextStatus === 'ready' ? 'Mark ready' : 'Reopen' }
}

function unavailableActionReason(row: ReadinessRow): string {
  if (row.status === 'blocked') return 'This item is blocked. Resolve the blocker before marking it ready.'
  if (row.status === 'waived') return 'This item is waived and cannot be marked ready from the review queue.'
  if (!row.feasible_for_target) return 'This item is not feasible for the current target. Resolve its timing or source issue first.'
  return 'This item has no available status action.'
}

function nextActionForRow(row: ReadinessRow): string {
  if (row.status === 'ready') return 'Reopen if changed'
  if (row.status === 'blocked' || !row.feasible_for_target) return row.vendor_expedite_required ? 'Resolve / expedite' : 'Resolve blocker'
  if (row.stale) return 'Refresh source'
  if (row.confidence === 'low') return 'Confirm source'
  if ((row.effective_slack ?? Number.POSITIVE_INFINITY) <= 0) return 'Review timing'
  return 'Review item'
}

function groupLabel(groupBy: string | undefined, value: string): string {
  if (groupBy === 'job') return humanizeJob(value)
  if (groupBy === 'stage') return humanizeStage(value)
  if (value === 'critical') return 'Critical'
  if (value === 'due') return 'Due soon'
  return 'On track'
}

function humanizeJob(value: string): string {
  return `Job · ${humanizeIdentifier(value)}`
}

function humanizeStage(value: string): string {
  return humanizeIdentifier(value)
}

function humanizeStatus(value: string): string {
  return humanizeIdentifier(value)
}

function humanizeIdentifier(value: string): string {
  const normalized = value.replace(/[_-]+/g, ' ').trim()
  if (!normalized) return 'Unknown'
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function sourceLabel(row: ReadinessRow): string {
  return row.source_reference ? `Source · ${row.source_reference}` : `Source · ${humanizeStatus(row.source_type)}`
}

function formatEta(row: ReadinessRow): string {
  if (row.eta_earliest === null && row.eta_latest === null) return 'Unknown'
  if (row.eta_earliest === row.eta_latest || row.eta_latest === null) return `D+${row.eta_earliest ?? '—'}`
  if (row.eta_earliest === null) return `D+${row.eta_latest}`
  return `D+${row.eta_earliest}–D+${row.eta_latest}`
}

function formatEffectiveEta(row: ReadinessRow): string {
  return row.effective_eta === null ? formatEta(row) : `D+${row.effective_eta}`
}

function formatFreshness(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return 'Unknown'
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return minutes <= 0 ? 'Just now' : `${minutes} min ago`
  }
  if (hours < 24) return `${Math.round(hours)} h ago`
  return `${Math.round(hours / 24)} d ago`
}

function formatAuditTimestamp(value: string | null): string {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date)
}

function planIdFromSuggestion(detail: ReadinessDetailData['suggestion']): string | null {
  const value = detail?.proposedPatch.plan_id ?? detail?.proposedPatch.planId
  return typeof value === 'string' && value.trim() ? value : null
}

async function copyItemId(itemId: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
    await navigator.clipboard.writeText(itemId)
    toast.success('Readiness item ID copied')
  } catch (error) {
    toast.error('Could not copy readiness item ID', { description: error instanceof Error ? error.message : 'Clipboard access is unavailable.' })
  }
}
