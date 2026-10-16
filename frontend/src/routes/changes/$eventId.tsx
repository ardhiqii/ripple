import { createFileRoute } from '@tanstack/react-router'

import { EventDetail } from '@/components/changes/event-detail'
import { changesSearchSchema } from '../search-schemas'

export const Route = createFileRoute('/changes/$eventId')({
  validateSearch: changesSearchSchema,
  component: ChangeEventRoute,
})

function ChangeEventRoute() {
  const { eventId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const backToInbox = () => void navigate({ to: '/changes', search: withoutEvent(search) })
  const openPlan = (planId: string, runId?: string) => void navigate({ to: '/decisions/$planId', params: { planId }, search: runId ? { run: runId } : {} })
  const openJob = (jobId: string, requestedDate: number | null) => {
    const from = requestedDate === null ? 0 : Math.max(0, requestedDate - 2)
    const to = requestedDate === null ? 14 : Math.max(from + 7, requestedDate + 5)
    void navigate({ to: '/timeline', search: { from, to, groups: [], vendors: [], job: jobId } })
  }
  return <EventDetail eventId={eventId} onBack={backToInbox} onOpenPlan={openPlan} onOpenJob={openJob} />
}

function withoutEvent(search: ReturnType<typeof Route.useSearch>) {
  const { event: _event, ...inboxSearch } = search
  return inboxSearch
}
