import { z } from 'zod'

// E.164-ish: leading + optional, leading digit 1-9, then 7-14 more digits.
const phoneRegex = /^\+?[1-9]\d{7,14}$/

export const phoneSchema = z
  .string()
  .trim()
  .regex(phoneRegex, 'Enter a valid phone number (8-15 digits, optional leading +)')

export const emailSchema = z.string().trim().email('Enter a valid email address')

export const otpSchema = z
  .string()
  .regex(/^\d{6}$/, 'Enter the 6-digit code')

export const loginPhoneSchema = z.object({
  phone: phoneSchema,
})

export const loginEmailSchema = z.object({
  email: emailSchema,
})

// Server's /auth/complete-signup accepts exactly these two role strings.
export const userRoleSchema = z.enum(['client', 'artist'])
export const registrationRoleSchema = userRoleSchema

export const registerDetailsSchema = z.object({
  role: registrationRoleSchema,
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name is too long'),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
})

export type LoginPhoneInput = z.infer<typeof loginPhoneSchema>
export type LoginEmailInput = z.infer<typeof loginEmailSchema>
export type RegisterDetailsInput = z.infer<typeof registerDetailsSchema>
