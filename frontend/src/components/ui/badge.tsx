import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex min-h-6 items-center gap-1 rounded-xs border px-2 text-xs font-bold leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-subtle text-muted',
        primary: 'border-primary/25 bg-primary-subtle text-primary',
        success: 'border-success/30 bg-success-subtle text-success',
        warning: 'border-warning/35 bg-warning-subtle text-warning',
        destructive: 'border-danger/30 bg-danger-subtle text-danger',
        info: 'border-info/30 bg-info-subtle text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
