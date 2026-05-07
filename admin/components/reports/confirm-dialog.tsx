'use client'

import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Minimal modal — feature-local per the agent contract (don't globalize).
 * Closes on Escape and backdrop click.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  disableConfirm = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
  loading?: boolean
  disableConfirm?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (!loading) onCancel()
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        </div>
        <div className="px-5 py-4 text-sm text-zinc-300">{children}</div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={disableConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
