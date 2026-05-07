import { VerificationService } from './verification.service';
import { verificationRoutes } from './verification.routes';

/**
 * Verification Module
 * Handles verification workflow for organizers and artists
 */
export const verificationModule = () => {
  const verificationService = new VerificationService();
  return verificationRoutes(verificationService);
};

export { VerificationService } from './verification.service';
export { verificationRoutes } from './verification.routes';
export * from './verification.schemas';
