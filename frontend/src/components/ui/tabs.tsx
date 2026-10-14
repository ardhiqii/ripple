import * as React from 'react'

import { cn } from '@/lib/cn'

type TabsContextValue = {
  value?: string
  setValue: (value: string) => void
  baseId: string
  orientation: 'horizontal' | 'vertical'
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error('Tabs components must be used inside Tabs')
  return context
}

function tabId(baseId: string, value: string) {
  return `${baseId}-tab-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  orientation?: 'horizontal' | 'vertical'
}

function Tabs({ className, defaultValue, value: valueProp, onValueChange, orientation = 'horizontal', ...props }: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const value = valueProp ?? uncontrolledValue
  const baseId = React.useId()
  const setValue = React.useCallback(
    (nextValue: string) => {
      if (valueProp === undefined) setUncontrolledValue(nextValue)
      onValueChange?.(nextValue)
    },
    [onValueChange, valueProp],
  )

  return (
    <TabsContext.Provider value={{ value, setValue, baseId, orientation }}>
      <div data-orientation={orientation} className={cn('grid gap-3', className)} {...props} />
    </TabsContext.Provider>
  )
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  loop?: boolean
}

function TabsList({ className, loop = true, ...props }: TabsListProps) {
  return <div role="tablist" data-loop={loop} className={cn('inline-flex min-h-9 items-center gap-1 rounded-sm border border-border bg-surface-subtle p-1', className)} {...props} />
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

function TabsTrigger({ className, value: triggerValue, disabled, onClick, onKeyDown, ...props }: TabsTriggerProps) {
  const { value, setValue, baseId, orientation } = useTabsContext()
  const selected = value === triggerValue

  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, direction: 1 | -1 | 'first' | 'last') => {
    const list = event.currentTarget.closest('[role="tablist"]')
    if (!list) return
    const triggers = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'))
    if (!triggers.length) return
    const currentIndex = triggers.indexOf(event.currentTarget)
    const nextIndex = direction === 'first'
      ? 0
      : direction === 'last'
        ? triggers.length - 1
        : (currentIndex + direction + triggers.length) % triggers.length
    event.preventDefault()
    triggers[nextIndex]?.focus()
  }

  return (
    <button
      type="button"
      role="tab"
      id={tabId(baseId, triggerValue)}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${triggerValue}`}
      tabIndex={selected ? 0 : -1}
      data-state={selected ? 'active' : 'inactive'}
      data-orientation={orientation}
      disabled={disabled}
      className={cn('inline-flex min-h-8 items-center justify-center rounded-xs border border-transparent px-2.5 text-xs font-bold text-muted outline-none transition-[background-color,border-color,color,box-shadow] duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-45 data-[state=active]:border-border data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-raised', className)}
      onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) setValue(triggerValue) }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (orientation === 'horizontal') {
          if (event.key === 'ArrowRight') moveFocus(event, 1)
          if (event.key === 'ArrowLeft') moveFocus(event, -1)
        } else {
          if (event.key === 'ArrowDown') moveFocus(event, 1)
          if (event.key === 'ArrowUp') moveFocus(event, -1)
        }
        if (event.key === 'Home') moveFocus(event, 'first')
        if (event.key === 'End') moveFocus(event, 'last')
      }}
      {...props}
    />
  )
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  forceMount?: boolean
}

function TabsContent({ className, value: contentValue, forceMount = false, ...props }: TabsContentProps) {
  const { value, baseId } = useTabsContext()
  const selected = value === contentValue
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${contentValue}`}
      aria-labelledby={tabId(baseId, contentValue)}
      tabIndex={0}
      hidden={!selected && !forceMount}
      data-state={selected ? 'active' : 'inactive'}
      className={cn('mt-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus', className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
