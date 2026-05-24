'use client'

import { RoleGuard } from '@/components/role-guard'

export default function ArtistLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RoleGuard role="ARTIST">{children}</RoleGuard>
}
