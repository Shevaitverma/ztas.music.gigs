/**
 * Export all Mongoose models
 */
// Export Models
export { UserModel } from './user.model';
export { GigModel } from './gig.model';
export { BidModel } from './bid.model';
export { ApplicationModel } from './application.model';
export { VenueModel } from './venue.model';
export { ReviewModel } from './review.model';
export { ReportModel } from './report.model';
export { EventCheckInModel } from './event-checkin.model';
export { OrganizerVerificationModel } from './organizer-verification.model';
export { ArtistVerificationModel } from './artist-verification.model';
export { ActivityLogModel } from './activity-log.model';
export { NotificationModel } from './notification.model';

// Export Interfaces
export type { User } from './user.model';
export type { Gig } from './gig.model';
export type { Bid } from './bid.model';
export type { Application } from './application.model';
export type { Venue } from './venue.model';
export type { Review } from './review.model';
export type { Report } from './report.model';
export type { EventCheckIn, ArtistCheckInLocation, EventEndConfirmation } from './event-checkin.model';
export type {
  OrganizerVerification,
  IdentityVerification,
  BusinessVerification,
  VenueVerification,
} from './organizer-verification.model';
export type {
  ArtistVerification,
  ArtistIdentityVerification,
  ProfessionalVerification,
  BankAccountVerification,
} from './artist-verification.model';
export type { ActivityLog } from './activity-log.model';
export type { Notification } from './notification.model';
export { NotificationType } from './notification.model';

// Export types
export type { UserLocation, ArtistProfile, ClientProfile, AudioSample, GeoPoint } from './user.model';
export type { VenueLocation, BudgetRange, EventTiming } from './gig.model';
export type { VenueParams } from './venue.model';
