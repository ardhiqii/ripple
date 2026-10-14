/* eslint-disable @typescript-eslint/no-explicit-any */

import { Route as RootRoute } from './__root'
import { Route as IndexRoute } from './index'
import { Route as TimelineRoute } from './timeline'
import { Route as ReadinessRoute } from './readiness'
import { Route as ChangesRoute } from './changes'
import { Route as ChangesIndexRoute } from './changes/index'
import { Route as ChangesEventIdRoute } from './changes/$eventId'
import { Route as DecisionsRoute } from './decisions'
import { Route as DecisionPlanRoute } from './decisions/$planId'
import { Route as HistoryRoute } from './history'
import { Route as SettingsRoute } from './settings'
import { Route as PolicyRoute } from './settings/policy'
import { Route as DemoRoute } from './demo'

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRoute; parentRoute: typeof RootRoute }
    '/timeline': { id: '/timeline'; path: '/timeline'; fullPath: '/timeline'; preLoaderRoute: typeof TimelineRoute; parentRoute: typeof RootRoute }
    '/readiness': { id: '/readiness'; path: '/readiness'; fullPath: '/readiness'; preLoaderRoute: typeof ReadinessRoute; parentRoute: typeof RootRoute }
    '/changes': { id: '/changes'; path: '/changes'; fullPath: '/changes'; preLoaderRoute: typeof ChangesRoute; parentRoute: typeof RootRoute }
    '/changes/': { id: '/changes/'; path: '/'; fullPath: '/changes/'; preLoaderRoute: typeof ChangesIndexRoute; parentRoute: typeof ChangesRoute }
    '/changes/$eventId': { id: '/changes/$eventId'; path: '/$eventId'; fullPath: '/changes/$eventId'; preLoaderRoute: typeof ChangesEventIdRoute; parentRoute: typeof ChangesRoute }
    '/decisions': { id: '/decisions'; path: '/decisions'; fullPath: '/decisions'; preLoaderRoute: typeof DecisionsRoute; parentRoute: typeof RootRoute }
    '/decisions/$planId': { id: '/decisions/$planId'; path: '/$planId'; fullPath: '/decisions/$planId'; preLoaderRoute: typeof DecisionPlanRoute; parentRoute: typeof DecisionsRoute }
    '/history': { id: '/history'; path: '/history'; fullPath: '/history'; preLoaderRoute: typeof HistoryRoute; parentRoute: typeof RootRoute }
    '/settings': { id: '/settings'; path: '/settings'; fullPath: '/settings'; preLoaderRoute: typeof SettingsRoute; parentRoute: typeof RootRoute }
    '/settings/policy': { id: '/settings/policy'; path: '/policy'; fullPath: '/settings/policy'; preLoaderRoute: typeof PolicyRoute; parentRoute: typeof SettingsRoute }
    '/demo': { id: '/demo'; path: '/demo'; fullPath: '/demo'; preLoaderRoute: typeof DemoRoute; parentRoute: typeof RootRoute }
  }
}

const indexRoute = IndexRoute.update({ id: '/', path: '/', getParentRoute: () => RootRoute } as any)
const timelineRoute = TimelineRoute.update({ id: '/timeline', path: '/timeline', getParentRoute: () => RootRoute } as any)
const readinessRoute = ReadinessRoute.update({ id: '/readiness', path: '/readiness', getParentRoute: () => RootRoute } as any)
const changesRoute = ChangesRoute.update({ id: '/changes', path: '/changes', getParentRoute: () => RootRoute } as any)
const changesIndexRoute = ChangesIndexRoute.update({ id: '/changes/', path: '/', getParentRoute: () => changesRoute } as any)
const changesEventIdRoute = ChangesEventIdRoute.update({ id: '/changes/$eventId', path: '/$eventId', getParentRoute: () => changesRoute } as any)
const decisionsRoute = DecisionsRoute.update({ id: '/decisions', path: '/decisions', getParentRoute: () => RootRoute } as any)
const decisionPlanRoute = DecisionPlanRoute.update({ id: '/decisions/$planId', path: '/$planId', getParentRoute: () => decisionsRoute } as any)
const historyRoute = HistoryRoute.update({ id: '/history', path: '/history', getParentRoute: () => RootRoute } as any)
const settingsRoute = SettingsRoute.update({ id: '/settings', path: '/settings', getParentRoute: () => RootRoute } as any)
const policyRoute = PolicyRoute.update({ id: '/settings/policy', path: '/policy', getParentRoute: () => settingsRoute } as any)
const demoRoute = DemoRoute.update({ id: '/demo', path: '/demo', getParentRoute: () => RootRoute } as any)

const changesRouteWithChildren = changesRoute._addFileChildren({
  changesIndexRoute,
  changesEventIdRoute,
})

const decisionsRouteWithChildren = decisionsRoute._addFileChildren({
  decisionPlanRoute,
})

const settingsRouteWithChildren = settingsRoute._addFileChildren({
  policyRoute,
})

interface FileRoutesByFullPath {
  '/': typeof indexRoute
  '/timeline': typeof timelineRoute
  '/readiness': typeof readinessRoute
  '/changes': typeof changesRoute
  '/changes/': typeof changesIndexRoute
  '/changes/$eventId': typeof changesEventIdRoute
  '/decisions': typeof decisionsRoute
  '/decisions/$planId': typeof decisionPlanRoute
  '/history': typeof historyRoute
  '/settings': typeof settingsRoute
  '/settings/policy': typeof policyRoute
  '/demo': typeof demoRoute
}

interface FileRoutesByTo {
  '/': typeof indexRoute
  '/timeline': typeof timelineRoute
  '/readiness': typeof readinessRoute
  '/changes': typeof changesIndexRoute
  '/changes/$eventId': typeof changesEventIdRoute
  '/decisions/$planId': typeof decisionPlanRoute
  '/history': typeof historyRoute
  '/settings/policy': typeof policyRoute
  '/demo': typeof demoRoute
}

interface FileRoutesById {
  __root__: typeof RootRoute
  '/': typeof indexRoute
  '/timeline': typeof timelineRoute
  '/readiness': typeof readinessRoute
  '/changes': typeof changesRoute
  '/changes/': typeof changesIndexRoute
  '/changes/$eventId': typeof changesEventIdRoute
  '/decisions': typeof decisionsRoute
  '/decisions/$planId': typeof decisionPlanRoute
  '/history': typeof historyRoute
  '/settings': typeof settingsRoute
  '/settings/policy': typeof policyRoute
  '/demo': typeof demoRoute
}

interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: keyof FileRoutesByFullPath
  fileRoutesByTo: FileRoutesByTo
  to: keyof FileRoutesByTo
  id: keyof FileRoutesById
  fileRoutesById: FileRoutesById
}

export const routeTree = RootRoute._addFileChildren({
  indexRoute,
  timelineRoute,
  readinessRoute,
  changesRoute: changesRouteWithChildren,
  decisionsRoute: decisionsRouteWithChildren,
  historyRoute,
  settingsRoute: settingsRouteWithChildren,
  demoRoute,
})._addFileTypes<FileRouteTypes>()
