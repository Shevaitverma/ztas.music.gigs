import type { ReactNode } from 'react'
import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { AuthBootstrap } from '@/lib/providers/auth-bootstrap'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthBootstrap>
      <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </AuthBootstrap>
  )
}
