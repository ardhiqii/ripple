import { useEffect, useState } from 'react'
import { ArrowSquareOut, Copy, Info, LockSimple } from '@phosphor-icons/react'

import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui'
import {
  isPolicySection,
  policySections,
  type DataSourceHealthView,
  type PolicyLeverView,
  type PolicySectionId,
  type PolicySearchState,
  type PolicyWorkspaceData,
  type WeightProfileView,
} from '@/features/policy/policy-data'

export interface PolicyWorkspaceProps {
  data: PolicyWorkspaceData
  search: PolicySearchState
  onSearchChange: (patch: Partial<PolicySearchState>) => void
  onOpenLever?: (leverName: string) => void
  onExplainApprovalOwner?: (approvalOwner: string | null) => void
  onCopyPolicyLink: (leverName: string) => void
  onViewAffectedItems: (sourceName: string) => void
  onUsedInDecisions?: (leverName: string) => void
}

const sectionHeading = 'scroll-mt-6 border-b border-border pb-3 text-sm font-extrabold uppercase tracking-wider text-ink'
const neutralLock = 'border-border bg-surface-subtle text-muted'

export function PolicyWorkspace({
  data,
  search,
  onSearchChange,
  onOpenLever,
  onExplainApprovalOwner,
  onCopyPolicyLink,
  onViewAffectedItems,
  onUsedInDecisions,
}: PolicyWorkspaceProps) {
  const [selectedLever, setSelectedLever] = useState<PolicyLeverView | null>(null)
  const [selectedOwner, setSelectedOwner] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!search.lever) return
    const lever = data.levers.find((item) => item.name === search.lever)
    if (lever) setSelectedLever(lever)
  }, [data.levers, search.lever])

  useEffect(() => {
    if (!isPolicySection(search.section)) return
    const target = document.getElementById(`policy-section-${search.section}`)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    target?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
  }, [search.section])

  const openLever = (lever: PolicyLeverView) => {
    setSelectedLever(lever)
    onSearchChange({ section: 'action-registry', lever: lever.name })
    onOpenLever?.(lever.name)
  }

  const closeLever = () => {
    setSelectedLever(null)
    onSearchChange({ lever: undefined })
  }

  const explainOwner = (approvalOwner: string | null) => {
    setSelectedOwner(approvalOwner)
    onExplainApprovalOwner?.(approvalOwner)
  }

  const closeOwner = () => setSelectedOwner(undefined)

  return (
    <main className="ds-page">
      <section className="ds-content ds-stack" aria-label="Policy and data health workspace">
        <header className="ds-section-header">
          <div className="ds-stack">
            <span className="ds-label">Read-only control plane</span>
            <h1 className="ds-heading ds-heading--page">Policy and data health</h1>
            <p className="ds-copy">Inspect the action registry, solver profiles, and source freshness without changing policy or integrations.</p>
          </div>
          <Badge variant="info">Read only</Badge>
        </header>

        <nav className="ds-panel flex flex-wrap gap-1.5" aria-label="Policy sections" style={{ padding: 'var(--ds-space-2)' }}>
          {policySections.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-current={search.section === section.id ? 'page' : undefined}
              className={`rounded-sm border px-2.5 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-focus ${search.section === section.id ? 'border-primary bg-primary-subtle text-primary' : 'border-transparent text-muted hover:border-border hover:bg-surface-subtle hover:text-ink'}`}
              onClick={() => onSearchChange({ section: section.id })}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <section id="policy-section-action-registry" tabIndex={-1} className="ds-panel ds-stack" aria-labelledby="policy-heading-action-registry" style={{ padding: 'var(--ds-space-4)' }}>
          <SectionHeader id="policy-heading-action-registry" title="Action registry" description="Policy decides which actions the agent may expose to the solver." />
          <ActionRegistryTable data={data.levers} highlightedLever={search.lever} onOpenLever={openLever} onExplainApprovalOwner={explainOwner} onCopyPolicyLink={onCopyPolicyLink} onUsedInDecisions={onUsedInDecisions} />
        </section>

        <section id="policy-section-weight-profiles" tabIndex={-1} className="ds-panel ds-stack" aria-labelledby="policy-heading-weight-profiles" style={{ padding: 'var(--ds-space-4)' }}>
          <SectionHeader id="policy-heading-weight-profiles" title="Weight profiles" description="Configured objective weights are displayed as supplied by the policy API." />
          <WeightProfiles profiles={data.profiles} />
        </section>

        <section id="policy-section-risk-rules" tabIndex={-1} className="ds-panel ds-stack" aria-labelledby="policy-heading-risk-rules" style={{ padding: 'var(--ds-space-4)' }}>
          <SectionHeader id="policy-heading-risk-rules" title="Risk rules" description="Risk rules are part of the policy boundary, not a local editing surface." />
          <ContractNotice title="Risk-rule details are not supplied" detail="The current generated OpenAPI policy responses do not include risk-rule rows. No inferred rules or admin controls are shown." />
        </section>

        <section id="policy-section-freshness-policy" tabIndex={-1} className="ds-panel ds-stack" aria-labelledby="policy-heading-freshness-policy" style={{ padding: 'var(--ds-space-4)' }}>
          <SectionHeader id="policy-heading-freshness-policy" title="Freshness policy" description="Source health is evaluated against the stale threshold returned by the policy service." />
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoCard label="Stale after" value={data.freshnessPolicy.staleAfterHours === null ? 'Not supplied' : `${data.freshnessPolicy.staleAfterHours} hours`} />
            <InfoCard label="Policy snapshot" value={formatDate(data.freshnessPolicy.asOf)} />
          </div>
        </section>

        <section id="policy-section-data-sources" tabIndex={-1} className="ds-panel ds-stack" aria-labelledby="policy-heading-data-sources" style={{ padding: 'var(--ds-space-4)' }}>
          <SectionHeader id="policy-heading-data-sources" title="Data sources" description="Freshness and affected-item counts are read-only health signals." />
          <DataSourceTable data={data.sources} highlightedSource={search.source} onViewAffectedItems={(source) => { onSearchChange({ section: 'data-sources', source }); onViewAffectedItems(source) }} />
        </section>

        <section id="policy-section-scenario-assumptions" tabIndex={-1} className="ds-panel ds-stack" aria-labelledby="policy-heading-scenario-assumptions" style={{ padding: 'var(--ds-space-4)' }}>
          <SectionHeader id="policy-heading-scenario-assumptions" title="Scenario assumptions" description="Assumptions remain visible as policy context and are not editable in this MVP view." />
          <ContractNotice title="Scenario assumptions are not supplied" detail="The current generated OpenAPI policy responses do not include scenario-assumption rows. Nothing is fabricated in their place." />
        </section>
      </section>

      <Sheet open={Boolean(selectedLever)} onOpenChange={(open) => { if (!open) closeLever() }}>
        <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-lg">
          {selectedLever ? <LeverDefinition lever={selectedLever} onExplainApprovalOwner={explainOwner} onClose={closeLever} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={selectedOwner !== undefined} onOpenChange={(open) => { if (!open) closeOwner() }}>
        <SheetContent side="right" className="w-full gap-5 sm:max-w-md">
          {selectedOwner !== undefined ? <ApprovalOwnerExplanation approvalOwner={selectedOwner} onClose={closeOwner} /> : null}
        </SheetContent>
      </Sheet>
    </main>
  )
}

function SectionHeader({ id, title, description }: { id: string; title: string; description: string }) {
  return <header className="grid gap-1"><h2 id={id} className={sectionHeading}>{title}</h2><p className="m-0 max-w-3xl text-xs leading-relaxed text-muted">{description}</p></header>
}

function ActionRegistryTable({ data, highlightedLever, onOpenLever, onExplainApprovalOwner, onCopyPolicyLink, onUsedInDecisions }: { data: PolicyLeverView[]; highlightedLever?: string; onOpenLever: (lever: PolicyLeverView) => void; onExplainApprovalOwner: (approvalOwner: string | null) => void; onCopyPolicyLink: (leverName: string) => void; onUsedInDecisions?: (leverName: string) => void }) {
  if (!data.length) return <EmptyState text="No action registry entries were supplied." />
  return <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-xs"><caption className="sr-only">Read-only action registry</caption><thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-3 font-bold">Action</th><th className="px-3 py-3 font-bold">Policy state</th><th className="px-3 py-3 font-bold">Approval owner</th><th className="px-3 py-3 font-bold">Cost weight</th><th className="px-3 py-3 font-bold">Read-only links</th></tr></thead><tbody>{data.map((lever) => <tr key={lever.name} className={`border-b border-border align-top ${highlightedLever === lever.name ? 'bg-primary-subtle/40' : ''}`}><td className="px-3 py-3"><Button type="button" variant="quiet" size="sm" className="px-0 text-left text-primary underline-offset-2 hover:underline" onClick={() => onOpenLever(lever)}>{lever.name}</Button></td><td className="px-3 py-3">{lever.allowed ? <Badge variant="success">Allowed</Badge> : <Badge className={neutralLock}><LockSimple aria-hidden="true" size={13} /> Forbidden</Badge>}</td><td className="px-3 py-3">{lever.approvalOwner ? <Button type="button" variant="quiet" size="sm" className="px-0 text-left text-primary underline-offset-2 hover:underline" onClick={() => onExplainApprovalOwner(lever.approvalOwner)}>{lever.approvalOwner}</Button> : <span className="text-muted">Not supplied</span>}</td><td className="px-3 py-3 font-mono text-ink">{lever.costWeight}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-1.5"><Button type="button" variant="quiet" size="sm" onClick={() => onCopyPolicyLink(lever.name)}><Copy aria-hidden="true" size={14} /> Copy policy link</Button>{onUsedInDecisions ? <Button type="button" variant="quiet" size="sm" onClick={() => onUsedInDecisions(lever.name)}><ArrowSquareOut aria-hidden="true" size={14} /> Used in decisions</Button> : null}</div></td></tr>)}</tbody></table></div>
}

function WeightProfiles({ profiles }: { profiles: WeightProfileView[] }) {
  if (!profiles.length) return <EmptyState text="No weight profiles were supplied." />
  return <div className="grid gap-2 md:grid-cols-2">{profiles.map((profile) => <article key={profile.name} className="rounded-sm border border-border bg-surface-subtle p-3"><div className="flex items-center justify-between gap-2"><h3 className="m-0 text-sm font-bold text-ink">{profile.name}</h3>{profile.isDefault ? <Badge variant="primary">Default</Badge> : null}</div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><Metric label="Delay" value={profile.delayWeight} /><Metric label="Lever cost" value={profile.leverCostWeight} /><Metric label="Movement" value={profile.movementWeight} /><Metric label="Risk" value={profile.riskWeight} /></dl></article>)}</div>
}

function DataSourceTable({ data, highlightedSource, onViewAffectedItems }: { data: DataSourceHealthView[]; highlightedSource?: string; onViewAffectedItems: (sourceName: string) => void }) {
  if (!data.length) return <EmptyState text="No data sources were supplied." />
  return <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-xs"><caption className="sr-only">Data source health</caption><thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-3 font-bold">Source name</th><th className="px-3 py-3 font-bold">Last successful update</th><th className="px-3 py-3 font-bold">Freshness</th><th className="px-3 py-3 font-bold">Affected count</th><th className="px-3 py-3 font-bold">Latest error</th><th className="px-3 py-3 font-bold">Action</th></tr></thead><tbody>{data.map((source) => <tr key={source.name} className={`border-b border-border align-top ${highlightedSource === source.name ? 'bg-primary-subtle/40' : ''}`}><td className="px-3 py-3 font-bold text-ink">{source.name}</td><td className="px-3 py-3 text-muted">{formatDate(source.lastSuccessfulUpdate)}</td><td className="px-3 py-3"><FreshnessBadge state={source.freshnessState} /></td><td className="px-3 py-3 font-mono text-ink">{source.affectedCount ?? 'Not supplied'}</td><td className="max-w-xs px-3 py-3 text-muted">{source.latestError ?? 'Not supplied'}</td><td className="px-3 py-3"><Button type="button" variant="quiet" size="sm" disabled={source.affectedCount === null || source.affectedCount === 0} onClick={() => onViewAffectedItems(source.name)}><ArrowSquareOut aria-hidden="true" size={14} /> View affected items</Button></td></tr>)}</tbody></table></div>
}

function LeverDefinition({ lever, onExplainApprovalOwner, onClose }: { lever: PolicyLeverView; onExplainApprovalOwner: (approvalOwner: string | null) => void; onClose: () => void }) {
  return <><SheetHeader className="border-b border-border pb-4 pr-8"><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Action definition</span><SheetTitle>{lever.name}</SheetTitle><SheetDescription>This definition is read-only and comes from the generated policy response.</SheetDescription></SheetHeader><div className="grid gap-2 text-xs"><InfoCard label="Policy state" value={lever.allowed ? 'Allowed' : 'Forbidden'} /><InfoCard label="Cost weight" value={lever.costWeight} /><InfoCard label="Approval owner" value={lever.approvalOwner ?? 'Not supplied'} /></div><div className={`rounded-sm border p-3 text-xs ${lever.allowed ? 'border-info/30 bg-info-subtle text-info' : `${neutralLock}`}`}>{lever.allowed ? 'This action may be considered by the controlled planning workflow.' : 'This action is closed by policy. The lock is a neutral policy constraint, not a system failure.'}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => onExplainApprovalOwner(lever.approvalOwner)}>Explain approval owner</Button></div><SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={onClose}>Close</Button></SheetFooter></>
}

function ApprovalOwnerExplanation({ approvalOwner, onClose }: { approvalOwner: string | null; onClose: () => void }) {
  const owner = approvalOwner ?? 'No owner supplied'
  const explanation = approvalOwner ? `${approvalOwner} is the approval owner named by policy. This view explains the requirement but does not expose administration or role-editing controls.` : 'The policy response did not supply an approval owner for this action.'
  return <><SheetHeader className="border-b border-border pb-4 pr-8"><span className="text-[10px] font-bold uppercase tracking-wider text-primary">Policy explanation</span><SheetTitle>Approval owner</SheetTitle><SheetDescription>{owner}</SheetDescription></SheetHeader><p className="m-0 text-sm leading-relaxed text-muted">{explanation}</p><SheetFooter className="border-t border-border pt-4"><Button type="button" variant="quiet" onClick={onClose}>Close</Button></SheetFooter></>
}

function ContractNotice({ title, detail }: { title: string; detail: string }) { return <div className="flex gap-2 rounded-sm border border-border bg-surface-subtle p-3 text-xs text-muted"><Info aria-hidden="true" className="mt-0.5 shrink-0 text-info" size={16} /><div><strong className="block text-ink">{title}</strong><span className="mt-1 block leading-relaxed">{detail}</span></div></div> }

function InfoCard({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 rounded-sm border border-border bg-surface-subtle p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="text-ink">{value}</strong></div> }

function Metric({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 rounded-sm border border-border bg-surface p-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</dt><dd className="m-0 font-mono text-ink">{value}</dd></div> }

function FreshnessBadge({ state }: { state: DataSourceHealthView['freshnessState'] }) { return <Badge variant={state === 'fresh' ? 'success' : state === 'stale' ? 'warning' : 'default'}>{state === 'fresh' ? 'Fresh' : state === 'stale' ? 'Stale' : 'Unknown'}</Badge> }

function EmptyState({ text }: { text: string }) { return <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted">{text}</div> }

function formatDate(value: string | null): string { if (!value) return 'Not supplied'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString() }

export type { PolicySectionId }
