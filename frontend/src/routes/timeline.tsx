import { createFileRoute } from '@tanstack/react-router'

import App from '@/App'
import type { JobInspectorContext } from '@/components/timeline/JobInspector'
import { timelineSearchSchema } from './search-schemas'

export const Route = createFileRoute('/timeline')({
  validateSearch: timelineSearchSchema,
  component: TimelineRoute,
})

function TimelineRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const openReadiness = (context: JobInspectorContext) => navigate({ to: '/readiness', search: { job: context.jobId } })
  const viewDecision = (context: JobInspectorContext) => {
    if (!context.decisionId) return
    return navigate({ to: '/decisions/$planId', params: { planId: context.decisionId }, search: {} })
  }

  return <App search={search} onSearchChange={(patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) })} onOpenReadiness={openReadiness} onViewDecision={viewDecision} />
}
