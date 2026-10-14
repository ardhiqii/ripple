import * as React from 'react'

import { cn } from '@/lib/cn'

type TooltipContextValue = {
  open: boolean
  setOpen: (nextOpen: boolean) => void
  contentId: string
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null)

function useTooltipContext() {
  const context = React.useContext(TooltipContext)
  if (!context) throw new Error('Tooltip components must be used inside Tooltip')
  return context
}

interface TooltipProps {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function Tooltip({ children, open: openProp, defaultOpen = false, onOpenChange }: TooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen
  const contentId = React.useId()

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp],
  )

  return (
    <TooltipContext.Provider value={{ open, setOpen, contentId }}>
      <span className="relative inline-flex" data-state={open ? 'open' : 'closed'}>
        {children}
      </span>
    </TooltipContext.Provider>
  )
}

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

interface TooltipTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: React.ReactElement
}

function TooltipTrigger({ asChild = false, children, onBlur, onFocus, onMouseEnter, onMouseLeave, ...props }: TooltipTriggerProps) {
  const { open, setOpen, contentId } = useTooltipContext()
  const triggerProps = {
    'aria-describedby': open ? contentId : undefined,
    'data-state': open ? 'open' : 'closed',
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      onBlur?.(event as React.FocusEvent<HTMLButtonElement>)
      setOpen(false)
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      onFocus?.(event as React.FocusEvent<HTMLButtonElement>)
      setOpen(true)
    },
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      onMouseEnter?.(event as React.MouseEvent<HTMLButtonElement>)
      setOpen(true)
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      onMouseLeave?.(event as React.MouseEvent<HTMLButtonElement>)
      setOpen(false)
    },
    ...props,
  }

  if (asChild) {
    return React.cloneElement(children, triggerProps)
  }

  return (
    <button type="button" {...triggerProps}>
      {children}
    </button>
  )
}

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left'
}

function TooltipContent({ className, side = 'top', ...props }: TooltipContentProps) {
  const { open, contentId } = useTooltipContext()
  const sideClass = {
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    bottom: 'left-1/2 top-full mt-2 -translate-x-1/2',
    left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  }[side]

  return (
    <div
      id={contentId}
      role="tooltip"
      data-state={open ? 'open' : 'closed'}
      hidden={!open}
      className={cn('pointer-events-none absolute z-50 w-max max-w-64 rounded-xs border border-border bg-ink px-2 py-1.5 text-xs text-surface shadow-raised', sideClass, className)}
      {...props}
    />
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
