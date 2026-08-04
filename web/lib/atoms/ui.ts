'use client'

import { atom } from 'jotai'

// Sidebar collapse state, shared by the dashboard layout, header and sidebar.
export const isSidebarCollapsedAtom = atom(false)
