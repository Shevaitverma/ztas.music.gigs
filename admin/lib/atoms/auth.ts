'use client'

import { atom } from 'jotai'
import type { User } from '@/lib/types'

// Cookies are the source of truth for tokens. This atom only mirrors the
// authenticated user object for in-app reads.
export const userAtom = atom<User | null>(null)

export const isAuthenticatedAtom = atom((get) => get(userAtom) !== null)
export const isAdminAtom = atom((get) => get(userAtom)?.role === 'admin')
export const userNameAtom = atom((get) => get(userAtom)?.name ?? '')
export const adminRoleAtom = atom((get) => get(userAtom)?.adminRole ?? null)
