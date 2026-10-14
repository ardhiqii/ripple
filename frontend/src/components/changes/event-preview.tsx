import { ArrowSquareOut, Clock, Copy, PencilSimple, WarningCircle } from '@phosphor-icons/react'

import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, toast } from '@/components/ui'
import { eventLifecycleMeta, type EventInboxItem } from '@/features/events/events-data'

interface EventPreviewProps {
  item?: EventInboxItem
  onClose: () => void
  onPrimaryAction: (item: EventInboxItem) => void
  onEditExtraction: (item: EventInboxItem) => void
  onOpenPlan: (item: EventInboxItem) => void
}

export function EventPreview({ item, onClose, onPrimaryAction, onEditExtraction, onOpenPlan }: EventPreviewProps) {
  const meta = item ? eventLifecycleMeta[item.lifecycle] : undefined
  const copySource = async () => {
    if (!item) return
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(item.rawTextPreview)
    toast.success('Source preview copied')
  }

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-lg">
        {item && meta ? <>
          <SheetHeader className="border-b border-border pb-4 pr-8">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Event preview</span>
            <SheetTitle>{item.id}</SheetTitle>
            <SheetDescription>{meta.label} · {item.nature} · updated {item.updatedAt}</SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-2 gap-2 text-xs" aria-label="Event summary">
            <Info label="Lifecycle" value={meta.label} />
            <Info label="Nature" value={item.nature} />
            <Info label="Extraction" value={`v${item.extractionVersion}`} />
            <Info label="Jobs" value={item.jobs.length ? item.jobs.join(', ') : 'None linked'} />
          </div>

          <section className="grid gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3"><h3 className="m-0 text-sm font-bold text-ink">Source preview</h3><Button type="button" variant="quiet" onClick={copySource}><Copy aria-hidden="true" size={15} />Copy</Button></div>
            <blockquote className="m-0 border-l-2 border-primary bg-surface-subtle px-3 py-2 text-sm leading-relaxed text-ink">{item.rawTextPreview}</blockquote>
            <p className="m-0 flex items-center gap-1 text-xs text-muted"><Clock aria-hidden="true" size={14} />Created {item.createdAt}</p>
          </section>

          <section className="grid gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3"><h3 className="m-0 text-sm font-bold text-ink">Extraction</h3><Badge variant={item.lifecycle === 'failed' ? 'destructive' : 'success'}>{item.lifecycle === 'failed' ? 'Not available' : 'Structured'}</Badge></div>
            {item.lifecycle === 'failed' ? <p className="m-0 flex gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-xs text-ink"><WarningCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-danger" />Extraction failed. Retry extraction before this event can enter plan review.</p> : <>
              <Info label="Nature" value={String(item.extraction?.nature ?? item.nature)} />
              <Info label="Cause" value={String(item.extraction?.cause ?? item.cause)} />
              <Info label="Requested start" value={String(item.extraction?.requested_start ?? item.requestedDate ?? 'Not specified')} />
              <Info label="Missing information" value={item.missingInfo.length ? item.missingInfo.join(', ') : 'None'} />
              {item.sourceSentences.length ? <div className="grid gap-1"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Source sentences</span>{item.sourceSentences.map((sentence) => <p key={sentence} className="m-0 border-l border-border pl-2 text-xs text-muted">{sentence}</p>)}</div> : null}
            </>}
          </section>

          <SheetFooter className="border-t border-border pt-4">
            <Button type="button" variant="quiet" onClick={onClose}>Close</Button>
            {item.lifecycle !== 'failed' ? <Button type="button" variant="secondary" onClick={() => onEditExtraction(item)}><PencilSimple aria-hidden="true" size={15} />Edit extraction</Button> : null}
            {item.planId ? <Button type="button" variant="secondary" onClick={() => onOpenPlan(item)}><ArrowSquareOut aria-hidden="true" size={15} />Open plan</Button> : null}
            <Button type="button" variant="primary" onClick={() => onPrimaryAction(item)}>{meta.primaryAction}</Button>
          </SheetFooter>
        </> : null}
      </SheetContent>
    </Sheet>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="break-words text-xs text-ink">{value}</strong></div>
}
