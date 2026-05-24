'use client'

import { RoleGuard } from '@/components/role-guard'

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RoleGuard role="CLIENT">{children}</RoleGuard>
}
