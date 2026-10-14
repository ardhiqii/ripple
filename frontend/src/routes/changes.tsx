import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/changes')({
  component: ChangesRoute,
})

function ChangesRoute() {
  return <Outlet />
}
