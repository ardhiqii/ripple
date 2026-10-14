import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { components } from '@/api/generated/openapi'
import { apiUrl } from '@/api/url'
import { Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea, toast } from '@/components/ui'
import { createCorrectionPayload, eventInboxFixture, type EventInboxItem } from '@/features/events/events-data'

type CreateEventRequest = components['schemas']['CreateEventRequest']
type ExtractionCorrectionRequest = components['schemas']['ExtractionCorrectionRequest']

interface NewChangeSheetProps {
  open: boolean
  initialEvent?: EventInboxItem
  initialText?: string
  onOpenChange: (open: boolean) => void
  onDirtyChange: (dirty: boolean) => void
  onCreated: (item: EventInboxItem) => void
  onCorrectionSaved: (item: EventInboxItem) => void
  onStartInvestigation: (item: EventInboxItem) => Promise<void>
}

type ComposerStep = 'source' | 'extraction'

export function NewChangeSheet({ open, initialEvent, initialText, onOpenChange, onDirtyChange, onCreated, onCorrectionSaved, onStartInvestigation }: NewChangeSheetProps) {
  const [step, setStep] = useState<ComposerStep>(initialEvent ? 'extraction' : 'source')
  const [sourceText, setSourceText] = useState(initialEvent?.rawTextPreview ?? initialText ?? '')
  const [draftEvent, setDraftEvent] = useState<EventInboxItem | undefined>(initialEvent)
  const [editing, setEditing] = useState(false)
  const [cause, setCause] = useState(initialEvent?.cause ?? '')
  const [nature, setNature] = useState<components['schemas']['EventNature']>(initialEvent?.nature ?? 'disruption')
  const [jobs, setJobs] = useState(initialEvent?.jobs.join(', ') ?? '')
  const [requestedStart, setRequestedStart] = useState(initialEvent?.requestedDate?.toString() ?? '')
  const [missingInfo, setMissingInfo] = useState(initialEvent?.missingInfo.join(', ') ?? '')
  const [closePrompt, setClosePrompt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()

  const dirty = open && step === 'source' && sourceText.trim().length > 0
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  useEffect(() => {
    if (!open) return
    const item = initialEvent
    setStep(item ? 'extraction' : 'source')
    setSourceText(item?.rawTextPreview ?? initialText ?? '')
    setDraftEvent(item)
    setCause(item?.cause ?? '')
    setNature(item?.nature ?? 'disruption')
    setJobs(item?.jobs.join(', ') ?? '')
    setRequestedStart(item?.requestedDate?.toString() ?? '')
    setMissingInfo(item?.missingInfo.join(', ') ?? '')
    setEditing(Boolean(item))
    setClosePrompt(false)
    setErrorMessage(undefined)
  }, [initialEvent, initialText, open])

  const close = () => {
    if (dirty) {
      setClosePrompt(true)
      return
    }
    onOpenChange(false)
  }

  const clearSource = () => {
    if (!sourceText.trim() || window.confirm('Clear the pasted message?')) setSourceText('')
  }

  const reviewChange = async (event: FormEvent) => {
    event.preventDefault()
    const rawText = sourceText.trim()
    if (!rawText) {
      toast.error('Paste a change before reviewing it.')
      return
    }
    setErrorMessage(undefined)
    setBusy(true)
    try {
      const item = await createEvent(rawText)
      setDraftEvent(item)
      setStep('extraction')
      setEditing(false)
      onCreated(item)
    } catch {
      const message = 'Change could not be submitted. The raw event was not created. Check the connection and retry.'
      setErrorMessage(message)
      toast.error('Change could not be submitted', { description: 'The raw event was not created. Check the connection and retry.' })
    } finally {
      setBusy(false)
    }
  }

  const currentItem = useMemo(() => {
    if (!draftEvent) return undefined
    const extraction = {
      ...draftEvent.extraction,
      cause,
      nature,
      job_ids: jobs.split(',').map((job) => job.trim()).filter(Boolean),
      requested_start: requestedStart ? Number(requestedStart) : undefined,
      missing_info: missingInfo.split(',').map((value) => value.trim()).filter(Boolean),
    }
    return { ...draftEvent, cause, nature, jobs: extraction.job_ids ?? [], requestedDate: extraction.requested_start ?? null, missingInfo: extraction.missing_info ?? [], extraction }
  }, [cause, draftEvent, jobs, missingInfo, nature, requestedStart])

  const saveCorrection = async () => {
    if (!currentItem) return
    setErrorMessage(undefined)
    setBusy(true)
    try {
      const payload = createCorrectionPayload(currentItem)
      await saveCorrectionRequest(currentItem.id, payload)
      onCorrectionSaved(currentItem)
      setDraftEvent(currentItem)
      setEditing(false)
      toast.success('Extraction correction saved')
    } catch {
      const message = 'Correction was not saved. The extraction version may have changed. Refresh before trying again.'
      setErrorMessage(message)
      toast.error('Correction was not saved', { description: 'The extraction version may have changed. Refresh before trying again.' })
    } finally {
      setBusy(false)
    }
  }

  const startInvestigation = async () => {
    if (!currentItem || currentItem.lifecycle === 'failed') return
    setErrorMessage(undefined)
    setBusy(true)
    try {
      await onStartInvestigation(currentItem)
      toast.success('Investigation started')
      onOpenChange(false)
    } catch {
      const message = 'Investigation could not start. Check the connection and retry.'
      setErrorMessage(message)
      toast.error('Investigation could not start')
    } finally {
      setBusy(false)
    }
  }

  return <Sheet open={open} onOpenChange={(nextOpen) => { if (nextOpen) onOpenChange(true); else close() }}>
    <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-lg" aria-busy={busy}>
      <SheetHeader className="border-b border-border pb-4 pr-8"><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Change intake</span><SheetTitle>{step === 'source' ? 'New change' : 'Review extraction'}</SheetTitle><SheetDescription>{step === 'source' ? 'Paste the source message. File upload is not part of this MVP.' : 'Verify the structured event before investigation.'}</SheetDescription></SheetHeader>
      {busy ? <p role="status" aria-live="polite" className="sr-only">{step === 'source' ? 'Reviewing change.' : editing ? 'Saving correction.' : 'Starting investigation.'}</p> : null}
      {errorMessage ? <div role="alert" className="flex gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink"><span>{errorMessage}</span></div> : null}

      {step === 'source' ? <form className="grid gap-4" onSubmit={reviewChange}>
        <div className="grid gap-1.5"><Label htmlFor="change-source">Pasted message</Label><Textarea id="change-source" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste a vendor, weather, or operations update..." rows={9} /><span className="text-xs text-muted">The original text stays visible in the event preview after submission.</span></div>
        <div className="grid gap-2"><span className="text-xs font-bold text-ink">Sample messages</span><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setSourceText('Vendor confirms A-12 test bay result by D+2; keep the barge window protected.')}>A-12 vendor update</Button><Button type="button" variant="secondary" onClick={() => setSourceText('Weather window may close on D+6. Review the current cargo transfer sequence.')}>Weather window</Button></div></div>
        <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="quiet" onClick={clearSource}>Clear pasted message</Button><Button type="button" variant="quiet" onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Reviewing...' : 'Review change'}</Button></div>
      </form> : currentItem ? <section className="grid gap-4">
        <div className="flex items-center justify-between gap-3"><Badge variant={currentItem.lifecycle === 'failed' ? 'destructive' : 'success'}>{currentItem.lifecycle === 'failed' ? 'Needs attention' : 'Extraction ready'}</Badge><span className="font-mono text-xs text-muted">v{currentItem.extractionVersion}</span></div>
        {currentItem.lifecycle === 'failed' ? <div className="rounded-sm border border-danger/30 bg-danger-subtle p-3 text-sm text-ink">This extraction failed and cannot enter plan review. Retry extraction from the event row first.</div> : <>
          <div className="grid gap-1.5"><Label htmlFor="extraction-nature">Nature</Label><select id="extraction-nature" disabled={!editing} className="h-9 rounded-sm border border-border bg-surface px-2.5 text-sm text-ink outline-none focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus" value={nature} onChange={(event) => setNature(event.target.value as components['schemas']['EventNature'])}><option value="request">Request</option><option value="disruption">Disruption</option><option value="opportunity">Opportunity</option></select></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-cause">Cause</Label><Input id="extraction-cause" disabled={!editing} value={cause} onChange={(event) => setCause(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-jobs">Jobs</Label><Input id="extraction-jobs" disabled={!editing} value={jobs} onChange={(event) => setJobs(event.target.value)} placeholder="A-12, D-07" /></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-date">Requested start day</Label><Input id="extraction-date" disabled={!editing} inputMode="numeric" value={requestedStart} onChange={(event) => setRequestedStart(event.target.value)} placeholder="D+5" /></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-missing">Missing information</Label><Input id="extraction-missing" disabled={!editing} value={missingInfo} onChange={(event) => setMissingInfo(event.target.value)} placeholder="Separate items with commas" /></div>
          <div className="rounded-sm border border-border bg-surface-subtle p-3 text-xs text-muted"><strong className="block text-ink">Source sentence</strong>{sourceText}</div>
        </>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="quiet" onClick={() => setStep('source')}>Back to source</Button><Button type="button" variant="quiet" onClick={() => setEditing((value) => !value)} disabled={currentItem.lifecycle === 'failed'}>{editing ? 'Stop editing' : 'Edit fields'}</Button>{editing ? <Button type="button" variant="secondary" onClick={saveCorrection} disabled={busy}>Save correction</Button> : null}{currentItem.lifecycle !== 'failed' ? <Button type="button" variant="primary" onClick={startInvestigation} disabled={busy}>Start investigation</Button> : null}</div>
      </section> : null}

      {closePrompt ? <div role="alertdialog" aria-labelledby="change-draft-title" aria-describedby="change-draft-description" className="grid gap-3 border border-warning/40 bg-warning-subtle p-3 text-sm"><strong id="change-draft-title" className="text-ink">Keep this draft?</strong><span id="change-draft-description" className="text-muted">The pasted message has not been submitted.</span><div className="flex justify-end gap-2"><Button type="button" variant="quiet" onClick={() => setClosePrompt(false)}>Keep draft</Button><Button type="button" variant="destructive" onClick={() => { setClosePrompt(false); onOpenChange(false) }}>Discard draft</Button></div></div> : null}
      <SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={close}>Close</Button></SheetFooter>
    </SheetContent>
  </Sheet>
}

async function createEvent(rawText: string): Promise<EventInboxItem> {
  const body: CreateEventRequest = { raw_text: rawText }
  const response = await fetch(apiUrl('/api/v1/events'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error('event creation failed')
  const payload = await response.json() as { id?: unknown }
  const base = eventInboxFixture[0]
  return { ...base, id: typeof payload.id === 'string' ? payload.id : `draft-${Date.now()}`, lifecycle: 'extracting', rawTextPreview: rawText, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
}

async function saveCorrectionRequest(eventId: string, payload: ExtractionCorrectionRequest) {
  const response = await fetch(apiUrl(`/api/v1/events/${encodeURIComponent(eventId)}/extraction`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!response.ok) throw new Error('correction failed')
}
