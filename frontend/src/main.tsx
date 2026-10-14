import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import { queryClient } from './app/query-client'
import { router } from './app/router'
import { RunRegistryProvider } from './features/agent/run-registry'
import './design-system.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RunRegistryProvider>
        <RouterProvider router={router} />
      </RunRegistryProvider>
    </QueryClientProvider>
  </StrictMode>,
)
