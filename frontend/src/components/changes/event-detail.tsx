import { useEffect, useMemo, useState } from 'react'
import { ArrowClockwise, ArrowLeft, ArrowSquareOut, CheckCircle, Clock, Copy, PencilSimple, Play, WarningCircle } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'

import type { components } from '@/api/generated/openapi'
import { ApiError, apiTransport } from '@/api/transport'
import { Badge, Button, Input, Label, toast } from '@/components/ui'
import { useRunRegistry } from '@/features/agent/run-registry'
import { createCorrectionPayload, eventLifecycleMeta, type EventInboxItem } from '@/features/events/events-data'
import {
  correctEventExtraction,
  startEventExtraction,
  startEventRun,
  useEventDetail,
  type EventDetailData,
  type EventPlanRecord,
  type EventRunRecord,
} from '@/features/events/events-api'

type EventNature = components['schemas']['EventNature']

interface EventDetailProps {
  eventId: string
  onBack: () => void
  onOpenPlan: (planId: string, runId?: string) => void
  onOpenJob: (jobId: string, requestedDate: number | null) => void
}

type DetailAction = 'extract' | 'clarify' | 'investigate' | 'refresh' | 'retry-run' | 'open-plan'

export function EventDetail({ eventId, onBack, onOpenPlan, onOpenJob }: EventDetailProps) {
  const queryClient = useQueryClient()
  const detailQuery = useEventDetail(eventId)
  const { registerRun } = useRunRegistry()
  const [editing, setEditing] = useState(false)
  const [nature, setNature] = useState<EventNature>('disruption')
  const [cause, setCause] = useState('')
  const [jobs, setJobs] = useState('')
  const [requestedStart, setRequestedStart] = useState('')
  const [missingInfo, setMissingInfo] = useState('')
  const [busyAction, setBusyAction] = useState<DetailAction>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const data = detailQuery.data
  const item = data?.event
  const hasPersistedExtraction = Boolean(item?.extraction && item.extractionVersion > 0)
  const latestRun = useMemo(() => latestRunFor(data), [data])
  const latestPlan = useMemo(() => latestPlanFor(data), [data])

  useEffect(() => {
    if (!item || editing) return
    setNature(item.extraction?.nature ?? item.nature ?? 'disruption')
    setCause(item.extraction?.cause ?? item.cause ?? '')
    setJobs(item.extraction?.job_ids?.join(', ') ?? item.jobs.join(', '))
    setRequestedStart(item.extraction?.requested_start === undefined ? '' : String(item.extraction.requested_start))
    setMissingInfo(item.extraction?.missing_info?.join(', ') ?? item.missingInfo.join(', '))
  }, [editing, item])

  const invalidateDetail = async () => {
    await queryClient.invalidateQueries({ queryKey: apiTransport.queryKey('events', 'detail', eventId) })
    await queryClient.invalidateQueries({ queryKey: apiTransport.queryKey('events') })
  }

  const runExtraction = async () => {
    if (!item) return
    setBusyAction('extract')
    setErrorMessage(undefined)
    setNotice(undefined)
    try {
      const response = await startEventExtraction(item.id)
      await detailQuery.refetch()
      if (response.status === 'clarification_needed') {
        setNotice('The server saved an extraction, but clarification is required before investigation.')
      } else if (response.status === 'already_completed') {
        setNotice('The server already has a persisted extraction for this event.')
      } else {
        setNotice('Extraction persisted by the server. Review the fields before investigation.')
      }
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Extraction could not be completed. The source is preserved; retry when the service is available.'))
    } finally {
      setBusyAction(undefined)
    }
  }

  const refreshDetail = async () => {
    setBusyAction('refresh')
    setErrorMessage(undefined)
    try {
      await detailQuery.refetch()
      setNotice('Event detail refreshed from the active scenario.')
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Event detail could not be refreshed.'))
    } finally {
      setBusyAction(undefined)
    }
  }

  const saveCorrection = async () => {
    if (!item?.extraction || item.extractionVersion < 1) return
    const parsedStart = requestedStart.trim() ? Number(requestedStart) : undefined
    if (parsedStart !== undefined && (!Number.isInteger(parsedStart) || parsedStart < 0)) {
      setErrorMessage('Requested start must be a non-negative whole day.')
      return
    }
    const editedItem: EventInboxItem = {
      ...item,
      extraction: {
        ...item.extraction,
        nature,
        cause: cause.trim() || undefined,
        job_ids: jobs.split(',').map((value) => value.trim()).filter(Boolean),
        requested_start: parsedStart,
        missing_info: missingInfo.split(',').map((value) => value.trim()).filter(Boolean),
      },
    }
    setBusyAction('clarify')
    setErrorMessage(undefined)
    try {
      const corrected = await correctEventExtraction(item.id, createCorrectionPayload(editedItem))
      queryClient.setQueryData(apiTransport.queryKey('events', 'detail', eventId), corrected)
      await invalidateDetail()
      setEditing(false)
      setNotice('Correction saved by the server. Review the updated extraction before investigating.')
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Correction was not saved. Refresh the event and retry the current version.'))
    } finally {
      setBusyAction(undefined)
    }
  }

  const startInvestigation = async (retry = false) => {
    if (!item?.extraction || item.extractionVersion < 1 || (item.lifecycle !== 'ready' && !(retry && item.lifecycle === 'failed'))) return
    setBusyAction(retry ? 'retry-run' : 'investigate')
    setErrorMessage(undefined)
    setNotice(undefined)
    try {
      const run = await startEventRun(item.id, retry ? { retry: true, idempotencyKey: `ripple-${item.id}-retry` } : undefined)
      registerRun({ runId: run.runId, eventId: run.eventId, status: runStatus(run.state), startedAt: new Date().toISOString(), scenarioId: apiTransport.scenarioId })
      await invalidateDetail()
      setNotice(`Investigation ${run.runId} is registered on the server. This page will revalidate while it runs.`)
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Investigation could not start. No schedule change was made; retry when safe.'))
    } finally {
      setBusyAction(undefined)
    }
  }

  const action = item ? nextAction(item, latestPlan) : undefined
  const actionBusy = busyAction !== undefined

  if (detailQuery.isPending) return <DetailState title="Loading change detail" message="Fetching the source, persisted extraction, investigation, and plan lineage from the active scenario…" />
  if (detailQuery.isError) return <DetailState title="Change detail could not be loaded" message={formatErrorMessage(detailQuery.error, 'The event may belong to another scenario or the service may be unavailable.')} onRetry={() => { void detailQuery.refetch() }} onBack={onBack} />
  if (!data || !item) return <DetailState title="Change detail unavailable" message="The server did not return a canonical event record." onBack={onBack} />

  return <main className="ds-page">
    <section className="ds-content ds-stack" aria-label="Change event detail">
      <header className="ds-section-header">
        <div className="ds-stack">
          <Button type="button" variant="quiet" size="sm" className="w-fit" onClick={onBack}><ArrowLeft aria-hidden="true" size={15} />Back to change inbox</Button>
          <span className="ds-label">Change event</span>
          <h1 className="ds-heading ds-heading--page">{eventTitle(item)}</h1>
          <p className="ds-copy">One server-backed path from source intake to extraction review, investigation, and decision.</p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted"><Badge variant={toneFor(item)}>{eventLifecycleMeta[item.lifecycle].label}</Badge><span>Event ID <code className="font-mono text-ink">{item.id}</code></span><span>v{item.extractionVersion} extraction</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" onClick={() => { void refreshDetail() }} disabled={actionBusy}><ArrowClockwise aria-hidden="true" size={15} />{busyAction === 'refresh' ? 'Refreshing…' : 'Refresh detail'}</Button></div>
      </header>

      <ProgressRail hasExtraction={hasPersistedExtraction} hasRun={Boolean(latestRun)} hasPlan={Boolean(latestPlan)} />
      {errorMessage ? <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-sm text-ink"><span className="flex items-start gap-2"><WarningCircle aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-danger" />{errorMessage}</span><Button type="button" size="sm" variant="secondary" onClick={() => { void retryCurrentAction(action, item, latestPlan) }} disabled={actionBusy}>Retry</Button></div> : null}
      {detailQuery.pollingTimedOut ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-sm text-ink"><span>The server has not reached a terminal extraction or investigation state within 30 seconds. Polling stopped so the page will not loop forever.</span><Button type="button" size="sm" variant="secondary" onClick={detailQuery.retryPolling} disabled={actionBusy}>Retry status polling</Button></div> : null}
      {notice ? <div role="status" className="rounded-sm border border-info/30 bg-info-subtle p-3 text-sm text-ink">{notice}</div> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
        <div className="grid gap-4">
          <SourceSection item={item} />
          <ExtractionSection item={item} data={data} hasPersistedExtraction={hasPersistedExtraction} editing={editing} nature={nature} cause={cause} jobs={jobs} requestedStart={requestedStart} missingInfo={missingInfo} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onNatureChange={setNature} onCauseChange={setCause} onJobsChange={setJobs} onRequestedStartChange={setRequestedStart} onMissingInfoChange={setMissingInfo} onSave={() => { void saveCorrection() }} onOpenJob={onOpenJob} saving={busyAction === 'clarify'} />
          <InvestigationSection run={latestRun} plan={latestPlan} onOpenPlan={onOpenPlan} />
          <PlanSection item={item} run={latestRun} plan={latestPlan} onOpenPlan={onOpenPlan} />
        </div>
        <aside className="grid h-fit gap-3 lg:sticky lg:top-4" aria-label="Current next action">
          <div className="ds-panel grid gap-3" style={{ padding: 'var(--ds-space-4)' }}>
            <div className="flex items-center gap-2"><Play aria-hidden="true" size={16} className="text-primary" /><h2 className="m-0 text-sm font-bold text-ink">Next action</h2></div>
            <strong className="text-base text-ink">{action?.label ?? 'Review server state'}</strong>
            <p className="m-0 text-xs leading-5 text-muted">{action?.description ?? 'Refresh this detail to confirm the current event lineage.'}</p>
            {action ? <Button type="button" variant="primary" onClick={() => { void runAction(action.kind, item, latestPlan) }} disabled={actionBusy}>{actionBusy ? actionBusyLabel(busyAction) : action.label}</Button> : null}
            {item.lifecycle === 'needs_info' && item.missingInfo.length ? <div className="grid gap-1 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink"><strong>Missing before investigation</strong><span>{item.missingInfo.join(', ')}</span></div> : null}
          </div>
          <div className="ds-panel grid gap-2" style={{ padding: 'var(--ds-space-4)' }}><h2 className="m-0 text-sm font-bold text-ink">Server record</h2><Record label="Scenario" value={apiTransport.scenarioId} /><Record label="Created" value={formatTimestamp(item.createdAt)} /><Record label="Updated" value={formatTimestamp(item.updatedAt)} /><Record label="Origin" value={item.nature ?? 'Unclassified'} /><Button type="button" variant="quiet" size="sm" onClick={() => { void copyText(item.rawTextPreview) }}><Copy aria-hidden="true" size={14} />Copy source</Button></div>
        </aside>
      </section>
    </section>
  </main>

  async function retryCurrentAction(currentAction: ReturnType<typeof nextAction> | undefined, currentItem: EventInboxItem, currentPlan: EventPlanRecord | undefined) {
    if (!currentAction) return
    await runAction(currentAction.kind, currentItem, currentPlan)
  }

  async function runAction(kind: DetailAction, currentItem: EventInboxItem, currentPlan: EventPlanRecord | undefined) {
    if (kind === 'extract') return runExtraction()
    if (kind === 'clarify') return setEditing(true)
    if (kind === 'refresh') return refreshDetail()
    if (kind === 'investigate') return startInvestigation()
    if (kind === 'retry-run') return startInvestigation(true)
    if (kind === 'open-plan' && currentPlan) return onOpenPlan(currentPlan.id, currentItem.runId)
  }
}

function SourceSection({ item }: { item: EventInboxItem }) {
  return <section className="ds-panel grid gap-3" style={{ padding: 'var(--ds-space-4)' }} aria-labelledby="change-source-title"><SectionHeading id="change-source-title" step="1" title="Source" status="Persisted" /><blockquote className="m-0 border-l-2 border-primary bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink">{item.rawTextPreview || 'The server stored no source text for this event.'}</blockquote><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>Received {formatTimestamp(item.createdAt)}</span><span>Last updated {formatTimestamp(item.updatedAt)}</span></div></section>
}

function ExtractionSection({ item, data, hasPersistedExtraction, editing, nature, cause, jobs, requestedStart, missingInfo, onEdit, onCancel, onNatureChange, onCauseChange, onJobsChange, onRequestedStartChange, onMissingInfoChange, onSave, onOpenJob, saving }: { item: EventInboxItem; data: EventDetailData; hasPersistedExtraction: boolean; editing: boolean; nature: EventNature; cause: string; jobs: string; requestedStart: string; missingInfo: string; onEdit: () => void; onCancel: () => void; onNatureChange: (value: EventNature) => void; onCauseChange: (value: string) => void; onJobsChange: (value: string) => void; onRequestedStartChange: (value: string) => void; onMissingInfoChange: (value: string) => void; onSave: () => void; onOpenJob: (jobId: string, requestedDate: number | null) => void; saving: boolean }) {
  const latest = [...data.extractions].sort((left, right) => right.version - left.version)[0]
  return <section className="ds-panel grid gap-3" style={{ padding: 'var(--ds-space-4)' }} aria-labelledby="change-extraction-title"><SectionHeading id="change-extraction-title" step="2" title="Extraction" status={hasPersistedExtraction ? item.lifecycle === 'needs_info' ? 'Needs clarification' : 'Persisted' : 'Not persisted'} /><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>Server extraction version {hasPersistedExtraction ? `v${item.extractionVersion}` : '—'}</span>{latest ? <span>{latest.modelName} · {latest.promptVersion}{latest.corrected ? ' · corrected' : ''}</span> : null}</div>{!hasPersistedExtraction ? <div className="flex gap-2 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-sm text-ink"><Clock aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-warning" /><span>The event has no persisted extraction yet. Structured fields will appear only after the backend returns a saved extraction.</span></div> : editing ? <div className="grid gap-3"><div className="grid gap-1.5"><Label htmlFor="event-nature">Nature</Label><select id="event-nature" className="h-9 rounded-sm border border-border bg-surface px-2.5 text-sm text-ink" value={nature} onChange={(event) => onNatureChange(event.target.value as EventNature)}><option value="request">Request</option><option value="disruption">Disruption</option><option value="opportunity">Opportunity</option></select></div><Field id="event-cause" label="Cause" value={cause} onChange={onCauseChange} /><Field id="event-jobs" label="Job IDs" value={jobs} onChange={onJobsChange} hint="Comma-separated canonical job IDs" /><Field id="event-start" label="Requested start day" value={requestedStart} onChange={onRequestedStartChange} hint="Relative schedule day, for example 6" /><Field id="event-missing" label="Missing information" value={missingInfo} onChange={onMissingInfoChange} hint="Comma-separated items" /><div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3"><Button type="button" variant="quiet" onClick={onCancel}>Cancel edit</Button><Button type="button" variant="primary" onClick={onSave} disabled={saving}>{saving ? 'Saving correction…' : 'Save correction'}</Button></div></div> : <><div className="grid gap-2 sm:grid-cols-2"><Record label="Nature" value={item.extraction?.nature ?? item.nature ?? 'Unclassified'} /><Record label="Cause" value={item.extraction?.cause ?? item.cause ?? 'Not supplied'} /><Record label="Linked jobs" value={item.jobs.length ? item.jobs.join(', ') : 'None resolved'} /><Record label="Requested start" value={item.requestedDate === null ? 'Not specified' : `D+${item.requestedDate}`} /><Record label="Missing information" value={item.missingInfo.length ? item.missingInfo.join(', ') : 'None'} /></div>{item.jobs.length ? <div className="grid gap-2 rounded-sm border border-border bg-surface-subtle p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Timeline handoff</span><div className="flex flex-wrap gap-2">{item.jobs.map((jobId) => <Button key={jobId} type="button" variant="quiet" size="sm" onClick={() => onOpenJob(jobId, item.requestedDate)}>Open {jobId} on Timeline</Button>)}</div></div> : null}<div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Evidence from source</span><span className="text-xs leading-5 text-ink">{item.extraction?.source_excerpt ?? 'No persisted source excerpt.'}</span></div><div className="flex justify-end"><Button type="button" variant="secondary" onClick={onEdit} disabled={!hasPersistedExtraction}><PencilSimple aria-hidden="true" size={15} />Review or correct extraction</Button></div></>}</section>
}

function InvestigationSection({ run, plan, onOpenPlan }: { run?: EventRunRecord; plan?: EventPlanRecord; onOpenPlan: (planId: string, runId?: string) => void }) {
  return <section className="ds-panel grid gap-3" style={{ padding: 'var(--ds-space-4)' }} aria-labelledby="change-investigation-title"><SectionHeading id="change-investigation-title" step="3" title="Investigation" status={run ? humanRunState(run.state) : 'Not started'} />{run ? <div className="grid gap-2 sm:grid-cols-2"><Record label="Run status" value={humanRunState(run.state)} /><Record label="Attempt" value={String(run.attempt)} /><Record label="Started" value={formatTimestamp(run.startedAt)} /><Record label="Run ID" value={run.id} /></div> : <p className="m-0 text-sm leading-6 text-muted">Investigation starts only from a persisted extraction. The event and source remain unchanged until the server registers a run.</p>}{run && plan ? <Button type="button" variant="secondary" className="w-fit" onClick={() => onOpenPlan(plan.id, run.id)}><ArrowSquareOut aria-hidden="true" size={15} />Open investigation run in decision workspace</Button> : null}</section>
}

function PlanSection({ item, run, plan, onOpenPlan }: { item: EventInboxItem; run?: EventRunRecord; plan?: EventPlanRecord; onOpenPlan: (planId: string, runId?: string) => void }) {
  return <section className="ds-panel grid gap-3" style={{ padding: 'var(--ds-space-4)' }} aria-labelledby="change-plan-title"><SectionHeading id="change-plan-title" step="4" title="Plan / decision" status={plan ? humanPlanStatus(plan.status) : run?.state === 'completed' ? 'Awaiting plan' : 'Not started'} />{plan ? <><div className="grid gap-2 sm:grid-cols-2"><Record label="Plan" value={`${plan.verdict} · v${plan.version}`} /><Record label="Decision state" value={humanPlanStatus(plan.status)} /><Record label="Plan ID" value={plan.id} /><Record label="Base schedule" value={`v${plan.baseScheduleVersion}`} /></div><Button type="button" variant="primary" className="w-fit" onClick={() => onOpenPlan(plan.id, item.runId)}><ArrowSquareOut aria-hidden="true" size={15} />Open decision workspace</Button></> : <p className="m-0 text-sm leading-6 text-muted">No persisted plan or decision is linked yet. Approval is unavailable until a server run produces a plan for review.</p>}</section>
}

function ProgressRail({ hasExtraction, hasRun, hasPlan }: { hasExtraction: boolean; hasRun: boolean; hasPlan: boolean }) {
  const stages = [{ label: 'Source', done: true }, { label: 'Extraction', done: hasExtraction, active: !hasExtraction }, { label: 'Investigation', done: hasRun, active: hasExtraction && !hasRun }, { label: 'Plan / decision', done: hasPlan, active: hasRun && !hasPlan }]
  return <ol className="grid gap-2 sm:grid-cols-4" aria-label="Event progression">{stages.map((stage, index) => <li key={stage.label} className={`flex items-center gap-2 rounded-sm border p-3 text-xs ${stage.active ? 'border-primary bg-primary-subtle' : 'border-border bg-surface'}`} aria-current={stage.active ? 'step' : undefined}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface font-mono text-[10px] text-muted">{stage.done ? <CheckCircle aria-hidden="true" size={16} className="text-success" /> : index + 1}</span><span className="font-bold text-ink">{stage.label}</span></li>)}</ol>
}

function SectionHeading({ id, step, title, status }: { id: string; step: string; title: string; status: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-bold text-muted">{step}</span><h2 id={id} className="m-0 text-base font-bold text-ink">{title}</h2></div><Badge variant="default">{status}</Badge></div>
}

function Field({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className="grid gap-1.5 text-xs font-bold text-muted" htmlFor={id}><span>{label}</span><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} /><span className="font-normal text-[10px]">{hint}</span></label>
}

function Record({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="break-words text-xs text-ink">{value}</strong></div>
}

function DetailState({ title, message, onRetry, onBack }: { title: string; message: string; onRetry?: () => void; onBack?: () => void }) {
  return <main className="ds-page"><section className="ds-content"><div className="ds-panel grid gap-3 p-8" role="status"><h1 className="m-0 text-xl font-extrabold text-ink">{title}</h1><p className="m-0 text-sm leading-6 text-muted">{message}</p><div className="flex flex-wrap gap-2">{onBack ? <Button type="button" variant="quiet" onClick={onBack}><ArrowLeft aria-hidden="true" size={15} />Back to inbox</Button> : null}{onRetry ? <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button> : null}</div></div></section></main>
}

function nextAction(item: EventInboxItem, plan?: EventPlanRecord): { kind: DetailAction; label: string; description: string } {
  if (plan && ['options_ready', 'pending_decision', 'approved', 'rejected', 'superseded', 'stale'].includes(item.lifecycle)) return { kind: 'open-plan', label: 'Open decision workspace', description: 'Review the server plan and use its explicit approval, reject, or reply action.' }
  if (item.lifecycle === 'draft' || (item.lifecycle === 'extracting' && !item.extraction)) return { kind: 'extract', label: item.lifecycle === 'draft' ? 'Start extraction' : 'Retry extraction', description: 'Ask the backend to persist a validated extraction for this source.' }
  if (item.lifecycle === 'needs_info') return { kind: 'clarify', label: 'Review missing information', description: 'Correct the persisted extraction in place before starting investigation.' }
  if (item.lifecycle === 'ready') return { kind: 'investigate', label: 'Start investigation', description: 'Register a server run using this persisted extraction. Schedule data is not changed by this action.' }
  if (item.lifecycle === 'running') return { kind: 'refresh', label: 'Refresh investigation status', description: 'The server run is still being resolved; this page also revalidates automatically.' }
  if (item.lifecycle === 'failed') return item.extraction ? { kind: 'retry-run', label: 'Retry investigation', description: 'Retry the failed server run with the same persisted extraction.' } : { kind: 'extract', label: 'Retry extraction', description: 'The source is preserved, but no persisted extraction is available yet.' }
  return { kind: 'refresh', label: 'Refresh event status', description: 'Re-read the server lineage before taking the next valid action.' }
}

function latestRunFor(data: EventDetailData | undefined): EventRunRecord | undefined {
  if (!data?.runs.length) return undefined
  return [...data.runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]
}

function latestPlanFor(data: EventDetailData | undefined): EventPlanRecord | undefined {
  if (!data?.plans.length) return undefined
  return [...data.plans].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
}

function eventTitle(item: EventInboxItem): string {
  return item.cause?.trim() || item.extraction?.objective?.trim() || item.rawTextPreview.split(/[.!?\n]/, 1)[0]?.trim() || 'Untitled operational change'
}

function humanRunState(state: string): string {
  return state.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function humanPlanStatus(status: string): string {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function actionBusyLabel(action?: DetailAction): string {
  if (action === 'extract') return 'Extracting…'
  if (action === 'clarify') return 'Saving…'
  if (action === 'investigate' || action === 'retry-run') return 'Starting…'
  return 'Working…'
}

function toneFor(item: EventInboxItem): 'default' | 'destructive' | 'success' | 'warning' {
  const tone = eventLifecycleMeta[item.lifecycle].tone
  return tone === 'danger' ? 'destructive' : tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'default'
}

function runStatus(state: string): 'queued' | 'streaming' | 'completed' | 'failed' {
  if (state === 'running' || state === 'streaming') return 'streaming'
  if (state === 'completed') return 'completed'
  if (state === 'failed' || state === 'timed_out') return 'failed'
  return 'queued'
}

function formatTimestamp(value: string): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    toast.success('Source copied')
  }
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`
  return error instanceof Error && error.message ? error.message : fallback
}
