/**
 * Event wall-clock tests.
 *
 * The whole point of `event-time.ts` is that the answer must NOT depend on the
 * server's local timezone, so every case runs under several `process.env.TZ`
 * values. Bun's `Date` reads TZ per call, so flipping it mid-test is enough.
 */
import { describe, it, expect, afterAll } from 'bun:test';
import {
  APP_TIMEZONE,
  currentEventDay,
  endOfEventDay,
  eventEndsAt,
  eventStartsAt,
} from '../shared/utils/event-time';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** Run `fn` once per server timezone, so nothing can pass by local-zone luck. */
function inEveryServerTz(fn: () => void): void {
  for (const tz of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
    process.env.TZ = tz;
    try {
      fn();
    } catch (err) {
      throw new Error(`Failed with server TZ=${tz}: ${(err as Error).message}`);
    }
  }
}

// How the frontend's `yyyy-MM-dd` lands in Mongo: UTC midnight.
const storedDate = (isoDay: string) => new Date(`${isoDay}T00:00:00.000Z`);

const eveningGig = {
  date: storedDate('2026-08-10'),
  startTime: '19:00',
  endTime: '23:00',
};

const overnightGig = {
  date: storedDate('2026-08-10'),
  startTime: '22:00',
  endTime: '02:00',
};

describe('event-time', () => {
  it('uses the India timezone by default', () => {
    expect(APP_TIMEZONE).toBe('Asia/Kolkata');
  });

  it('eventStartsAt resolves IST wall-clock to the right UTC instant', () => {
    inEveryServerTz(() => {
      // 19:00 IST == 13:30 UTC.
      expect(eventStartsAt(eveningGig).toISOString()).toBe('2026-08-10T13:30:00.000Z');
    });
  });

  it('eventEndsAt resolves the end instant on the same day', () => {
    inEveryServerTz(() => {
      // 23:00 IST == 17:30 UTC.
      expect(eventEndsAt(eveningGig).toISOString()).toBe('2026-08-10T17:30:00.000Z');
    });
  });

  it('eventEndsAt rolls an overnight event (22:00 -> 02:00) onto the next day', () => {
    inEveryServerTz(() => {
      // 02:00 IST on Aug 11 == 20:30 UTC on Aug 10.
      expect(eventEndsAt(overnightGig).toISOString()).toBe('2026-08-10T20:30:00.000Z');
      expect(eventEndsAt(overnightGig).getTime()).toBeGreaterThan(
        eventStartsAt(overnightGig).getTime()
      );
    });
  });

  it('endOfEventDay is the last millisecond of the IST calendar day', () => {
    inEveryServerTz(() => {
      // 23:59:59.999 IST on Aug 10 == 18:29:59.999 UTC.
      expect(endOfEventDay(eveningGig).toISOString()).toBe('2026-08-10T18:29:59.999Z');
    });
  });

  /**
   * THE BUG: `new Date(gig.eventTiming.date) >= now` made a 19:00 gig "past"
   * from 05:30 IST on the morning of the event, so it vanished from the
   * artist's dashboard hours before they played it.
   */
  it('keeps a 19:00 IST gig upcoming at 06:00 IST on the day of the event', () => {
    // 06:00 IST on the event day == 00:30 UTC.
    const morningOfEvent = new Date('2026-08-10T00:30:00.000Z');

    inEveryServerTz(() => {
      // The old comparison — kept here to document what regressed.
      expect(new Date(eveningGig.date) >= morningOfEvent).toBe(false);
      // The fixed comparison.
      expect(endOfEventDay(eveningGig) >= morningOfEvent).toBe(true);
    });
  });

  it('drops the gig once its IST day is genuinely over', () => {
    // 00:30 IST on Aug 11 == 19:00 UTC on Aug 10.
    const afterMidnightIst = new Date('2026-08-10T19:00:00.000Z');
    inEveryServerTz(() => {
      expect(endOfEventDay(eveningGig) >= afterMidnightIst).toBe(false);
    });
  });

  it('opens the OTP window exactly 30 minutes before the IST start', () => {
    const OTP_LEAD_MS = 30 * 60 * 1000;

    inEveryServerTz(() => {
      const earliestOtpTime = new Date(eventStartsAt(eveningGig).getTime() - OTP_LEAD_MS);
      // 18:30 IST == 13:00 UTC.
      expect(earliestOtpTime.toISOString()).toBe('2026-08-10T13:00:00.000Z');

      // One minute early: refused. Exactly on the boundary: allowed.
      expect(new Date('2026-08-10T12:59:00.000Z') < earliestOtpTime).toBe(true);
      expect(new Date('2026-08-10T13:00:00.000Z') < earliestOtpTime).toBe(false);
    });
  });

  it('OTP expiry (end + 1h buffer) survives the overnight case', () => {
    inEveryServerTz(() => {
      const expiry = new Date(eventEndsAt(overnightGig).getTime() + 60 * 60 * 1000);
      // 03:00 IST on Aug 11 == 21:30 UTC on Aug 10.
      expect(expiry.toISOString()).toBe('2026-08-10T21:30:00.000Z');
    });
  });

  it('currentEventDay is the UTC-midnight day key of the IST calendar day', () => {
    inEveryServerTz(() => {
      // 00:30 UTC == 06:00 IST, still Aug 10 in India.
      expect(currentEventDay(new Date('2026-08-10T00:30:00.000Z')).toISOString()).toBe(
        '2026-08-10T00:00:00.000Z'
      );
      // 19:00 UTC == 00:30 IST on Aug 11 — India has already rolled over.
      expect(currentEventDay(new Date('2026-08-10T19:00:00.000Z')).toISOString()).toBe(
        '2026-08-11T00:00:00.000Z'
      );
    });
  });
});
