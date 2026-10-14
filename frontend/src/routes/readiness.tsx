import { createFileRoute } from '@tanstack/react-router'

import { ReadinessBoard } from '@/components/readiness/readiness-board'
import { readinessSearchSchema } from './search-schemas'

export const Route = createFileRoute('/readiness')({
  validateSearch: readinessSearchSchema,
  component: ReadinessRoute,
})

function ReadinessRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <ReadinessBoard search={search} onSearchChange={(patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) })} onOpenJob={(jobId) => navigate({ to: '/timeline', search: { from: 0, to: 14, groups: [], vendors: [], job: jobId } })} />
}
