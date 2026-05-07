import { CheckInService } from './checkin.service';
import { checkinRoutes } from './checkin.routes';
import { GigsService } from '../gigs/gigs.service';

/**
 * Check-In Module.
 *
 * The CheckInService composes a GigsService instance so the BOOKED ->
 * COMPLETED and (any-state) -> CANCELLED transitions go through the gig
 * state-machine validator instead of bypassing it with raw model writes.
 * GigsService is stateless and cheap to instantiate, so a dedicated instance
 * here is fine.
 */
export const checkinModule = () => {
  const gigsService = new GigsService();
  const checkinService = new CheckInService(gigsService);
  return checkinRoutes(checkinService);
};

export { CheckInService } from './checkin.service';
export { checkinRoutes } from './checkin.routes';
export * from './checkin.schemas';
