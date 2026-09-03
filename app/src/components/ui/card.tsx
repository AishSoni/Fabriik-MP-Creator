import * as React from 'react';
import { cn } from '../../lib/cn';
import { cardVariants } from '../../lib/variants';
import type { VariantProps } from 'class-variance-authority';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, tone, ...props }: CardProps) {
  return <div className={cn(cardVariants({ tone }), className)} {...props} />;
}

export function CardInner({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[calc(20px-6px)] p-3.5', className)} {...props} />;
}
