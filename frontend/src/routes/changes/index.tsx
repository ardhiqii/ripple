import { createFileRoute } from '@tanstack/react-router'

import { ChangeInbox } from '@/components/changes/change-inbox'
import { changesSearchSchema } from '../search-schemas'

export const Route = createFileRoute('/changes/')({
  validateSearch: changesSearchSchema,
  component: ChangesIndexRoute,
})

function ChangesIndexRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <ChangeInbox search={search} onSearchChange={(patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) })} onOpenPlan={(planId) => navigate({ to: '/decisions/$planId', params: { planId } })} />
}
