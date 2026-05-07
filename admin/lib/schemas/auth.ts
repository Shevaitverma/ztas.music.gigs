import { z } from 'zod'

// E.164-ish: leading + optional, leading digit 1-9, then 7-14 more digits.
const phoneRegex = /^\+?[1-9]\d{7,14}$/

export const phoneSchema = z
  .string()
  .trim()
  .regex(phoneRegex, 'Enter a valid phone number (8-15 digits, optional leading +)')

export const otpSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code')

export const loginPhoneSchema = z.object({ phone: phoneSchema })
export const loginOtpSchema = z.object({ otp: otpSchema })

export type LoginPhoneInput = z.infer<typeof loginPhoneSchema>
export type LoginOtpInput = z.infer<typeof loginOtpSchema>
