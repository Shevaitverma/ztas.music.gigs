# Beta Readiness Plan

**Date:** 2026-08-04 · **Target:** a closed beta that produces *learning*, not just uptime
**Stack decision:** staying on Bun + TypeScript (see `08-go-migration-plan.md` §0.5)

---

## 1. What the beta has to achieve

A beta is not "the app doesn't crash." It is an instrument for answering questions you cannot answer today:

1. Will artists bid on gigs at all?
2. Will a client actually pick someone and follow through?
3. Does the gig happen, and does the OTP check-in get used?
4. Will either side leave a review?
5. Where do people drop out?

**You currently cannot answer any of these**, because there is no analytics, no notification, and no way to complete a booking in the product. Everything below is chosen to make those five questions answerable.

## 2. The single decision that sets scope

**Payments are OUT of the beta.** Money moves off-platform, with honest in-product messaging.

- **Why:** escrow + commission + payouts + reconciliation + GST/TDS is 6–8 weeks and needs gateway onboarding (2–6 weeks external, not started). Gating the beta on it delays *all* learning by two months.
- **What you lose:** you don't validate willingness-to-pay a commission. That is real, and it is the right thing to defer — you can't charge a take rate until you know bookings happen at all.
- **What you must not do:** imply payment protection you don't have. The UI says plainly that payment is arranged directly between the parties for now.

**Everything else that blocks the five questions is IN.**

## 3. Scope

### P0 — the beta is meaningless without these

| # | Item | Why it's P0 | Est. |
|---|---|---|---|
| 1 | **Analytics + error tracking** | Without it the beta teaches nothing and you learn about crashes from users | 1.5d |
| 2 | **Notification events + email delivery** | The loop cannot close. Note: most notifications aren't merely undelivered — **they are never created**. Only the scheduler writes any | 4d |
| 3 | **Check-in UI** (OTP generate → verify → start → end) | Backend is built and tested but unreachable. This is the only path to a COMPLETED gig | 5d |
| 4 | **Review creation UI** | Nothing can produce a review today, so the reputation moat generates zero data | 3d |
| 5 | **Dead ends removed** — `/admin` 404, post-booking "coming soon", earnings page | Users hit these at peak engagement | 2d |
| 6 | **Rate limiter switched on, safely** | Currently never executes; login brute-force is unthrottled | 1d |

**≈ 16 working days.**

### P1 — do if the P0 lands early

- Onboarding completion enforcement (artists can bid with an empty profile today)
- Double-booking guard (an artist can accept two gigs at the same time)
- Admin: a real `GET /admin/users/:id` (detail page breaks past the newest 100)

### Explicitly OUT

Payments/escrow · in-app messaging · the quote-compare pivot · availability calendar · ensembles/lessons · native apps · the Go migration.

## 4. The notification matrix

The events that must fire, who receives them, and whether they exist today:

| Event | Recipient | Record exists? | Delivery |
|---|---|---|---|
| Bid placed on your gig | client | ❌ no | email |
| You were outbid | artist | ❌ no | email |
| Your bid was accepted | artist | ❌ no | email |
| Your bid was rejected | artist | ❌ no | email |
| Gig booked — confirm details | client | ❌ no | email |
| Event tomorrow / in 2h | both | ✅ scheduler | email |
| Check-in OTP ready | artist | ❌ no | email |
| Gig completed — leave a review | both | ✅ scheduler | email |

**Six of eight events have no record at all.** The work is: emit at the domain event, then deliver.

**Channel: email first.** WhatsApp is the right long-term channel for India, but BSP template approval is a 1–2 week external dependency. **Start that application now, in parallel** — it is free to begin and it is on the critical path for post-beta.

## 5. Workstreams

Partitioned so they can run in parallel without touching each other's files.

| Stream | Owns | Delivers |
|---|---|---|
| **A — Server** | `server/` | Notification emission at domain events · email transport · Sentry · rate limiter enabled safely |
| **B — Post-booking UI** | `web/app`, `web/lib/api` | Check-in flow · review creation · removal of the dead ends |
| **C — Instrumentation** | `admin/`, `landing/`, cross-app analytics | PostHog · funnel events · admin fixes |

## 6. Sequence

1. **Day 1** — instrumentation first. Ship analytics before anything else changes, so you have a baseline to compare against.
2. **Days 2–6** — server notification events + email, in parallel with the check-in UI.
3. **Days 7–11** — review UI, dead-end removal, rate limiter.
4. **Day 12** — end-to-end rehearsal on a seeded database: post a gig, bid, accept, check in, complete, review. Every step must emit an email and an analytics event.
5. **Days 13–16** — fix what the rehearsal breaks. It will break.

## 7. Definition of done

The beta ships when one person can, on a clean account, complete this without help:

> post a gig → receive a bid → accept it → both parties get emailed → the artist checks in with an OTP at the venue → both confirm the event ended → both leave a review → the client sees the artist's rating update

…and every step of that appears in analytics.

## 8. Explicit non-goals for the beta

- **Not** validating the commission rate.
- **Not** proving the reverse auction is the right primitive — the beta is how you *find out* it isn't.
- **Not** scale. Ten real bookings beat a thousand signups.
