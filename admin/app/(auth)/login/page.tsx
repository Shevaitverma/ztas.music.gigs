'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useSetAtom } from 'jotai'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authApi, isRequiresRoleResponse } from '@/lib/api/auth'
import { ApiClientError } from '@/lib/api/client'
import { userAtom } from '@/lib/atoms/auth'
import { signInWithGoogle } from '@/lib/firebase/google-auth'
import { initRecaptcha, sendOtp, verifyOtp } from '@/lib/firebase/phone-auth'
import {
  loginOtpSchema,
  loginPhoneSchema,
  type LoginOtpInput,
  type LoginPhoneInput,
} from '@/lib/schemas/auth'

type Step = 'phone' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setUser = useSetAtom(userAtom)

  const [step, setStep] = useState<Step>('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Surface middleware-supplied errors (?error=not_admin) once on mount.
  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'not_admin') {
      toast.error('Not authorized. This portal is for administrators only.')
    }
  }, [searchParams])

  const phoneForm = useForm<LoginPhoneInput>({
    resolver: zodResolver(loginPhoneSchema),
    defaultValues: { phone: '' },
  })
  const otpForm = useForm<LoginOtpInput>({
    resolver: zodResolver(loginOtpSchema),
    defaultValues: { otp: '' },
  })

  /**
   * Centralized post-verify handling. The verify endpoints set httpOnly
   * cookies on success; we just need to validate role and route.
   */
  async function handleVerifyResponse(
    response: Awaited<ReturnType<typeof authApi.verifyPhone>>
  ) {
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
    const next = searchParams.get('next')
    router.replace(next && next.startsWith('/') ? next : '/')
    router.refresh()
  }

  async function onSubmitPhone(values: LoginPhoneInput) {
    setSubmitting(true)
    try {
      const phone = values.phone.startsWith('+') ? values.phone : `+${values.phone}`
      const recaptcha = initRecaptcha('recaptcha-container')
      if (!recaptcha.success) {
        throw new Error(recaptcha.error || 'reCAPTCHA failed to initialize')
      }
      await sendOtp(phone)
      setPhoneNumber(phone)
      setStep('otp')
      toast.success('OTP sent')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to send OTP'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitOtp(values: LoginOtpInput) {
    setSubmitting(true)
    try {
      const { idToken } = await verifyOtp(values.otp)
      const response = await authApi.verifyPhone(idToken, phoneNumber)
      await handleVerifyResponse(response)
    } catch (e) {
      const message =
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'OTP verification failed'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
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
          Sign in with your administrator credentials.
        </p>

        {step === 'phone' ? (
          <form onSubmit={phoneForm.handleSubmit(onSubmitPhone)} className="flex flex-col gap-3">
            <Input
              id="phone"
              label="Phone number"
              placeholder="+919876543210"
              autoComplete="tel"
              {...phoneForm.register('phone')}
              error={phoneForm.formState.errors.phone?.message}
            />
            <Button type="submit" loading={submitting} className="mt-1 w-full">
              Send OTP
            </Button>
          </form>
        ) : (
          <form onSubmit={otpForm.handleSubmit(onSubmitOtp)} className="flex flex-col gap-3">
            <Input
              id="otp"
              label={`Enter OTP sent to ${phoneNumber}`}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              {...otpForm.register('otp')}
              error={otpForm.formState.errors.otp?.message}
            />
            <Button type="submit" loading={submitting} className="w-full">
              Verify & Sign in
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep('phone')
                otpForm.reset()
              }}
              disabled={submitting}
            >
              Change phone number
            </Button>
          </form>
        )}

        <div className="my-5 flex items-center gap-3 text-xs text-zinc-600">
          <div className="h-px flex-1 bg-zinc-800" />
          <span>OR</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={onGoogleSignIn}
          loading={googleLoading}
          className="w-full"
        >
          Continue with Google
        </Button>

        {/* Invisible reCAPTCHA mount point. */}
        <div id="recaptcha-container" />
      </CardContent>
    </Card>
  )
}
