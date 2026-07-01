# Payment, Escrow & Commission — Implementation Plan

**Prepared for:** ZTS Music (India-focused music-gig marketplace).
**Date:** 2026-06-29.
**Author:** Backend architecture.
**Scope:** Turn the founder's chosen monetization model — **a flat ~10–12% platform commission taken from an escrowed booking deposit, released on OTP-confirmed event completion** — into a build-ready engineering blueprint grounded in the actual `server/` codebase (Bun + Elysia + Mongoose + MongoDB Atlas + Firebase Admin).

This document is a **plan only**. No source files are modified here. It closes SRV-004 (no money layer) and explicitly neutralizes SRV-007 (timer auto-complete), cross-references SRV-015 (dead `PAYMENT_STATUS` stub) and WEB-001 (no frontend money surfaces).

> **Stack conventions this plan obeys** (verified in code):
> - Modules live in `server/src/modules/<feature>/{index,routes,service,schemas}.ts`; models in `server/src/db/models/*.model.ts` and re-exported from `server/src/db/models/index.ts`; enums in `server/src/shared/enums/index.ts`; runtime config in `server/src/config/index.ts` (reads `Bun.env`); modules are registered under `.group('/api/v1', …)` in `server/src/app.ts`.
> - Services are plain classes, instantiated per-module and injected where they compose (e.g. `checkinModule()` does `new CheckInService(new GigsService())` — see `server/src/modules/checkin/index.ts`).
> - PII at rest uses AES-256-GCM with field-bound AAD via Mongoose getters/setters (`encryptPii`/`decryptPii` in `server/src/shared/utils/crypto.ts`).
> - State transitions go through validators, not raw writes (the canonical example is `GigsService.completeGigFromCheckIn`, `server/src/modules/gigs/gigs.service.ts:450-464`).

---

## 0. The release trigger in one sentence (the spine)

The fraud-resistant signal already exists: in `server/src/modules/checkin/checkin.service.ts:410-422`, when **both** parties confirm event end (`endConfirmation.organizerConfirmed && endConfirmation.artistConfirmed`), `endEvent` calls `gigsService.completeGigFromCheckIn(gigId)` which atomically moves the gig `BOOKED → COMPLETED`. **That exact call site is where escrow release is wired.** Money in at `acceptBid`; money out at the both-confirmed branch of `endEvent`. Nothing else releases — least of all the scheduler timer (SRV-007, §5.3).

---

## 1. Transaction data model

### 1.1 New enums (add to `server/src/shared/enums/index.ts`)

```ts
/**
 * Lifecycle of the money for one booking.
 * PENDING_PAYMENT  → order created at gateway, client has not paid yet
 * ESCROW           → client paid; funds captured & held (platform-controlled)
 * RELEASED         → OTP dual-confirm fired; commission booked, payout initiated
 * REFUNDED         → full refund issued (cancellation / no-show against client)
 * PARTIALLY_REFUNDED → partial refund issued (split-fault, late cancel, etc.)
 * DISPUTED         → on hold pending manual/admin resolution (no auto-release)
 * FAILED           → payment attempt failed/abandoned at gateway (terminal-ish)
 * EXPIRED          → order never paid within window (terminal)
 */
export enum TransactionStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  ESCROW = 'ESCROW',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  DISPUTED = 'DISPUTED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/**
 * Status of the artist payout leg (the Route transfer / settlement to the
 * artist's linked account). Tracked separately from the escrow lifecycle
 * because a RELEASED transaction can still have a payout in flight or failed.
 */
export enum PayoutStatus {
  NOT_STARTED = 'NOT_STARTED',  // escrow not released yet
  QUEUED = 'QUEUED',            // release fired; transfer being created
  PROCESSING = 'PROCESSING',    // gateway accepted, settlement in flight
  PAID = 'PAID',                // settled to artist account (terminal)
  FAILED = 'FAILED',            // transfer/settlement failed → retry/manual
  REVERSED = 'REVERSED',        // payout clawed back (rare; post-dispute)
}

/** What the client is charged at booking. */
export enum PaymentCaptureMode {
  FULL = 'FULL',           // full gig amount captured into escrow
  DEPOSIT = 'DEPOSIT',     // deposit % captured; balance later (Phase 2)
}
```

> Replace, do not extend, the dead `PAYMENT_STATUS` map in `server/src/shared/constants/index.ts:87-94` (SRV-015) — delete it when this model lands so there is one source of truth.

### 1.2 New model: `server/src/db/models/transaction.model.ts`

One `Transaction` per booking (per accepted bid). Money math is stored in **integer paise** (avoid float drift on INR); helpers expose rupees for display. AAD-encrypt only what is genuinely sensitive — gateway IDs are operational, not PII, so they are stored in clear (we need them for reconciliation queries and webhook lookups).

```ts
import { Schema, model, Document, Types } from 'mongoose';
import { TransactionStatus, PayoutStatus, PaymentCaptureMode } from '../../shared/enums';

export interface Transaction extends Document {
  // ---- Booking linkage ----
  gig: Types.ObjectId;        // ref Gig (unique — one txn per gig booking)
  bid: Types.ObjectId;        // ref Bid (the accepted bid that set the price)
  payer: Types.ObjectId;      // ref User (client/organizer who pays)
  payee: Types.ObjectId;      // ref User (artist who gets paid)

  // ---- Money (all amounts in PAISE, integer) ----
  currency: string;                 // 'INR'
  grossAmount: number;              // what the client pays into escrow
  captureMode: PaymentCaptureMode;  // FULL | DEPOSIT
  depositPercent?: number;          // when DEPOSIT (e.g. 25)
  commissionRate: number;           // snapshot at booking, e.g. 0.10 (10%)
  commissionAmount: number;         // round(grossAmount * commissionRate)
  gstOnCommission: number;          // round(commissionAmount * 0.18)
  tcsAmount: number;                // 0.5% Sec 52 (see §9); 0 at MVP if deferred
  tdsAmount: number;                // 0.1% Sec 194-O (see §9); 0 at MVP if deferred
  netPayout: number;                // grossAmount - commissionAmount - gst? - tcs - tds (see §7)
  gatewayFeeBorneBy: 'PLATFORM' | 'CLIENT'; // who eats PG fee (§6)

  // ---- Gateway references (clear text — operational ids, not PII) ----
  gateway: 'RAZORPAY';              // single-gateway MVP; enum-ready for future
  gatewayOrderId?: string;          // Razorpay order_id (created at booking)
  gatewayPaymentId?: string;        // razorpay_payment_id (on capture)
  gatewayTransferId?: string;       // Route transfer id (artist payout leg)
  gatewayRefundId?: string;         // refund id (on refund)
  linkedAccountId?: string;         // artist's Route linked account (acc_***)

  // ---- State machine ----
  status: TransactionStatus;
  payoutStatus: PayoutStatus;

  // ---- Idempotency / audit ----
  idempotencyKey: string;           // unique; "txn:<gigId>:<bidId>" at creation
  statusHistory: {
    from?: TransactionStatus;
    to: TransactionStatus;
    at: Date;
    reason?: string;
    actor?: 'SYSTEM' | 'WEBHOOK' | 'ADMIN' | 'CLIENT' | 'ARTIST';
  }[];

  // ---- Dispute ----
  dispute?: {
    isOpen: boolean;
    openedBy?: Types.ObjectId;      // ref User or admin
    reason?: string;
    relatedReport?: Types.ObjectId; // ref Report (existing Report model)
    resolution?: 'RELEASE' | 'REFUND' | 'PARTIAL_REFUND' | 'SPLIT';
    resolvedBy?: Types.ObjectId;
    resolvedAt?: Date;
    refundAmount?: number;          // paise, when partial
  };

  // ---- Timestamps of money milestones ----
  paidAt?: Date;        // entered ESCROW
  releasedAt?: Date;    // entered RELEASED
  refundedAt?: Date;
  payoutPaidAt?: Date;
  expiresAt?: Date;     // order pay-by deadline (PENDING_PAYMENT TTL)

  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes** (define at schema level, following the existing duplicate-index discipline noted in PROJECT_CONTEXT):

```ts
TransactionSchema.index({ gig: 1 }, { unique: true });           // one txn per gig booking
TransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
TransactionSchema.index({ gatewayOrderId: 1 }, { sparse: true });   // webhook lookup
TransactionSchema.index({ gatewayPaymentId: 1 }, { sparse: true }); // webhook lookup
TransactionSchema.index({ payee: 1, status: 1 });                   // artist earnings
TransactionSchema.index({ payer: 1, status: 1 });                   // client history
TransactionSchema.index({ status: 1, payoutStatus: 1 });            // reconciliation sweeps
TransactionSchema.index({ 'dispute.isOpen': 1 });                   // admin dispute queue
```

Re-export from `server/src/db/models/index.ts` (model + `Transaction` type), mirroring the existing export block.

### 1.3 Separate ledger for the webhook log (replay safety)

Add `server/src/db/models/gateway-event.model.ts` — an append-only record of every webhook delivery, keyed by the gateway's event id, with a unique index. This is the idempotency backstop for §4 (a webhook that has already been processed is a no-op).

```ts
export interface GatewayEvent extends Document {
  gateway: 'RAZORPAY';
  eventId: string;        // x-razorpay-event-id header (unique)
  eventType: string;      // e.g. 'payment.captured'
  signatureValid: boolean;
  payloadHash: string;    // sha256 of raw body (tamper/debug)
  transaction?: Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
}
// GatewayEventSchema.index({ eventId: 1 }, { unique: true });
```

---

## 2. Gateway choice — **Razorpay Route**

**Pick: Razorpay Route** (with Razorpay Payments for collection and RazorpayX/Route transfers for payout). Cashfree Easy Split is a fully acceptable equivalent and the integration shape below is gateway-agnostic behind a thin adapter, but Route is the primary recommendation.

**Justification (grounded in `04-business-model-research.md` §4.2 and §6):**
- **No Payment-Aggregator licence needed.** Report 04 §4.2 is explicit: under the RBI PA Directions 2025, ZTS can "ride Razorpay Route/Cashfree's escrow + split-settlement rails to wire payments fast" rather than hold customer funds itself or obtain its own PA licence. Route's marketplace model keeps funds in Razorpay's regulated nodal/escrow account; ZTS only orchestrates capture, hold, split, and transfer.
- **Native split-settlement / hold-and-release.** Route supports capturing into the platform account, **holding** the artist's share (`on_hold: true`), then releasing via a **transfer** to the artist's **linked account** — which maps 1:1 onto the escrow→release model the founder chose. Cashfree Easy Split does the same (collect → deduct commission → settle to vendor); Route is chosen for the richer hold/transfer-reversal primitives and the well-documented webhook surface.
- **One-to-many and multi-party ready.** Route's transfer model extends cleanly to the Phase-2 ensemble payment-split use case (`05` §3.3) without re-platforming.
- **The artist KYC we already collect feeds it directly.** `server/src/db/models/artist-verification.model.ts` already captures an encrypted `bankAccount` (`accountHolderName`, `accountNumber`, `ifscCode`, `bankName`, `upiId`) gated by `overallStatus === VERIFIED`. Creating a Route **linked account / beneficiary** for the artist consumes exactly these fields (decrypted via the model getters at payout time only). No new KYC surface is required to start paying artists — the moat is already built (report 04 §4.4).

**Adapter boundary.** Put all SDK calls behind `server/src/services/payment-gateway.service.ts` exposing: `createOrder`, `verifyWebhookSignature`, `fetchPayment`, `createLinkedAccount`, `createTransfer`, `releaseHold`, `createRefund`, `reverseTransfer`. The Transaction service never imports the Razorpay SDK directly — this keeps Cashfree swappable and makes the service unit-testable with a mock adapter.

---

## 3. Capture-at-booking flow

**Where:** `BidsService.acceptBid` (`server/src/modules/bids/bids.service.ts:365-441`). Today it: (1) atomically claims the bid `PENDING → ACCEPTED`; (2) atomically claims the gig `LIVE → BOOKED` setting `acceptedBid`/`acceptedArtist`; (3) cross-rejects sibling pending bids and applications. We extend step (2)/(3) without weakening the existing race-safety.

**Important design decision — booking vs payment ordering.** Accepting a bid should **create the payment intent**, not require the client to have already paid. The clean sequence:

1. Client accepts the artist's bid → `acceptBid` runs exactly as today through the atomic gig-lock and sibling rejection. **Gig goes to `BOOKED`.**
2. Immediately after the gig lock succeeds, create a `Transaction` in `PENDING_PAYMENT` with a deterministic `idempotencyKey = "txn:<gigId>:<bidId>"` and a Razorpay **order** for the capture amount, via `paymentGateway.createOrder({ amount, currency, notes:{ gigId, bidId, txnId } })`. Store `gatewayOrderId`, `commissionRate` (snapshot from config, §7), computed `commissionAmount`, and `expiresAt` (pay-by window, e.g. 24h or until `eventDate - X`, whichever is sooner).
3. Return the `order` handle to the client so the frontend opens Razorpay Checkout (WEB-001 surface). The booking is **provisional** until payment captured.
4. On `payment.captured` webhook (§4) → Transaction `PENDING_PAYMENT → ESCROW`, `paidAt` set. The booking is now firm; funds are escrowed with the artist share held.

**What the client pays — full vs deposit.** MVP: **`captureMode = FULL`** — capture the full accepted bid `amount` into escrow. This is simplest, maximizes disintermediation resistance (platform holds 100%), and matches the accepted-bid price being a fixed, known number. `DEPOSIT` mode (capture e.g. 25%, collect balance pre-event) is modeled in the schema and deferred to Phase 2 (the Poptop pattern in report 04 §1a). The commission is always computed on the **full gig value**, not the deposit, regardless of capture mode.

**Idempotency.** The deterministic `idempotencyKey` + the unique index on `{ gig: 1 }` mean a double-accept or a retried request cannot create two transactions or two orders. `acceptBid`'s second step already guards against double-accept at the gig level; the Transaction create uses `findOneAndUpdate({ gig }, { $setOnInsert: … }, { upsert: true })` so a retry returns the existing order instead of creating a new one. Pass the same key as Razorpay's `Idempotency-Key` header on `createOrder`.

**What happens to other bids.** Unchanged — `acceptBid` step (3) already cross-rejects sibling `PENDING` bids and applications atomically (`bids.service.ts:423-438`). No money was ever attached to losing bids, so there is nothing to refund for them.

**Failure/abandonment.** If the client never pays, the order expires: a reconciliation sweep (§8) flips `PENDING_PAYMENT → EXPIRED` past `expiresAt` and **rolls the booking back** (gig `BOOKED → LIVE`, accepted bid back to `PENDING` or `EXPIRED`) so the gig can be re-awarded. This rollback must reuse the gig state-machine validator, not a raw write.

> **Transactionality caveat.** MongoDB Atlas supports multi-document transactions. Wrap the Transaction-create + order-create orchestration so a gateway failure after the gig lock does not leave a `BOOKED` gig with no Transaction. Because `createOrder` is an external call, the safe pattern is: persist Transaction `PENDING_PAYMENT` first (idempotent upsert), then call `createOrder`, then patch `gatewayOrderId`. If `createOrder` fails, the sweep retries from the persisted `PENDING_PAYMENT` row.

---

## 4. Webhook endpoint

**New module:** `server/src/modules/payments/` with `payments.routes.ts`, `payments.service.ts`, `payments.webhook.ts`, `payments.schemas.ts`, `index.ts`. Register in `server/src/app.ts` inside the `/api/v1` group (alongside `bidsModule()`, `checkinModule()`, …). The webhook itself is mounted **outside** the JWT-derive expectations — it authenticates by HMAC signature, not by user token.

**Route:** `POST /api/v1/payments/webhook/razorpay`.

**Raw-body requirement.** HMAC must be computed over the **exact raw request bytes**. Elysia parses JSON by default; the webhook route must read the raw body (e.g. via a route-scoped parser / `onParse` that preserves the raw string for this path) before any transformation. Document this clearly — a re-serialized body will fail signature verification.

**Verification & handling order:**
1. Read raw body + `x-razorpay-signature` header. Compute `HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)` and `crypto.timingSafeEqual` against the header. Reject `400` on mismatch (mirrors the constant-time comparison already used for OTP in `checkin.service.ts:243-248` and refresh tokens).
2. **Replay/idempotency:** upsert a `GatewayEvent` by `eventId` (`x-razorpay-event-id`). If it already exists with `processedAt` set, return `200` immediately (no-op). This makes redeliveries safe.
3. Dispatch on `event`:
   - **`payment.captured`** → find Transaction by `gatewayOrderId`/`gatewayPaymentId`; transition `PENDING_PAYMENT → ESCROW`; set `paidAt`, `gatewayPaymentId`; emit client+artist "payment received / booking confirmed" notifications.
   - **`payment.failed`** → `PENDING_PAYMENT → FAILED`; surface to client to retry; do not roll back the booking immediately (let them retry within the window).
   - **`refund.processed`** → `→ REFUNDED` or `→ PARTIALLY_REFUNDED` depending on amount; set `refundedAt`, `gatewayRefundId`.
   - **`transfer.processed` / `settlement.processed` (payout leg)** → `payoutStatus → PAID`, `payoutPaidAt`; notify artist "payout settled".
   - **`transfer.failed`** → `payoutStatus → FAILED`; queue for retry/manual (§8).
4. Mark `GatewayEvent.processedAt`. Always return `200` on a handled or duplicate event; return `4xx` only on signature failure or genuinely unparseable input (so the gateway retries on transient `5xx` only).

**Security:** the webhook path must be exempt from the per-user rate limiter but subject to a generous IP/signature-based guard; never trust any field in the body for authorization — re-derive Transaction state from our own DB keyed by gateway ids.

---

## 5. OTP-gated release

### 5.1 Wire release into the dual-confirmation branch

In `server/src/modules/checkin/checkin.service.ts:414-422`, the both-confirmed branch currently does only:

```ts
if (bothConfirmed) {
  await this.gigsService.completeGigFromCheckIn(gigId);   // BOOKED → COMPLETED
  checkIn.status = CheckInStatus.EVENT_ENDED;
  checkIn.eventEndedAt = now;
}
```

**Plan:** compose a `TransactionService` into `CheckInService` (constructor injection, exactly like `GigsService` is composed today — see `server/src/modules/checkin/index.ts`). After `completeGigFromCheckIn` succeeds (and only then), call:

```ts
await this.transactionService.releaseEscrowForGig(gigId, { actor: 'SYSTEM', reason: 'OTP_DUAL_CONFIRM' });
```

`releaseEscrowForGig`:
1. Atomically transition the Transaction `ESCROW → RELEASED` via `findOneAndUpdate({ gig, status: ESCROW }, { $set: { status: RELEASED, releasedAt } })`. If no doc matches (not paid, already released, disputed), it is a **no-op that does not throw** the check-in flow — log and return; completion of the gig is independent of payout mechanics. (If status is `DISPUTED`, leave it; release happens via admin resolution, §6.)
2. Compute/confirm commission, GST, TCS/TDS snapshot (§7, §9).
3. Set `payoutStatus → QUEUED` and enqueue the payout (§8) — `releaseHold` + `createTransfer` to the artist's `linkedAccountId`. The actual settlement confirmation arrives via the `transfer.processed` webhook (§4).

**Ordering guarantee:** completion (`gig.status` and `checkIn.status`) is committed through the existing validated, idempotent helper *before* any money moves. If release fails, the gig is still correctly COMPLETED and the payout retries from `RELEASED/QUEUED` via the reconciliation sweep — money is never lost or double-sent because each leg is an idempotent conditional update keyed on current status.

### 5.2 Why this is the right trigger

`endConfirmation.organizerConfirmed && artistConfirmed` is ground truth that the event actually happened, confirmed by **both** counterparties, gated upstream by the artist's GPS+OTP physical check-in (`verifyOtp`, `checkin.service.ts:210-315`). Report 05 §5.2 calls this the crown jewel: nobody else in the space ties payout to a dual-confirmed, location-verified check-in. Release on anything weaker re-opens the disintermediation/fraud hole the moat was built to close.

### 5.3 SRV-007 neutralization (MANDATORY — the scheduler must NEVER release funds)

`SchedulerService.autoCompleteGigs` (`server/src/services/scheduler.service.ts:245-307`) today force-sets any `BOOKED`/`CLOSED` gig whose event is >24h past to `COMPLETED` via a **raw** `GigModel.updateOne({ _id }, { status: COMPLETED })` — bypassing `completeGigFromCheckIn` and the OTP dual-confirm entirely. Once escrow exists, "auto-complete" would equal "auto-release without ground truth" — catastrophic.

**Fix (apply as part of this work):**
1. The scheduler must **only** auto-complete gigs whose `EventCheckIn.status === CheckInStatus.EVENT_ENDED` (i.e. both parties already confirmed — the money path, if any, has already released through §5.1). For these, route through `gigsService.completeGigFromCheckIn` (or simply skip, since the check-in flow already completed them).
2. Any `BOOKED`/`CLOSED` gig past its event date **without** an `EVENT_ENDED` check-in must transition to a manual-review state — introduce **`GigStatus.DISPUTED`** (or reuse a review queue) and move the **Transaction to `TransactionStatus.DISPUTED`**, never to `RELEASED`. These land in the admin dispute queue (§6) for human resolution (release, refund, or partial).
3. **The scheduler timer path has zero authority to call `releaseEscrowForGig`.** Release is reachable *only* from the dual-confirm branch of `endEvent` (§5.1) and from explicit admin dispute resolution (§6). Add a unit test asserting the scheduler never transitions a Transaction to `RELEASED` (§11).

This converts SRV-007 from "auto-complete-with-release" into "auto-flag-for-review", which is the only safe behavior with money in escrow.

---

## 6. Refund / dispute / cancellation money paths

Money unwinds map onto the existing cascade in `GigsService` (`cancelGig`/`closeGig` → `cascadeTerminate`, `gigs.service.ts:291-408`). Each gig money-affecting transition calls a corresponding Transaction method; the Transaction state machine is the source of truth for who gets what.

| Trigger (existing code) | Transaction state before | Money action | Resulting state |
|---|---|---|---|
| `cancelGig` **before payment** (`PENDING_PAYMENT`) | PENDING_PAYMENT | cancel gateway order; no capture occurred | `EXPIRED`/`FAILED` |
| `cancelGig` by **client** after escrow, before event | ESCROW | full refund of gross to client; platform eats PG fee | `REFUNDED` |
| **Artist** cancels / no-show (artist never checks in; OTP `EXPIRED`) | ESCROW | full refund to client; flag artist (Report) | `REFUNDED` |
| **Client** no-show / refuses to confirm a performed event | ESCROW | → manual review; likely release to artist | `DISPUTED` → `RELEASED`/`PARTIAL` |
| `closeGig` after event, then dual-confirm | ESCROW | normal release | `RELEASED` |
| Mutual cancel within free-cancel window | ESCROW | full refund, no commission | `REFUNDED` |
| Late cancel (inside penalty window) | ESCROW | partial refund; platform/artist keep cancellation fee | `PARTIALLY_REFUNDED` |
| Dispute raised (existing `Report` with `PAYMENT_DISPUTE`/`NO_SHOW` types) | ESCROW | hold; admin decides | `DISPUTED` → resolution |

**Wiring points:**
- `cancelGig` / `closeGig` (`gigs.service.ts:337,380`) and `cancelCheckIn` (`checkin.service.ts:461`) must, after the existing cascade, call `transactionService.handleGigCancellation(gigId, { actor, reason })`, which inspects current Transaction status and chooses refund vs order-cancel vs dispute.
- Disputes reuse the **existing `Report` model + pipeline** (`ReportType.PAYMENT_DISPUTE`, `NO_SHOW` already exist in `server/src/shared/enums/index.ts:228,239`). Opening a payment dispute sets `Transaction.dispute.isOpen = true`, `status = DISPUTED`, and links `dispute.relatedReport`. Admin resolution (`RELEASE | REFUND | PARTIAL_REFUND | SPLIT`) drives the final money action and the terminal Transaction state. The OTP timer (SRV-007) feeds this queue automatically for unconfirmed events.

**Who eats the gateway fee.** MVP policy (store per-Transaction in `gatewayFeeBorneBy`):
- **Successful release:** PG fee is netted from the platform commission (platform absorbs it out of its ~10–12%). Set `gatewayFeeBorneBy = PLATFORM`.
- **Client-initiated refund before event:** platform absorbs the (typically small/refundable) PG fee — pro-consumer, protects conversion.
- **Late cancellation / no-show:** the cancellation penalty (a configured % of gross) covers the PG fee and is split per policy; the refunded portion is `grossAmount − penalty`.

Partial refunds are first-class: `PARTIALLY_REFUNDED` + `dispute.refundAmount` (paise) record the split so reconciliation and invoicing stay correct.

---

## 7. Commission engine

- **Flat ~10–12%, configurable.** Add `COMMISSION_RATE` (decimal, e.g. `0.10`) and an optional `COMMISSION_MIN_FEE_PAISE` (small floor fee) to config (§10). Surface in `server/src/config/index.ts` under a new `payments` block (`commissionRate`, `minFeePaise`, `captureMode`, `currency`). Default `0.10`.
- **Where computed.** A pure helper `computeCommercials(grossPaise, rate, minFeePaise)` in `server/src/modules/payments/commission.ts` (unit-testable, no I/O). Called **once at booking** (snapshot `commissionRate`/`commissionAmount` onto the Transaction so a later config change can't retroactively alter a booked deal) and re-validated at release.
- **Rounding.** All math in integer paise; `commissionAmount = Math.round(grossPaise * rate)`; apply `Math.max(commissionAmount, minFeePaise)`. `netPayout = grossPaise − commissionAmount − tcs − tds` (GST on commission is the platform's output-tax liability funded from the commission, not an extra deduction from the artist — see §9). Round each statutory component independently, then derive `netPayout` last so totals reconcile to the paise.
- **Why drop the tiered "15% on small gigs" idea.** Report 04 §4.5 and §6 are explicit: 15% on a sub-₹10k gig is *exactly* the rate that pushes price-sensitive Indian bookings off-platform, and Urban Company's worker backlash / commission cut is the cautionary benchmark. A flat ~10–12% sits in the Poptop (12%) / Sharetribe "start ~10%" band (04 §2.1) and is the disintermediation-minimizing choice. Keep a small **minimum fee floor** instead of a high small-gig rate to protect unit economics on tiny bookings without punishing them.

---

## 8. Payout pipeline

1. **Linked-account provisioning.** When an artist's `ArtistVerification.overallStatus` reaches `VERIFIED` (or lazily on first payout), call `paymentGateway.createLinkedAccount` using the decrypted `bankAccount` fields (`accountHolderName`, `accountNumber`, `ifscCode`, `bankName`, optional `upiId`) from `artist-verification.model.ts`. Decrypt **only** at this call (the model getters handle AAD); never log the plaintext. Persist the returned `linkedAccountId`/beneficiary id on the artist's verification doc (new field) and copy it onto each Transaction at release time. Block payout (and warn at booking) if the artist is not bank-verified.
2. **Release → transfer.** On `releaseEscrowForGig` (§5.1): `payoutStatus QUEUED`; `releaseHold(paymentId)` then `createTransfer({ account: linkedAccountId, amount: netPayout, currency, notes:{ gigId, txnId } })`; store `gatewayTransferId`; `payoutStatus → PROCESSING`.
3. **Settlement confirmation** arrives via `transfer.processed`/`settlement.processed` webhook → `payoutStatus → PAID`, `payoutPaidAt`. Razorpay settles linked accounts on a schedule (T+x); we surface "processing → paid" to the artist rather than claiming instant payout.
4. **Failure handling.** `transfer.failed` → `payoutStatus → FAILED`; the reconciliation sweep retries with backoff (idempotent on `gatewayTransferId`); after N retries, raise an admin alert + notification. Common cause: stale/invalid bank details → prompt artist to re-verify.
5. **Reconciliation.** A scheduled job (extend `SchedulerService`, but as a **separate** job from auto-complete — never coupled to it) periodically: (a) flips expired `PENDING_PAYMENT`; (b) re-polls `RELEASED && payoutStatus IN (QUEUED, PROCESSING, FAILED)` against the gateway and reconciles; (c) emits a daily settlement report row for the admin financial surface. Keyed lookups use the `gatewayOrderId`/`gatewayPaymentId`/`gatewayTransferId` sparse indexes (§1.2).

---

## 9. GST / TCS / TDS / invoicing

Grounded in report 04 §4.3 (Sec 9(5) does **not** apply to music/event services — ZTS owes GST only on its **own commission**, and acts as e-commerce operator for TCS/TDS).

**Compute & store on every released Transaction:**
- **GST 18% on commission** (intermediary/support service, SAC 9985/998599). `gstOnCommission = round(commissionAmount * 0.18)`. This is ZTS's **output tax** liability — it is funded from the platform's commission take, not an extra deduction from the artist's payout. Store it for filing/reporting.
- **GST TCS 0.5% (Sec 52, e-commerce operator)** on net taxable supplies — collected from the artist's payout, deposited by the platform, reported in GSTR-8. `tcsAmount = round(grossTaxableSupply * 0.005)`.
- **Income-tax TDS 0.1% (Sec 194-O)** on gross to the artist (5% if no PAN; threshold ₹5L/yr for resident individuals). `tdsAmount = round(grossAmount * 0.001)` subject to threshold logic.
- **`netPayout`** to the artist = `grossAmount − commissionAmount − tcsAmount − tdsAmount`.

**GST invoice numbering.** Add an `Invoice` concept (can be a sub-document on Transaction or a small `invoice.model.ts`): a monotonically increasing, financial-year-scoped, gap-free series per GSTIN (e.g. `ZTS/2026-27/000123`). Generate the **commission tax invoice** (platform → client/artist for the service fee) at release. Use an atomic counter collection (`findOneAndUpdate` `$inc` on a `Counters` doc keyed by `series+FY`) to guarantee no gaps/duplicates under concurrency.

**MVP vs deferrable:**
- **MVP (store + report):** snapshot `commissionAmount`, `gstOnCommission`, `tcsAmount`, `tdsAmount`, `netPayout` on every Transaction; generate the commission invoice number + a simple invoice record. This is cheap and makes later filing/audit possible.
- **Deferrable (Phase 2/3):** automated GSTR-8 generation, TDS challan/26Q automation, PDF invoice rendering + email delivery, threshold tracking across a financial year, and edge-case PAN-missing 5% TDS. Compute and **store** the numbers from day one even if filing is manual at launch — the data must exist to be reconciled later.

---

## 10. Required env vars & secrets (names only)

Add to the required/optional env handling in `server/src/config/index.ts` (do not print or read any `.env` here):

```
# Gateway (Razorpay Route)
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_ROUTE_ACCOUNT_ID        # platform account id for transfers (if needed)

# Commission / capture policy
COMMISSION_RATE                  # e.g. 0.10
COMMISSION_MIN_FEE_PAISE         # optional floor fee, e.g. 2000 (= ₹20)
PAYMENT_CAPTURE_MODE             # FULL | DEPOSIT (default FULL)
DEPOSIT_PERCENT                  # used only when DEPOSIT (e.g. 25)
PAYMENT_CURRENCY                 # INR

# Tax
GST_COMMISSION_RATE              # 0.18
TCS_RATE                         # 0.005
TDS_RATE                         # 0.001
PLATFORM_GSTIN                   # for invoice numbering / reporting
INVOICE_SERIES_PREFIX            # e.g. ZTS

# Ops
PAYMENT_ORDER_TTL_HOURS          # PENDING_PAYMENT expiry window
```

Production boot should hard-fail (the existing `process.exit(1)` pattern in `loadConfig`) if `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`/`COMMISSION_RATE`/`PLATFORM_GSTIN` are missing, mirroring how `JWT_SECRET` etc. are already validated.

---

## 11. New / changed files, endpoints, and frontend surfaces

### New files
- `server/src/db/models/transaction.model.ts` — Transaction model (§1.2).
- `server/src/db/models/gateway-event.model.ts` — webhook replay ledger (§1.3).
- `server/src/db/models/invoice.model.ts` (+ a `counters.model.ts` or reuse) — GST invoice numbering (§9). *(May start as a Transaction sub-doc.)*
- `server/src/services/payment-gateway.service.ts` — Razorpay/Route adapter (§2).
- `server/src/modules/payments/{index,routes,service,webhook,schemas}.ts` — Transaction service, webhook handler, client-facing order/refund endpoints.
- `server/src/modules/payments/commission.ts` — pure commission/tax math (§7, §9).

### Changed files
- `server/src/shared/enums/index.ts` — add `TransactionStatus`, `PayoutStatus`, `PaymentCaptureMode`, and (for SRV-007) `GigStatus.DISPUTED`.
- `server/src/shared/constants/index.ts` — delete dead `PAYMENT_STATUS` (SRV-015).
- `server/src/db/models/index.ts` — export new models/types.
- `server/src/config/index.ts` — add `payments`/`tax` config block + env validation (§10).
- `server/src/app.ts` — register `paymentsModule()` under `/api/v1`.
- `server/src/modules/bids/bids.service.ts` — `acceptBid` creates Transaction + order (§3).
- `server/src/modules/bids/bids.gateway.ts` / `bids.routes.ts` — return order handle on accept (and note: SRV-003 WS leak should be fixed alongside, since money makes leaked bid books worse).
- `server/src/modules/checkin/checkin.service.ts` + `checkin/index.ts` — inject `TransactionService`; release on dual-confirm (§5.1).
- `server/src/modules/gigs/gigs.service.ts` — `cancelGig`/`closeGig`/`completeGigFromCheckIn` call Transaction unwind hooks (§6); add `DISPUTED` to the transition map.
- `server/src/db/models/artist-verification.model.ts` — add `linkedAccountId`/beneficiary field (§8).
- `server/src/services/scheduler.service.ts` — **SRV-007 fix** (§5.3): gate auto-complete on `EVENT_ENDED`; route the rest to DISPUTED; add a **separate** reconciliation job (§8); never touch release.
- `server/src/db/models/notification.model.ts` — add `NotificationType` values: `PAYMENT_RECEIVED`, `PAYMENT_FAILED`, `ESCROW_RELEASED`, `PAYOUT_PAID`, `PAYOUT_FAILED`, `REFUND_ISSUED`, `DISPUTE_OPENED`.

### New endpoints (all under `/api/v1`)
- `POST /payments/webhook/razorpay` — gateway webhook (HMAC, raw body, no JWT) (§4).
- `POST /payments/orders/:gigId` — (or fold into accept) create/refetch the order for the booked gig; client only.
- `GET  /payments/transaction/:gigId` — booking parties view their Transaction (escrow/payout status).
- `GET  /payments/me/earnings` — artist earnings/payout history (backs WEB-001 earnings page; replaces hardcoded zeros).
- `GET  /payments/me/payments` — client payment history.
- `POST /payments/:gigId/refund` — client/admin-initiated refund (policy-gated) (§6).
- `POST /admin/payments/:txnId/resolve-dispute` — admin release/refund/partial (§6); permission-gated via the existing `AdminPermission` matrix (add a `MANAGE_PAYMENTS` permission).
- `GET  /admin/payments` + replace the `{ totalRevenue: 0 }` stub at `admin.routes.ts:114-136` with real aggregation over `Transaction`.

### Frontend surfaces (cross-ref WEB-001, report 02)
WEB-001 is the Critical "revenue spine absent on the frontend." This backend plan unblocks, and must be matched by:
- **Client:** the missing `app/(dashboard)/client/gigs/[id]/manage/` route (WEB-002) as the event-lifecycle hub — pay-into-escrow (Razorpay Checkout), OTP display, end-event confirm, payment status, post-event review.
- **Artist:** OTP check-in screen + end-event confirm (`lib/api/checkin.ts` is currently entirely unused per WEB-001); real **earnings** page wired to `GET /payments/me/earnings` (currently hardcoded zeros, `artist/earnings/page.tsx`); bank/UPI KYC entry feeding linked-account creation.
- **Shared:** the unused `Transaction` type in `lib/types.ts:142-164` becomes the real client model.
- **Admin:** transaction monitoring + dispute resolution + payout management UIs (the deferred "admin financial surfaces", PROJECT_CONTEXT §"Things deliberately deferred").

---

## 12. Test plan & phased sequencing

### Unit tests
- `commission.ts`: rate math, paise rounding, min-fee floor, GST/TCS/TDS computation, `netPayout` reconciles to the paise. Property test: `commission + net + tcs + tds === gross` (modulo policy on GST being platform-funded).
- Transaction state-machine: only legal transitions allowed; illegal ones (e.g. `RELEASED → ESCROW`, `REFUNDED → RELEASED`) rejected.
- Webhook signature verify: valid/invalid/tampered/replayed (duplicate `eventId` → no-op).
- **SRV-007 guard:** scheduler `autoCompleteGigs` never moves a Transaction to `RELEASED`; an unconfirmed past-event gig goes to `DISPUTED`, not `COMPLETED`-with-release.
- Idempotency: double `acceptBid` / retried `createOrder` yields exactly one Transaction + one order (unique `{gig}` + deterministic `idempotencyKey`).
- Refund paths: cancel-before-pay (order cancel), cancel-after-escrow (full refund), late-cancel (partial), no-show (refund/dispute).

### Integration test (the headline happy path)
End-to-end against an in-memory/real Mongo (the suite already spins one up per `server/src/test/setup.ts`) with a **mocked `payment-gateway.service`**:
`place bid → acceptBid` (gig→BOOKED, Transaction PENDING_PAYMENT, order created) → simulate **`payment.captured`** webhook (→ESCROW) → `generateOtp` → `verifyOtp` (GPS+OTP) → `startEvent` → `endEvent` by organizer **and** artist (dual-confirm) → assert gig COMPLETED, Transaction RELEASED, payout QUEUED → simulate **`transfer.processed`** webhook → assert `payoutStatus PAID`, `netPayout` correct, commission/GST/TCS/TDS snapshotted, invoice number issued. Plus a negative path: skip dual-confirm, run the scheduler past +24h, assert Transaction `DISPUTED` and **no** release.

### Phased sequencing to first rupee
- **Phase 0 (no escrow needed — earns immediately):** ship the low-build complements from report 05 §5.1 — Verified-Pro/featured subscription + one-time charges via a simple Razorpay subscription/order, and switch pricing primitive toward quote/RFQ. *(Out of scope for this doc, but it is the fastest revenue and de-risks the gateway integration.)*
- **Phase 1 — the spine (this plan):**
  1. Enums + `Transaction`/`GatewayEvent` models + config/env + gateway adapter (mock-first).
  2. `acceptBid` → create Transaction + order (capture-at-booking, §3).
  3. Webhook endpoint: signature + replay + `payment.captured` → ESCROW (§4).
  4. **SRV-007 fix** in the scheduler *before* enabling any release (§5.3) — non-negotiable ordering.
  5. Release on dual-confirm in `endEvent` (§5.1) + linked-account creation + transfer (§8).
  6. Refund/dispute/cancellation hooks (§6) + admin dispute resolution + real `/admin/payments` revenue.
  7. Commission/GST/TCS/TDS snapshot + invoice numbering (§7, §9).
  8. Frontend WEB-001/WEB-002 surfaces (client manage hub, artist check-in + earnings).
- **Phase 2+:** deposit-mode capture, ensemble payment splits, lessons recurring billing, automated GST/TDS filing (report 05 §8).

**First rupee is collected the moment Phase-1 steps 1–3 are live (escrow capture) and recognized as platform revenue at step 5 (release with commission booked).**
