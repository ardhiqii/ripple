import * as React from 'react'

import { cn } from '@/lib/cn'
import { Button } from './button'
import { Overlay, Portal } from './overlay'

type AlertDialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  setTrigger: (element: HTMLElement | null) => void
  titleId: string
  descriptionId: string
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null)

function useAlertDialogContext() {
  const context = React.useContext(AlertDialogContext)
  if (!context) throw new Error('AlertDialog components must be used inside AlertDialog')
  return context
}

interface AlertDialogProps {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function AlertDialog({ children, open: openProp, defaultOpen = false, onOpenChange }: AlertDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const wasOpen = React.useRef(openProp ?? defaultOpen)
  const open = openProp ?? uncontrolledOpen
  const titleId = React.useId()
  const descriptionId = React.useId()
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp],
  )

  const setTrigger = React.useCallback((element: HTMLElement | null) => {
    triggerRef.current = element
  }, [])

  React.useEffect(() => {
    if (open) {
      if (!wasOpen.current && !triggerRef.current && document.activeElement instanceof HTMLElement) triggerRef.current = document.activeElement
      wasOpen.current = true
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    const trigger = triggerRef.current
    triggerRef.current = null
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true })
  }, [open])

  return <AlertDialogContext.Provider value={{ open, setOpen, setTrigger, titleId, descriptionId }}>{children}</AlertDialogContext.Provider>
}

function AlertDialogTrigger({ asChild = false, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { open, setOpen, setTrigger } = useAlertDialogContext()
  const triggerProps = {
    type: 'button' as const,
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': open,
    ...props,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented) {
        setTrigger(event.currentTarget)
        setOpen(true)
      }
    },
  }
  if (asChild) return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, triggerProps)
  return <button {...triggerProps}>{children}</button>
}

function AlertDialogPortal({ children }: { children: React.ReactNode }) {
  return <Portal>{children}</Portal>
}

function AlertDialogOverlay(props: React.HTMLAttributes<HTMLDivElement>) {
  return <Overlay {...props} />
}

const AlertDialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => {
  const { open, titleId, descriptionId } = useAlertDialogContext()
  const contentRef = React.useRef<HTMLDivElement>(null)
  const setContentRef = React.useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }, [ref])

  React.useEffect(() => {
    if (!open) return undefined
    if (document.activeElement === document.body) contentRef.current?.focus({ preventScroll: true })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) {
        event.preventDefault()
        contentRef.current?.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <div
          ref={setContentRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={cn('relative z-50 grid w-full max-w-md gap-4 rounded-md border border-border bg-surface p-5 text-ink shadow-raised outline-none', className)}
          {...props}
        >
          {children}
        </div>
      </div>
    </AlertDialogPortal>
  )
})
AlertDialogContent.displayName = 'AlertDialogContent'

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1.5 text-left', className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => {
  const { titleId } = useAlertDialogContext()
  return <h2 ref={ref} id={titleId} className={cn('font-display text-lg font-extrabold leading-tight tracking-tight', className)} {...props} />
})
AlertDialogTitle.displayName = 'AlertDialogTitle'

const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => {
  const { descriptionId } = useAlertDialogContext()
  return <p ref={ref} id={descriptionId} className={cn('max-w-prose text-sm leading-relaxed text-muted', className)} {...props} />
})
AlertDialogDescription.displayName = 'AlertDialogDescription'

function AlertDialogAction({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useAlertDialogContext()
  return <Button variant="primary" className={className} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) setOpen(false) }} {...props} />
}

function AlertDialogCancel({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useAlertDialogContext()
  return <Button variant="secondary" className={className} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) setOpen(false) }} {...props} />
}

export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger }
