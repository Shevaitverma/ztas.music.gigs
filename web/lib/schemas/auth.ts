import { z } from 'zod'

// Server's /auth/complete-signup accepts exactly these two role strings.
export const registrationRoleSchema = z.enum(['client', 'artist'])
