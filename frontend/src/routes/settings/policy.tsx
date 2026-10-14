import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { PolicyWorkspace } from '@/components/policy/policy-workspace'
import { Skeleton, toast } from '@/components/ui'
import { usePolicyData } from '@/features/policy/policy-api'
import { toPolicyWorkspaceData } from '@/features/policy/policy-data'
import { policySearchSchema } from '../search-schemas'

export const Route = createFileRoute('/settings/policy')({
  validateSearch: policySearchSchema,
  component: PolicyRoute,
})

function PolicyRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = usePolicyData()
  const data = useMemo(() => query.data ? toPolicyWorkspaceData(query.data) : undefined, [query.data])

  if (query.isPending) return <PolicyState title="Policy and data health" message="Loading policy registry and source health…" />
  if (query.isError || !data) return <PolicyState title="Policy and data health" message={query.error instanceof Error ? query.error.message : 'Policy data could not be loaded.'} onRetry={() => void query.refetch()} />

  const copyPolicyLink = (leverName: string) => {
    const url = `/settings/policy?section=action-registry&lever=${encodeURIComponent(leverName)}`
    void navigator.clipboard?.writeText(`${window.location.origin}${url}`).then(() => toast.success('Policy link copied')).catch(() => toast.error('Could not copy policy link'))
  }

  return <PolicyWorkspace data={data} search={search} onSearchChange={(patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) })} onOpenLever={() => undefined} onExplainApprovalOwner={() => undefined} onCopyPolicyLink={copyPolicyLink} onViewAffectedItems={(sourceName) => navigate({ to: '/readiness', search: { q: sourceName } })} onUsedInDecisions={(leverName) => navigate({ to: '/history', search: { q: leverName } })} />
}

function PolicyState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <main className="ds-page"><section className="ds-content ds-stack"><header className="ds-section-header"><div className="ds-stack"><span className="ds-label">Read-only control plane</span><h1 className="ds-heading ds-heading--page">{title}</h1></div></header><section className="ds-panel ds-stack" aria-live="polite" style={{ padding: 'var(--ds-space-4)' }}>{onRetry ? <><p className="m-0 text-sm text-danger">{message}</p><button type="button" className="w-fit rounded-sm border border-border px-3 py-2 text-xs font-bold text-ink hover:bg-surface-subtle" onClick={onRetry}>Retry</button></> : <><Skeleton className="h-5 w-56" /><span className="text-sm text-muted">{message}</span></>}</section></section></main>
}
