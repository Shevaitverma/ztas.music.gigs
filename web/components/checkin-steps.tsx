'use client'

import { useEffect } from 'react'
import { Check, Circle } from 'lucide-react'
import { capture } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import type { CheckIn, CheckInStatus } from '@/lib/types'

const ORDER: CheckInStatus[] = ['PENDING', 'CHECKED_IN', 'EVENT_STARTED', 'EVENT_ENDED']

const STEPS = [
  { status: 'PENDING' as const, label: 'Check-in code issued' },
  { status: 'CHECKED_IN' as const, label: 'Artist checked in at the venue' },
  { status: 'EVENT_STARTED' as const, label: 'Event started' },
  { status: 'EVENT_ENDED' as const, label: 'Event ended — both confirmed' },
]

export function checkInStepIndex(status: CheckInStatus | undefined): number {
  if (!status) return -1
  const i = ORDER.indexOf(status)
  // EXPIRED / CANCELLED are terminal and off the happy path.
  return i
}

/**
 * Shared progress rail for the OTP check-in state machine. Used by both the
 * organizer's manage page and the artist's check-in page.
 */
export function CheckInSteps({ checkIn }: { checkIn: CheckIn | null }) {
  const current = checkInStepIndex(checkIn?.status)

  return (
    <ol className="space-y-3">
      {STEPS.map((step, i) => {
        const done = current >= i
        const active = current === i
        return (
          <li key={step.status} className="flex items-center gap-3">
            <span
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center shrink-0 border',
                done
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-surface border-white/10 text-foreground-subtle'
              )}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-2 h-2 fill-current" />}
            </span>
            <span
              className={cn(
                'text-sm',
                active
                  ? 'text-foreground font-medium'
                  : done
                    ? 'text-foreground-muted'
                    : 'text-foreground-subtle'
              )}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Honest, non-escrow payment copy. Payments are out of the beta. */
export function PaymentNote() {
  // Seeing this is the moment a user learns the platform won't handle money.
  useEffect(() => {
    capture('dead_end_hit', { feature: 'payments' })
  }, [])

  return (
    <p className="text-sm text-foreground-subtle">
      Payment is arranged directly between you and the other party — ZTS Music does not
      hold, transfer or guarantee funds. Agree the amount and method between yourselves.
    </p>
  )
}
