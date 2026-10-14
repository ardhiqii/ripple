import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUpRight, Check, Clock, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'

import { Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, toast } from '@/components/ui'
import { readinessDetailFixture } from '@/mocks/fixtures'
import type { ReadinessSearch } from '@/routes/search-schemas'
import {
  filterReadinessRows,
  initialReadinessRows,
  mockUpdateReadinessStatus,
  riskForRow,
  type ReadinessRow,
  type ReadinessStatus,
  type ReadinessUpdate,
} from '@/features/readiness/readiness-data'

interface ReadinessBoardProps {
  search: ReadinessSearch
  onSearchChange: (patch: Partial<ReadinessSearch>) => void
  onOpenJob: (jobId: string) => void
  updateStatus?: ReadinessUpdate
}

const selectClass = 'h-9 rounded-sm border border-border bg-surface px-2.5 text-xs text-ink outline-none transition-colors hover:border-border-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus max-[700px]:min-h-11'

export function ReadinessBoard({ search, onSearchChange, onOpenJob, updateStatus = mockUpdateReadinessStatus }: ReadinessBoardProps) {
  const [rows, setRows] = useState(initialReadinessRows)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
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

  const changeStatus = async (row: ReadinessRow) => {
    const nextStatus: ReadinessStatus = row.status === 'ready' ? 'pending' : 'ready'
    const previousRows = rows
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: nextStatus } : item))
    setPendingItemId(row.id)
    try {
      await updateStatus(row.id, nextStatus)
    } catch {
      setRows(previousRows)
      toast.error('Readiness update rolled back', { description: 'The server rejected this change. The current value was restored.' })
    } finally {
      setPendingItemId(null)
    }
  }

  const setFilter = (key: keyof ReadinessSearch, value: string) => onSearchChange({ [key]: value || undefined })

  return (
    <main className="ds-page">
      <section className="ds-content ds-stack" aria-label="Readiness board">
        <header className="ds-section-header">
          <div className="ds-stack">
            <span className="ds-label">Operations</span>
            <h1 className="ds-heading ds-heading--page">Readiness board</h1>
            <p className="ds-copy">Resolve blockers before work enters the committed plan.</p>
          </div>
        </header>

        <SummaryStrip rows={rows} />

        <section className="ds-panel ds-stack" aria-label="Readiness filters" style={{ padding: 'var(--ds-space-3)' }}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-52 flex-1 gap-1.5">
              <Label htmlFor="readiness-search">Search item, job, or source</Label>
              <div className="relative">
                <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 text-muted" size={15} />
                <Input id="readiness-search" value={search.q ?? ''} onChange={(event) => setFilter('q', event.target.value)} placeholder="Search readiness..." className="pl-8 max-[700px]:min-h-11" />
              </div>
            </div>
            <FilterSelect label="Risk" value={search.risk ?? ''} onChange={(value) => setFilter('risk', value)} options={[['', 'All risk'], ['critical', 'Critical'], ['due', 'Due soon'], ['on_track', 'On track']]} />
            <FilterSelect label="Job" value={search.job ?? ''} onChange={(value) => setFilter('job', value)} options={[['', 'All jobs'], ...[...new Set(rows.map((row) => row.job_id))].map((job) => [job, job])]} />
            <FilterSelect label="Stage" value={search.stage ?? ''} onChange={(value) => setFilter('stage', value)} options={[['', 'All stages'], ...[...new Set(rows.map((row) => row.stage))].map((stage) => [stage, stage])]} />
            <FilterSelect label="Confidence" value={search.confidence ?? ''} onChange={(value) => setFilter('confidence', value)} options={[['', 'All confidence'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
            <FilterSelect label="Freshness" value={search.freshness ?? ''} onChange={(value) => setFilter('freshness', value)} options={[['', 'All freshness'], ['fresh', 'Fresh'], ['stale', 'Stale']]} />
            <FilterSelect label="Group by" value={search.group ?? 'urgency'} onChange={(value) => setFilter('group', value)} options={[['urgency', 'Urgency'], ['job', 'Job'], ['stage', 'Stage']]} />
          </div>
        </section>

        <section className="ds-panel overflow-hidden" aria-label="Readiness work queue">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-xs">
              <caption className="sr-only">Readiness work queue grouped by {search.group ?? 'urgency'}</caption>
              <thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted">
                <tr><th className="px-3 py-3 font-bold">Status</th><th className="px-3 py-3 font-bold">Item / job</th><th className="px-3 py-3 font-bold">Stage</th><th className="px-3 py-3 font-bold">Slack</th><th className="px-3 py-3 font-bold">Freshness</th><th className="px-3 py-3 font-bold">Confidence</th><th className="px-3 py-3 font-bold">Next action</th></tr>
              </thead>
              <tbody>
                {groupedRows.map(([group, groupItems]) => (
                  <ReadinessGroup key={group} title={group} rows={groupItems} selectedId={search.item} pendingItemId={pendingItemId} onStatusChange={changeStatus} onSelect={(itemId) => setFilter('item', itemId)} onOpenJob={onOpenJob} />
                ))}
              </tbody>
            </table>
          </div>
          {!filteredRows.length ? <div className="p-8 text-center text-sm text-muted">No readiness items match these filters.</div> : null}
        </section>
      </section>

      <ItemDetailSheet row={selected} onOpenChange={(open) => { if (!open) setFilter('item', '') }} onOpenJob={onOpenJob} />
    </main>
  )
}

function SummaryStrip({ rows }: { rows: ReadinessRow[] }) {
  const stale = rows.filter((row) => row.stale).length
  const lowConfidence = rows.filter((row) => row.confidence === 'low').length
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Readiness summary">
    <Metric label="Items" value={rows.length} icon={<Check aria-hidden="true" />} tone="neutral" />
    <Metric label="At risk" value={rows.filter((row) => riskForRow(row) !== 'on_track').length} icon={<WarningCircle aria-hidden="true" />} tone="danger" />
    <Metric label="Stale" value={stale} icon={<Clock aria-hidden="true" />} tone="warning" />
    <Metric label="Low confidence" value={lowConfidence} icon={<ArrowUpRight aria-hidden="true" />} tone="info" />
  </div>
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

function ReadinessGroup({ title, rows, selectedId, pendingItemId, onStatusChange, onSelect, onOpenJob }: { title: string; rows: ReadinessRow[]; selectedId?: string; pendingItemId: string | null; onStatusChange: (row: ReadinessRow) => void; onSelect: (itemId: string) => void; onOpenJob: (jobId: string) => void }) {
  return <>
    <tr className="border-y border-border bg-surface-subtle"><th colSpan={7} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted">{title} <span className="font-mono">{rows.length}</span></th></tr>
    {rows.map((row) => <tr key={row.id} className={`border-b border-border align-top transition-colors hover:bg-surface-subtle ${selectedId === row.id ? 'bg-primary-subtle/40' : ''}`}>
      <td className="px-3 py-3"><label className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={`Mark ${row.id} ready`}><input type="checkbox" aria-label={`Mark ${row.id} ready`} checked={row.status === 'ready'} disabled={pendingItemId === row.id || row.status === 'waived'} onChange={() => onStatusChange(row)} className="size-4 accent-primary" /></label></td>
      <td className="px-3 py-3"><button type="button" className="grid gap-0.5 text-left font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onSelect(row.id)}>{row.id}<span className="font-mono text-[10px] text-muted">{row.job_id}</span></button><button type="button" className="mt-1 text-[10px] font-bold text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenJob(row.job_id)}>Open job →</button></td>
      <td className="px-3 py-3 text-ink">{row.stage}<span className="mt-1 block text-[10px] text-muted">Step {row.step_order}</span></td>
      <td className="px-3 py-3"><span className={`font-mono font-bold ${(row.effective_slack ?? 0) <= 0 ? 'text-danger' : 'text-ink'}`}>{row.effective_slack ?? '—'}d</span><span className="mt-1 block text-[10px] text-muted">required D+{row.required_by}</span></td>
      <td className="px-3 py-3"><Badge variant={row.stale ? 'warning' : 'success'}>{row.stale ? 'Stale' : `${row.freshness_hours ?? '—'}h old`}</Badge></td>
      <td className="px-3 py-3"><Badge variant={row.confidence === 'high' ? 'success' : row.confidence === 'low' ? 'destructive' : 'warning'}>{row.confidence}</Badge></td>
      <td className="px-3 py-3">{row.status === 'ready' ? <Badge variant="success">Ready</Badge> : row.status === 'blocked' ? <Badge variant="destructive">Blocked</Badge> : <Badge variant="default">Review</Badge>}{row.id === readinessDetailFixture.item.id ? <span className="mt-1 block text-[10px] font-bold text-primary">Proposed update</span> : null}</td>
    </tr>)}
  </>
}

function ItemDetailSheet({ row, onOpenChange, onOpenJob }: { row?: ReadinessRow; onOpenChange: (open: boolean) => void; onOpenJob: (jobId: string) => void }) {
  const detail = row ? readinessDetailFixture : null
  return <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-lg">
      {row && detail ? <>
        <SheetHeader className="border-b border-border pb-4 pr-8"><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Readiness detail</span><SheetTitle>{row.id}</SheetTitle><SheetDescription>{row.job_id} · {row.stage} · source freshness and confidence remain separate signals.</SheetDescription></SheetHeader>
        <div className="grid grid-cols-2 gap-2 text-xs"><Info label="Current status" value={row.status} /><Info label="Slack" value={`${row.effective_slack ?? '—'} days`} /><Info label="Freshness" value={row.stale ? 'Stale' : `${row.freshness_hours ?? '—'} hours`} /><Info label="Confidence" value={row.confidence} /></div>
        <section className="grid gap-2"><h3 className="m-0 text-sm font-bold text-ink">Proposed update</h3><div className="rounded-sm border-2 border-dashed border-primary bg-primary-subtle p-3 text-xs"><strong className="block text-primary">Not committed</strong><span className="mt-1 block text-ink">Planned day D+{detail.suggestion?.proposed_patch?.planned_day ?? '—'} · ETA latest D+{detail.suggestion?.proposed_patch?.eta_latest ?? '—'}</span><span className="mt-2 block text-muted">{detail.suggestion?.source_excerpt}</span></div></section>
        <section className="grid gap-2 border-t border-border pt-4"><h3 className="m-0 text-sm font-bold text-ink">Source</h3><p className="m-0 text-xs text-muted">{detail.source.source_type} · {detail.source.source_reference}</p><Button type="button" variant="secondary" onClick={() => onOpenJob(row.job_id)}>Open job timeline</Button></section>
        <SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>Close</Button></SheetFooter>
      </> : null}
    </SheetContent>
  </Sheet>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="text-ink">{value}</strong></div> }
