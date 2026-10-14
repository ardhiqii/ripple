import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { RipplePanel, type RippleContext, type RippleMode } from '@/components/agent/ripple-panel'
import { GlobalHeader, type GlobalHeaderProps } from './global-header'

export interface AppShellProps extends Pick<GlobalHeaderProps, 'activeScenario' | 'askRippleTrigger' | 'demoMode' | 'resetDemoTrigger' | 'onAskRipple'> {
  children: ReactNode
}

export function AppShell({ children, ...headerProps }: AppShellProps) {
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState<RippleMode>('ask')
  const [panelContext, setPanelContext] = useState<RippleContext>({ route: window.location.pathname })

  useEffect(() => {
    const handleRippleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: RippleMode; context?: Partial<RippleContext> }>).detail
      setPanelMode(detail?.mode ?? 'ask')
      setPanelContext({ route: window.location.pathname, ...detail?.context })
      setPanelOpen(true)
    }
    window.addEventListener('ripple:open', handleRippleOpen)
    return () => window.removeEventListener('ripple:open', handleRippleOpen)
  }, [])

  const openAskPanel = () => {
    setPanelMode('ask')
    setPanelContext({ route: window.location.pathname })
    setPanelOpen(true)
  }

  return <div className="ripple-shell h-dvh overflow-hidden bg-canvas text-ink">
    <GlobalHeader {...headerProps} onAskRipple={openAskPanel} />
    <div className="ripple-shell__viewport mt-14 h-[calc(100dvh-3.5rem)] min-h-0 overflow-auto [&>.app.unified]:!h-full [&>.app.unified]:!min-h-0 [&>.ds-page]:!min-h-full">
      {children}
    </div>
    <RipplePanel open={panelOpen} mode={panelMode} context={panelContext} onOpenChange={setPanelOpen} onPlanReady={(planId) => { void navigate({ to: '/decisions/$planId', params: { planId } }) }} />
  </div>
}
