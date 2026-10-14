import type { ReactNode } from 'react'

type RoutePlaceholderProps = {
  title: string
  path: string
  search?: Record<string, unknown>
  children?: ReactNode
  description?: string
}

export function RoutePlaceholder({ title, path, search, children, description = 'This route is wired and ready for its feature implementation.' }: RoutePlaceholderProps) {
  return (
    <main className="ds-page">
      <section className="ds-content ds-stack">
        <header className="ds-section-header">
          <div className="ds-stack">
            <span className="ds-label">Route shell</span>
            <h1 className="ds-heading ds-heading--page">{title}</h1>
            <p className="ds-copy">{description}</p>
          </div>
        </header>
        <section className="ds-panel ds-stack" aria-label={`${title} development status`} style={{ padding: 'var(--ds-space-4)' }}>
          <strong>Development placeholder</strong>
          <span className="ds-copy">{path}</span>
          {children}
          {search ? <pre className="ds-copy" aria-label="Validated search state">{JSON.stringify(search, null, 2)}</pre> : null}
        </section>
      </section>
    </main>
  )
}
