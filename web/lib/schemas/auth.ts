import { z } from 'zod'

export const emailSchema = z.string().trim().email('Enter a valid email address')

export const loginEmailSchema = z.object({
  email: emailSchema,
})

// Server's /auth/complete-signup accepts exactly these two role strings.
export const userRoleSchema = z.enum(['client', 'artist'])
export const registrationRoleSchema = userRoleSchema

export type LoginEmailInput = z.infer<typeof loginEmailSchema>
