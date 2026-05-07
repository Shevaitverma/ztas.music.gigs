import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">ZTS Music Admin</h1>
          <p className="mt-1 text-sm text-zinc-500">Internal operations console</p>
        </div>
        {children}
      </div>
    </div>
  )
}
