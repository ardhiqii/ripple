import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/timeline', search: { from: 0, to: 14, groups: [], vendors: [] } })
  },
  component: () => null,
})
