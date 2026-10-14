import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/decisions')({
  component: DecisionsRoute,
})

function DecisionsRoute() {
  return <Outlet />
}
