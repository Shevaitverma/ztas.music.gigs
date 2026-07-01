# Product Strategy & Brainstorm — Turning ZTS into a Revenue-Generating Music Marketplace

> Scope: this report synthesizes the founder's expansion ideas (music **freelancing / accompanists**, **cross-user pitching to join gigs**, "anything to improve the music business logic") against the **actual data model in the codebase**, and maps every idea to a concrete **revenue surface**. Market sizing and competitor evidence live in `04-business-model-research.md`; this report is the product/engineering blueprint.

---

## 0. The one thing that matters most

**Today the platform literally cannot collect a single rupee.** There is no `Transaction` model, no escrow, no commission logic, no payment gateway — only a `PAYMENT` *report category* and KYC fields for payouts. Meanwhile the *hard* part — the trust rail that makes people willing to pay through a platform (KYC on both sides, OTP event check-in, dual end-of-event confirmation, two-way reviews, dispute/report pipeline) — **is already built**.

So the strategic situation is the inverse of most startups: **the moat is built, the cash register is missing.** Everything below is organized around installing the cash register and then widening what it can ring up.

---

## 1. Reframe: from "event gig board" to a multi-sided music-work marketplace

### 1.1 Current model (as coded)
- One work type: a **Gig** = a live event a **client** posts; **artists** place **Bids** (reverse auction, lowest/best wins).
- One transaction axis: **client → artist**.
- Pricing primitive: **reverse auction** (`budget.min/max` + artists bid `amount`).

### 1.2 The problem with that single model
1. **Reverse auction repels quality supply.** Top artists don't enter bidding wars; they quote. (Already flagged in `PROJECT_CONTEXT.md`.)
2. **One transaction axis = thin GMV.** Every other music-money flow (a singer hiring a tabla player, a band needing a sound engineer, a student paying for lessons) is invisible to the platform — and therefore unmonetized.
3. **Low-frequency buyers (weddings/events) disintermediate.** A client books once a year; after the intro they have no reason to stay on-platform — unless the platform owns payment protection, the contract, and the reputation.

### 1.3 The reframe
Treat the platform as a **marketplace for music *work*, not just music *events*** — with the same trust rail underneath every work type. Introduce a `workType` (or `engagementType`) dimension on the gig/engagement entity:

| workType | Who posts | Who fulfills | Money axis | Example |
|---|---|---|---|---|
| `LIVE_EVENT` (today) | Client/organizer | Artist / band | client → artist | Wedding sangeet singer |
| `SESSION_WORK` | Artist **or** client | Session musician / accompanist | **artist → artist** or client → artist | Record tabla for my track; accompany my recital |
| `ENSEMBLE_SEAT` | Lead artist | Sideman / section player | **artist → artist** | "I won a 5-pc wedding band gig, need a keyboardist" |
| `LESSONS` | Student (client) | Teacher (artist) | client → artist, **recurring** | Weekly guitar lessons |
| `COLLAB` | Artist | Artist | revenue-share / flat | Co-write, feature, remix |

The crucial unlock is the **artist-as-buyer** rows (`SESSION_WORK`, `ENSEMBLE_SEAT`, `COLLAB`). They turn a 2-sided market into an **N-sided network** where supply also generates demand — which is exactly what fixes thin liquidity in a cold marketplace, and exactly where the founder's two ideas (accompanists + cross-pitching) plug in.

---

## 2. Idea #1 — Music freelancing (accompanists, session players, teachers)

### 2.1 What it is
Beyond "book a performer for my event," let musicians sell **discrete music services**: accompany a vocalist, lay down a session track, arrange/transcribe, teach, produce/mix. This is the SoundBetter / AirGigs / Fiverr-Pro lane (see `04`), adapted to India and fused with the live-event business.

### 2.2 Why it fits ZTS specifically
- The artist profile **already models the right attributes**: `instruments`, `genres`, `languages`, `performanceTypes`, `baseRate`, `audioSamples`, `videoLinks`, `yearsOfExperience`, geo `location`. A session/accompanist marketplace is mostly a **new `workType` + new browse/match surface over data that already exists.**
- It raises **frequency**. Events are once-a-year; session work, lessons, and accompaniment are weekly/monthly → more transactions → more take-rate events → less disintermediation pressure (recurring relationships are stickier *and* the platform is where the calendar/payment lives).
- It **monetizes the supply side directly** (artists paying artists), which most event marketplaces never capture.

### 2.3 Data-model design (concrete, minimal)
Rather than fork a whole new model, generalize the existing `Gig`:
- Add `Gig.workType: GigWorkType` (enum above), default `LIVE_EVENT` for back-compat.
- Make `eventTiming`/`venue` **optional** when `workType !== LIVE_EVENT` (session work is often remote/asynchronous). Add `deliveryMode: 'IN_PERSON' | 'REMOTE' | 'HYBRID'`.
- For `SESSION_WORK`: add `deliverables` (e.g. stems, number of takes, revisions) and `deadline` instead of `eventTiming`.
- For `LESSONS`: add `recurrence` (one-off / weekly / package-of-N) — this is where **recurring revenue** lives.
- Reuse `Bid`/`Application` as the response primitive (see §3 — we should collapse these two into one).

> Engineering note: because `postedBy` is already a generic `User` ref and roles are not hard-wired into the gig flow, allowing an **artist** to post a `SESSION_WORK`/`ENSEMBLE_SEAT` gig is a smaller change than it looks. The harder part is UI/role-permissions and the artist-pays-artist payout split (§5).

### 2.4 Revenue from freelancing
- **Same take rate** as events on every completed session/lesson/accompaniment booking.
- **Lessons = subscriptions**: a teacher selling a 4-lesson package or weekly recurring slot is a recurring-billing product → predictable MRR and a reason to keep payment on-platform (auto-charge each week).
- **Higher transaction frequency** multiplies take-rate events even at a lower average ticket.

---

## 3. Idea #2 — Cross-user pitching ("join the gig")

This is the strongest idea for network density. There are **two distinct mechanics**; build both, but #A first because it directly grows GMV.

### 3.1 Mechanic A — Ensemble seats / sub-contracting (artist → artist)
**Scenario:** an artist wins (or holds) a gig that needs more than one musician — a wedding wants a 5-piece band, a corporate show needs a sound engineer, a classical recital needs a tabla + harmonium accompanist.

**Flow:**
1. Lead artist marks a booked/won gig as needing roles → posts **`ENSEMBLE_SEAT`** sub-gigs (role = "Keyboardist", budget = their allocated split).
2. Other artists **pitch** to fill seats (this is exactly what the dormant `Application` model is for).
3. Lead accepts → the platform now intermediates an **artist→artist** payment → **another take-rate event** on the same underlying booking.

**Why it's powerful:** one client booking can spawn 3–4 downstream artist→artist bookings, each commissionable. It also solves the "I'm a soloist but the gig wants a band" supply gap and makes the platform the place bands actually *assemble*, not just get discovered.

### 3.2 Mechanic B — Self-pitch / referral to join a gig (artist ↔ artist)
**Scenario:** an accompanist pitches *themselves* to a soloist ("I play tabla, can I back your ghazal set?"), or an artist who can't take a gig **refers** a peer.

**Flow:**
- A "Pitch to collaborate" action on any artist profile or open gig.
- **Referral bounty:** if Artist A refers Artist B who gets booked, A earns a referral cut (funded from the take rate). This is a growth loop *and* a reason to keep activity on-platform.

### 3.3 Required new concept: the **Ensemble / Band** entity
Cross-pitching needs a group abstraction the schema doesn't have yet:
- `Ensemble`: name, members (`User[]` with roles + payout split %), leader, shared portfolio/audio, shared availability.
- An ensemble can **bid/quote as one unit**; on payout, the platform **splits** the released escrow across members per the split table — this is a natural, defensible reason for money to flow through the platform (try splitting a UPI payment 5 ways manually after a wedding).
- Ties directly into §5 payments (Razorpay Route supports multi-party splits) and §6 availability.

### 3.4 Collapse `Bid` + `Application` first
The codebase has **two overlapping models** (`Bid`: amount+message, unique per gig+artist; `Application`: bidAmount+proposal, unique per gig+applicant) plus a deprecated `acceptedApplicant`. Before building cross-pitching, **unify them into one `Proposal`/`Bid` primitive** with a `proposalType` (`CLIENT_GIG_BID` | `ENSEMBLE_SEAT_PITCH` | `COLLAB_PITCH`). This removes live tech-debt *and* gives cross-pitching a clean home instead of a third parallel model. (See audit report `01` for the dead-code finding.)

---

## 4. The pricing-primitive fix (protect quality supply)

Move off pure reverse auction to a **hybrid**, using fields that already exist (`artistProfile.baseRate`, `budget`):

1. **Quote/RFQ as default:** client posts a brief → artists send **fixed quotes** + proposal (no public race-to-the-bottom). This is the Poptop/Encore model and what quality supply tolerates.
2. **Instant-book at listed rate:** for artists who publish a `baseRate`, clients can book directly → fastest path to a transaction (and to a take-rate event).
3. **Optional negotiation** thread on top (keep the messaging, drop the public underbidding).
4. Keep auction only as an *opt-in* mode for price-sensitive, commodity gigs.

This is a UX/flow change more than a schema change, and it materially improves supply quality — the input that determines whether the marketplace is worth a fee at all.

---

## 5. The revenue engine — install the cash register

Map of monetization surfaces, ranked by **time-to-first-rupee** and **disintermediation resistance**. The big idea: **don't bet 100% of revenue on completed-booking commission** (which disintermediation can starve). Stack surfaces so revenue starts *before* GMV scales.

| # | Surface | How it works | Time to revenue | Disintermediation-resistant? | Build cost |
|---|---|---|---|---|---|
| 1 | **Booking deposit + escrow + commission** | Client pays deposit/full into escrow at booking; released on OTP dual-confirm; platform keeps take rate | Medium (needs gateway) | High (you hold the money + reviews) | **High** |
| 2 | **Supply-side subscription (Artist Pro / Verified Pro)** | Monthly: more bids/pitches, featured placement, analytics, priority verified badge, lower commission | **Immediate** | **Very high** (not booking-contingent) | Low |
| 3 | **Pay-per-pitch credits (Bark/Thumbtack model)** ⚠️ | Artists spend credits to bid on / unlock high-intent gigs | **Immediate** | High (charged on intent, not completion) | Low–Med |

> ⚠️ **Caveat on #3 (revised after market research — see `04`):** pay-per-lead is a **poor fit for the low-frequency event side** (it spams once-a-year wedding buyers, churns quality supply, and carries advertising/consumer-protection risk — Angi paid a $7.2M settlement over lead practices). The dead Sonicbids "pay-to-submit" model is exactly this. **Do NOT use pay-per-pitch as the primary event-side surface.** It is, however, reasonable on the **high-frequency artist→artist freelancing/session side** (§2–3), where pitching volume is high and buyers are pros, not consumers. Treat it as a Phase-2, freelancing-only lever — not a launch headline.
| 4 | **Featured / urgent gig posting (demand side)** | Client pays to boost a gig or get "verified organizer" trust badge | Immediate | High | Low |
| 5 | **Ensemble payment-split fee** | Small fee to split one payout across band members (§3.3) | With payments | High (genuinely useful) | Med |
| 6 | **Value-added: contracts, cancellation protection, GST invoicing, insurance** | Per-booking add-ons | With payments | High | Med |
| 7 | **Lessons recurring billing** | Auto-charge weekly/package lessons; take rate each cycle | With payments | High (recurring) | Med |
| 8 | **Tipping at live events** | Digital tip jar during/after a set; small fee | Later | Med | Low |

### 5.1 Recommended launch stack (to actually make money at launch)
> Reconciled with market research (`04`): the **commission-from-escrowed-deposit is the spine and should be the primary model**, not deferred. Subscription + featured are the immediate, low-build *complements* — not a substitute for payments.
- **Phase 0 (immediate, low-build revenue + supply quality):** ship **Verified Pro / Artist subscription (#2)** + **featured/urgent posting (#4)**, and **switch the pricing primitive to quote/RFQ** (§4) so you stop repelling quality supply. These bill via a simple gateway subscription/one-time charge (far simpler than full escrow) and earn from day one. *(Pay-per-pitch #3 is deliberately excluded here — see the ⚠️ caveat above.)*
- **Phase 1 (the spine — the highest-leverage move overall):** build **`Transaction` + escrow + commission (#1)** at **~10–12% taken from an escrowed booking deposit**, wired to the **already-existing OTP dual-confirmation** as the release trigger, via **Razorpay Route / Cashfree Easy Split** (turnkey split-settlement, no payment-aggregator licence needed; the platform owes 18% GST on its *commission* only, plus TCS/TDS on payouts — music services are outside CGST Sec 9(5)). Add the **booking deposit** to kill disintermediation (money is already in the platform's hands). Drop the planned "15% on sub-₹10k gigs" tier — research shows that's the rate that pushes price-sensitive Indian bookings off-platform.
- **Phase 2 (widen GMV):** ensemble splits (#5), lessons recurring (#7), value-added (#6), then tipping (#8).

### 5.2 The escrow ↔ check-in wiring (this is the crown jewel)
The `EventCheckIn` model already encodes: OTP generated → artist checks in (with optional GPS) → event started → **both parties confirm end** (`endConfirmation.organizerConfirmed && artistConfirmed`). **That dual-confirm transition is the exact, fraud-resistant signal to release escrow.** Build `Transaction { gig, payer, payee, gross, fee, status: PENDING_PAYMENT → ESCROW → RELEASED/DISPUTED/REFUNDED }` and release on `CheckInStatus.EVENT_ENDED`. Nobody else in this space has ground-truth check-in tied to payout — lead with it.

---

## 6. Other "music business logic" improvements (ranked by leverage)

1. **Availability calendar + double-booking prevention** *(currently missing — `PROJECT_CONTEXT` confirms artists can receive conflicting bids).* This is **mandatory** the moment supply is recurring (session/lessons/ensembles). Add an `Availability` model (busy slots, blackout dates) and block conflicting accept actions. Also the substrate for "instant book."
2. **Match/ranking engine.** All the inputs exist (`instruments`, `genres`, `languages`, geo, `baseRate`, ratings) but search is unranked. Rank by fit × rating × availability × price → better matches → more bookings → more take-rate. A clear lever on conversion.
3. **Repeat-booking / rebooking & "favorites."** Venues that book live music weekly are the highest-LTV demand. One-tap rebook of a past artist + saved roster → recurring GMV. (Bars/cafés/hotels are in your `VenueType` enum already.)
4. **Ensemble/band profiles** (§3.3) — books as one, splits payment, shared reputation.
5. **Rider / setlist / equipment coordination** attached to a booking (reduces day-of disputes → fewer refunds → protects take rate).
6. **Reputation portability & lock-in.** Reviews + verified KYC + completed-gig count are only worth keeping if they live on-platform. Make the verified badge + rating the thing artists *show clients*, so leaving means starting reputation from zero. This is your strongest anti-disintermediation asset after holding the money.
7. **Teaching/lessons vertical** (§2.4) for recurring revenue and weekday utilization of the same supply.
8. **Tip jar / fan support** at live events — small, viral, low-build, and a reason for the audience (a third side) to touch the platform.

---

## 7. Disintermediation — the existential risk, and the answers built into the moat

For a low-frequency event marketplace, users meeting on-platform then paying off-platform to dodge the fee is the #1 way to die. The defenses, all leveraging what's *already built or proposed here*:
- **Hold the money** (escrow + deposit) — can't dodge a fee on money the platform already has.
- **Reputation lock-in** — reviews + verified KYC + check-in history only accrue on-platform.
- **Payment protection / dispute resolution** tied to escrow + the report/dispute pipeline (already modeled) — off-platform = no protection.
- **Don't depend on completion** — subscription + pay-per-pitch + featured (Phase 0) earn even when a specific deal leaks.
- **Make on-platform *easier*** — auto GST invoice, multi-party split, contract e-sign, recurring auto-charge for lessons. Convenience beats fee-avoidance for most users.

---

## 8. Phased roadmap to revenue

- **Phase 0 — "Low-build revenue + supply quality" (weeks):** Verified Pro subscription + featured/urgent posting. Switch default pricing primitive to **quote/RFQ** (protect supply). Collapse `Bid`/`Application`. *(No event-side pay-per-pitch — see §5 ⚠️.)* *Outcome: first revenue, better supply, cleaner core.*
- **Phase 1 — "The spine":** `Transaction`+escrow+commission wired to OTP dual-confirm; booking deposit; payment protection messaging. *Outcome: GMV-based revenue + disintermediation defense.*
- **Phase 2 — "Widen the market":** `SESSION_WORK` + accompanist browse; `ENSEMBLE_SEAT` cross-pitching + `Ensemble` entity + payment splits; availability calendar. *Outcome: artist-as-buyer GMV, network density.*
- **Phase 3 — "Frequency & stickiness":** lessons recurring billing, rebooking/favorites, ranking engine, tipping. *Outcome: recurring revenue, higher LTV, retention.*

---

## 9. Bottom line

The founder's instincts are right and *better than they may realize*: **music freelancing** and **cross-user pitching** aren't just feature additions — together they convert a thin, once-a-year, disintermediation-prone event board into a **high-frequency, multi-sided music-work network** where supply is also demand and a single client booking can spawn several commissionable artist→artist transactions. But none of it makes money until the **cash register exists**. So: install low-build Phase-0 monetization (Verified Pro subscription + featured posting) and switch off the reverse auction *immediately*, then build the **~10–12% commission-from-escrow spine onto the OTP check-in you already have** (this is the single highest-leverage move), then widen GMV with freelancing + ensembles. The moat is built; ring the register.

> Cross-references: revenue-blocker engineering detail → `01-server-audit.md`; funnel breakpoints → `02-web-audit.md`; pricing-truthfulness of the live marketing copy → `03-admin-landing-audit.md`; market sizing, competitor take rates, and India payment/tax specifics → `04-business-model-research.md`.
