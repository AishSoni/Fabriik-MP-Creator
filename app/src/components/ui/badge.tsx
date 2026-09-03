import * as React from 'react';
import { cn } from '../../lib/cn';
import { historyBadgeVariants } from '../../lib/variants';
import type { VariantProps } from 'class-variance-authority';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof historyBadgeVariants> {}

export function Badge({ className, source, dark, ...props }: BadgeProps) {
  return <span className={cn(historyBadgeVariants({ source, dark }), className)} {...props} />;
}

export function Pill({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize tabular-nums', className)} {...props} />;
}
