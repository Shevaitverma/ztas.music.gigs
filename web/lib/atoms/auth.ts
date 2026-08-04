'use client'

import { atom } from 'jotai'
import type { User } from '@/lib/types'

// Session user. Cookies remain the source of truth for tokens; this only
// mirrors the authenticated user object for in-app reads.
export const userAtom = atom<User | null>(null)
