import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type ClassValue = string | false | null | undefined
const cx = (...values: ClassValue[]) => values.filter(Boolean).join(' ')

export function PageShell({ children, workspace = false, className }: { children: ReactNode; workspace?: boolean; className?: string }) {
  return <main className={cx('ds-page', workspace && 'ds-page--workspace', className)}>{children}</main>
}

export function Button({ variant = 'secondary', className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return <button type={type} className={cx('ds-button', `ds-button--${variant}`, className)} {...props} />
}

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={cx('ds-button', 'ds-button--secondary', 'ds-icon-button', className)} {...props} />
}

export function TextField({ label, hint, error, id, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const fieldId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`
  return <label className={cx('ds-field', className)} htmlFor={fieldId}><span className="ds-field__label">{label}</span><input id={fieldId} className="ds-input" aria-invalid={Boolean(error)} {...props}/>{error ? <span className="ds-field__error">{error}</span> : hint ? <span className="ds-field__hint">{hint}</span> : null}</label>
}

export function SelectField({ label, children, id, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const fieldId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`
  return <label className={cx('ds-field', className)} htmlFor={fieldId}><span className="ds-field__label">{label}</span><select id={fieldId} className="ds-select" {...props}>{children}</select></label>
}

export function StatusBadge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; className?: string }) {
  return <span className={cx('ds-badge', tone !== 'neutral' && `ds-badge--${tone}`, className)}>{children}</span>
}

export function SectionHeader({ title, eyebrow, description, action }: { title: string; eyebrow?: string; description?: string; action?: ReactNode }) {
  return <header className="ds-section-header"><div className="ds-stack">{eyebrow && <span className="ds-label">{eyebrow}</span>}<h2 className="ds-heading ds-heading--section">{title}</h2>{description && <p className="ds-copy">{description}</p>}</div>{action}</header>
}

export function MetricStrip({ items }: { items: Array<{ label: string; value: string; detail?: string }> }) {
  return <section className="ds-metric-strip" aria-label="Summary metrics">{items.map(item => <div className="ds-metric" key={item.label}><span>{item.label}</span><strong>{item.value}</strong>{item.detail && <small>{item.detail}</small>}</div>)}</section>
}
