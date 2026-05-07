'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { UserFilters } from '@/components/users/user-filters'
import { UserTable } from '@/components/users/user-table'
import { usersApi, usersQueryKeys } from '@/lib/api/users'
import type { UserListFilters, UserRole, UserStatus } from '@/lib/types'

const PAGE_SIZE = 20

const VALID_ROLES: UserRole[] = ['artist', 'client', 'admin']
const VALID_STATUSES: UserStatus[] = ['active', 'inactive', 'banned', 'suspended', 'pending']

function parseFilters(sp: URLSearchParams): UserListFilters {
  const role = sp.get('role')
  const status = sp.get('status')
  const isVerifiedRaw = sp.get('isVerified')
  const search = sp.get('search')?.trim() || undefined
  const pageRaw = sp.get('page')
  const pageNum = pageRaw ? Number.parseInt(pageRaw, 10) : 1
  return {
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
    limit: PAGE_SIZE,
    role: role && VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : undefined,
    status:
      status && VALID_STATUSES.includes(status as UserStatus)
        ? (status as UserStatus)
        : undefined,
    isVerified:
      isVerifiedRaw === 'true' ? true : isVerifiedRaw === 'false' ? false : undefined,
    search,
  }
}

function toQuery(filters: UserListFilters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.role) params.set('role', filters.role)
  if (filters.status) params.set('status', filters.status)
  if (filters.isVerified !== undefined) params.set('isVerified', String(filters.isVerified))
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  return params.toString()
}

export default function UsersListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filters = useMemo(
    () => parseFilters(searchParams ?? new URLSearchParams()),
    [searchParams]
  )

  const query = useQuery({
    queryKey: usersQueryKeys.list(filters),
    queryFn: () => usersApi.list(filters),
    placeholderData: keepPreviousData,
  })

  const updateFilters = useCallback(
    (next: UserListFilters) => {
      const merged: UserListFilters = { ...filters, ...next, page: 1 }
      const qs = toQuery(merged)
      router.replace(qs ? `/users?${qs}` : '/users')
    },
    [filters, router]
  )

  const goToPage = useCallback(
    (page: number) => {
      const merged: UserListFilters = { ...filters, page }
      const qs = toQuery(merged)
      router.replace(qs ? `/users?${qs}` : '/users')
    },
    [filters, router]
  )

  const pagination = query.data?.pagination
  const total = pagination?.total ?? 0
  const currentPage = pagination?.page ?? filters.page ?? 1
  const totalPages = pagination?.totalPages ?? 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Users</h1>
          <p className="text-sm text-zinc-500">
            Moderate user accounts. {total > 0 && <span>{total} total.</span>}
          </p>
        </div>
      </div>

      <UserFilters initial={filters} onChange={updateFilters} />

      {query.isError ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-5 text-sm text-rose-300">
          Failed to load users.{' '}
          <button
            className="underline underline-offset-2 hover:text-rose-200"
            onClick={() => query.refetch()}
          >
            Retry
          </button>
        </div>
      ) : (
        <UserTable users={query.data?.data ?? []} loading={query.isLoading} />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-zinc-400">
          <div>
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1 || query.isFetching}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages || query.isFetching}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
