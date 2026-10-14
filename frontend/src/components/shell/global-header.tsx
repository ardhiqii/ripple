import { useEffect, useMemo, useState } from 'react'
import { ArrowCounterClockwise, CaretDown, ClockCounterClockwise, Command, Database, GearSix, List, Sparkle, SquaresFour, Tray } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@/components/ui'

const primaryNav = [
  { label: 'Timeline', to: '/timeline', search: { from: 0, to: 14, groups: [] as string[], vendors: [] as string[] }, icon: SquaresFour },
  { label: 'Readiness', to: '/readiness', search: {}, icon: List },
  { label: 'Changes', to: '/changes', search: {}, icon: Tray },
  { label: 'History', to: '/history', search: {}, icon: ClockCounterClockwise },
] as const

const commandPages = [
  { label: 'Fleet Timeline', description: 'Current resource plan and capacity', to: '/timeline', search: { from: 0, to: 14, groups: [] as string[], vendors: [] as string[] } },
  { label: 'Readiness Board', description: 'Cross-job readiness work queue', to: '/readiness', search: {} },
  { label: 'Change Inbox', description: 'Requests, disruptions, and opportunities', to: '/changes', search: {} },
  { label: 'Decision History', description: 'Auditable plan decisions', to: '/history', search: {} },
  { label: 'Policy and Data Health', description: 'Read-only action registry and source freshness', to: '/settings/policy', search: {} },
  { label: 'Demo Lab', description: 'Guided scenarios and A-12 comparison', to: '/demo', search: {} },
] as const

export interface GlobalHeaderProps {
  activeScenario?: string
  askRippleTrigger?: React.ReactNode
  demoMode?: boolean
  resetDemoTrigger?: React.ReactNode
  onAskRipple?: () => void
}

function ProductMark({ activeScenario }: { activeScenario: string }) {
  return (
    <Link to="/timeline" search={{ from: 0, to: 14, groups: [] as string[], vendors: [] as string[] }} aria-label="Ripple home" className="group flex min-w-0 shrink-0 items-center gap-2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus max-[899px]:min-h-11 max-[899px]:min-w-11">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-xs bg-primary-subtle text-primary transition-transform duration-150 group-hover:-translate-y-px">
        <Sparkle size={17} weight="fill" />
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block font-display text-sm font-extrabold leading-tight tracking-tight text-ink">Ripple</span>
        <span className="block max-w-32 truncate font-mono text-[10px] leading-tight text-muted">{activeScenario}</span>
      </span>
    </Link>
  )
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {primaryNav.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.to}
            to={item.to}
            search={item.search}
            onClick={onNavigate}
            activeProps={{ 'aria-current': 'page' }}
            className="group inline-flex min-h-8 items-center gap-1.5 rounded-xs border border-transparent px-2 text-xs font-bold text-muted outline-none transition-[background-color,border-color,color] duration-150 hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus data-[status=active]:border-border data-[status=active]:bg-surface-subtle data-[status=active]:text-ink data-[status=active]:shadow-raised"
          >
            <Icon aria-hidden="true" size={14} weight="bold" className="text-muted group-data-[status=active]:text-primary" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </>
  )
}

function MobileNavigation() {
  return (
    <details className="relative min-[1200px]:hidden">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-xs border border-border bg-surface px-2.5 text-xs font-bold text-ink outline-none transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus [&::-webkit-details-marker]:hidden max-[899px]:min-h-11">
        <List aria-hidden="true" size={15} weight="bold" />
        <span className="hidden sm:inline">Menu</span>
        <CaretDown aria-hidden="true" size={12} />
      </summary>
      <nav aria-label="Primary navigation" className="absolute right-0 top-full z-50 mt-2 grid min-w-44 gap-1 rounded-sm border border-border bg-surface p-1.5 shadow-raised">
        <NavigationLinks />
      </nav>
    </details>
  )
}

function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return commandPages
    return commandPages.filter((page) => `${page.label} ${page.description}`.toLowerCase().includes(normalizedQuery))
  }, [query])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-3 p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle>Command search</DialogTitle>
          <DialogDescription>Navigate to a page without changing schedule data.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 px-5 pb-5">
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages..." aria-label="Search command results" />
          <div aria-label="Command results" className="grid gap-1">
            <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted">Pages</span>
            {results.length ? results.map((page) => (
              <Link
                key={page.to}
                to={page.to}
                search={page.search}
                onClick={() => onOpenChange(false)}
                className="grid gap-0.5 rounded-xs border border-transparent px-2 py-2 text-left outline-none transition-colors hover:border-border hover:bg-surface-subtle focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                <span className="text-sm font-bold text-ink">{page.label}</span>
                <span className="text-xs text-muted">{page.description}</span>
              </Link>
            )) : <span className="px-2 py-3 text-sm text-muted">No matching page.</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EnvironmentMenu({ resetDemoTrigger }: { resetDemoTrigger?: React.ReactNode }) {
  return (
    <details className="relative">
      <summary aria-label="Open environment menu" className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-xs border border-border bg-surface px-2 text-xs font-bold text-ink outline-none transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus [&::-webkit-details-marker]:hidden max-[899px]:min-h-11">
        <GearSix aria-hidden="true" size={15} weight="bold" />
        <span className="hidden min-[900px]:inline">Environment</span>
        <CaretDown aria-hidden="true" size={12} />
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 grid min-w-56 gap-1 rounded-sm border border-border bg-surface p-1.5 shadow-raised">
        <Link to="/settings/policy" className="flex items-center gap-2 rounded-xs px-2.5 py-2 text-xs font-bold text-ink outline-none hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus">
          <Database aria-hidden="true" size={15} />
          Policy and data health
        </Link>
        <Link to="/demo" className="flex items-center gap-2 rounded-xs px-2.5 py-2 text-xs font-bold text-ink outline-none hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus">
          <SquaresFour aria-hidden="true" size={15} />
          Demo Lab
        </Link>
        {resetDemoTrigger ? <div className="mt-1 border-t border-border pt-1">{resetDemoTrigger}</div> : null}
      </div>
    </details>
  )
}

export function GlobalHeader({ activeScenario = 'A-12 / Offshore demo', askRippleTrigger, demoMode = true, resetDemoTrigger, onAskRipple }: GlobalHeaderProps) {
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const defaultAskRippleTrigger = (
    <Button
      type="button"
      variant="primary"
      size="sm"
      className="max-[899px]:min-h-11 max-[899px]:min-w-11"
      aria-haspopup="dialog"
      aria-label="Ask Ripple"
      onClick={() => {
        onAskRipple?.()
        window.dispatchEvent(new CustomEvent('ripple:open'))
      }}
    >
      <Sparkle aria-hidden="true" size={15} weight="fill" />
      <span className="hidden min-[900px]:inline">Ask Ripple</span>
    </Button>
  )

  return (
    <>
      <header
        role="banner"
        aria-label="Global application header"
        className="fixed inset-x-0 top-0 z-50 h-14 border-b border-border bg-surface/95 shadow-raised backdrop-blur"
      >
        <div className="mx-auto flex h-full w-full max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-5">
          <ProductMark activeScenario={activeScenario} />
          <nav aria-label="Primary navigation" className="hidden min-[1200px]:flex min-w-0 items-center gap-0.5">
            <NavigationLinks />
          </nav>
          <MobileNavigation />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button type="button" variant="secondary" size="sm" className="max-[899px]:min-h-11 max-[899px]:min-w-11" onClick={() => setCommandOpen(true)} aria-label="Open command search" aria-keyshortcuts="Control+K Meta+K">
              <Command aria-hidden="true" size={15} weight="bold" />
              <span className="hidden min-[900px]:inline">Search</span>
              <kbd className="hidden rounded-xs border border-border-strong px-1 font-mono text-[9px] font-medium text-muted min-[1100px]:inline">⌘K</kbd>
            </Button>
            {askRippleTrigger ?? defaultAskRippleTrigger}
            <EnvironmentMenu resetDemoTrigger={demoMode ? resetDemoTrigger : undefined} />
          </div>
        </div>
      </header>
      <CommandSearch open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  )
}

export function ResetDemoTrigger({ onReset }: { onReset: () => void }) {
  return (
    <Button type="button" variant="quiet" size="sm" className="w-full justify-start" onClick={onReset}>
      <ArrowCounterClockwise aria-hidden="true" size={15} />
      Reset demo
    </Button>
  )
}
