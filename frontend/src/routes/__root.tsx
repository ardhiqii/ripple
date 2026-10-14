import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

import { RoutePlaceholder } from '@/app/route-placeholder'
import { AppShell } from '@/components/shell'

export interface AppRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: () => <AppShell><Outlet /></AppShell>,
  notFoundComponent: () => <RoutePlaceholder title="Page not found" path="/*" description="This path is not part of the MVP route map." />,
})
