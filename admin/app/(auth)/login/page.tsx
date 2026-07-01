'use client'

import { useSetAtom } from 'jotai'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { authApi, isRequiresRoleResponse, type VerifyResponse } from '@/lib/api/auth'
import { ApiClientError } from '@/lib/api/client'
import { userAtom } from '@/lib/atoms/auth'
import { signInWithGoogle } from '@/lib/firebase/google-auth'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setUser = useSetAtom(userAtom)

  const [googleLoading, setGoogleLoading] = useState(false)

  // Surface middleware-supplied errors (?error=not_admin) once on mount.
  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'not_admin') {
      toast.error('Not authorized. This portal is for administrators only.')
    }
  }, [searchParams])

  /**
   * Centralized post-verify handling. The verify endpoint sets httpOnly
   * cookies on success; we just need to validate role and route.
   */
  async function handleVerifyResponse(response: VerifyResponse) {
    if (isRequiresRoleResponse(response)) {
      // Admin accounts are minted server-side. We refuse to complete signup here.
      toast.error('Account not found. Contact your administrator.')
      return
    }

    if (response.user.role !== 'admin') {
      // The cookies were just set; clear them so we don't leak a non-admin session.
      try {
        await authApi.logout()
      } catch {
        /* best-effort */
      }
      toast.error('Not authorized. This portal is for administrators only.')
      return
    }

    setUser(response.user)
    toast.success(`Welcome, ${response.user.name}`)
    // Only allow same-origin relative redirects (ADM-003). `startsWith('/')`
    // alone is true for protocol-relative `//evil.com` (and `/\evil.com`),
    // which the router resolves to a foreign origin — a post-auth open redirect.
    const next = searchParams.get('next')
    const safeNext =
      next && next.startsWith('/') && next[1] !== '/' && next[1] !== '\\' ? next : '/'
    router.replace(safeNext)
    router.refresh()
  }

  async function onGoogleSignIn() {
    setGoogleLoading(true)
    try {
      const { idToken } = await signInWithGoogle()
      const response = await authApi.verifyGoogle(idToken)
      await handleVerifyResponse(response)
    } catch (e) {
      const message =
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Google sign-in failed'
      toast.error(message)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Admin Sign-in</h2>
        <p className="mb-5 text-sm text-zinc-500">
          Sign in with your administrator Google account.
        </p>

        <Button
          type="button"
          variant="secondary"
          onClick={onGoogleSignIn}
          loading={googleLoading}
          className="w-full"
        >
          Continue with Google
        </Button>
      </CardContent>
    </Card>
  )
}
