'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface PiiFieldProps {
  /** Human label for the field, e.g. "Aadhaar number". */
  label: string
  /** The masked value (last-4 form), as returned by the server. May be undefined when not submitted. */
  masked?: string
  /** Identifier of the user this field belongs to — used for the audit log entry. */
  userId: string
  /** Audit-log key, e.g. "aadhaar", "pan", "bank_account". */
  field: string
}

/**
 * PII field — masked by default. Clicking "Reveal" exposes the masked (last-4) value
 * the server returned. The full document number is encrypted at rest server-side and
 * is never sent to the client; "Reveal" therefore only un-hides the masked form.
 *
 * Each reveal click logs to the console with a structured tag so a future audit-trail
 * backend hook can pick it up.
 */
export function PiiField({ label, masked, userId, field }: PiiFieldProps) {
  const [revealed, setRevealed] = useState(false)

  const handleReveal = () => {
    if (!revealed) {
      // TODO: wire to server-side audit-trail endpoint so reveals are logged
      // against the acting admin with the raw userId server-side, not here.
      // Until then we only emit a dev-only breadcrumb without the raw userId
      // to avoid leaking PII into browser consoles / log shippers in prod.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.info('[admin-pii-reveal]', field)
      }
    }
    setRevealed((v) => !v)
  }

  if (!masked) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <span className="text-sm text-zinc-500 italic">Not submitted</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-zinc-100">
          {revealed ? masked : '••••••••'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReveal}
          className="h-6 px-2 text-xs"
        >
          {revealed ? (
            <>
              <EyeOff className="h-3 w-3" /> Hide
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" /> Reveal
            </>
          )}
        </Button>
      </div>
      <span className="text-[10px] text-zinc-600">
        Server returns last 4 only; full number is encrypted at rest.
      </span>
    </div>
  )
}
