import { QueryClient } from '@tanstack/react-query'

import { scenarioQueryKey, type ScenarioQueryKey } from '@/api/transport'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export { scenarioQueryKey }
export type { ScenarioQueryKey }

export function removeScenarioCache(client: QueryClient, scenarioId: string): void {
  void scenarioId
  client.removeQueries({
    predicate: ({ queryKey }) => Array.isArray(queryKey) && queryKey[0] === 'scenario',
  })
}
