import * as React from 'react'

import { cn } from '@/lib/cn'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="status" aria-busy="true" aria-label="Loading" className={cn('animate-pulse rounded-sm bg-surface-subtle', className)} {...props} />
}

export { Skeleton }
