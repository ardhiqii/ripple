import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatCircleDots, CircleNotch, LinkSimple, PaperPlaneTilt, Sparkle, X } from '@phosphor-icons/react'

import type { components } from '@/api/generated/openapi'
import { askRipple, streamRun, type AskAnswer } from '@/api/agent-runs'
import { ApiError, apiTransport } from '@/api/transport'
import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea, toast } from '@/components/ui'
import { startEventExtraction } from '@/features/events/events-api'
import { useRunRegistry } from '@/features/agent/run-registry'
import { createRunState, initialRunState, runReducer, type PublicRunEvent, type RunState } from '@/features/agent/run-reducer'

export type RippleMode = 'ask' | 'submit'

export interface RippleContext {
  route: string
  jobIds?: string[]
  resourceIds?: string[]
  readinessItemIds?: string[]
  eventId?: string
  planId?: string
  scheduleVersion?: number
}

export interface RippleSubmitPayload {
  rawText: string
  context: RippleContext
}

export interface RipplePanelProps {
  open: boolean
  mode: RippleMode
  context: RippleContext
  onOpenChange: (open: boolean) => void
  onEventCreated?: (eventId: string) => void
  onRunStarted?: (runId: string) => void
  onPlanReady?: (planId: string) => void
  onSubmit?: (payload: RippleSubmitPayload) => Promise<{ eventId?: string; runId?: string } | void>
}

type Chip = { id: string; label: string; remove: () => void }
type CreateEventRequest = components['schemas']['CreateEventRequest']

export function RipplePanel({ open, mode, context, onOpenChange, onEventCreated, onRunStarted, onPlanReady, onSubmit }: RipplePanelProps) {
  const { activeRuns, registerRun, updateRun } = useRunRegistry()
  const [activeMode, setActiveMode] = useState<RippleMode>(mode)
  const [activeContext, setActiveContext] = useState<RippleContext>(context)
  const [draft, setDraft] = useState('')
  const [runState, setRunState] = useState<RunState>(initialRunState)
  const [busy, setBusy] = useState(false)
  const [askAnswer, setAskAnswer] = useState<AskAnswer>()
  const [submitError, setSubmitError] = useState<string>()
  const [askAvailable, setAskAvailable] = useState(true)
  const streamControllerRef = useRef<AbortController | undefined>(undefined)

  useEffect(() => {
    setActiveMode(mode)
    setActiveContext(context)
    setAskAnswer(undefined)
    setSubmitError(undefined)
    setRunState(initialRunState)
    streamControllerRef.current?.abort()
    streamControllerRef.current = undefined
  }, [context, mode])

  const dispatch = useCallback((action: Parameters<typeof runReducer>[1]) => {
    setRunState((current) => runReducer(current, action))
  }, [])

  useEffect(() => {
    if (!runState.runId) return
    const status = runState.status === 'completed' ? 'completed' : runState.status === 'failed' ? 'failed' : runState.status === 'queued' ? 'queued' : 'streaming'
    updateRun(runState.runId, { status, lastSeq: runState.lastSeq })
  }, [runState.lastSeq, runState.runId, runState.status, updateRun])

  const startStream = useCallback(async (runId: string, after?: number) => {
    streamControllerRef.current?.abort()
    const controller = new AbortController()
    streamControllerRef.current = controller
    dispatch({ type: 'stream_open' })
    try {
      await streamRun(runId, {
        after,
        signal: controller.signal,
        onEvent: (event) => {
          dispatch({ type: 'event', event })
          if (event.type === 'plan') {
            const planId = stringValue(event.public.plan_id)
            if (planId) onPlanReady?.(planId)
          }
        },
      })
    } catch (error) {
      if (controller.signal.aborted) return
      dispatch({ type: 'stream_error', error: error instanceof Error ? error.message : 'Run stream failed.' })
    } finally {
      if (streamControllerRef.current === controller) streamControllerRef.current = undefined
    }
  }, [dispatch, onPlanReady])

  useEffect(() => {
    if (!open) return
    const activeRun = activeRuns.find((run) => run.scenarioId === apiTransport.scenarioId && (run.status === 'queued' || run.status === 'streaming'))
    if (!activeRun || runState.runId === activeRun.runId) return
    setRunState(createRunState(activeRun.runId, activeRun.eventId, activeRun.lastSeq ?? 0))
    void startStream(activeRun.runId, activeRun.lastSeq)
  }, [activeRuns, open, runState.runId, startStream])

  const executeAsk = async () => {
    const rawQuestion = draft.trim()
    if (!rawQuestion) {
      toast.error('Write a question first.')
      return
    }
    setBusy(true)
    setAskAnswer(undefined)
    setSubmitError(undefined)
    try {
      const answer = await askRipple(rawQuestion, askContext(activeContext))
      setAskAvailable(true)
      setAskAnswer(answer)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 503)) setAskAvailable(false)
      setSubmitError(error instanceof Error ? error.message : 'Ask could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    const rawText = draft.trim()
    if (!rawText) {
      toast.error(activeMode === 'ask' ? 'Write a question first.' : 'Describe the change first.')
      return
    }
    if (activeMode === 'ask') {
      await executeAsk()
      return
    }

    setSubmitError(undefined)
    setBusy(true)
    try {
      const result = onSubmit ? await onSubmit({ rawText, context: activeContext }) : await createEventAndStartExtraction(rawText, activeContext)
      if (result?.eventId) onEventCreated?.(result.eventId)
      if (result && 'runId' in result && result.runId) {
        const eventId = result.eventId ?? activeContext.eventId
        if (eventId) {
          registerRun({ runId: result.runId, eventId, status: 'queued', startedAt: new Date().toISOString(), scenarioId: apiTransport.scenarioId })
        }
        onRunStarted?.(result.runId)
      }
      setDraft('')
      toast.success('Change submitted', { description: 'Extraction started. Review the server extraction before investigation.' })
    } catch (error) {
      const message = error instanceof Error && error.message ? `Ripple could not start. ${error.message}` : 'Ripple could not start. The request failed.'
      setSubmitError(message)
      toast.error('Ripple could not start', { description: error instanceof Error ? error.message : 'The request failed.' })
    } finally {
      setBusy(false)
    }
  }

  const chips = useMemo(() => buildChips(activeContext, setActiveContext), [activeContext])
  const planId = runState.events.reduce<string | undefined>((current, event) => current ?? (event.type === 'plan' ? stringValue(event.public.plan_id) : undefined), activeContext.planId)

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-md">
      <SheetHeader className="border-b border-border pb-4 pr-8"><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary"><Sparkle aria-hidden="true" size={14} weight="fill" />Contextual Ripple</span><SheetTitle>{activeMode === 'ask' ? 'Ask Ripple' : 'Submit change'}</SheetTitle><SheetDescription>Context stays attached to this panel while you navigate.</SheetDescription></SheetHeader>

      <div className="grid gap-2" role="group" aria-label="Ripple mode"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Mode</span><div className="grid grid-cols-2 gap-1 rounded-sm border border-border bg-surface-subtle p-1"><Button type="button" aria-pressed={activeMode === 'ask'} variant={activeMode === 'ask' ? 'primary' : 'quiet'} onClick={() => setActiveMode('ask')}><ChatCircleDots aria-hidden="true" size={15} />Ask</Button><Button type="button" aria-pressed={activeMode === 'submit'} variant={activeMode === 'submit' ? 'primary' : 'quiet'} onClick={() => setActiveMode('submit')}><PaperPlaneTilt aria-hidden="true" size={15} />Submit change</Button></div></div>

      <section className="grid gap-2" aria-label="Ripple context"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Context</span><Badge variant="default">{activeContext.route}</Badge></div>{chips.length ? <div className="flex flex-wrap gap-1.5">{chips.map((chip) => <span key={chip.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle px-2 py-1 text-[11px] font-semibold text-ink"><LinkSimple aria-hidden="true" size={12} className="text-primary" />{chip.label}<button type="button" aria-label={`Remove ${chip.label} context`} className="rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus" onClick={chip.remove}><X aria-hidden="true" size={12} /></button></span>)}</div> : <p className="m-0 rounded-sm border border-dashed border-border p-3 text-xs text-muted">No page context attached. Ask remains read-only until you explicitly submit a change.</p>}</section>

      <div className="grid gap-2" aria-busy={busy}><label htmlFor="ripple-composer" className="text-xs font-bold text-ink">{activeMode === 'ask' ? 'Question' : 'Change request'}</label><Textarea id="ripple-composer" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={activeMode === 'ask' ? 'Ask about readiness, capacity, or a schedule trade-off...' : 'Describe the operational change Ripple should investigate...'} rows={5} /><div className="flex justify-end"><Button type="button" variant="primary" onClick={() => void submit()} disabled={busy || (activeMode === 'ask' && !askAvailable)} aria-busy={busy}>{busy ? <><CircleNotch aria-hidden="true" className="motion-safe:animate-spin motion-reduce:animate-none" size={15} />{activeMode === 'ask' ? 'Asking...' : 'Starting...'}</> : activeMode === 'ask' ? 'Ask Ripple' : 'Submit change'}</Button></div>{activeMode === 'ask' && !askAvailable ? <div className="flex items-center justify-between gap-2"><p role="status" className="m-0 text-xs text-muted">Read-only Ask is unavailable. Submit a change to use the extraction workflow.</p><Button type="button" size="sm" variant="secondary" onClick={() => { setAskAvailable(true); void executeAsk() }} disabled={busy}>Retry Ask</Button></div> : null}{busy ? <p role="status" aria-live="polite" className="sr-only">{activeMode === 'ask' ? 'Reading persisted facts.' : 'Starting change extraction.'}</p> : null}</div>
      {submitError ? <div role="alert" className="rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink">{submitError}</div> : null}

      {askAnswer ? <AskAnswerView answer={askAnswer} /> : null}
      {runState.status !== 'idle' ? <RunTrace state={runState} planId={planId} onReconnect={() => { if (runState.runId) void startStream(runState.runId, runState.lastSeq) }} onOpenPlan={() => { if (planId) onPlanReady?.(planId) }} /> : null}

      <SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>Close</Button></SheetFooter>
    </SheetContent>
  </Sheet>
}

function RunTrace({ state, planId, onReconnect, onOpenPlan }: { state: RunState; planId?: string; onReconnect: () => void; onOpenPlan: () => void }) {
  return <section className="grid gap-2 border-t border-border pt-4" aria-label="Live Ripple trace"><div className="flex items-center justify-between gap-2"><h3 className="m-0 text-sm font-bold text-ink">Live trace</h3><span role="status" aria-live="polite"><Badge variant={state.status === 'failed' ? 'destructive' : state.status === 'completed' ? 'success' : 'default'}>{state.status}</Badge></span></div>{state.error ? <div role="alert" className="grid gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink"><span>{state.error}</span>{state.status === 'reconnecting' ? <Button type="button" variant="secondary" onClick={onReconnect}>Reconnect</Button> : null}</div> : null}{state.events.length ? <ol className="m-0 grid list-none gap-2 p-0">{state.events.map((event) => <li key={event.seq} className="grid gap-1 border-l-2 border-primary pl-3 text-xs"><span className="font-mono text-[10px] text-muted">#{event.seq} · {event.phase}</span><span className="text-ink">{publicSummary(event)}</span></li>)}</ol> : <p className="m-0 text-xs text-muted">Waiting for the first public event.</p>}{planId ? <div className="grid gap-2 rounded-sm border-2 border-dashed border-primary bg-primary-subtle p-3"><strong className="text-sm text-primary">Plan ready</strong><span className="text-xs text-ink">Ripple has a plan for review. Approval is still a separate action.</span><Button type="button" variant="primary" onClick={onOpenPlan}>Open decision workspace</Button></div> : null}</section>
}

function publicSummary(event: PublicRunEvent) {
  const summary = event.public.summary
  return typeof summary === 'string' && summary.trim() ? summary : `${event.type} completed in ${event.phase}.`
}

function buildChips(context: RippleContext, setContext: (context: RippleContext) => void): Chip[] {
  const chips: Chip[] = []
  for (const jobId of context.jobIds ?? []) chips.push({ id: `job-${jobId}`, label: `Job ${jobId}`, remove: () => setContext({ ...context, jobIds: (context.jobIds ?? []).filter((value) => value !== jobId) }) })
  for (const resourceId of context.resourceIds ?? []) chips.push({ id: `resource-${resourceId}`, label: `Resource ${resourceId}`, remove: () => setContext({ ...context, resourceIds: (context.resourceIds ?? []).filter((value) => value !== resourceId) }) })
  for (const itemId of context.readinessItemIds ?? []) chips.push({ id: `readiness-${itemId}`, label: `Readiness ${itemId}`, remove: () => setContext({ ...context, readinessItemIds: (context.readinessItemIds ?? []).filter((value) => value !== itemId) }) })
  if (context.eventId) chips.push({ id: 'event', label: `Event ${context.eventId}`, remove: () => setContext({ ...context, eventId: undefined }) })
  if (context.planId) chips.push({ id: 'plan', label: `Plan ${context.planId}`, remove: () => setContext({ ...context, planId: undefined }) })
  if (context.scheduleVersion !== undefined) chips.push({ id: 'schedule', label: `Schedule v${context.scheduleVersion}`, remove: () => setContext({ ...context, scheduleVersion: undefined }) })
  return chips
}

async function createEventAndStartExtraction(rawText: string, context: RippleContext) {
  const body: CreateEventRequest = { raw_text: rawText, parent_event_id: context.eventId, parent_plan_id: context.planId }
  const payload = await apiTransport.post<components['schemas']['EventResponse']>('/api/v1/events', body)
  const eventId = stringValue(payload.id)
  if (!eventId) throw new Error('Event creation response did not include an event id.')
  await startEventExtraction(eventId)
  return { eventId }
}

function askContext(context: RippleContext) {
  return {
    ...(context.jobIds?.length ? { job_ids: context.jobIds } : {}),
    ...(context.resourceIds?.length ? { resource_ids: context.resourceIds } : {}),
    ...(context.readinessItemIds?.length ? { readiness_item_ids: context.readinessItemIds } : {}),
    ...(context.eventId ? { event_id: context.eventId } : {}),
    ...(context.planId ? { plan_id: context.planId } : {}),
    ...(context.scheduleVersion !== undefined ? { schedule_version: context.scheduleVersion } : {}),
  }
}

function AskAnswerView({ answer }: { answer: AskAnswer }) {
  return <section className="grid gap-3 rounded-sm border border-info/30 bg-info-subtle p-3" aria-label="Read-only Ask answer"><div className="flex items-center justify-between gap-2"><h3 className="m-0 text-sm font-bold text-ink">Read-only answer</h3><Badge variant={answer.freshness === 'current' ? 'success' : answer.freshness === 'stale' ? 'warning' : 'default'}>{answer.freshness} evidence</Badge></div><p className="m-0 text-sm leading-relaxed text-ink">{answer.answer}</p><dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-muted">Schedule version</dt><dd className="m-0 font-mono text-ink">v{answer.scheduleVersion}</dd></div><div><dt className="text-muted">Answered</dt><dd className="m-0 text-ink">{formatDate(answer.answeredAt)}</dd></div></dl>{answer.uncertainty ? <p className="m-0 text-xs text-muted">{answer.uncertainty}</p> : null}<div className="grid gap-1.5"><strong className="text-xs text-ink">Evidence</strong>{answer.evidence.length ? <ul className="m-0 grid list-disc gap-1 pl-4 text-xs text-muted">{answer.evidence.map((item) => <li key={`${item.entityType}:${item.entityId}`}>{item.label}{item.sourceUpdatedAt ? ` · updated ${formatDate(item.sourceUpdatedAt)}` : ' · source time not supplied'}</li>)}</ul> : <span className="text-xs text-muted">No persisted evidence was returned.</span>}</div></section>
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
