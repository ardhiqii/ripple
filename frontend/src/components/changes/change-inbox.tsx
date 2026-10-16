import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, Funnel, Plus, Play, WarningCircle } from '@phosphor-icons/react'
import { useBlocker } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

import { ApiError, apiTransport } from '@/api/transport'
import { Badge, Button, Input, Label, toast } from '@/components/ui'
import { eventLifecycleMeta, eventStateMeta, type EventInboxItem } from '@/features/events/events-data'
import { startEventRun, useEventList } from '@/features/events/events-api'
import type { ChangesSearch } from '@/routes/search-schemas'
import { NewChangeSheet } from './new-change-sheet'

interface ChangeInboxProps {
  search: ChangesSearch
  onSearchChange: (patch: Partial<ChangesSearch>) => void
  onOpenEvent?: (eventId: string) => void
  onOpenPlan: (planId: string) => void
}

const selectClass = 'h-9 rounded-sm border border-border bg-surface px-2.5 text-xs text-ink outline-none transition-colors motion-reduce:transition-none hover:border-border-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus'

export function ChangeInbox({ search, onSearchChange, onOpenEvent, onOpenPlan }: ChangeInboxProps) {
  const queryClient = useQueryClient()
  const listQuery = useEventList({ nature: search.nature, state: search.state, job: search.job, q: search.q })
  const listItems = useMemo(() => listQuery.data?.pages.flatMap((page) => page.items) ?? [], [listQuery.data])
  const [composerOpen, setComposerOpen] = useState(false)
  const [sampleText, setSampleText] = useState<string>()
  const [draftDirty, setDraftDirty] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [queryDraft, setQueryDraft] = useState(search.q ?? '')
  const eventButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const hasActiveFilters = Boolean(search.q || search.nature || search.state || search.job)
  const serverCounts = listQuery.data?.pages[0]?.scenarioLifecycleCounts ?? {}
  const totalCount = listQuery.data?.pages[0]?.totalCount ?? 0

  useBlocker({
    shouldBlockFn: () => draftDirty && !window.confirm('A pasted change is not submitted. Leave and discard it?'),
    enableBeforeUnload: () => draftDirty,
  })

  useEffect(() => setQueryDraft(search.q ?? ''), [search.q])
  useEffect(() => {
    if (queryDraft === (search.q ?? '')) return
    const timeout = window.setTimeout(() => onSearchChange({ q: queryDraft.trim() || undefined }), 220)
    return () => window.clearTimeout(timeout)
  }, [onSearchChange, queryDraft, search.q])

  const invalidateEvents = async (eventId?: string) => {
    await queryClient.invalidateQueries({ queryKey: apiTransport.queryKey('events') })
    if (eventId) await queryClient.invalidateQueries({ queryKey: apiTransport.queryKey('events', 'detail', eventId) })
  }

  const openComposer = (text?: string) => {
    setSampleText(text)
    setComposerOpen(true)
  }

  const setFilter = (key: keyof ChangesSearch, value: string) => onSearchChange({ [key]: value || undefined })

  const primaryAction = (item: EventInboxItem) => {
    if (['options_ready', 'pending_decision', 'approved', 'rejected', 'superseded', 'stale'].includes(item.lifecycle) && item.planId) {
      onOpenPlan(item.planId)
      return
    }
    onOpenEvent?.(item.id)
  }

  const refresh = async () => {
    setActionError(undefined)
    try {
      await listQuery.refetch()
      toast.success('Inbox refreshed from server')
    } catch (error) {
      setActionError(`Inbox refresh failed. ${actionErrorMessage(error, 'Check the connection and retry.')}`)
    }
  }

  return <main className="ds-page">
    <section className="ds-content ds-stack" aria-label="Change inbox">
      <header className="ds-section-header">
        <div className="ds-stack"><span className="ds-label">Operations</span><h1 className="ds-heading ds-heading--page">Change inbox</h1><p className="ds-copy">Turn raw operational updates into reviewed, traceable investigations.</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { void refresh() }} disabled={listQuery.isFetching}><ArrowClockwise aria-hidden="true" size={16} />{listQuery.isFetching ? 'Refreshing…' : 'Refresh'}</Button><Button type="button" variant="secondary" onClick={() => openComposer('Vendor confirms A-12 test bay result by D+2; keep the barge window protected.')}><Play aria-hidden="true" size={16} />Run sample</Button><Button type="button" variant="primary" onClick={() => openComposer()}><Plus aria-hidden="true" size={16} />New change</Button></div>
      </header>

      <InboxSummary totalCount={totalCount} counts={serverCounts} />
      <section className="ds-panel ds-stack" aria-label="Change filters" style={{ padding: 'var(--ds-space-3)' }}>
        <div className="flex items-center gap-2 text-xs font-bold text-muted"><Funnel aria-hidden="true" size={15} />Filter inbox <span className="font-normal">Filters and count are server-scoped.</span></div>
        <div className="flex flex-wrap items-end gap-2"><div className="grid min-w-52 flex-1 gap-1.5"><Label htmlFor="change-search">Search events</Label><Input id="change-search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Search cause, job, or source..." /></div><FilterSelect label="Nature" value={search.nature ?? ''} onChange={(value) => setFilter('nature', value)} options={[['', 'All nature'], ['request', 'Request'], ['disruption', 'Disruption'], ['opportunity', 'Opportunity']]} /><FilterSelect label="Event state" value={search.state ?? ''} onChange={(value) => setFilter('state', value)} options={[['', 'All event states'], ...Object.entries(eventStateMeta).map(([key, value]) => [key, value.label])]} /><div className="grid min-w-40 gap-1.5"><Label htmlFor="change-job">Job ID</Label><Input id="change-job" value={search.job ?? ''} onChange={(event) => setFilter('job', event.target.value)} placeholder="A-12" /></div></div>
      </section>

      {actionError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink" role="alert"><span>{actionError}</span><Button type="button" size="sm" variant="secondary" onClick={() => { void refresh() }}>Retry</Button></div> : null}
      {listQuery.isPending ? <div role="status" className="ds-panel p-8 text-center text-sm text-muted">Loading change events from the active scenario…</div> : null}
      {listQuery.isError ? <div className="ds-panel grid gap-3 p-8 text-center" role="alert"><strong className="text-sm text-ink">Change inbox could not be loaded.</strong><span className="text-xs text-muted">{actionErrorMessage(listQuery.error, 'Check the connection and retry.')}</span><Button type="button" variant="secondary" onClick={() => { void listQuery.refetch() }}>Retry</Button></div> : null}
      {hasActiveFilters ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface-subtle p-3 text-xs text-muted"><span>{totalCount} matching server event{totalCount === 1 ? '' : 's'}.</span><Button type="button" size="sm" variant="secondary" onClick={() => onSearchChange({ q: undefined, nature: undefined, state: undefined, job: undefined })}>Clear filters</Button></div> : null}
      <section className="ds-panel overflow-hidden" aria-label="Event list"><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left text-xs"><caption className="sr-only">Change inbox event list</caption><thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-3 font-bold">Event</th><th className="px-3 py-3 font-bold">Nature / cause</th><th className="px-3 py-3 font-bold">Jobs</th><th className="px-3 py-3 font-bold">State</th><th className="px-3 py-3 font-bold">Next action</th></tr></thead><tbody>{listItems.map((item) => <EventRow key={item.id} item={item} buttonRef={(node) => { if (node) eventButtonRefs.current.set(item.id, node); else eventButtonRefs.current.delete(item.id) }} onSelect={() => onOpenEvent?.(item.id)} onPrimaryAction={() => primaryAction(item)} />)}</tbody></table></div>{!listQuery.isPending && !listQuery.isError && listItems.length === 0 ? <div className="grid place-items-center gap-2 p-10 text-center"><WarningCircle aria-hidden="true" size={24} className="text-muted" /><p className="m-0 text-sm text-muted">{hasActiveFilters ? 'No server events match these filters.' : 'No change events have been recorded in this scenario.'}</p></div> : null}{listQuery.hasNextPage ? <div className="flex justify-center border-t border-border p-3"><Button type="button" variant="secondary" onClick={() => { void listQuery.fetchNextPage() }} disabled={listQuery.isFetchingNextPage}>{listQuery.isFetchingNextPage ? 'Loading more…' : 'Load more events'}</Button></div> : null}</section>
    </section>

    <NewChangeSheet open={composerOpen} initialText={sampleText} onOpenChange={(open) => { setComposerOpen(open); if (!open) setSampleText(undefined) }} onDirtyChange={setDraftDirty} onCreated={(item) => { void invalidateEvents(item.id); onOpenEvent?.(item.id) }} onCorrectionSaved={(item) => { void invalidateEvents(item.id) }} onEventUpdated={(item) => { void invalidateEvents(item.id) }} onStartInvestigation={async (item) => { await startEventRun(item.id); await invalidateEvents(item.id) }} />
  </main>
}

function InboxSummary({ totalCount, counts }: { totalCount: number; counts: Record<string, number> }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Inbox summary"><Metric label="Matching events" value={totalCount} scope="Server-filtered result" /><Metric label="Needs attention" value={(counts.needs_clarification ?? 0) + (counts.failed ?? 0)} scope="Entire scenario" tone="danger" /><Metric label="In progress" value={(counts.reading_input ?? 0) + (counts.investigating ?? 0)} scope="Entire scenario" tone="info" /><Metric label="Options ready" value={(counts.options_ready ?? 0) + (counts.stale ?? 0)} scope="Entire scenario" tone="success" /></div>
}

function Metric({ label, value, scope, tone = 'neutral' }: { label: string; value: number; scope: string; tone?: 'neutral' | 'danger' | 'info' | 'success' }) {
  const toneClass = { neutral: 'text-ink', danger: 'text-danger', info: 'text-info', success: 'text-success' }[tone]
  return <div className="ds-panel grid gap-1" style={{ padding: 'var(--ds-space-3)' }}><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className={`font-mono text-xl ${toneClass}`}>{value}</strong><span className="text-[10px] text-muted">{scope}</span></div>
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="grid min-w-32 gap-1.5 text-xs font-bold text-muted"><span>{label}</span><select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function EventRow({ item, buttonRef, onSelect, onPrimaryAction }: { item: EventInboxItem; buttonRef: (node: HTMLButtonElement | null) => void; onSelect: () => void; onPrimaryAction: () => void }) {
  const meta = eventLifecycleMeta[item.lifecycle]
  const opensPlan = ['options_ready', 'pending_decision', 'approved', 'rejected', 'superseded', 'stale'].includes(item.lifecycle) && Boolean(item.planId)
  return <tr className="border-b border-border transition-colors motion-reduce:transition-none hover:bg-surface-subtle"><td className="px-3 py-3"><button ref={buttonRef} type="button" className="grid gap-0.5 text-left font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={onSelect}><span className="max-w-60 truncate">{eventTitle(item)}</span><span className="font-mono text-[10px] text-muted">{item.id} · v{item.extractionVersion}</span></button></td><td className="max-w-sm px-3 py-3"><Badge variant="default">{item.nature ?? 'Unclassified'}</Badge><span className="mt-1 block truncate text-ink">{item.cause ?? 'No cause supplied'}</span><span className="mt-1 block truncate text-[10px] text-muted">{item.rawTextPreview || 'Source text is available in detail.'}</span></td><td className="px-3 py-3 text-ink">{item.jobs.length ? item.jobs.join(', ') : 'None linked'}</td><td className="px-3 py-3"><Badge variant={meta.tone === 'danger' ? 'destructive' : meta.tone === 'success' ? 'success' : meta.tone === 'warning' ? 'warning' : 'default'}>{meta.label}</Badge>{item.pendingPlan ? <span className="mt-1 block text-[10px] text-muted">Plan pending</span> : null}</td><td className="px-3 py-3"><Button type="button" variant={opensPlan ? 'primary' : 'secondary'} onClick={onPrimaryAction}>{opensPlan ? 'Review plan' : meta.primaryAction}</Button></td></tr>
}

function eventTitle(item: EventInboxItem): string {
  return item.cause?.trim() || item.extraction?.objective?.trim() || item.rawTextPreview.split(/[.!?\n]/, 1)[0]?.trim() || 'Untitled operational change'
}

function actionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`
  return error instanceof Error && error.message ? error.message : fallback
}
