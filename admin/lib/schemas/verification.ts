import { z } from 'zod'

export const verificationSectionSchema = z.enum([
  'identity',
  'business',
  'bank',
  'professional',
  'venue',
])
export type VerificationSection = z.infer<typeof verificationSectionSchema>

export const verificationTypeSchema = z.enum(['artist', 'organizer'])
export type VerificationKind = z.infer<typeof verificationTypeSchema>

export const approveVerificationSchema = z.object({
  verificationId: z.string().min(1, 'Verification id is required'),
  section: verificationSectionSchema,
  venueId: z.string().optional(),
  notes: z.string().max(500).optional(),
})
export type ApproveVerificationInput = z.infer<typeof approveVerificationSchema>

export const rejectVerificationSchema = z.object({
  verificationId: z.string().min(1, 'Verification id is required'),
  section: verificationSectionSchema,
  venueId: z.string().optional(),
  reason: z
    .string()
    .trim()
    .min(10, 'Please provide a reason of at least 10 characters')
    .max(500, 'Reason must be 500 characters or less'),
})
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>
