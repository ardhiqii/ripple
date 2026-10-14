import { createRouter } from '@tanstack/react-router'

import { queryClient } from './query-client'
import { routeTree } from '@/routes/routeTree.gen'

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
