import * as React from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/cn'

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  return mounted ? createPortal(children, document.body) : null
}

const Overlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} aria-hidden="true" className={cn('fixed inset-0 z-50 bg-overlay', className)} {...props} />
))
Overlay.displayName = 'Overlay'

export { Overlay, Portal }
