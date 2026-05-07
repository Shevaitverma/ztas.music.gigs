'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import type { UserListFilters } from '@/lib/types'

/**
 * Filter form. URL is the source of truth — the form is uncontrolled-ish:
 * we hydrate `defaultValues` from the URL and call `onChange` (debounced
 * for the search input via submit-on-blur + submit-on-enter; selects fire
 * onChange immediately).
 *
 * Role 'admin' is intentionally NOT offered (admins are not flippable from
 * the moderation UI). Role 'admin' rows can still appear in results because
 * the server may return them when no role filter is active.
 */

interface UserFiltersProps {
  initial: UserListFilters
  onChange: (next: UserListFilters) => void
}

interface FormShape {
  search: string
  role: '' | 'artist' | 'client'
  status: '' | 'active' | 'inactive' | 'banned' | 'suspended' | 'pending'
  isVerified: '' | 'true' | 'false'
}

function toForm(f: UserListFilters): FormShape {
  return {
    search: f.search ?? '',
    role: (f.role === 'admin' ? '' : (f.role ?? '')) as FormShape['role'],
    status: (f.status ?? '') as FormShape['status'],
    isVerified:
      f.isVerified === true ? 'true' : f.isVerified === false ? 'false' : '',
  }
}

function fromForm(v: FormShape): UserListFilters {
  return {
    search: v.search.trim() || undefined,
    role: v.role || undefined,
    status: v.status || undefined,
    isVerified:
      v.isVerified === 'true' ? true : v.isVerified === 'false' ? false : undefined,
  }
}

const SELECT_CLASSES = cn(
  'h-10 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100',
  'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
)

export function UserFilters({ initial, onChange }: UserFiltersProps) {
  const { register, handleSubmit, reset, watch } = useForm<FormShape>({
    defaultValues: toForm(initial),
  })

  // Re-hydrate when URL changes externally (e.g. browser back).
  useEffect(() => {
    reset(toForm(initial))
  }, [initial.search, initial.role, initial.status, initial.isVerified, reset, initial])

  // Auto-fire when selects change.
  useEffect(() => {
    const sub = watch((value, info) => {
      if (info.name === 'role' || info.name === 'status' || info.name === 'isVerified') {
        onChange(fromForm(value as FormShape))
      }
    })
    return () => sub.unsubscribe()
  }, [watch, onChange])

  const submit = handleSubmit((value) => onChange(fromForm(value)))

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label className="text-xs font-medium text-zinc-400" htmlFor="users-filter-search">
          Search
        </label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            id="users-filter-search"
            placeholder="Name or email"
            className="pl-9"
            {...register('search')}
            onBlur={() => submit()}
          />
        </div>
      </div>

      <div className="flex flex-col">
        <label className="text-xs font-medium text-zinc-400" htmlFor="users-filter-role">
          Role
        </label>
        <select
          id="users-filter-role"
          className={cn(SELECT_CLASSES, 'mt-1.5')}
          {...register('role')}
        >
          <option value="">All roles</option>
          <option value="artist">Artist</option>
          <option value="client">Client</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs font-medium text-zinc-400" htmlFor="users-filter-status">
          Status
        </label>
        <select
          id="users-filter-status"
          className={cn(SELECT_CLASSES, 'mt-1.5')}
          {...register('status')}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs font-medium text-zinc-400" htmlFor="users-filter-verified">
          Verified
        </label>
        <select
          id="users-filter-verified"
          className={cn(SELECT_CLASSES, 'mt-1.5')}
          {...register('isVerified')}
        >
          <option value="">Any</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
      </div>

      <Button type="submit" size="md" variant="secondary" className="sm:self-end">
        Apply
      </Button>
    </form>
  )
}
