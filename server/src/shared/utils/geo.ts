/**
 * Geo Utilities
 * Distance calculations for location-based validation (e.g. OTP check-in).
 */

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Compute great-circle distance between two lat/lng points in meters
 * using the haversine formula.
 */
export function geoDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Maximum tolerated distance (in meters) between the artist's reported GPS
 * position and the venue when verifying OTP check-in.
 */
export const OTP_GPS_TOLERANCE_METERS = 200;
