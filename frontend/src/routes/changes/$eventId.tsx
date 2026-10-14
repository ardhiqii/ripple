import { createFileRoute } from '@tanstack/react-router'

import { ChangeInbox } from '@/components/changes/change-inbox'
import { changesSearchSchema } from '../search-schemas'

export const Route = createFileRoute('/changes/$eventId')({
  validateSearch: changesSearchSchema,
  component: ChangeEventRoute,
})

function ChangeEventRoute() {
  const { eventId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <ChangeInbox search={{ ...search, event: eventId }} onSearchChange={(patch) => navigate({ to: '/changes', search: (previous) => ({ ...previous, ...patch }) })} onOpenPlan={(planId) => navigate({ to: '/decisions/$planId', params: { planId } })} />
}
