import { useMemo, useRef, useState } from 'react'
import { ArrowClockwise, Funnel, Plus, Play, WarningCircle } from '@phosphor-icons/react'
import { useBlocker } from '@tanstack/react-router'

import { Badge, Button, Input, Label, toast } from '@/components/ui'
import { apiUrl } from '@/api/url'
import { eventInboxFixture, eventLifecycleMeta, filterEventInbox, getEventById, type EventInboxItem } from '@/features/events/events-data'
import type { ChangesSearch } from '@/routes/search-schemas'
import { EventPreview } from './event-preview'
import { NewChangeSheet } from './new-change-sheet'

interface ChangeInboxProps {
  search: ChangesSearch
  onSearchChange: (patch: Partial<ChangesSearch>) => void
  onOpenPlan: (planId: string) => void
}

const selectClass = 'h-9 rounded-sm border border-border bg-surface px-2.5 text-xs text-ink outline-none transition-colors motion-reduce:transition-none hover:border-border-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus'

export function ChangeInbox({ search, onSearchChange, onOpenPlan }: ChangeInboxProps) {
  const [items, setItems] = useState(eventInboxFixture)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerEvent, setComposerEvent] = useState<EventInboxItem | undefined>()
  const [sampleText, setSampleText] = useState<string | undefined>()
  const [draftDirty, setDraftDirty] = useState(false)
  const [pendingEventId, setPendingEventId] = useState<string>()
  const [actionError, setActionError] = useState<{ eventId: string; message: string }>()
  const eventButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const selected = getEventById(items, search.event)
  const filtered = useMemo(() => filterEventInbox(items, search), [items, search])
  const hasActiveFilters = Boolean(search.q || search.nature || search.state || search.job)

  useBlocker({
    shouldBlockFn: () => draftDirty && !window.confirm('A pasted change is not submitted. Leave and discard it?'),
    enableBeforeUnload: () => draftDirty,
  })

  const setFilter = (key: keyof ChangesSearch, value: string) => onSearchChange({ [key]: value || undefined })

  const openComposer = (item?: EventInboxItem, text?: string) => {
    setComposerEvent(item)
    setSampleText(text)
    setComposerOpen(true)
  }

  const updateItem = (nextItem: EventInboxItem) => setItems((current) => current.some((item) => item.id === nextItem.id) ? current.map((item) => item.id === nextItem.id ? nextItem : item) : [nextItem, ...current])

  const startInvestigation = async (item: EventInboxItem) => {
    setPendingEventId(item.id)
    setActionError(undefined)
    try {
      const response = await fetch(apiUrl(`/api/v1/events/${encodeURIComponent(item.id)}/runs`), { method: 'POST', headers: { 'Idempotency-Key': `ripple-${item.id}` } })
      if (!response.ok) throw new Error('run could not start')
      updateItem({ ...item, lifecycle: 'running', updatedAt: new Date().toISOString() })
    } catch (error) {
      setActionError({ eventId: item.id, message: error instanceof Error && error.message ? `Investigation could not start. ${error.message}.` : 'Investigation could not start. Check the connection and retry.' })
      throw error
    } finally {
      setPendingEventId((current) => current === item.id ? undefined : current)
    }
  }

  const retryExtraction = async (item: EventInboxItem) => {
    setPendingEventId(item.id)
    setActionError(undefined)
    try {
      const response = await fetch(apiUrl(`/api/v1/events/${encodeURIComponent(item.id)}/extract`), { method: 'POST' })
      if (!response.ok) throw new Error('Check the connection and retry.')
      updateItem({ ...item, lifecycle: 'extracting', updatedAt: new Date().toISOString() })
      toast.success('Extraction retry started')
    } catch (error) {
      const message = error instanceof Error && error.message ? `Extraction retry failed. ${error.message}` : 'Extraction retry failed. Check the connection and retry.'
      setActionError({ eventId: item.id, message })
      toast.error('Extraction retry failed')
    } finally {
      setPendingEventId((current) => current === item.id ? undefined : current)
    }
  }

  const primaryAction = (item: EventInboxItem) => {
    switch (item.lifecycle) {
      case 'draft':
      case 'needs_info':
      case 'rejected':
        openComposer(item)
        break
      case 'ready':
        void startInvestigation(item).catch(() => undefined)
        break
      case 'extracting':
      case 'running':
        onSearchChange({ event: item.id })
        toast.info(eventLifecycleMeta[item.lifecycle].label, { description: 'Live status remains discoverable while you navigate.' })
        break
      case 'options_ready':
      case 'pending_decision':
      case 'superseded':
        if (item.planId) onOpenPlan(item.planId)
        else onSearchChange({ event: item.id })
        break
      case 'approved':
        onSearchChange({ event: item.id })
        break
      case 'failed':
        void retryExtraction(item)
        break
    }
  }

  return <main className="ds-page">
    <section className="ds-content ds-stack" aria-label="Change inbox">
      <header className="ds-section-header">
        <div className="ds-stack"><span className="ds-label">Operations</span><h1 className="ds-heading ds-heading--page">Change inbox</h1><p className="ds-copy">Turn raw operational updates into reviewed, traceable investigations.</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { setItems([...eventInboxFixture]); setActionError(undefined); toast.success('Inbox refreshed') }}><ArrowClockwise aria-hidden="true" size={16} />Refresh</Button><Button type="button" variant="secondary" onClick={() => openComposer(undefined, 'Vendor confirms A-12 test bay result by D+2; keep the barge window protected.')}><Play aria-hidden="true" size={16} />Run sample</Button><Button type="button" variant="primary" onClick={() => openComposer()}><Plus aria-hidden="true" size={16} />New change</Button></div>
      </header>

      <InboxSummary items={items} />

      <section className="ds-panel ds-stack" aria-label="Change filters" style={{ padding: 'var(--ds-space-3)' }}>
        <div className="flex items-center gap-2 text-xs font-bold text-muted"><Funnel aria-hidden="true" size={15} />Filter inbox</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-52 flex-1 gap-1.5"><Label htmlFor="change-search">Search events</Label><Input id="change-search" value={search.q ?? ''} onChange={(event) => setFilter('q', event.target.value)} placeholder="Search id, job, or cause..." /></div>
          <FilterSelect label="Nature" value={search.nature ?? ''} onChange={(value) => setFilter('nature', value)} options={[['', 'All nature'], ['request', 'Request'], ['disruption', 'Disruption'], ['opportunity', 'Opportunity']]} />
          <FilterSelect label="State" value={search.state ?? ''} onChange={(value) => setFilter('state', value)} options={[['', 'All states'], ...Object.entries(eventLifecycleMeta).map(([key, value]) => [key, value.label])]} />
          <FilterSelect label="Job" value={search.job ?? ''} onChange={(value) => setFilter('job', value)} options={[['', 'All jobs'], ...[...new Set(items.flatMap((item) => item.jobs))].map((job) => [job, job])]} />
        </div>
      </section>

      {actionError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink" role="alert"><span className="flex items-start gap-2"><WarningCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-danger" />{actionError.message}</span>{(() => { const item = getEventById(items, actionError.eventId); return item ? <Button type="button" size="sm" variant="secondary" onClick={() => primaryAction(item)}>Retry action</Button> : null })()}</div> : null}
      <section className="ds-panel overflow-hidden" aria-label="Event list"><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left text-xs"><caption className="sr-only">Change inbox event list</caption><thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-3 font-bold">Event</th><th className="px-3 py-3 font-bold">Nature / cause</th><th className="px-3 py-3 font-bold">Jobs</th><th className="px-3 py-3 font-bold">State</th><th className="px-3 py-3 font-bold">Next action</th></tr></thead><tbody>{filtered.map((item) => <EventRow key={item.id} item={item} selected={item.id === selected?.id} pending={pendingEventId === item.id} buttonRef={(node) => { if (node) eventButtonRefs.current.set(item.id, node); else eventButtonRefs.current.delete(item.id) }} onSelect={() => onSearchChange({ event: item.id })} onPrimaryAction={primaryAction} />)}</tbody></table></div>{filtered.length === 0 ? <div className="grid place-items-center gap-2 p-10 text-center"><WarningCircle aria-hidden="true" size={24} className="text-muted" /><p className="m-0 text-sm text-muted">No events match these filters.</p>{hasActiveFilters ? <Button type="button" variant="secondary" onClick={() => onSearchChange({ q: undefined, nature: undefined, state: undefined, job: undefined })}>Clear filters</Button> : null}</div> : null}</section>
    </section>

    <EventPreview item={selected} onClose={() => { const eventId = selected?.id; setFilter('event', ''); if (eventId) window.setTimeout(() => eventButtonRefs.current.get(eventId)?.focus(), 0) }} onPrimaryAction={primaryAction} onEditExtraction={(item) => openComposer(item)} onOpenPlan={(item) => { if (item.planId) onOpenPlan(item.planId) }} />
    <NewChangeSheet open={composerOpen} initialEvent={composerEvent} initialText={sampleText} onOpenChange={(open) => { setComposerOpen(open); if (!open) { setComposerEvent(undefined); setSampleText(undefined) } }} onDirtyChange={setDraftDirty} onCreated={(item) => { updateItem(item); onSearchChange({ event: item.id }) }} onCorrectionSaved={updateItem} onStartInvestigation={startInvestigation} />
  </main>
}

function InboxSummary({ items }: { items: EventInboxItem[] }) {
  const count = (lifecycle: EventInboxItem['lifecycle']) => items.filter((item) => item.lifecycle === lifecycle).length
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Inbox summary"><Metric label="All events" value={items.length} /><Metric label="Needs attention" value={count('needs_info') + count('failed')} tone="danger" /><Metric label="In progress" value={count('extracting') + count('running')} tone="info" /><Metric label="Options ready" value={count('options_ready') + count('pending_decision')} tone="success" /></div>
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'danger' | 'info' | 'success' }) {
  const toneClass = { neutral: 'bg-surface-subtle text-muted', danger: 'bg-danger-subtle text-danger', info: 'bg-info-subtle text-info', success: 'bg-success-subtle text-success' }[tone]
  return <div className="ds-panel grid gap-1" style={{ padding: 'var(--ds-space-3)' }}><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className={`font-mono text-xl ${toneClass}`}>{value}</strong></div>
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="grid min-w-32 gap-1.5 text-xs font-bold text-muted"><span>{label}</span><select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function EventRow({ item, selected, pending, buttonRef, onSelect, onPrimaryAction }: { item: EventInboxItem; selected: boolean; pending: boolean; buttonRef: (node: HTMLButtonElement | null) => void; onSelect: () => void; onPrimaryAction: (item: EventInboxItem) => void }) {
  const meta = eventLifecycleMeta[item.lifecycle]
  return <tr className={`border-b border-border transition-colors motion-reduce:transition-none hover:bg-surface-subtle ${selected ? 'bg-primary-subtle/40' : ''}`}><td className="px-3 py-3"><button ref={buttonRef} type="button" className="grid gap-0.5 text-left font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={onSelect}>{item.id}<span className="font-mono text-[10px] text-muted">v{item.extractionVersion}</span></button></td><td className="max-w-sm px-3 py-3"><Badge variant="default">{item.nature}</Badge><span className="mt-1 block text-ink">{item.cause}</span><span className="mt-1 block truncate text-[10px] text-muted">{item.rawTextPreview}</span></td><td className="px-3 py-3 text-ink">{item.jobs.length ? item.jobs.join(', ') : 'None linked'}</td><td className="px-3 py-3"><Badge variant={meta.tone === 'danger' ? 'destructive' : meta.tone === 'success' ? 'success' : meta.tone === 'warning' ? 'warning' : 'default'}>{meta.label}</Badge></td><td className="px-3 py-3"><Button type="button" variant={item.lifecycle === 'failed' ? 'destructive' : item.lifecycle === 'ready' || item.lifecycle === 'options_ready' ? 'primary' : 'secondary'} onClick={() => onPrimaryAction(item)} disabled={pending} aria-busy={pending}>{pending ? item.lifecycle === 'failed' ? 'Retrying…' : 'Starting…' : meta.primaryAction}</Button></td></tr>
}
