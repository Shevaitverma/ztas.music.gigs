'use client'

import { useAtomValue, useSetAtom } from 'jotai'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { authApi } from '@/lib/api/auth'
import { adminRoleAtom, userAtom, userNameAtom } from '@/lib/atoms/auth'

export function Header() {
  const router = useRouter()
  const userName = useAtomValue(userNameAtom)
  const adminRole = useAtomValue(adminRoleAtom)
  const setUser = useSetAtom(userAtom)
  const [loggingOut, setLoggingOut] = useState(false)

  async function onLogout() {
    setLoggingOut(true)
    try {
      await authApi.logout()
    } catch {
      /* server best-effort; cookies may already be invalid */
    }
    setUser(null)
    toast.success('Signed out')
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-5">
      <div className="text-sm text-zinc-400">Admin Console</div>
      <div className="flex items-center gap-3">
        <div className="text-right text-xs leading-tight">
          <div className="font-medium text-zinc-200">{userName || 'Administrator'}</div>
          {adminRole && <div className="text-zinc-500">{adminRole}</div>}
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout} loading={loggingOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  )
}
