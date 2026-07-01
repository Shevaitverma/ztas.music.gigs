# Server Backend Audit

Scope: `E:\shevait-projects\ztas.music.gigs\server` (Bun + Elysia + Mongoose + Firebase Admin).
Date: 2026-06-26. Method: full static review of `src/**` plus `bun install` / `bun run typecheck` / `bun test` (all run successfully — see "Compilation / tests").

The PROJECT_CONTEXT documented decisions were verified against code. Most documented security hardening (DB-sourced auth on every request, refresh-token hashing + rotation + reuse-detection, AES-256-GCM PII with field-bound AAD via Mongoose getters/setters, CSPRNG + 5-strike OTP lockout, trusted-proxy XFF handling, WS ticket auth, CORS allowlist, `validateObjectId` + `CastError→400`, magic-byte image validation, `escapeRegex` in admin/artist search) is **genuinely implemented and solid**. The findings below are the real gaps that remain.

## Summary of findings

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 4 | SRV-001, SRV-002, SRV-003, SRV-004 |
| Medium | 6 | SRV-005, SRV-006, SRV-007, SRV-008, SRV-009, SRV-010 |
| Low | 6 | SRV-011, SRV-012, SRV-013, SRV-014, SRV-015, SRV-016 |

No "Critical" was assigned because the most damaging item (no payments) is documented as deliberately deferred; it is the dominant revenue blocker and is detailed in SRV-004 and the Revenue-readiness section. There are no exploitable auth-bypass or RCE-class defects.

---

## SRV-001 — Two-way reviews are broken for every bid-booked gig (wrong gig field)
- **Severity:** High (core trust/safety moat is non-functional)
- **File:** `src/modules/reviews/reviews.service.ts:88-129` (and `:106-122`)
- **What's wrong:** `createReview` determines participants using the **deprecated** `gig.acceptedApplicant` field:
  ```ts
  .populate('acceptedApplicant', 'name profilePicture')
  const isArtist = gig.acceptedApplicant?._id?.toString() === userId;
  ...
  if (isClient && userRole === CLIENT) { if (!gig.acceptedApplicant) throw 'No artist was accepted...'; ... }
  ```
  But the primary booking flow is the **reverse-auction bid flow**, which sets `acceptedBid` + `acceptedArtist` and **never** `acceptedApplicant` (see `src/modules/bids/bids.service.ts:395-410` `acceptBid`). Only the legacy applications flow sets `acceptedApplicant` (`src/modules/applications/applications.service.ts:266-269`).
  Result for a bid-booked, completed gig:
  - Client review of artist → throws `BadRequestException('No artist was accepted for this gig')`.
  - Artist review of client → `isArtist` is false → `ForbiddenException('You are not a participant of this gig')`.
  So **neither side can review** on the main flow.
- **Why it matters:** Reviews + sub-ratings are the stated trust moat that makes a low-frequency-buyer marketplace (weddings/events) credible. With the bid flow being the headline product, reviews silently fail for essentially all real bookings — directly degrading trust and conversion.
- **Recommended fix:** Resolve the reviewee from the actual booking fields, supporting both flows:
  ```ts
  const artistId = (gig.acceptedArtist?._id ?? gig.acceptedArtist
                   ?? gig.acceptedApplicant?._id ?? gig.acceptedApplicant)?.toString();
  const isArtist = artistId === userId;
  // client→artist: revieweeId = artistId (require artistId present)
  // artist→client: revieweeId = gig.postedBy._id
  ```
  Populate `acceptedArtist` too. Add an integration test that books via a bid, completes via check-in, and asserts both review directions succeed.

## SRV-002 — Documented `/auth/phone/verify` endpoint does not exist (phone OTP login unimplemented)
- **Severity:** High (blocks the primary India onboarding path)
- **File:** `src/modules/auth/auth.routes.ts` (routes: `/google/verify`, `/login`, `/refresh`, `/complete-signup`, `/logout`, `/ws-ticket`, `/me` only)
- **What's wrong:** PROJECT_CONTEXT and `server/USER_FLOW_DIAGRAM.md:147,307,762` describe phone login via `POST /api/v1/auth/phone/verify` (frontend sends the Firebase token in an `X-Firebase-Token` header). The server implements **no** phone-verify route and reads no `X-Firebase-Token` header anywhere (`grep` for `phone/verify` / `X-Firebase-Token` only hits docs). A phone client hitting that contract gets a 404.
- **Why it matters:** This is an India-only, phone-first product (Aadhaar/UPI/INR throughout). If artists/clients onboard via phone OTP, they cannot authenticate at all → no supply, no demand, no revenue. (A Firebase **phone** ID token would actually pass `firebaseAdminService.verifyIdToken` if POSTed to `/google/verify` as `idToken`, but that mislabels `authProvider=GOOGLE` and is not the documented contract.)
- **Recommended fix:** Implement `POST /auth/phone/verify` mirroring `verifyGoogleToken` (accept the Firebase ID token from `X-Firebase-Token` header or body `idToken`, set `authProvider=PHONE`, reuse the same signup-challenge / token-issuance / cookie path). Reconcile the wire-shape inconsistency flagged in the PROJECT_CONTEXT TODO table.

## SRV-003 — Real-time bid stream leaks all competitors' bid amounts + identities to any authenticated user
- **Severity:** High (auction integrity / IDOR in the WS layer)
- **File:** `src/modules/bids/bids.gateway.ts:124-131` (`JOIN_GIG`) + `src/modules/bids/bids.routes.ts:34,78,314` (publishes)
- **What's wrong:** The WS `JOIN_GIG` handler subscribes **any authenticated socket** to `gig/{gigId}` with no check that the user owns the gig:
  ```ts
  case 'JOIN_GIG':
    if (payload?.gigId) { ws.subscribe(`gig/${payload.gigId}`); ... }
  ```
  The REST publishers broadcast the full transformed bid object to that room on every place/update/accept:
  ```ts
  server.publish(`gig/${bid.gigId}`, JSON.stringify({ type: 'BID_PLACED', data: bid }));
  ```
  `data: bid` includes `amount`, artist `id`/`name`/`profileImage`/`artistProfile`. So a rival artist (or anyone with a token) can subscribe to any `gigId` and watch every competitor's exact bid and identity in real time. By contrast, the REST endpoint `GET /bids/gig/:gigId` correctly restricts to the gig owner (`bids.service.ts:229-244`). The WS path is the authorization hole.
- **Why it matters:** In a reverse auction this lets an artist always undercut by ₹1 and deanonymizes the bid book — corrupting the core pricing mechanism and supplier trust.
- **Recommended fix:** In `JOIN_GIG`, verify `gig.postedBy === ws.userId` before subscribing to `gig/{gigId}` (only the client-owner room should carry full bid objects). Artists should only ever join `gig/{gigId}/artists`, which by design carries the sanitized `{ lowestAmount }` payload. Alternatively stop publishing full bid objects to a room non-owners can join.

## SRV-004 — No payments / escrow / commission / payout code exists (monetization spine absent)
- **Severity:** High (the single biggest revenue blocker)
- **Files:** entire `src/` — there is **no** `transaction.model.ts`, no escrow state machine, no Razorpay/UPI/Stripe/webhook/payout/invoice code (`grep -i razorpay|stripe|payout|invoice|webhook|escrow|commission` over `src` returns only enum labels + an unused `PAYMENT_STATUS` constant in `src/shared/constants/index.ts`). `src/modules/admin/admin.routes.ts:114-136` `/admin/reports/revenue` returns a hardcoded `{ totalRevenue: 0 }` mock.
- **What's wrong vs. docs:** PROJECT_CONTEXT states "The schema models the flow (`Transaction` states: `PENDING_PAYMENT → ESCROW → RELEASED/DISPUTED/REFUNDED`) but no gateway wiring." Verified: **the Transaction schema does not exist.** `Bid` (`src/db/models/bid.model.ts`) and `Gig` (`src/db/models/gig.model.ts`) carry no monetary/transaction fields. The OTP check-in dual-confirmation completes the gig (`checkin.service.ts:419` → `gigsService.completeGigFromCheckIn`) but releases nothing — there is nothing to release.
- **Why it matters:** The product cannot take a single rupee. The take-rate (10% / tiered) is unbuilt; artist bank/UPI KYC is collected (`artist-verification.model.ts`) but never used to pay anyone.
- **Recommended fix:** See the Revenue-readiness section — this needs a Transaction model, a gateway integration, escrow capture-on-booking, OTP-gated release, refund/dispute handling, commission computation, and GST invoicing.

---

## SRV-005 — Regex injection / ReDoS in public gig search (`venue.city` not escaped)
- **Severity:** Medium
- **File:** `src/modules/gigs/gigs.service.ts:532-534` (and `/gigs/city/:city` via `gigs.routes.ts:148-156`)
- **What's wrong:** `filter['venue.city'] = { $regex: params.city, $options: 'i' }` injects raw, **unauthenticated** user input into a Mongo regex. The codebase already has `escapeRegex` (`src/shared/utils/validation.utils.ts:12`) and uses it in admin search (`admin.service.ts:291,348`) and artist search (`users.service.ts:257,282`), but the public gig search and `city/:city` route do not. A crafted pattern (e.g. nested quantifiers) can cause catastrophic backtracking / CPU exhaustion on an unauthenticated endpoint, and unanchored patterns broaden matches.
- **Why it matters:** Cheap unauthenticated DoS vector on the most-hit discovery endpoint.
- **Recommended fix:** `const safe = escapeRegex(params.city); filter['venue.city'] = { $regex: safe, $options: 'i' };` (apply to both call sites). Consider anchoring (`^safe`).

## SRV-006 — `GET /gigs/:id` exposes DRAFT/CLOSED/CANCELLED gigs to anyone
- **Severity:** Medium
- **File:** `src/modules/gigs/gigs.routes.ts:209-224` → `src/modules/gigs/gigs.service.ts:140-157` (`getGig`)
- **What's wrong:** The public detail endpoint returns a gig regardless of `status` and with no owner check. `searchGigs` correctly forces non-owners to `status=LIVE` (`gigs.service.ts:510-516`), but a direct ID fetch bypasses that — an unauthenticated caller who guesses/obtains a 24-hex id can read a DRAFT (unpublished) or CANCELLED gig, including venue address and full details.
- **Why it matters:** Information disclosure of unpublished listings; inconsistent with the deliberate LIVE-only discovery rule.
- **Recommended fix:** In `getGig`, if the gig is not `LIVE`, require an authenticated caller who is the owner (or admin); otherwise 404. Thread the caller id into `getGig` as is already done for `searchGigs`.

## SRV-007 — Scheduler auto-completes gigs 24h after the event, bypassing OTP dual-confirmation
- **Severity:** Medium (becomes High the moment payments are wired)
- **File:** `src/services/scheduler.service.ts:245-258` (`autoCompleteGigs`)
- **What's wrong:** Any `BOOKED`/`CLOSED` gig whose event date is >24h ago is force-set to `COMPLETED` via raw `GigModel.updateOne({_id}, {status: COMPLETED})`, regardless of whether the artist ever checked in or both parties confirmed end-of-event. This bypasses the validated path (`completeGigFromCheckIn`) and the "OTP + dual confirmation gates completion" trust model that the rest of the code carefully enforces.
- **Why it matters:** Today it merely lets disputed/no-show gigs auto-complete (and, given SRV-001 is fixed, would auto-open reviews for events that never happened). Once escrow exists, auto-complete = auto-release of funds without ground-truth confirmation — exactly the disintermediation/fraud risk the OTP moat was meant to prevent.
- **Recommended fix:** Auto-complete only gigs whose `EventCheckIn.status === EVENT_ENDED`; otherwise transition unconfirmed gigs to a `DISPUTED`/manual-review state rather than `COMPLETED`. Never release payment on the timer path.

## SRV-008 — Admin analytics/export use wrong field names (silent wrong numbers / unpopulated refs)
- **Severity:** Medium (admin data correctness)
- **File:** `src/modules/admin/admin.service.ts:546-548, 668-689`
- **What's wrong:**
  - `getGigsAnalytics` computes avg bids per gig grouping on a non-existent field: `{ $group: { _id: '$gig', ... } }`. The Bid schema field is `gigId` (`bid.model.ts`). All bids collapse into a single `_id: null` group, so `avgBidsPerGig` ≈ total bid count — wildly wrong.
  - `exportData` populates paths that don't exist on the schemas: `.populate('artist', ...)` / `.populate('gig', ...)` for bids (real fields `artistId` / `gigId`) and `.populate('artist', ...)` for applications (real field `applicant`). These populates are no-ops; exports return bare ObjectIds instead of names/emails.
- **Why it matters:** Admin dashboards and CSV/JSON exports show incorrect/empty data — bad for ops decisions and any future financial reconciliation.
- **Recommended fix:** Use `$gigId` for the aggregation `_id`; fix populate paths to `artistId`/`gigId`/`applicant`. Add a smoke test asserting populated fields are objects.

## SRV-009 — Rate limiter is per-process in-memory (ineffective horizontally; resets on deploy)
- **Severity:** Medium
- **File:** `src/plugins/security.plugin.ts:69,76-83`
- **What's wrong:** Limits are tracked in a local `Map` with a per-instance `setInterval` sweep. Behind >1 instance / autoscaling, an attacker's requests fan out across instances and each enforces its own counter (effective limit = configured × N). A rolling deploy/restart wipes all counters. This directly weakens the credential-stuffing/OTP-brute-force/review-spam caps the plugin is meant to provide.
- **Why it matters:** The tight per-route caps (login 5/15m, verify-otp 5/5m) are the main brute-force defense; they degrade under normal production topology.
- **Recommended fix:** Back the limiter with a shared store (Redis / Mongo TTL collection) keyed by `clientIp|routeKey`, or enforce at the edge (API gateway / Cloudflare). Acceptable as-is only for single-instance MVP — document the constraint.

## SRV-010 — Gig image upload lacks size cap and content-type validation (storage/DoS abuse)
- **Severity:** Medium
- **File:** `src/modules/gigs/gigs.service.ts:767-791` (`uploadGigImage`); `src/services/s3.service.ts:45-69`
- **What's wrong:** Unlike `uploadProfilePicture` (which enforces a 5 MB cap and magic-byte MIME detection — `users.service.ts:340-357`), `uploadGigImage` reads `file.arrayBuffer()` with no size limit and uploads with the client-supplied `file.type`, and builds the S3 key from the raw client `file.name` (`gigs/${gigId}/${Date.now()}_${file.name}`). A client can upload arbitrarily large files or non-image content (the bucket then serves attacker-controlled content-type from your domain).
- **Why it matters:** Cheap storage-cost/DoS abuse and content-spoofing; inconsistent with the hardened profile-picture path.
- **Recommended fix:** Reuse the profile-picture approach: enforce a max size, detect MIME from magic bytes, and generate a sanitized key (`gigs/${gigId}/${uuid}.${ext}`). Reject on failure.

---

## SRV-011 — Stale legacy code past its own cutover date
- **Severity:** Low
- **File:** `src/modules/auth/auth.service.ts:394-413, 454-462`
- **What's wrong:** The refresh-token "legacy raw-JWT" acceptance branch is annotated `TODO(refresh-token-legacy): remove after 2026-05-21`. Today is 2026-06-26 — the cutover has passed but the branch (accept-once raw JWT, then upgrade to hash) is still present. Security impact is minimal (it only aids un-migrated tokens and re-stores them hashed), but it is dead/contract-violating code that was supposed to be removed.
- **Recommended fix:** Delete the `looksLikeJwt`/raw-token branches in `refreshAccessToken` and `rotateRefreshToken`; any still-raw token then forces a re-login, as the TODO intended.

## SRV-012 — Doc says "same JWT_SECRET for all"; code requires a separate `JWT_REFRESH_SECRET`
- **Severity:** Low (deployment foot-gun)
- **File:** `src/config/index.ts:62-69,124-129`; `src/app.ts:71-84`
- **What's wrong:** PROJECT_CONTEXT states access/refresh/signup/ws-ticket all use the same `JWT_SECRET`. In reality `JWT_REFRESH_SECRET` is a **required** env var and the refresh JWT instance uses it; signup/ws-ticket use the access secret. Using distinct secrets is fine (arguably better), but an operator following the doc and setting only `JWT_SECRET` will hit `process.exit(1)` at boot ("Missing required environment variables: JWT_REFRESH_SECRET").
- **Recommended fix:** Update the doc, or default `refreshSecret` to `JWT_SECRET` when `JWT_REFRESH_SECRET` is unset to match the documented contract.

## SRV-013 — `updateGig` mass-assigns via `Object.assign` (defense-in-depth)
- **Severity:** Low (currently mitigated by Elysia `normalize`)
- **File:** `src/modules/gigs/gigs.service.ts:188-189`
- **What's wrong:** `const { status, ...otherUpdates } = dto; Object.assign(gig, otherUpdates);` would set any provided schema path (e.g. `postedBy`, `acceptedArtist`, `isFlagged`, `viewCount`, `bidCount`). It is **not currently exploitable**: Elysia 1.4.19 defaults `normalize: true` (verified in `node_modules/elysia/dist/index.mjs:200`, `additionalProperties: !normalize`), so unknown body props are stripped before the handler — and `UpdateGigSchema` doesn't include those fields. But this relies entirely on framework behavior, and the codebase elsewhere deliberately uses explicit allow-lists for exactly this reason (`users.service.ts:115-145` `updateProfile`, "M8").
- **Recommended fix:** Assign an explicit allow-list of updatable fields (title/description/category/budget/venue/eventTiming/images/requirements/equipmentProvided/preferredGenres) rather than spreading, for consistency and resilience if `normalize` is ever disabled.

## SRV-014 — `createGig` drops venue coordinates when lat or lng is `0`
- **Severity:** Low
- **File:** `src/modules/gigs/gigs.service.ts:111` (truthy check) vs `:192` (`!== undefined`)
- **What's wrong:** `if (dto.venue.coordinates?.lat && dto.venue.coordinates?.lng)` skips building `geoPoint` when either coordinate is `0`. `updateGig` correctly uses `!== undefined`. Practically harmless for India (lat ~8–37, lng ~68–97 are always non-zero), but it's an inconsistency that would silently break geo-search for any 0-coordinate venue.
- **Recommended fix:** Use `!== undefined && !== null` (or check `Number.isFinite`) as in `updateGig`.

## SRV-015 — `PAYMENT_STATUS` constant defined but unused (dead stub)
- **Severity:** Low
- **File:** `src/shared/constants/index.ts:87-89`
- **What's wrong:** A `PAYMENT_STATUS` map exists but nothing references it (no Transaction model/route). It is a leftover from the unbuilt payments spine and can mislead readers into thinking payment state handling exists.
- **Recommended fix:** Remove it, or keep it only alongside the real Transaction model when payments are built.

## SRV-016 — Scheduler dedup does N findOne-per-gig on an unindexed `data.gigId`
- **Severity:** Low (reliability at scale)
- **File:** `src/services/scheduler.service.ts:143-147,162-167,223-228,264-268`; `src/db/models/notification.model.ts` (`data` is unindexed `Mixed`)
- **What's wrong:** Reminder/auto-close/auto-complete jobs issue a `NotificationModel.findOne({ userId, type, 'data.gigId': ... })` per gig per tick to avoid duplicates. `data.gigId` is not indexed, so each is a partial scan; volume grows with notification history. Fine at MVP scale, a hotspot later.
- **Recommended fix:** Add a partial/sparse index on `{ userId: 1, type: 1, 'data.gigId': 1 }`, or model dedup with a dedicated typed field + unique index, or batch the existence checks.

---

## Compilation / tests

All three steps completed successfully (no abandonment needed):

- `bun install` — exit 0.
- `bun run typecheck` (`tsc --noEmit`) — **exit 0, zero type errors.**
- `bun test` — **21 pass / 0 fail**, 48 assertions across `src/test/gigs-status.test.ts` and `src/test/utils.test.ts` (~43s; spins up an in-memory/real Mongo per `src/test/setup.ts`).

Caveat: test coverage is shallow for business logic (e.g. `gigs.service.ts` ~3% line coverage; reviews/bids/checkin services have no dedicated tests). The state-machine and review-gating bugs (SRV-001, SRV-007) are exactly the kind of thing the missing tests would have caught. The suite passing does **not** validate the bid→checkin→review happy path end-to-end.

---

## Revenue-readiness gap — what must be built before the app can take ₹1

The backend currently cannot move money. Concretely, the following is **missing** (not merely unwired):

1. **Transaction/escrow model** — no `Transaction` schema exists despite docs. Need: amount, currency, gig/bid/artist/client refs, commission amount, gateway ids, and a real `PENDING_PAYMENT → ESCROW → RELEASED | REFUNDED | DISPUTED` state machine with atomic transitions.
2. **Payment gateway integration** — no Razorpay/UPI (or any) client, order creation, or **webhook** endpoint/signature verification. Capture must happen at booking (bid accept / `acceptBid`) so funds are escrowed before the event.
3. **Commission/take-rate engine** — the 10% (or tiered 15%/8%) take rate is entirely unimplemented; nothing computes platform fee vs artist payout.
4. **Payout pipeline** — artist bank/UPI KYC is collected and encrypted (`artist-verification.model.ts`) but never consumed; no payout/transfer call, no payout status tracking, no reconciliation.
5. **OTP-gated release wiring** — `checkin.endEvent` (dual confirmation) and `gigsService.completeGigFromCheckIn` must trigger escrow release; today completion changes only `gig.status`. And SRV-007 (timer auto-complete) must **not** release funds.
6. **Refund / dispute / cancellation money paths** — `cancelGig`/`closeGig` cascade gig+bid+application+checkin state but have no monetary unwind (refund escrow on cancel, hold on dispute).
7. **GST invoicing** — India GST invoice generation/numbering is absent (the product collects PAN/GST but issues nothing).
8. **Auth onboarding for phone (SRV-002)** — phone-OTP login must work or there are no paying users to begin with.
9. **Reviews must function (SRV-001)** — broken reviews undermine the trust needed to justify a commission; fix before launch.
10. **Admin financial surfaces** — `/admin/reports/revenue` is a `{ totalRevenue: 0 }` stub; transaction monitoring/payout management UIs and endpoints don't exist.

Until items 1–7 exist and item 5 is correctly gated, no booking can be monetized.
