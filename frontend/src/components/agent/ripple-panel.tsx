import { useEffect, useMemo, useState } from 'react'
import { ChatCircleDots, CircleNotch, LinkSimple, PaperPlaneTilt, Sparkle, X } from '@phosphor-icons/react'

import type { components } from '@/api/generated/openapi'
import { createRun, streamRun } from '@/api/agent-runs'
import { apiUrl } from '@/api/url'
import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea, toast } from '@/components/ui'
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
  const { registerRun, updateRun } = useRunRegistry()
  const [activeMode, setActiveMode] = useState<RippleMode>(mode)
  const [activeContext, setActiveContext] = useState<RippleContext>(context)
  const [draft, setDraft] = useState('')
  const [runState, setRunState] = useState<RunState>(initialRunState)
  const [busy, setBusy] = useState(false)
  const [askNotice, setAskNotice] = useState(false)
  const [submitError, setSubmitError] = useState<string>()

  useEffect(() => {
    setActiveMode(mode)
    setActiveContext(context)
    setAskNotice(false)
    setSubmitError(undefined)
  }, [context, mode])

  const dispatch = (action: Parameters<typeof runReducer>[1]) => {
    setRunState((current) => {
      const next = runReducer(current, action)
      if (next.runId) {
        const status = next.status === 'completed' ? 'completed' : next.status === 'failed' ? 'failed' : next.status === 'queued' ? 'queued' : 'streaming'
        updateRun(next.runId, { status })
      }
      return next
    })
  }

  const startStream = async (runId: string, after?: number) => {
    dispatch({ type: 'stream_open' })
    try {
      await streamRun(runId, {
        after,
        onEvent: (event) => {
          dispatch({ type: 'event', event })
          if (event.type === 'plan') {
            const planId = stringValue(event.public.plan_id)
            if (planId) onPlanReady?.(planId)
          }
        },
      })
    } catch (error) {
      dispatch({ type: 'stream_error', error: error instanceof Error ? error.message : 'Run stream failed.' })
    }
  }

  const startRun = async (eventId: string) => {
    const result = await createRun(eventId, `ripple-${eventId}-${Date.now()}`)
    setRunState(createRunState(result.runId, result.eventId))
    registerRun({ runId: result.runId, eventId: result.eventId, status: 'queued', startedAt: new Date().toISOString() })
    onRunStarted?.(result.runId)
    void startStream(result.runId)
  }

  const submit = async () => {
    const rawText = draft.trim()
    if (!rawText) {
      toast.error(activeMode === 'ask' ? 'Write a question first.' : 'Describe the change first.')
      return
    }
    if (activeMode === 'ask') {
      setAskNotice(true)
      window.dispatchEvent(new CustomEvent('ripple:ask', { detail: { prompt: rawText, context: activeContext } }))
      return
    }

    setSubmitError(undefined)
    setBusy(true)
    try {
      const result = onSubmit ? await onSubmit({ rawText, context: activeContext }) : await createEventAndRun(rawText, activeContext, startRun)
      if (result?.eventId) onEventCreated?.(result.eventId)
      if (result && 'runId' in result && result.runId) onRunStarted?.(result.runId)
      setDraft('')
      toast.success('Change submitted', { description: 'Ripple is investigating with the attached context.' })
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

      <div className="grid gap-2" aria-busy={busy}><label htmlFor="ripple-composer" className="text-xs font-bold text-ink">{activeMode === 'ask' ? 'Question' : 'Change request'}</label><Textarea id="ripple-composer" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={activeMode === 'ask' ? 'Ask about readiness, capacity, or a schedule trade-off...' : 'Describe the operational change Ripple should investigate...'} rows={5} /><div className="flex justify-end"><Button type="button" variant="primary" onClick={() => void submit()} disabled={busy} aria-busy={busy}>{busy ? <><CircleNotch aria-hidden="true" className="motion-safe:animate-spin motion-reduce:animate-none" size={15} />Starting...</> : activeMode === 'ask' ? 'Ask Ripple' : 'Submit change'}</Button></div>{busy ? <p role="status" aria-live="polite" className="sr-only">Starting change investigation.</p> : null}</div>
      {submitError ? <div role="alert" className="rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink">{submitError}</div> : null}

      {askNotice ? <div role="status" className="rounded-sm border border-info/30 bg-info-subtle p-3 text-xs text-ink">Read-only answer mode is active. Use Submit change when you want Ripple to create an auditable event and run.</div> : null}
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

async function createEventAndRun(rawText: string, context: RippleContext, startRun: (eventId: string) => Promise<void>) {
  const body: CreateEventRequest = { raw_text: rawText, parent_event_id: context.eventId, parent_plan_id: context.planId }
  const response = await fetch(apiUrl('/api/v1/events'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`Event creation failed with status ${response.status}.`)
  const payload = await response.json() as Record<string, unknown>
  const eventId = stringValue(payload.id)
  if (!eventId) throw new Error('Event creation response did not include an event id.')
  await startRun(eventId)
  return { eventId }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
