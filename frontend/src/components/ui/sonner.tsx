import * as React from 'react'

import { cn } from '@/lib/cn'

type ToastKind = 'default' | 'success' | 'error' | 'warning' | 'info'

export interface ToastOptions {
  id?: string | number
  description?: React.ReactNode
  duration?: number
  action?: { label: string; onClick: () => void }
}

export interface ToastData extends ToastOptions {
  id: string
  message: React.ReactNode
  kind: ToastKind
}

let toastSequence = 0
let toastItems: ToastData[] = []
const toastListeners = new Set<() => void>()
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()

function notifyToasts() {
  toastListeners.forEach((listener) => listener())
}

function dismissToast(id?: string | number) {
  const normalizedId = id === undefined ? undefined : String(id)
  toastItems = normalizedId ? toastItems.filter((item) => item.id !== normalizedId) : []
  if (normalizedId) {
    const timer = toastTimers.get(normalizedId)
    if (timer) clearTimeout(timer)
    toastTimers.delete(normalizedId)
  } else {
    toastTimers.forEach((timer) => clearTimeout(timer))
    toastTimers.clear()
  }
  notifyToasts()
}

function createToast(message: React.ReactNode, kind: ToastKind, options: ToastOptions = {}) {
  const id = String(options.id ?? `toast-${++toastSequence}`)
  const item: ToastData = { ...options, id, message, kind }
  toastItems = [...toastItems.filter((current) => current.id !== id), item]
  notifyToasts()

  if (options.duration !== Infinity) {
    const duration = options.duration ?? 5000
    const timer = setTimeout(() => dismissToast(id), duration)
    toastTimers.set(id, timer)
  }
  return id
}

type ToastFunction = {
  (message: React.ReactNode, options?: ToastOptions): string
  success: (message: React.ReactNode, options?: ToastOptions) => string
  error: (message: React.ReactNode, options?: ToastOptions) => string
  warning: (message: React.ReactNode, options?: ToastOptions) => string
  info: (message: React.ReactNode, options?: ToastOptions) => string
  dismiss: (id?: string | number) => void
}

const toast = Object.assign(
  (message: React.ReactNode, options?: ToastOptions) => createToast(message, 'default', options),
  {
    success: (message: React.ReactNode, options?: ToastOptions) => createToast(message, 'success', options),
    error: (message: React.ReactNode, options?: ToastOptions) => createToast(message, 'error', options),
    warning: (message: React.ReactNode, options?: ToastOptions) => createToast(message, 'warning', options),
    info: (message: React.ReactNode, options?: ToastOptions) => createToast(message, 'info', options),
    dismiss: dismissToast,
  },
) as ToastFunction

function subscribeToasts(listener: () => void) {
  toastListeners.add(listener)
  return () => toastListeners.delete(listener)
}

function getToasts() {
  return toastItems
}

interface ToasterProps extends React.HTMLAttributes<HTMLDivElement> {
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
}

const positionClasses: Record<NonNullable<ToasterProps['position']>, string> = {
  'top-left': 'left-4 top-4 items-start',
  'top-center': 'left-1/2 top-4 -translate-x-1/2 items-center',
  'top-right': 'right-4 top-4 items-end',
  'bottom-left': 'bottom-4 left-4 items-start',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-4 right-4 items-end',
}

function Toaster({ className, position = 'bottom-right', ...props }: ToasterProps) {
  const items = React.useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  return (
    <div aria-live="polite" aria-label="Notifications" className={cn('pointer-events-none fixed z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2', positionClasses[position], className)} {...props}>
      {items.map((item) => <Toast key={item.id} toast={item} />)}
    </div>
  )
}

function Toast({ toast: item }: { toast: ToastData }) {
  const toneClass = {
    default: 'border-border bg-surface text-ink',
    success: 'border-success/35 bg-success-subtle text-ink',
    error: 'border-danger/35 bg-danger-subtle text-ink',
    warning: 'border-warning/35 bg-warning-subtle text-ink',
    info: 'border-info/35 bg-info-subtle text-ink',
  }[item.kind]

  return (
    <div role={item.kind === 'error' ? 'alert' : 'status'} className={cn('pointer-events-auto grid w-full gap-1 rounded-sm border p-3 text-sm shadow-raised', toneClass)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-semibold">{item.message}</p>
          {item.description ? <p className="m-0 mt-1 text-xs text-muted">{item.description}</p> : null}
        </div>
        <button type="button" aria-label="Dismiss notification" className="rounded-xs px-1 text-muted hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={() => dismissToast(item.id)}>×</button>
      </div>
      {item.action ? <button type="button" className="justify-self-start text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={item.action.onClick}>{item.action.label}</button> : null}
    </div>
  )
}

export { Toaster, toast }
