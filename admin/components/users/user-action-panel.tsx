'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Ban, CheckCircle2, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usersApi, usersQueryKeys } from '@/lib/api/users'
import { usePermission } from '@/lib/permissions'
import type { AssignableUserStatus, UserDetail } from '@/lib/types'
import { ConfirmDialog } from './confirm-dialog'

interface UserActionPanelProps {
  user: UserDetail
}

interface PendingAction {
  status: AssignableUserStatus
  label: string
  description: string
  variant: 'primary' | 'danger'
  needsReason: boolean
}

const ACTIONS: Record<AssignableUserStatus, PendingAction> = {
  suspended: {
    status: 'suspended',
    label: 'Suspend user',
    description: 'Suspended users cannot sign in but their data is retained. Provide a reason for the audit log.',
    variant: 'danger',
    needsReason: true,
  },
  banned: {
    status: 'banned',
    label: 'Ban user',
    description: 'Banned users are blocked indefinitely. Provide a reason for the audit log.',
    variant: 'danger',
    needsReason: true,
  },
  active: {
    status: 'active',
    label: 'Reactivate user',
    description: 'Restore the user to active status. A reason is optional.',
    variant: 'primary',
    needsReason: false,
  },
}

export function UserActionPanel({ user }: UserActionPanelProps) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [reason, setReason] = useState('')
  const canBan = usePermission('BAN_USERS')

  const isAdminTarget = user.role === 'admin'

  const mutation = useMutation({
    mutationFn: (input: { status: AssignableUserStatus; reason?: string }) =>
      usersApi.updateStatus(user.id, input.status, input.reason),
    onSuccess: () => {
      toast.success('User status updated')
      qc.invalidateQueries({ queryKey: usersQueryKeys.all })
      qc.invalidateQueries({ queryKey: usersQueryKeys.detail(user.id) })
      qc.invalidateQueries({ queryKey: usersQueryKeys.activity(user.id) })
      setPending(null)
      setReason('')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to update status'
      toast.error(msg)
    },
  })

  const isBanned = user.status === 'banned'
  const isSuspended = user.status === 'suspended'
  const isActive = user.status === 'active'

  const open = (action: PendingAction) => {
    setReason('')
    setPending(action)
  }

  const close = () => {
    if (mutation.isPending) return
    setPending(null)
    setReason('')
  }

  const confirm = () => {
    if (!pending) return
    if (pending.needsReason && reason.trim().length < 3) {
      toast.error('Please provide a reason (at least 3 characters)')
      return
    }
    mutation.mutate({
      status: pending.status,
      reason: reason.trim() ? reason.trim() : undefined,
    })
  }

  if (isAdminTarget) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        Admin accounts cannot be modified from this panel. Use the server-side
        super-admin tooling.
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Moderation actions</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Status changes are logged to the audit trail with the current admin&apos;s identity.
        </p>

        {user.statusReason && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
            <span className="font-medium text-zinc-300">Last reason:</span> {user.statusReason}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {canBan && !isSuspended && !isBanned && (
            <Button variant="danger" size="sm" onClick={() => open(ACTIONS.suspended)}>
              <PauseCircle className="h-4 w-4" />
              Suspend
            </Button>
          )}
          {canBan && !isBanned && (
            <Button variant="danger" size="sm" onClick={() => open(ACTIONS.banned)}>
              <Ban className="h-4 w-4" />
              Ban
            </Button>
          )}
          {canBan && !isActive && (
            <Button variant="primary" size="sm" onClick={() => open(ACTIONS.active)}>
              <CheckCircle2 className="h-4 w-4" />
              Reactivate
            </Button>
          )}
          {!canBan && (
            <p className="text-xs text-zinc-500">
              Your admin tier doesn&apos;t have permission to change user status.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        title={pending?.label ?? 'Confirm'}
        description={pending?.description}
        variant={pending?.variant ?? 'primary'}
        confirmLabel={pending?.label ?? 'Confirm'}
        loading={mutation.isPending}
        onCancel={close}
        onConfirm={confirm}
      >
        <label className="block text-xs font-medium text-zinc-400" htmlFor="status-reason">
          Reason {pending?.needsReason ? '' : '(optional)'}
        </label>
        <textarea
          id="status-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder={
            pending?.needsReason
              ? 'Why is this action being taken?'
              : 'Optional notes for the audit log'
          }
        />
        <div className="mt-1 text-right text-[10px] text-zinc-600">{reason.length}/500</div>
      </ConfirmDialog>
    </>
  )
}
