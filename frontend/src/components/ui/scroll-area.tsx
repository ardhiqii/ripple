import * as React from 'react'

import { cn } from '@/lib/cn'

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(({ className, viewportClassName, children, ...props }, ref) => (
  <div ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
    <div className={cn('h-full w-full overflow-auto overscroll-contain', viewportClassName)}>{children}</div>
  </div>
))
ScrollArea.displayName = 'ScrollArea'

interface ScrollBarProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
}

function ScrollBar({ className, orientation = 'vertical', ...props }: ScrollBarProps) {
  return <div aria-hidden="true" data-orientation={orientation} className={cn('pointer-events-none absolute rounded-full bg-border-strong/60', orientation === 'vertical' ? 'right-1 top-1 bottom-1 w-1' : 'bottom-1 left-1 right-1 h-1', className)} {...props} />
}

export { ScrollArea, ScrollBar }
