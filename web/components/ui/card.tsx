'use client'

import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'gradient' | 'glass'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hoverable?: boolean
  overflow?: 'hidden' | 'visible'
}

const cardVariants = {
  default: 'bg-surface border border-white/5',
  elevated: 'bg-surface-elevated border border-white/10 shadow-xl',
  gradient: 'gradient-border',
  glass: 'glass border border-white/10',
}

const cardPadding = {
  none: '',
  sm: 'p-3',
  md: 'p-4 md:p-5',
  lg: 'p-5 md:p-6',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { className, variant = 'default', padding = 'md', hoverable = false, overflow = 'hidden', children, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl',
          overflow === 'hidden' ? 'overflow-hidden' : 'overflow-visible',
          cardVariants[variant],
          cardPadding[padding],
          hoverable &&
            'transition-all duration-300 hover:border-white/20 hover:shadow-lg hover:shadow-violet-500/5 hover:-translate-y-0.5',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'
