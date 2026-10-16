import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { ChangeInbox } from '@/components/changes/change-inbox'
import { changesSearchSchema } from '../search-schemas'

export const Route = createFileRoute('/changes/')({
  validateSearch: changesSearchSchema,
  component: ChangesIndexRoute,
})

function ChangesIndexRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  useEffect(() => {
    if (!search.event) return
    const { event: eventId, ...inboxSearch } = search
    void navigate({ replace: true, to: '/changes/$eventId', params: { eventId }, search: inboxSearch })
  }, [navigate, search])

  const openEvent = (eventId: string) => void navigate({ to: '/changes/$eventId', params: { eventId }, search: withoutEvent(search) })
  const openPlan = (planId: string) => void navigate({ to: '/decisions/$planId', params: { planId }, search: {} })
  return <ChangeInbox search={search} onSearchChange={(patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) })} onOpenEvent={openEvent} onOpenPlan={openPlan} />
}

function withoutEvent(search: ReturnType<typeof Route.useSearch>) {
  const { event: _event, ...inboxSearch } = search
  return inboxSearch
}
