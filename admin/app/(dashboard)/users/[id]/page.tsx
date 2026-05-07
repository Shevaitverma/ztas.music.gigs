'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, CheckCircle2, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ActivityLogList } from '@/components/users/activity-log-list'
import { UserActionPanel } from '@/components/users/user-action-panel'
import { UserRolePill } from '@/components/users/user-role-pill'
import { UserStatusPill } from '@/components/users/user-status-pill'
import { usersApi, usersQueryKeys } from '@/lib/api/users'
import type { UserDetail } from '@/lib/types'
import { cn } from '@/lib/utils/cn'

type Tab = 'profile' | 'activity' | 'actions'

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'activity', label: 'Activity' },
  { key: 'actions', label: 'Actions' },
]

function safeDate(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'PPp')
}

function joinLocation(loc?: { city?: string; state?: string; country?: string }) {
  if (!loc) return undefined
  return [loc.city, loc.state, loc.country].filter(Boolean).join(', ')
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const [tab, setTab] = useState<Tab>('profile')

  const userQuery = useQuery({
    queryKey: usersQueryKeys.detail(id),
    queryFn: () => usersApi.getById(id),
    enabled: !!id,
  })

  const activityQuery = useQuery({
    queryKey: usersQueryKeys.activity(id),
    queryFn: () => usersApi.getActivityLog(id, 100),
    enabled: !!id && tab === 'activity',
  })

  const user = userQuery.data ?? null

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/users"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </Link>
      </div>

      {userQuery.isLoading ? (
        <UserHeaderSkeleton />
      ) : userQuery.isError ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-5 text-sm text-rose-300">
          Failed to load user.
        </div>
      ) : !user ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
          User not found in the most recent listing page. The detail view currently
          falls back to the list endpoint; ask an engineer to add a dedicated
          <code className="mx-1 rounded bg-zinc-800 px-1">GET /admin/users/:id</code>
          route to make this view robust.
        </div>
      ) : (
        <UserHeader user={user} />
      )}

      <div className="border-b border-zinc-800">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'border-indigo-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profile' && user && <ProfileTab user={user} />}
      {tab === 'activity' && (
        <ActivityLogList
          entries={activityQuery.data ?? []}
          loading={activityQuery.isLoading}
        />
      )}
      {tab === 'actions' && user && <UserActionPanel user={user} />}
    </div>
  )
}

function UserHeader({ user }: { user: UserDetail }) {
  const initial = (user.name?.[0] || user.email?.[0] || '?').toUpperCase()
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      {user.profilePicture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.profilePicture}
          alt=""
          className="h-14 w-14 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-semibold text-zinc-200">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold text-zinc-100">
            {user.name || 'Unnamed user'}
          </h2>
          <UserRolePill role={user.role} />
          <UserStatusPill status={user.status} />
          {user.isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <ShieldCheck className="h-3 w-3" /> Verified
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-zinc-500">ID {user.id}</div>
      </div>
    </div>
  )
}

function UserHeaderSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="h-14 w-14 animate-pulse rounded-full bg-zinc-800" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-64 animate-pulse rounded bg-zinc-800/70" />
      </div>
    </div>
  )
}

function ProfileTab({ user }: { user: UserDetail }) {
  const artistLoc = joinLocation(user.artistProfile?.location)
  const clientLoc = joinLocation(user.clientProfile?.location)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardContent>
          <h3 className="text-sm font-semibold text-zinc-100">Account</h3>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
            <Field label="Name" value={user.name || '—'} />
            <Field
              label="Email"
              value={
                user.email ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-zinc-500" />
                    {user.email}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <Field
              label="Phone"
              value={
                user.phoneNumber ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-zinc-500" />
                    {user.phoneNumber}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <Field label="Joined" value={safeDate(user.joinedAt ?? user.createdAt)} />
            <Field label="Last login" value={safeDate(user.lastLogin)} />
            <Field
              label="Verified"
              value={
                user.isVerified ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                  </span>
                ) : (
                  <span className="text-zinc-500">No</span>
                )
              }
            />
            {user.statusReason && (
              <Field label="Status reason" value={user.statusReason} />
            )}
          </dl>
        </CardContent>
      </Card>

      {user.artistProfile && (
        <Card>
          <CardContent>
            <h3 className="text-sm font-semibold text-zinc-100">Artist profile</h3>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
              {user.artistProfile.stageName && (
                <Field label="Stage name" value={user.artistProfile.stageName} />
              )}
              {user.artistProfile.bio && (
                <Field label="Bio" value={user.artistProfile.bio} />
              )}
              {typeof user.artistProfile.yearsOfExperience === 'number' && (
                <Field
                  label="Years of experience"
                  value={String(user.artistProfile.yearsOfExperience)}
                />
              )}
              {artistLoc && (
                <Field
                  label="Location"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                      {artistLoc}
                    </span>
                  }
                />
              )}
              {user.artistProfile.genres && user.artistProfile.genres.length > 0 && (
                <Field label="Genres" value={user.artistProfile.genres.join(', ')} />
              )}
              {user.artistProfile.instruments &&
                user.artistProfile.instruments.length > 0 && (
                  <Field
                    label="Instruments"
                    value={user.artistProfile.instruments.join(', ')}
                  />
                )}
              {user.artistProfile.languages && user.artistProfile.languages.length > 0 && (
                <Field
                  label="Languages"
                  value={user.artistProfile.languages.join(', ')}
                />
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {user.clientProfile && (
        <Card>
          <CardContent>
            <h3 className="text-sm font-semibold text-zinc-100">Client profile</h3>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
              {user.clientProfile.company && (
                <Field label="Company" value={user.clientProfile.company} />
              )}
              {user.clientProfile.industry && (
                <Field label="Industry" value={user.clientProfile.industry} />
              )}
              {clientLoc && (
                <Field
                  label="Location"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                      {clientLoc}
                    </span>
                  }
                />
              )}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="col-span-2 text-zinc-200">{value}</dd>
    </div>
  )
}
