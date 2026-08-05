/**
 * Event Wall-Clock Time
 *
 * `gig.eventTiming` stores `date` as a Date (the clients post `yyyy-MM-dd`,
 * which Mongoose casts to UTC midnight) and `startTime`/`endTime` as bare
 * "HH:mm" strings with no timezone. The intended wall-clock is always
 * APP_TIMEZONE — never the server's local zone, and never UTC.
 *
 * Everything that turns eventTiming into an absolute instant must go through
 * this module. `Date#setHours` reads the *server's* local zone, and comparing
 * the raw `date` (UTC midnight) against `new Date()` makes an event "past"
 * from 05:30 IST on the morning of the event.
 *
 * India has no DST, but the offset is derived via `Intl` rather than hardcoded
 * so changing APP_TIMEZONE stays correct.
 */
import { config } from '../../config';

export const APP_TIMEZONE = config.app.timezone;

/** Structural shape of `gig.eventTiming` — accepts the Mongoose subdocument. */
export interface EventTimingLike {
  date: Date | string;
  startTime: string;
  endTime: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const zoneFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock components of `instant` as seen in APP_TIMEZONE. */
function zoneParts(instant: number): ZoneParts {
  const raw: Record<string, string> = {};
  for (const part of zoneFormatter.formatToParts(new Date(instant))) {
    raw[part.type] = part.value;
  }
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    hour: Number(raw.hour) % 24,
    minute: Number(raw.minute),
    second: Number(raw.second),
  };
}

/** Offset of APP_TIMEZONE from UTC, in ms, at the given instant. */
function zoneOffsetMs(instant: number): number {
  const p = zoneParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The absolute instant of a wall-clock date/time in APP_TIMEZONE.
 * Out-of-range components roll over (day 32 -> next month), same as Date.UTC.
 */
function zonedWallClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Second pass so a zone with DST resolves to the offset actually in force at
  // the resulting instant, not the one at the naive guess.
  const firstGuess = naive - zoneOffsetMs(naive);
  return new Date(naive - zoneOffsetMs(firstGuess));
}

/**
 * The calendar day an event falls on. Stored dates are UTC midnight of the
 * intended day, so the UTC components ARE the intended wall-clock day.
 */
function eventDayParts(date: Date | string): { year: number; month: number; day: number } {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid event date: ${String(date)}`);
  }
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** "HH:mm" -> [hours, minutes]. */
function parseHhMm(value: string): [number, number] {
  const [hours, minutes] = String(value).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new TypeError(`Invalid time value: ${String(value)}`);
  }
  return [hours, minutes];
}

/** The instant the event starts, interpreting date + startTime as APP_TIMEZONE. */
export function eventStartsAt(timing: Pick<EventTimingLike, 'date' | 'startTime'>): Date {
  const { year, month, day } = eventDayParts(timing.date);
  const [hours, minutes] = parseHhMm(timing.startTime);
  return zonedWallClock(year, month, day, hours, minutes);
}

/**
 * The instant the event ends, in APP_TIMEZONE. Overnight rule: an endTime at
 * or before startTime (22:00 -> 02:00) falls on the next calendar day.
 */
export function eventEndsAt(timing: EventTimingLike): Date {
  const { year, month, day } = eventDayParts(timing.date);
  const [startHours, startMinutes] = parseHhMm(timing.startTime);
  const [endHours, endMinutes] = parseHhMm(timing.endTime);
  const overnight = endHours * 60 + endMinutes <= startHours * 60 + startMinutes;
  return zonedWallClock(year, month, day + (overnight ? 1 : 0), endHours, endMinutes);
}

/**
 * The last instant of the event's calendar day in APP_TIMEZONE (23:59:59.999).
 * This is what "is this gig still upcoming?" filters compare against — a gig
 * stays upcoming until its day is genuinely over locally.
 */
export function endOfEventDay(timing: Pick<EventTimingLike, 'date'>): Date {
  const { year, month, day } = eventDayParts(timing.date);
  return new Date(zonedWallClock(year, month, day + 1).getTime() - 1);
}

/**
 * The stored `eventTiming.date` value (UTC midnight) for the APP_TIMEZONE
 * calendar day containing `at`. Use this for Mongo range queries against
 * `eventTiming.date`, where a JS helper cannot run per document.
 */
export function currentEventDay(at: Date | number = new Date()): Date {
  const p = zoneParts(typeof at === 'number' ? at : at.getTime());
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** `currentEventDay` shifted by whole days — for building query windows. */
export function eventDayOffset(days: number, at: Date = new Date()): Date {
  return new Date(currentEventDay(at).getTime() + days * MS_PER_DAY);
}
