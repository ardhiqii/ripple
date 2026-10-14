import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-sm border px-3 text-sm font-bold leading-none whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'border-primary bg-primary text-on-primary hover:border-primary-hover hover:bg-primary-hover',
        secondary: 'border-border bg-surface text-ink hover:border-border-strong hover:bg-surface-subtle',
        quiet: 'border-transparent bg-transparent text-muted hover:bg-surface-subtle hover:text-ink',
        destructive: 'border-danger bg-danger text-on-danger hover:bg-danger/90',
      },
      size: {
        sm: 'min-h-8 px-2.5 text-xs',
        md: 'min-h-9 px-3 text-sm',
        lg: 'min-h-10 px-4 text-sm',
        icon: 'size-9 px-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, disabled, loading = false, variant, size, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <><span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />{children}</> : children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
