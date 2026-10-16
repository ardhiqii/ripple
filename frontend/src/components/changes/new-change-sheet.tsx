import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { components } from '@/api/generated/openapi'
import { ApiError } from '@/api/transport'
import { Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea, toast } from '@/components/ui'
import { createCorrectionPayload, type EventInboxItem } from '@/features/events/events-data'
import { correctEventExtraction, createEvent, fetchEventDetail, mapServerLifecycle, startEventExtraction } from '@/features/events/events-api'

interface NewChangeSheetProps {
  open: boolean
  initialEvent?: EventInboxItem
  initialText?: string
  onOpenChange: (open: boolean) => void
  onDirtyChange: (dirty: boolean) => void
  onCreated: (item: EventInboxItem) => void
  onCorrectionSaved: (item: EventInboxItem) => void
  onEventUpdated?: (item: EventInboxItem) => void
  onStartInvestigation: (item: EventInboxItem) => Promise<void>
}

type ComposerStep = 'source' | 'extracting' | 'extraction'
type EventNature = components['schemas']['EventNature']

export function NewChangeSheet({ open, initialEvent, initialText, onOpenChange, onDirtyChange, onCreated, onCorrectionSaved, onEventUpdated, onStartInvestigation }: NewChangeSheetProps) {
  const [step, setStep] = useState<ComposerStep>(composerStep(initialEvent))
  const [sourceText, setSourceText] = useState(initialEvent?.rawTextPreview ?? initialText ?? '')
  const [draftEvent, setDraftEvent] = useState<EventInboxItem | undefined>(initialEvent)
  const [editing, setEditing] = useState(false)
  const [cause, setCause] = useState(initialEvent?.cause ?? '')
  const [nature, setNature] = useState<EventNature>(initialEvent?.nature ?? 'disruption')
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
    setStep(composerStep(initialEvent))
    setSourceText(initialEvent?.rawTextPreview ?? initialText ?? '')
    setDraftEvent(initialEvent)
    setCause(initialEvent?.cause ?? '')
    setNature(initialEvent?.nature ?? 'disruption')
    setJobs(initialEvent?.jobs.join(', ') ?? '')
    setRequestedStart(initialEvent?.requestedDate?.toString() ?? '')
    setMissingInfo(initialEvent?.missingInfo.join(', ') ?? '')
    setEditing(Boolean(initialEvent?.extraction))
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

  const applyItem = (item: EventInboxItem) => {
    setDraftEvent(item)
    setCause(item.extraction?.cause?.toString() ?? item.cause ?? '')
    setNature(item.extraction?.nature === 'request' || item.extraction?.nature === 'disruption' || item.extraction?.nature === 'opportunity' ? item.extraction.nature : item.nature ?? 'disruption')
    setJobs(item.jobs.join(', '))
    setRequestedStart(item.requestedDate?.toString() ?? '')
    setMissingInfo(item.missingInfo.join(', '))
  }

  const beginExtraction = async (item: EventInboxItem): Promise<EventInboxItem> => {
    setBusy(true)
    setErrorMessage(undefined)
    try {
      const response = await startEventExtraction(item.id)
      const nextItem = { ...item, lifecycle: mapServerLifecycle(response.state, undefined, undefined), extractionVersion: response.extractionVersion }
      applyItem(nextItem)
      setStep('extracting')
      onEventUpdated?.(nextItem)
      return nextItem
    } catch (error) {
      setErrorMessage(errorMessageFor(error, 'Extraction could not be started. The event and source are preserved; retry when the API is available.'))
      throw error
    } finally {
      setBusy(false)
    }
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
      applyItem(item)
      setStep('extracting')
      try {
        const extractedItem = await beginExtraction(item)
        onCreated(extractedItem)
        toast.success('Change created; extraction started')
      } catch {
        onCreated(item)
        toast.error('Change created, but extraction needs a retry')
      }
    } catch (error) {
      const message = `Change could not be submitted. ${errorMessageFor(error, 'The raw event was not created. Check the connection and retry.')}`
      setErrorMessage(message)
      toast.error('Change could not be submitted', { description: 'The raw event was not created. The pasted source remains available to retry.' })
    } finally {
      setBusy(false)
    }
  }

  const refreshExtraction = async () => {
    if (!draftEvent) return
    setBusy(true)
    setErrorMessage(undefined)
    try {
      const detail = await fetchEventDetail(draftEvent.id)
      applyItem(detail.event)
      onEventUpdated?.(detail.event)
      setStep(detail.event.extraction ? 'extraction' : 'extracting')
    } catch (error) {
      setErrorMessage(errorMessageFor(error, 'Extraction status could not be loaded. The source remains preserved; retry status refresh.'))
    } finally {
      setBusy(false)
    }
  }

  const currentItem = useMemo(() => {
    if (!draftEvent) return undefined
    const extraction = draftEvent.extraction ? {
      ...draftEvent.extraction,
      cause,
      nature,
      job_ids: jobs.split(',').map((job) => job.trim()).filter(Boolean),
      requested_start: requestedStart ? Number(requestedStart) : undefined,
      missing_info: missingInfo.split(',').map((value) => value.trim()).filter(Boolean),
    } : undefined
    return { ...draftEvent, cause: cause || draftEvent.cause, nature, jobs: extraction?.job_ids ?? draftEvent.jobs, requestedDate: extraction?.requested_start ?? draftEvent.requestedDate, missingInfo: extraction?.missing_info ?? draftEvent.missingInfo, extraction }
  }, [cause, draftEvent, jobs, missingInfo, nature, requestedStart])

  const saveCorrection = async () => {
    if (!currentItem?.extraction) return
    setErrorMessage(undefined)
    setBusy(true)
    try {
      const detail = await correctEventExtraction(currentItem.id, createCorrectionPayload(currentItem))
      applyItem(detail.event)
      setEditing(false)
      onCorrectionSaved(detail.event)
      toast.success('Extraction correction saved by server')
    } catch (error) {
      const message = errorMessageFor(error, 'Correction was not saved. The extraction version may have changed. Refresh before trying again.')
      setErrorMessage(message)
      toast.error('Correction was not saved', { description: message })
    } finally {
      setBusy(false)
    }
  }

  const startInvestigation = async () => {
    if (!currentItem || currentItem.lifecycle !== 'ready' || !currentItem.extraction) return
    setErrorMessage(undefined)
    setBusy(true)
    try {
      await onStartInvestigation(currentItem)
      onOpenChange(false)
    } catch (error) {
      const message = errorMessageFor(error, 'Investigation could not start. Check the connection and retry.')
      setErrorMessage(message)
      toast.error('Investigation could not start', { description: message })
    } finally {
      setBusy(false)
    }
  }

  return <Sheet open={open} onOpenChange={(nextOpen) => { if (nextOpen) onOpenChange(true); else close() }}>
    <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-lg" aria-busy={busy}>
      <SheetHeader className="border-b border-border pb-4 pr-8"><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Change intake</span><SheetTitle>{step === 'source' ? 'New change' : step === 'extracting' ? 'Reading source' : 'Review extraction'}</SheetTitle><SheetDescription>{step === 'source' ? 'Paste the source message. File upload is not part of this MVP.' : step === 'extracting' ? 'The event is persisted. Wait for the server extraction state before editing or investigating.' : 'Verify the structured event before investigation.'}</SheetDescription></SheetHeader>
      {busy ? <p role="status" aria-live="polite" className="sr-only">{step === 'source' ? 'Submitting change.' : editing ? 'Saving correction.' : 'Refreshing server state.'}</p> : null}
      {errorMessage ? <div role="alert" className="flex gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink"><span>{errorMessage}</span></div> : null}

      {step === 'source' ? <form className="grid gap-4" onSubmit={reviewChange}>
        <div className="grid gap-1.5"><Label htmlFor="change-source">Pasted message</Label><Textarea id="change-source" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste a vendor, weather, or operations update..." rows={9} /><span className="text-xs text-muted">The original text stays visible in the event preview after submission.</span></div>
        <div className="grid gap-2"><span className="text-xs font-bold text-ink">Sample messages</span><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setSourceText('Vendor confirms A-12 test bay result by D+2; keep the barge window protected.')}>A-12 vendor update</Button><Button type="button" variant="secondary" onClick={() => setSourceText('Weather window may close on D+6. Review the current cargo transfer sequence.')}>Weather window</Button></div></div>
        <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="quiet" onClick={clearSource}>Clear pasted message</Button><Button type="button" variant="quiet" onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Submitting...' : 'Create and read change'}</Button></div>
      </form> : step === 'extracting' && draftEvent ? <section className="grid gap-4">
        <div className="rounded-sm border border-border bg-surface-subtle p-4"><div className="flex items-center justify-between gap-3"><Badge variant={draftEvent.lifecycle === 'failed' ? 'destructive' : 'default'}>{eventLabel(draftEvent)}</Badge><span className="font-mono text-xs text-muted">{draftEvent.id}</span></div><p className="mt-3 mb-0 text-sm text-ink">{sourceText}</p><p className="mt-2 mb-0 text-xs text-muted">The server controls when structured extraction is ready. This event has not entered investigation.</p></div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="quiet" onClick={close}>Close</Button>{draftEvent.lifecycle === 'draft' || draftEvent.lifecycle === 'failed' ? <Button type="button" variant="secondary" onClick={() => { void beginExtraction(draftEvent) }} disabled={busy}>{busy ? 'Starting…' : 'Start extraction'}</Button> : null}<Button type="button" variant="primary" onClick={() => { void refreshExtraction() }} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh extraction status'}</Button></div>
      </section> : currentItem ? <section className="grid gap-4">
        <div className="flex items-center justify-between gap-3"><Badge variant={currentItem.lifecycle === 'failed' ? 'destructive' : currentItem.lifecycle === 'needs_info' ? 'warning' : 'success'}>{currentItem.lifecycle === 'failed' ? 'Needs attention' : currentItem.lifecycle === 'needs_info' ? 'Needs clarification' : currentItem.lifecycle === 'ready' ? 'Extraction ready' : eventLabel(currentItem)}</Badge><span className="font-mono text-xs text-muted">v{currentItem.extractionVersion}</span></div>
        {currentItem.lifecycle === 'failed' ? <div className="rounded-sm border border-danger/30 bg-danger-subtle p-3 text-sm text-ink">This extraction cannot enter plan review until the server action is retried. Retry the server extraction/run action from the inbox.</div> : !currentItem.extraction ? <div className="rounded-sm border border-border bg-surface-subtle p-3 text-sm text-muted">No extraction version is available yet. Refresh the server status before editing.</div> : <>
          <div className="grid gap-1.5"><Label htmlFor="extraction-nature">Nature</Label><select id="extraction-nature" disabled={!editing} className="h-9 rounded-sm border border-border bg-surface px-2.5 text-sm text-ink outline-none focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus" value={nature} onChange={(event) => setNature(event.target.value as EventNature)}><option value="request">Request</option><option value="disruption">Disruption</option><option value="opportunity">Opportunity</option></select></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-cause">Cause</Label><Input id="extraction-cause" disabled={!editing} value={cause} onChange={(event) => setCause(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-jobs">Jobs</Label><Input id="extraction-jobs" disabled={!editing} value={jobs} onChange={(event) => setJobs(event.target.value)} placeholder="A-12, D-07" /></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-date">Requested start day</Label><Input id="extraction-date" disabled={!editing} inputMode="numeric" value={requestedStart} onChange={(event) => setRequestedStart(event.target.value)} placeholder="D+5" /></div>
          <div className="grid gap-1.5"><Label htmlFor="extraction-missing">Missing information</Label><Input id="extraction-missing" disabled={!editing} value={missingInfo} onChange={(event) => setMissingInfo(event.target.value)} placeholder="Separate items with commas" /></div>
          <div className="rounded-sm border border-border bg-surface-subtle p-3 text-xs text-muted"><strong className="block text-ink">Source sentence</strong>{currentItem.extraction.source_excerpt}</div>
        </>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="quiet" onClick={() => setStep('source')}>Back to source</Button>{currentItem.extraction ? <Button type="button" variant="quiet" onClick={() => setEditing((value) => !value)} disabled={currentItem.lifecycle === 'failed'}>{editing ? 'Stop editing' : 'Edit fields'}</Button> : null}{editing && currentItem.extraction ? <Button type="button" variant="secondary" onClick={() => { void saveCorrection() }} disabled={busy}>Save correction</Button> : null}{currentItem.lifecycle === 'ready' && currentItem.extraction ? <Button type="button" variant="primary" onClick={() => { void startInvestigation() }} disabled={busy}>Start investigation</Button> : null}</div>
      </section> : null}

      {closePrompt ? <div role="alertdialog" aria-labelledby="change-draft-title" aria-describedby="change-draft-description" className="grid gap-3 border border-warning/40 bg-warning-subtle p-3 text-sm"><strong id="change-draft-title" className="text-ink">Keep this draft?</strong><span id="change-draft-description" className="text-muted">The pasted message has not been submitted.</span><div className="flex justify-end gap-2"><Button type="button" variant="quiet" onClick={() => setClosePrompt(false)}>Keep draft</Button><Button type="button" variant="destructive" onClick={() => { setClosePrompt(false); onOpenChange(false) }}>Discard draft</Button></div></div> : null}
      <SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={close}>Close</Button></SheetFooter>
    </SheetContent>
  </Sheet>
}

function composerStep(item?: EventInboxItem): ComposerStep {
  if (!item) return 'source'
  return item.extraction && item.lifecycle !== 'draft' && item.lifecycle !== 'extracting' ? 'extraction' : 'extracting'
}

function eventLabel(item: EventInboxItem): string {
  return item.lifecycle === 'failed' ? 'Needs attention' : item.lifecycle.replaceAll('_', ' ')
}

function errorMessageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`
  return error instanceof Error && error.message ? error.message : fallback
}
