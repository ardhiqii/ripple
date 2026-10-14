import * as React from 'react'

import { cn } from '@/lib/cn'
import { Overlay, Portal } from './overlay'

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  setTrigger: (element: HTMLElement | null) => void
  titleId: string
  descriptionId: string
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error('Dialog components must be used inside Dialog')
  return context
}

interface DialogProps {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function Dialog({ children, open: openProp, defaultOpen = false, onOpenChange }: DialogProps) {
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

  return <DialogContext.Provider value={{ open, setOpen, setTrigger, titleId, descriptionId }}>{children}</DialogContext.Provider>
}

function DialogTrigger({ asChild = false, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { open, setOpen, setTrigger } = useDialogContext()
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

function DialogPortal({ children }: { children: React.ReactNode }) {
  return <Portal>{children}</Portal>
}

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const { setOpen } = useDialogContext()
  return <Overlay ref={ref} className={className} onClick={() => setOpen(false)} {...props} />
})
DialogOverlay.displayName = 'DialogOverlay'

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onEscapeKeyDown?: (event: KeyboardEvent) => void
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(({ className, children, onEscapeKeyDown, ...props }, ref) => {
  const { open, setOpen, titleId, descriptionId } = useDialogContext()
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
      if (event.key === 'Tab') {
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
        return
      }
      if (event.key !== 'Escape') return
      onEscapeKeyDown?.(event)
      if (!event.defaultPrevented) setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onEscapeKeyDown, open, setOpen])

  if (!open) return null

  return (
    <DialogPortal>
      <DialogOverlay />
      <div className="fixed inset-0 z-50 grid place-items-center p-4" onMouseDown={(event) => event.stopPropagation()}>
        <div
          ref={setContentRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={cn('relative z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-lg gap-4 overflow-y-auto rounded-md border border-border bg-surface p-5 text-ink shadow-raised outline-none', className)}
          {...props}
        >
          {children}
          <DialogClose className="absolute right-3 top-3" aria-label="Close dialog">×</DialogClose>
        </div>
      </div>
    </DialogPortal>
  )
})
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1.5 text-left', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => {
  const { titleId } = useDialogContext()
  return <h2 ref={ref} id={titleId} className={cn('font-display text-lg font-extrabold leading-tight tracking-tight', className)} {...props} />
})
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => {
  const { descriptionId } = useDialogContext()
  return <p ref={ref} id={descriptionId} className={cn('max-w-prose text-sm leading-relaxed text-muted', className)} {...props} />
})
DialogDescription.displayName = 'DialogDescription'

function DialogClose({ asChild = false, children, className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { setOpen } = useDialogContext()
  const closeProps = {
    type: 'button' as const,
    className: cn('inline-flex min-h-8 items-center justify-center rounded-sm border border-transparent px-2 text-sm font-bold text-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus', className),
    ...props,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      if (!event.defaultPrevented) setOpen(false)
    },
  }
  if (asChild) return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, closeProps)
  return <button {...closeProps}>{children ?? 'Close'}</button>
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
