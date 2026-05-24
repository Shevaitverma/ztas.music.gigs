'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Loader2, AlertCircle, RefreshCw, Music, Briefcase, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui'
import { useAuth } from '@/lib/providers'
import { authApi } from '@/lib/api'
import { isRequiresRoleResponse, type ProviderProfile } from '@/lib/api/auth'
import { getFirebaseStatus } from '@/lib/firebase/config'
import { signInWithGoogle } from '@/lib/firebase/google-auth'
import '@/lib/firebase/init' // Initialize Firebase on import
import toast from 'react-hot-toast'

type UserRole = 'artist' | 'client'

interface FirebaseState {
  isReady: boolean
  isChecking: boolean
  error: string | null
}

/**
 * Captures everything needed to finish signup once the user picks a role.
 * `signupToken` is the short-lived JWT issued by /auth/google/verify
 * when the account has no role yet — we hand it back to /auth/complete-signup.
 */
interface PendingSignup {
  type: 'google'
  signupToken: string
  providerProfile: ProviderProfile
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('next')
  const { login } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [firebaseState, setFirebaseState] = useState<FirebaseState>({
    isReady: false,
    isChecking: true,
    error: null,
  })
  const [showRoleSelection, setShowRoleSelection] = useState(false)
  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null)

  useEffect(() => {
    let mounted = true
    let retryCount = 0
    const maxRetries = 3

    const checkAndInitialize = () => {
      const status = getFirebaseStatus()

      if (!mounted) return

      if (status.isReady) {
        setFirebaseState({ isReady: true, isChecking: false, error: null })
      } else if (status.error) {
        setFirebaseState({ isReady: false, isChecking: false, error: status.error })
      } else if (retryCount < maxRetries) {
        retryCount++
        setTimeout(checkAndInitialize, 500 * retryCount)
      } else {
        setFirebaseState({
          isReady: false,
          isChecking: false,
          error: 'Firebase initialization timed out. Please refresh the page.',
        })
      }
    }

    const timer = setTimeout(checkAndInitialize, 100)

    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [])

  const handleGoogleLogin = async () => {
    if (!firebaseState.isReady) {
      toast.error('Authentication service is not available. Please refresh the page.')
      return
    }

    setIsLoading(true)

    try {
      // Sign in with Google via Firebase
      const googleResult = await signInWithGoogle()

      // Send Firebase token to backend for verification
      const response = await authApi.verifyGoogle(googleResult.idToken)

      // Branch on the structured `requiresRole` payload — no string matching.
      if (isRequiresRoleResponse(response)) {
        setPendingSignup({
          type: 'google',
          signupToken: response.signupToken,
          providerProfile: response.providerProfile,
        })
        setShowRoleSelection(true)
        return
      }

      login(
        { accessToken: response.accessToken, refreshToken: response.refreshToken },
        response.user
      )

      toast.success('Welcome back!')

      // Redirect to original destination or role-based dashboard
      const userRole = response.user.role?.toUpperCase()
      let redirectUrl: string
      if (response.isNewUser) {
        redirectUrl = `/onboarding?role=${userRole}`
      } else if (redirectTo) {
        redirectUrl = redirectTo
      } else {
        redirectUrl = userRole === 'ARTIST' ? '/artist' : userRole === 'ADMIN' ? '/admin' : '/client'
      }

      router.push(redirectUrl)
    } catch (error: any) {
      toast.error(error.message || 'Google login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleSelect = async (role: UserRole) => {
    if (!pendingSignup) return

    setIsLoading(true)
    try {
      // Hand the short-lived signupToken back to the server alongside the
      // selected role to finish account creation. The provider profile (name)
      // gives the backend something sensible to seed the user record with.
      const response = await authApi.completeSignup({
        signupToken: pendingSignup.signupToken,
        role,
        name: pendingSignup.providerProfile.displayName,
      })

      login(
        { accessToken: response.accessToken, refreshToken: response.refreshToken },
        response.user
      )

      toast.success('Account created successfully!')

      // Redirect to onboarding
      router.push(`/onboarding?role=${role.toUpperCase()}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete registration. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackFromRoleSelection = () => {
    setShowRoleSelection(false)
    setPendingSignup(null)
  }

  // Role selection UI
  if (showRoleSelection) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <button
          onClick={handleBackFromRoleSelection}
          className="flex items-center gap-2 text-foreground-muted hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Choose your role</h1>
          <p className="text-foreground-muted">Select how you want to use ZTS Music</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => handleRoleSelect('artist')}
            disabled={isLoading}
            className="w-full p-6 bg-surface hover:bg-surface-elevated border border-surface-overlay rounded-2xl transition-all group text-left disabled:opacity-50"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-violet-500/20 rounded-xl group-hover:bg-violet-500/30 transition-colors">
                <Music className="w-6 h-6 text-violet-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">I'm an Artist</h3>
                <p className="text-sm text-foreground-muted">
                  Find gigs, showcase your talent, and connect with clients looking for performers
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleRoleSelect('client')}
            disabled={isLoading}
            className="w-full p-6 bg-surface hover:bg-surface-elevated border border-surface-overlay rounded-2xl transition-all group text-left disabled:opacity-50"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-pink-500/20 rounded-xl group-hover:bg-pink-500/30 transition-colors">
                <Briefcase className="w-6 h-6 text-pink-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">I'm a Client</h3>
                <p className="text-sm text-foreground-muted">
                  Post gigs, discover talented artists, and hire performers for your events
                </p>
              </div>
            </div>
          </button>
        </div>

        {isLoading && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
            <span className="text-sm text-foreground-muted">Creating your account...</span>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back</h1>
        <p className="text-foreground-muted">Sign in to continue to ZTS Music</p>
      </div>

      {/* Firebase initialization states */}
      {firebaseState.isChecking && (
        <div className="mb-6 flex items-center justify-center gap-3 rounded-xl border border-surface-overlay bg-surface p-4">
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          <span className="text-sm text-foreground-muted">Initializing authentication...</span>
        </div>
      )}

      {firebaseState.error && !firebaseState.isChecking && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-error">Authentication service unavailable</p>
              <p className="text-sm text-foreground-muted mt-1">{firebaseState.error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh page
              </button>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="secondary"
        fullWidth
        size="lg"
        onClick={handleGoogleLogin}
        isLoading={isLoading}
        disabled={!firebaseState.isReady}
        leftIcon={
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        }
      >
        Continue with Google
      </Button>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-foreground-muted">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-violet-400 hover:text-violet-300 font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </motion.div>
  )
}
