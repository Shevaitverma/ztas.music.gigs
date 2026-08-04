import { t } from 'elysia';
import { UserStatus } from '../../shared/enums';

/**
 * Update User Status Schema
 */
export const UpdateUserStatusSchema = t.Object({
  status: t.Enum(UserStatus),
  reason: t.Optional(t.String()),
});

/**
 * Verify User Schema
 */
export const VerifyUserSchema = t.Object({
  isVerified: t.Boolean(),
});
