'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Provider as JotaiProvider } from 'jotai'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'react-hot-toast'

// Side-effect import: bootstraps Firebase on the client.
import '@/lib/firebase/init'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
          mutations: { retry: 1 },
        },
      })
  )

  return (
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1c1c1f',
              color: '#fafafa',
              border: '1px solid #242428',
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#1c1c1f' } },
            error: { iconTheme: { primary: '#f43f5e', secondary: '#1c1c1f' } },
          }}
        />
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
        )}
      </QueryClientProvider>
    </JotaiProvider>
  )
}
