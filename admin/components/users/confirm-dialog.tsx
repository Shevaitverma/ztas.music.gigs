'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
  loading?: boolean
  disabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

/**
 * Local confirm dialog scoped to the users-moderation feature. Modal pattern
 * uses native `<dialog>` for focus trap + esc-to-close without a portal lib.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading,
  disabled,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    const onCancelEvent = (e: Event) => {
      e.preventDefault()
      onCancel()
    }
    dlg.addEventListener('cancel', onCancelEvent)
    return () => dlg.removeEventListener('cancel', onCancelEvent)
  }, [onCancel])

  return (
    <dialog
      ref={ref}
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-0 text-zinc-100 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
    >
      <div className="w-[min(28rem,90vw)] p-5">
        <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        {description && (
          <div className="mt-2 text-sm text-zinc-400">{description}</div>
        )}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
