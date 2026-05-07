'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  resolveFormSchema,
  resolveVerdictValues,
  type ResolveFormInput,
  type ResolveVerdict,
} from '@/lib/schemas/report'
import { ConfirmDialog } from './confirm-dialog'
import { cn } from '@/lib/utils/cn'

const VERDICT_LABELS: Record<ResolveVerdict, { title: string; sub: string }> = {
  valid: {
    title: 'Valid — content removed',
    sub: 'Report substantiated. Content has been removed.',
  },
  inconclusive: {
    title: 'Inconclusive — warning issued',
    sub: 'Not enough evidence to act decisively. Reporter / target warned.',
  },
  invalid: {
    title: 'Invalid — no action',
    sub: 'Report not substantiated. No action taken.',
  },
}

/**
 * Resolve dialog: verdict + notes (>= 10 chars). Submits to the parent which
 * calls `reportsApi.resolve`. Banning the reported user is intentionally not
 * available here — admins must do that via the users panel.
 */
export function ResolveDialog({
  open,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean
  loading?: boolean
  onCancel: () => void
  onSubmit: (input: ResolveFormInput) => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid },
  } = useForm<ResolveFormInput>({
    resolver: zodResolver(resolveFormSchema),
    mode: 'onChange',
    defaultValues: { verdict: 'valid', notes: '' },
  })

  const verdict = watch('verdict')

  useEffect(() => {
    if (open) reset({ verdict: 'valid', notes: '' })
  }, [open, reset])

  return (
    <ConfirmDialog
      open={open}
      title="Resolve report"
      confirmLabel="Resolve"
      variant="primary"
      loading={loading}
      disableConfirm={!isValid}
      onCancel={onCancel}
      onConfirm={handleSubmit(onSubmit)}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit(onSubmit)()
        }}
      >
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Verdict
          </div>
          <div className="space-y-1.5">
            {resolveVerdictValues.map((v) => {
              const meta = VERDICT_LABELS[v]
              const active = verdict === v
              return (
                <button
                  type="button"
                  key={v}
                  onClick={() => setValue('verdict', v, { shouldValidate: true })}
                  className={cn(
                    'block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    active
                      ? 'border-indigo-500 bg-indigo-500/10 text-zinc-100'
                      : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700'
                  )}
                >
                  <div className="font-medium">{meta.title}</div>
                  <div className="text-xs text-zinc-500">{meta.sub}</div>
                </button>
              )
            })}
          </div>
          <input type="hidden" {...register('verdict')} />
        </div>

        <div>
          <label
            htmlFor="resolve-notes"
            className="mb-1.5 block text-xs font-medium text-zinc-400"
          >
            Resolution notes
          </label>
          <textarea
            id="resolve-notes"
            rows={4}
            placeholder="At least 10 characters. Visible to other admins."
            {...register('notes')}
            className={cn(
              'w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100',
              'placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
              errors.notes && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
            )}
          />
          {errors.notes && (
            <span className="mt-1 block text-xs text-rose-400">{errors.notes.message}</span>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            To ban or suspend the reported user, use the Users panel after resolving.
          </p>
        </div>
      </form>
    </ConfirmDialog>
  )
}
