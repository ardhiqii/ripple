import { useState } from 'react'
import { ArrowClockwise, GitDiff, Info, Play, Sparkle, WarningCircle } from '@phosphor-icons/react'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton } from '@/components/ui'
import type { DemoComparisonFixture, DemoMode, DemoScenarioId, DemoScenarioMetadata } from '@/features/demo/demo-data'
import type { RecordedDemoFixture } from '@/features/demo/demo-recorded'

export interface DemoLabProps {
  scenarios: readonly DemoScenarioMetadata[]
  selectedScenarioId: DemoScenarioId
  mode: DemoMode
  comparison: DemoComparisonFixture
  recordedFixture?: RecordedDemoFixture
  runPending?: 'live' | 'recorded' | null
  resetPending?: boolean
  error?: string | null
  onSelectScenario: (scenarioId: DemoScenarioId) => void
  onRunScenario: (scenarioId: DemoScenarioId) => void
  onRunRecorded: (scenarioId: DemoScenarioId) => void
  onComparePair: () => void
  onReset: () => void | Promise<void>
  onRetry?: () => void
}

export function DemoLab({ scenarios, selectedScenarioId, mode, comparison, recordedFixture, runPending = null, resetPending = false, error = null, onSelectScenario, onRunScenario, onRunRecorded, onComparePair, onReset, onRetry }: DemoLabProps) {
  const [previewScenario, setPreviewScenario] = useState<DemoScenarioMetadata | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const selected = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0]

  return <main className="ds-page">
    <section className="ds-content ds-stack" aria-label="Demo lab">
      <header className="ds-section-header"><div className="ds-stack"><span className="ds-label">Recorded operations lab</span><h1 className="ds-heading ds-heading--page">Demo Lab</h1><p className="ds-copy">Run the core A-12 paths without typing, then inspect how one readiness constraint changes the verified plan.</p></div><Badge variant={mode === 'live' ? 'warning' : 'info'}>{mode} mode</Badge></header>

      {error ? <div className="flex items-start gap-2 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-sm text-danger" role="alert"><WarningCircle aria-hidden="true" size={17} /><span className="flex-1">{error}</span>{onRetry ? <Button type="button" size="sm" variant="secondary" onClick={onRetry}>Retry</Button> : null}</div> : null}

      <section className="grid gap-3 md:grid-cols-2" aria-label="Demo scenarios">{scenarios.map((scenario) => <ScenarioCard key={scenario.id} scenario={scenario} selected={scenario.id === selected?.id} running={runPending !== null && scenario.id === selectedScenarioId} runPending={runPending} onSelect={() => onSelectScenario(scenario.id)} onPreview={() => setPreviewScenario(scenario)} onRun={() => onRunScenario(scenario.id)} onRunRecorded={() => onRunRecorded(scenario.id)} />)}</section>

      <section className="ds-panel grid gap-3" aria-label="Demo controls" style={{ padding: 'var(--ds-space-4)' }}><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-wider text-muted">A-12 paired learning path</span><h2 className="m-0 mt-1 text-lg font-extrabold text-ink">Compare base request and constrained request</h2><p className="m-0 mt-1 max-w-2xl text-xs leading-relaxed text-muted">Both sides share the same seeded schedule. The right side adds one vendor sentence that removes the expedite path.</p></div><GitDiff aria-hidden="true" size={24} className="text-primary" /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="max-[700px]:min-h-11" onClick={() => { onComparePair(); setComparisonOpen(true) }}><GitDiff aria-hidden="true" size={16} />Compare A-12 pair</Button><Button type="button" variant="destructive" className="max-[700px]:min-h-11" onClick={() => setResetOpen(true)} disabled={resetPending} loading={resetPending}><ArrowClockwise aria-hidden="true" size={16} />Reset all demo data</Button></div></section>

      {recordedFixture ? <RecordedTrace fixture={recordedFixture} /> : <section className="ds-panel grid gap-2" aria-label="Recorded mode status" style={{ padding: 'var(--ds-space-4)' }}><div className="flex items-center gap-2 text-sm font-bold text-ink"><Sparkle aria-hidden="true" size={16} className="text-primary" />Choose Run recorded to load the recorded public trace.</div><p className="m-0 text-xs text-muted">The recorded path reuses the production event, run, trace, and plan routes.</p></section>}
    </section>

    <PreviewDialog scenario={previewScenario} onOpenChange={(open) => { if (!open) setPreviewScenario(null) }} />
    <ComparisonDialog open={comparisonOpen} comparison={comparison} onOpenChange={setComparisonOpen} />
    <AlertDialog open={resetOpen} onOpenChange={(open) => { if (!resetPending) setResetOpen(open) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset all demo data?</AlertDialogTitle><AlertDialogDescription>This restores the prototype schedule, readiness, events, plans, and decisions to the selected seed. Current local demo state and active runs will be cleared after a successful reset.</AlertDialogDescription></AlertDialogHeader><div className="flex gap-2 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs text-ink"><Info aria-hidden="true" size={16} className="mt-0.5 shrink-0" /><span>Reset is destructive and only available for the synthetic demo scenario.</span></div><AlertDialogFooter><AlertDialogCancel disabled={resetPending}>Keep current state</AlertDialogCancel><AlertDialogAction disabled={resetPending} onClick={(event) => { event.preventDefault(); void Promise.resolve(onReset()).then(() => setResetOpen(false)).catch(() => undefined) }}>{resetPending ? 'Resetting demo…' : 'Reset all demo data'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>
}

function ScenarioCard({ scenario, selected, running, runPending, onSelect, onPreview, onRun, onRunRecorded }: { scenario: DemoScenarioMetadata; selected: boolean; running: boolean; runPending: DemoLabProps['runPending']; onSelect: () => void; onPreview: () => void; onRun: () => void; onRunRecorded: () => void }) {
  return <article className={`grid gap-3 rounded-sm border p-4 ${selected ? 'border-primary bg-primary-subtle/20' : 'border-border bg-surface'}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-base font-extrabold text-ink">{scenario.name}</h2>{selected ? <Badge variant="primary">Selected</Badge> : null}</div><p className="m-0 mt-1 text-xs leading-relaxed text-muted">{scenario.description}</p></div><span className="font-mono text-[10px] text-muted">{scenario.seedVersion}</span></div><div className="rounded-sm border border-border bg-surface-subtle p-3 text-xs text-ink"><span className="font-bold uppercase tracking-wider text-muted">Message</span><p className="m-0 mt-1 leading-relaxed">{scenario.message}</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" className="max-[700px]:min-h-11" variant={selected ? 'primary' : 'secondary'} onClick={onSelect}>{selected ? 'Selected scenario' : 'Select scenario'}</Button><Button type="button" size="sm" className="max-[700px]:min-h-11" variant="quiet" onClick={onPreview}>Preview scenario</Button><Button type="button" size="sm" className="max-[700px]:min-h-11" variant="secondary" onClick={onRun} disabled={running} loading={running && runPending === 'live'}><Play aria-hidden="true" size={14} />Run scenario</Button><Button type="button" size="sm" className="max-[700px]:min-h-11" variant="quiet" onClick={onRunRecorded} disabled={running} loading={running && runPending === 'recorded'}><Sparkle aria-hidden="true" size={14} />Run recorded</Button></div></article>
}

function PreviewDialog({ scenario, onOpenChange }: { scenario: DemoScenarioMetadata | null; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={Boolean(scenario)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Preview scenario</DialogTitle><DialogDescription>{scenario?.name}</DialogDescription></DialogHeader>{scenario ? <div className="grid gap-3 text-sm"><InfoCard label="Learning goal" value={scenario.preview.learningGoal} /><InfoCard label="Source" value={scenario.preview.source} /><section className="grid gap-2"><h3 className="m-0 text-xs font-bold uppercase tracking-wider text-muted">Expected path</h3><ol className="m-0 grid gap-1 pl-5 text-xs text-ink">{scenario.preview.expectedPath.map((step) => <li key={step}>{step}</li>)}</ol></section><InfoCard label="Reset impact" value={scenario.preview.resetImpact} /></div> : <Skeleton className="h-24 w-full" />}<DialogFooter><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close preview</Button></DialogFooter></DialogContent></Dialog>
}

function ComparisonDialog({ open, comparison, onOpenChange }: { open: boolean; comparison: DemoComparisonFixture; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>A-12 pair comparison</DialogTitle><DialogDescription>Same seeded context, one added test-bay constraint.</DialogDescription></DialogHeader><div className="overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left text-xs"><caption className="sr-only">A-12 base and constrained request comparison</caption><thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted"><tr><th scope="col" className="px-2 py-2">Layer</th><th scope="col" className="px-2 py-2">Base request</th><th scope="col" className="px-2 py-2">Constrained request</th><th scope="col" className="px-2 py-2">Difference</th></tr></thead><tbody>{comparison.diffs.map((diff) => <tr key={`${diff.layer}-${diff.label}`} className="border-b border-border align-top"><th scope="row" className="px-2 py-2 text-ink">{diff.label}</th><td className="px-2 py-2 text-ink">{formatComparisonValue(diff.base)}</td><td className="px-2 py-2 text-ink">{formatComparisonValue(diff.constrained)}</td><td className="px-2 py-2">{diff.changed ? <Badge variant="warning">Changed</Badge> : <Badge variant="default">Same</Badge>}</td></tr>)}</tbody></table></div><DialogFooter><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close comparison</Button></DialogFooter></DialogContent></Dialog>
}

function RecordedTrace({ fixture }: { fixture: RecordedDemoFixture }) {
  return <section className="ds-panel grid gap-3" aria-label="Recorded public trace" style={{ padding: 'var(--ds-space-4)' }}><div className="flex items-center justify-between gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Recorded mode</span><h2 className="m-0 mt-1 text-base font-extrabold text-ink">Public run trace</h2></div><Badge variant="success">No typing required</Badge></div><ol className="m-0 grid list-none gap-2 p-0">{fixture.events.map((event) => <li key={String(event.seq)} className="grid gap-1 border-l-2 border-border pl-3 text-xs"><span className="font-mono text-[10px] text-muted">#{String(event.seq)} · {String(event.phase ?? 'step')}</span><span className="text-ink">{readSummary(event.public) ?? String(event.type)}</span></li>)}</ol></section>
}

function InfoCard({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><span className="text-xs leading-relaxed text-ink">{value}</span></div> }
function formatComparisonValue(value: string | readonly string[]): string { return typeof value === 'string' ? value : value.length ? value.join(', ') : 'None' }
function readSummary(value: unknown): string | null { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; const summary = (value as Record<string, unknown>).summary; return typeof summary === 'string' ? summary : null }
