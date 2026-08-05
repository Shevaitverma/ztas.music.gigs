/**
 * Event wall-clock, client side.
 *
 * Mirrors `server/src/shared/utils/event-time.ts`. Gig dates are stored as UTC
 * midnight (the API takes `yyyy-MM-dd`) while `startTime`/`endTime` are bare
 * "HH:mm" strings meaning **event-local** wall clock — which for this product is
 * always IST.
 *
 * The trap this exists to avoid: `new Date(date).setHours(h, m)` interprets the
 * time in the *browser's* zone. An organiser in London opening the manage page
 * would compute a 19:00 IST gig as unlocking at 19:00 BST — five and a half
 * hours late — and disagree with the server's own gate. Always go through here.
 */

export const APP_TIMEZONE = 'Asia/Kolkata'

/** Offset of `tz` from UTC, in ms, at the given instant. */
function tzOffsetMs(at: Date, tz: string): number {
  // `en-CA` yields ISO-ish "YYYY-MM-DD, HH:MM:SS", which is trivial to reassemble.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  // Reading the same instant as if the zone's wall clock were UTC gives the offset.
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  )
  return asUtc - at.getTime()
}

/**
 * Absolute instant for a stored event date + "HH:mm", read as APP_TIMEZONE
 * wall clock. Two passes so the offset used is the one actually in force at the
 * resulting instant (irrelevant for IST, which has no DST, but correct if
 * APP_TIMEZONE ever changes).
 */
export function eventStartsAt(eventTiming: {
  date: string | Date
  startTime: string
}): Date {
  const d = new Date(eventTiming.date)
  const [h, m] = eventTiming.startTime.split(':').map(Number)

  const naive = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m)
  const firstPass = naive - tzOffsetMs(new Date(naive), APP_TIMEZONE)
  return new Date(naive - tzOffsetMs(new Date(firstPass), APP_TIMEZONE))
}

/** When the organiser may generate the check-in OTP: 30 min before event start. */
export function otpUnlocksAt(eventTiming: {
  date: string | Date
  startTime: string
}): Date {
  return new Date(eventStartsAt(eventTiming).getTime() - 30 * 60 * 1000)
}
