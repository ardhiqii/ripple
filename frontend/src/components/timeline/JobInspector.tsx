import { CalendarBlank, ChatCircleDots, ClipboardText, Copy, Sparkle, Wrench } from '@phosphor-icons/react'

import { Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, toast } from '@/components/ui'
import { vendorForTone } from '@/features/schedule/fixture-adapter'
import type { TimelineJob, TimelineRange, TimelineResource } from '@/features/schedule/types'

export interface JobInspectorContext {
  route: '/timeline'
  jobId: string
  resourceId: string
  resourceName: string
  startDay: number
  endDay: number
  dateRange: TimelineRange
  scheduleVersion: number
  decisionId?: string
}

export interface RippleJobContext {
  route: string
  jobIds: [string]
  resourceIds: [string]
  scheduleVersion: number
  dates: { startDay: number; endDay: number }
}

interface JobInspectorProps {
  job: TimelineJob
  resource: TimelineResource
  range: TimelineRange
  scheduleVersion: number
  decisionId?: string
  onClose: () => void
  onOpenReadiness?: (context: JobInspectorContext) => void
  onViewDecision?: (context: JobInspectorContext) => void
}

export function JobInspector({ job, resource, range, scheduleVersion, decisionId, onClose, onOpenReadiness, onViewDecision }: JobInspectorProps) {
  const context: JobInspectorContext = {
    route: '/timeline',
    jobId: job.id,
    resourceId: resource.id,
    resourceName: resource.name,
    startDay: job.start,
    endDay: job.start + job.span - 1,
    dateRange: range,
    scheduleVersion,
    decisionId,
  }

  const closeAndRestoreFocus = () => {
    onClose()
    queueMicrotask(() => {
      const selectedBlock = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-job-id]')).find((element) => element.dataset.jobId === job.id)
      selectedBlock?.focus()
    })
  }

  const emitRippleContext = (mode: 'ask' | 'submit') => {
    const rippleContext: RippleJobContext = {
      route: window.location.pathname,
      jobIds: [job.id],
      resourceIds: [resource.id],
      scheduleVersion,
      dates: { startDay: job.start, endDay: job.start + job.span - 1 },
    }
    window.dispatchEvent(new CustomEvent('ripple:open', { detail: { mode, context: rippleContext } }))
  }

  const copyLink = async () => {
    const href = window.location.href
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(href)
    toast.success('Timeline link copied', { description: 'The selected job context is in the URL.' })
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) closeAndRestoreFocus() }}>
      <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4 pr-8">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary"><Sparkle aria-hidden="true" size={14} weight="fill" />Job inspector</span>
          <SheetTitle>{job.id} · {job.label}</SheetTitle>
          <SheetDescription>{resource.name} ({resource.code}) · {vendorForTone(job.tone)}</SheetDescription>
        </SheetHeader>

        <div className="grid gap-3" aria-label="Selected job context">
          <div className="grid grid-cols-2 gap-2">
            <ContextItem icon={<CalendarBlank aria-hidden="true" />} label="Schedule window" value={`D+${context.startDay} – D+${context.endDay}`} />
            <ContextItem icon={<Wrench aria-hidden="true" />} label="Resource" value={resource.name} />
            <ContextItem icon={<ClipboardText aria-hidden="true" />} label="Schedule version" value={`v${scheduleVersion}`} />
            <ContextItem icon={<Sparkle aria-hidden="true" />} label="Status" value={statusLabel(job.status)} />
          </div>
          {job.risk ? <p className="m-0 rounded-sm border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-ink">Readiness risk is attached to this activity. Open Readiness to review its chain.</p> : null}
        </div>

        <div className="grid gap-2 border-t border-border pt-4">
          <span className="text-xs font-bold text-ink">Next actions</span>
          {onOpenReadiness ? <Button type="button" variant="secondary" onClick={() => onOpenReadiness(context)}>Open readiness</Button> : null}
          <Button type="button" variant="secondary" onClick={() => emitRippleContext('ask')}><ChatCircleDots aria-hidden="true" size={16} />Ask Ripple</Button>
          <Button type="button" variant="primary" onClick={() => emitRippleContext('submit')}><Sparkle aria-hidden="true" size={16} weight="fill" />Submit change</Button>
          {decisionId && onViewDecision ? <Button type="button" variant="secondary" onClick={() => onViewDecision(context)}>View decision</Button> : null}
          <Button type="button" variant="quiet" onClick={copyLink}><Copy aria-hidden="true" size={16} />Copy link</Button>
        </div>

        <SheetFooter className="border-t border-border pt-4">
          <Button type="button" variant="quiet" onClick={closeAndRestoreFocus} aria-label="Close inspector">Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ContextItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-2"><span className="flex items-center gap-1 text-[10px] font-bold text-muted">{icon}{label}</span><strong className="truncate text-xs text-ink">{value}</strong></div>
}

function statusLabel(status: TimelineJob['status']): string {
  if (status === 'progress') return 'In progress'
  if (status === 'complete') return 'Complete'
  if (status === 'hold') return 'Weather hold'
  return 'Planned'
}
