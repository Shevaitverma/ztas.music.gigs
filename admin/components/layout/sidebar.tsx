'use client'

import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/verifications', label: 'Verifications', icon: ShieldCheck },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 lg:block">
      <div className="flex h-14 items-center border-b border-zinc-800 px-5">
        <span className="text-sm font-semibold tracking-tight text-zinc-100">ZTS Admin</span>
      </div>
      <nav className="flex flex-col gap-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-zinc-800/80 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
