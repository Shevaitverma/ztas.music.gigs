# ZTS Music Platform - Future Implementation Roadmap

> This document outlines features to be implemented in upcoming sessions.

---

## Table of Contents

1. [Core Business Flow: Reverse Auction Bidding](#1-core-business-flow-reverse-auction-bidding)
2. [Payment & Escrow System](#2-payment--escrow-system)
3. [Event Check-in OTP System](#3-event-check-in-otp-system)
4. [Verification Systems](#4-verification-systems)
5. [Admin Dashboard Enhancements](#5-admin-dashboard-enhancements)
6. [User Activity Logging](#6-user-activity-logging)
7. [Priority Order](#7-priority-order)

---

## 1. Core Business Flow: Reverse Auction Bidding

### Overview

The **Bidding System** is the CORE feature of the platform. It operates as a **reverse auction** where:
- Venue posts a gig with a **maximum budget**
- Artists compete by bidding **lower amounts**
- Venue selects the best bid (not always the lowest - quality matters)

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REVERSE AUCTION BIDDING FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

  1. VENUE posts gig with MAX budget (e.g., ₹10,000)
              │
              ▼
  2. Gig appears to ARTISTS in range + available timeslot
              │
              ▼
  3. Artists place BIDS (competing lower: ₹9,000, ₹8,500, ₹8,000...)
              │
              ▼
  4. Venue reviews bids + artist profiles/portfolios
              │
              ▼
  5. Venue ACCEPTS one bid (quality + price consideration)
              │
              ▼
  ┌───────────────────────────────────────────────────────────┐
  │  • Selected bid → ACCEPTED                                 │
  │  • Gig status → BOOKED                                     │
  │  • Other pending bids → AUTO-REJECTED                      │
  │  • Transaction created → PENDING_PAYMENT                   │
  └───────────────────────────────────────────────────────────┘
              │
              ▼
  6. Venue PAYS the bid amount to platform
              │
              ▼
  ┌───────────────────────┐
  │   MONEY IN ESCROW     │ ◄── Platform holds funds
  └───────────────────────┘
              │
              ▼
  7. Event day: OTP CHECK-IN verifies artist showed up
              │
              ▼
  8. Event COMPLETED (both parties confirm)
              │
              ▼
  9. Payment RELEASED to artist (minus platform cut)
```

### System Architecture

We have TWO systems that work together:

| System | Purpose | When Used |
|--------|---------|-----------|
| **Bids** | Competitive pricing (reverse auction) | Artist bids on gigs with price |
| **Applications** | Express interest with proposal | Optional: detailed proposals without bidding |

**Primary Flow**: Bids (reverse auction)
**Secondary Flow**: Applications (for non-competitive scenarios)

### Bid Model (Existing - KEEP)

```typescript
interface Bid {
  id: string;
  gigId: ObjectId;
  artist: ObjectId;

  // Bid details
  amount: number;           // Artist's quoted price (lower = more competitive)
  currency: string;
  proposal?: string;        // Optional cover letter

  // Status
  status: BidStatus;        // PENDING → ACCEPTED/REJECTED

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

enum BidStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}
```

### Required Improvements

#### 1. Auto-Reject Other Bids on Accept
When a bid is accepted, all other pending bids should be auto-rejected.

```typescript
// In bids.service.ts - acceptBid()
async acceptBid(bidId: string, clientId: string): Promise<Bid> {
  const bid = await BidModel.findById(bidId);

  // ... validation ...

  // Accept this bid
  bid.status = BidStatus.ACCEPTED;
  await bid.save();

  // Update gig
  await GigModel.findByIdAndUpdate(bid.gigId, {
    status: GigStatus.BOOKED,
    acceptedBid: bidId,
    acceptedArtist: bid.artist,
  });

  // AUTO-REJECT all other pending bids
  await BidModel.updateMany(
    { gigId: bid.gigId, _id: { $ne: bidId }, status: BidStatus.PENDING },
    { status: BidStatus.REJECTED }
  );

  // Create transaction for payment
  await TransactionModel.create({
    gig: bid.gigId,
    bid: bidId,
    payer: clientId,
    payee: bid.artist,
    totalAmount: bid.amount,
    status: TransactionStatus.PENDING_PAYMENT,
  });

  return bid;
}
```

#### 2. Cascade on Gig Cancel/Close
When a gig is cancelled or closed, all pending bids should be rejected.

```typescript
// In gigs.service.ts
async cancelGig(gigId: string, userId: string): Promise<Gig> {
  // ... existing logic ...

  // Reject all pending bids
  await BidModel.updateMany(
    { gigId, status: BidStatus.PENDING },
    { status: BidStatus.REJECTED }
  );

  return gig;
}

async closeGig(gigId: string, userId: string): Promise<Gig> {
  // ... existing logic ...

  // Reject all pending bids (no more bids accepted)
  await BidModel.updateMany(
    { gigId, status: BidStatus.PENDING },
    { status: BidStatus.REJECTED }
  );

  return gig;
}
```

#### 3. Add Complete Gig Endpoint

```typescript
// POST /gigs/:id/complete
async completeGig(gigId: string, userId: string): Promise<Gig> {
  const gig = await GigModel.findById(gigId);

  if (!gig) throw new NotFoundException('Gig not found');
  if (gig.postedBy.toString() !== userId) throw new ForbiddenException();
  if (gig.status !== GigStatus.CLOSED) {
    throw new BadRequestException('Can only complete CLOSED gigs');
  }

  gig.status = GigStatus.COMPLETED;
  await gig.save();

  return gig;
}
```

---

## 2. Payment & Escrow System

### Overview
Platform holds money from Venue in escrow. After successful event completion (verified by OTP check-in), funds are released minus platform cut.

### Flow
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAYMENT FLOW                                         │
└─────────────────────────────────────────────────────────────────────────────┘

  1. Bid accepted for gig
              │
              ▼
  2. Venue pays FULL bid amount to platform
              │
              ▼
  ┌───────────────────────┐
  │   MONEY IN ESCROW     │ ◄── Platform holds funds
  └───────────────────────┘
              │
              ▼
  3. Event happens (verified by OTP check-in)
              │
              ▼
  4. Event marked COMPLETED
              │
         ┌────┴────┐
         │         │
    No Dispute   Dispute Raised
         │              │
         ▼              ▼
  ┌─────────────┐  ┌─────────────┐
  │  RELEASE    │  │   HOLD      │
  │  PAYMENT    │  │  PENDING    │
  └─────────────┘  └─────────────┘
         │              │
         ▼              ▼
  Artist gets:     Admin resolves
  Amount - Cut     dispute first
                        │
                   ┌────┴────┐
                   │         │
              Artist    Venue
              Wins      Wins
                   │         │
                   ▼         ▼
              Pay Artist  Refund
              (minus cut) Venue
```

### New Models Required

#### Transaction Model
```typescript
interface Transaction {
  id: string;
  gig: ObjectId;
  bid: ObjectId;              // The accepted bid

  // Parties
  payer: ObjectId;            // Venue/Event Organizer
  payee: ObjectId;            // Artist

  // Amounts
  totalAmount: number;        // Bid amount
  platformCut: number;        // Platform fee
  artistAmount: number;       // totalAmount - platformCut
  currency: string;

  // Status
  status: TransactionStatus;
  // PENDING_PAYMENT → ESCROW → RELEASED → COMPLETED
  // PENDING_PAYMENT → ESCROW → DISPUTED → RESOLVED
  // PENDING_PAYMENT → ESCROW → REFUNDED

  // Payment details
  paymentMethod: string;
  paymentGatewayId: string;
  paymentGatewayResponse: object;

  // Timestamps
  paidAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;

  // Dispute
  dispute?: {
    raisedBy: ObjectId;
    reason: string;
    raisedAt: Date;
    resolvedBy?: ObjectId;
    resolution?: string;
    resolvedAt?: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

#### TransactionStatus Enum
```typescript
enum TransactionStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',  // Waiting for venue to pay
  ESCROW = 'ESCROW',                    // Money held by platform
  RELEASED = 'RELEASED',                // Money released to artist
  COMPLETED = 'COMPLETED',              // Transaction fully settled
  DISPUTED = 'DISPUTED',                // Dispute raised
  REFUNDED = 'REFUNDED',                // Money returned to venue
}
```

### API Endpoints Required
```
POST   /transactions/initiate          - Create transaction after bid acceptance
POST   /transactions/:id/pay           - Venue pays (webhook from gateway)
POST   /transactions/:id/release       - Release to artist (after OTP verified)
POST   /transactions/:id/dispute       - Raise dispute
POST   /transactions/:id/resolve       - Admin resolves dispute
GET    /transactions/my                - Get my transactions
GET    /transactions/:id               - Get transaction details
```

### Platform Cut Configuration
```typescript
// In config
platformCut: {
  percentage: 10,  // 10% platform fee
  // OR
  fixed: 500,      // Fixed ₹500 per transaction
  // OR
  tiered: [
    { upTo: 10000, percentage: 15 },
    { upTo: 50000, percentage: 12 },
    { upTo: 100000, percentage: 10 },
    { above: 100000, percentage: 8 },
  ]
}
```

---

## 3. Event Check-in OTP System

### Overview
To verify artist actually showed up and performed, an OTP-based check-in system is required.

### Flow
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EVENT CHECK-IN OTP FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  Gig status: BOOKED
  Payment status: ESCROW (venue has paid)
  Event date arrives
           │
           ▼
  ┌─────────────────────┐
  │  VENUE'S APP        │
  │  Shows: OTP "4829"  │ ◄── Generated when event time starts
  └─────────────────────┘
           │
           │ Venue shares OTP verbally with Artist
           ▼
  ┌─────────────────────┐
  │   ARTIST'S APP      │
  │  Enter OTP: [____]  │
  └─────────────────────┘
           │
           ▼
  OTP Verified?
     │         │
    YES        NO
     │         │
     ▼         ▼
  ┌──────────┐  ┌──────────────┐
  │ EVENT    │  │ Invalid OTP  │
  │ STARTED  │  │ Try again    │
  └──────────┘  └──────────────┘
     │
     │ Event happens...
     ▼
  ┌─────────────────────┐
  │  "END EVENT" button │ ◄── Only visible after OTP verified
  │  appears for both   │
  └─────────────────────┘
     │
     ▼
  Both parties confirm end
     │
     ▼
  Gig → COMPLETED
  Payment → RELEASED (if no dispute)
```

### New Model: EventCheckIn
```typescript
interface EventCheckIn {
  id: string;
  gig: ObjectId;
  bid: ObjectId;              // The accepted bid
  transaction: ObjectId;

  // OTP
  otp: string;                // 4-6 digit code
  otpGeneratedAt: Date;
  otpExpiresAt: Date;         // Valid for event duration + buffer
  otpRegenerateCount: number; // Max 3 regenerations

  // Check-in status
  status: CheckInStatus;
  // PENDING → CHECKED_IN → EVENT_STARTED → EVENT_ENDED

  // Timestamps
  artistCheckedInAt?: Date;
  eventStartedAt?: Date;
  eventEndedAt?: Date;

  // Who ended the event
  endedBy?: {
    organizer: boolean;
    artist: boolean;
    organizerEndedAt?: Date;
    artistEndedAt?: Date;
  };

  // Location verification (optional)
  artistLocation?: {
    lat: number;
    lng: number;
    capturedAt: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

### CheckInStatus Enum
```typescript
enum CheckInStatus {
  PENDING = 'PENDING',           // OTP generated, waiting for artist
  CHECKED_IN = 'CHECKED_IN',     // Artist entered OTP successfully
  EVENT_STARTED = 'EVENT_STARTED', // Event in progress
  EVENT_ENDED = 'EVENT_ENDED',   // Both parties confirmed end
  EXPIRED = 'EXPIRED',           // OTP expired, artist didn't show
  CANCELLED = 'CANCELLED',       // Event cancelled
}
```

### API Endpoints Required
```
POST   /checkin/generate-otp/:gigId    - Generate OTP (Venue, on event day)
GET    /checkin/otp/:gigId             - Get current OTP (Venue only)
POST   /checkin/verify-otp             - Verify OTP (Artist)
POST   /checkin/start-event/:gigId     - Mark event started (after OTP)
POST   /checkin/end-event/:gigId       - End event (both parties)
GET    /checkin/status/:gigId          - Get check-in status
```

### OTP Rules
- 6-digit numeric code
- Generated at event start time (or 30 mins before)
- Valid until event end time + 1 hour buffer
- Can be regenerated if needed (max 3 times)
- Artist must be at venue location (optional GPS check)

---

## 4. Verification Systems

### 4.1 Venue/Event Organizer Verification

#### What to Verify
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  VENUE/ORGANIZER VERIFICATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

  1. IDENTITY VERIFICATION
     - Government ID (Aadhaar, PAN, Passport)
     - Selfie with ID
     - Phone number (already done via OTP)
     - Email verification

  2. BUSINESS VERIFICATION (if company)
     - GST Certificate
     - Business Registration
     - Company PAN

  3. VENUE/PROPERTY VERIFICATION
     - Venue ownership proof OR
     - Authorization letter from owner
     - Venue photos
     - Venue address verification
```

#### OrganizerVerification Model
```typescript
interface OrganizerVerification {
  id: string;
  user: ObjectId;

  // Identity
  identity: {
    type: 'AADHAAR' | 'PAN' | 'PASSPORT' | 'DRIVING_LICENSE';
    number: string;        // Encrypted
    documentUrl: string;   // S3 URL
    selfieUrl: string;
    status: VerificationStatus;
    verifiedAt?: Date;
    verifiedBy?: ObjectId;
    rejectionReason?: string;
  };

  // Business (optional)
  business?: {
    type: 'INDIVIDUAL' | 'COMPANY' | 'PARTNERSHIP' | 'LLP';
    name: string;
    gstNumber?: string;
    panNumber: string;
    registrationDocUrl?: string;
    status: VerificationStatus;
    verifiedAt?: Date;
    verifiedBy?: ObjectId;
    rejectionReason?: string;
  };

  // Venues (multiple possible)
  venues: [{
    name: string;
    address: string;
    city: string;
    proofType: 'OWNERSHIP' | 'LEASE' | 'AUTHORIZATION';
    proofDocUrl: string;
    photosUrls: string[];
    coordinates: { lat: number; lng: number };
    status: VerificationStatus;
    verifiedAt?: Date;
    verifiedBy?: ObjectId;
    rejectionReason?: string;
  }];

  // Overall status
  overallStatus: VerificationStatus;

  createdAt: Date;
  updatedAt: Date;
}
```

### 4.2 Artist Verification

#### What to Verify
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ARTIST VERIFICATION                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  1. IDENTITY VERIFICATION
     - Government ID (Aadhaar, PAN, Passport)
     - Selfie with ID
     - Phone number (already done)

  2. PROFESSIONAL VERIFICATION
     - Performance videos (YouTube/Instagram links)
     - Audio samples
     - Past event photos
     - References/testimonials

  3. BANK ACCOUNT VERIFICATION (for payouts)
     - Bank account details
     - Cancelled cheque / Bank statement
     - UPI ID verification
```

#### ArtistVerification Model
```typescript
interface ArtistVerification {
  id: string;
  user: ObjectId;

  // Identity
  identity: {
    type: 'AADHAAR' | 'PAN' | 'PASSPORT' | 'DRIVING_LICENSE';
    number: string;        // Encrypted
    documentUrl: string;
    selfieUrl: string;
    status: VerificationStatus;
    verifiedAt?: Date;
    verifiedBy?: ObjectId;
    rejectionReason?: string;
  };

  // Professional
  professional: {
    portfolioReviewed: boolean;
    videoLinksVerified: boolean;
    audioSamplesVerified: boolean;
    status: VerificationStatus;
    verifiedAt?: Date;
    verifiedBy?: ObjectId;
    notes?: string;
  };

  // Bank/Payout
  bankAccount: {
    accountHolderName: string;
    accountNumber: string;  // Encrypted
    ifscCode: string;
    bankName: string;
    proofDocUrl: string;    // Cancelled cheque
    upiId?: string;
    status: VerificationStatus;
    verifiedAt?: Date;
    verifiedBy?: ObjectId;
    rejectionReason?: string;
  };

  // Overall status
  overallStatus: VerificationStatus;

  createdAt: Date;
  updatedAt: Date;
}
```

### VerificationStatus Enum
```typescript
enum VerificationStatus {
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',      // Need to re-verify
}
```

### API Endpoints Required
```
# Organizer Verification
POST   /verification/organizer/identity      - Submit identity docs
POST   /verification/organizer/business      - Submit business docs
POST   /verification/organizer/venue         - Submit venue proof
GET    /verification/organizer/status        - Get verification status

# Artist Verification
POST   /verification/artist/identity         - Submit identity docs
POST   /verification/artist/bank             - Submit bank details
GET    /verification/artist/status           - Get verification status

# Admin
GET    /admin/verifications                  - List pending verifications
GET    /admin/verifications/:id              - Get verification details
PUT    /admin/verifications/:id/approve      - Approve verification
PUT    /admin/verifications/:id/reject       - Reject with reason
```

---

## 5. Admin Dashboard Enhancements

### 5.1 Analytics Dashboard

#### Metrics to Track
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ANALYTICS DASHBOARD                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  USERS
  ├── Total users (by role)
  ├── New signups (daily/weekly/monthly)
  ├── Active users (DAU/WAU/MAU)
  ├── User retention rate
  └── Verified vs unverified users

  GIGS
  ├── Total gigs created
  ├── Gigs by status
  ├── Gigs by category
  ├── Gigs by city
  ├── Average bids per gig
  └── Gig completion rate

  BIDS
  ├── Total bids placed
  ├── Average bid amount
  ├── Bid acceptance rate
  ├── Average bid-to-budget ratio
  └── Competitive ratio (bids per gig)

  TRANSACTIONS
  ├── Total transaction value
  ├── Platform revenue (cuts)
  ├── Average transaction value
  ├── Transactions by status
  ├── Dispute rate
  └── Refund rate

  ENGAGEMENT
  ├── Bid success rate (per artist)
  ├── Review submission rate
  ├── Average rating (artists/venues)
  └── Report resolution time
```

#### Analytics Model
```typescript
interface AnalyticsSnapshot {
  id: string;
  date: Date;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  users: {
    total: number;
    byRole: { artist: number; client: number; admin: number };
    newSignups: number;
    activeUsers: number;
    verified: number;
  };

  gigs: {
    total: number;
    byStatus: Record<GigStatus, number>;
    byCategory: Record<GigCategory, number>;
    byCity: Record<string, number>;
    avgBidsPerGig: number;
    completionRate: number;
  };

  bids: {
    total: number;
    avgAmount: number;
    acceptanceRate: number;
    avgBidToBudgetRatio: number;
  };

  transactions: {
    totalValue: number;
    platformRevenue: number;
    count: number;
    avgValue: number;
    disputeRate: number;
    refundRate: number;
  };

  createdAt: Date;
}
```

### 5.2 Storage Management

#### What to Track
```
  STORAGE
  ├── Total storage used
  ├── Storage by type (images, audio, documents)
  ├── Storage by user
  ├── Largest files
  └── Storage growth trend
```

#### API Endpoints
```
GET    /admin/storage/stats              - Storage statistics
GET    /admin/storage/by-user            - Storage per user
GET    /admin/storage/largest-files      - Largest files list
DELETE /admin/storage/cleanup            - Clean orphaned files
```

### 5.3 User Activity Logs

#### What to Log
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      USER ACTIVITY LOGGING                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  LOG EVERY:
  ├── Authentication events (login, logout, failed attempts)
  ├── Profile updates
  ├── Gig creation/updates/status changes
  ├── Bid submissions/status changes
  ├── Transaction events
  ├── Review submissions
  ├── Report submissions
  ├── Verification submissions
  └── Admin actions
```

#### ActivityLog Model
```typescript
interface ActivityLog {
  id: string;

  // Who
  user?: ObjectId;           // null for system actions
  userRole?: UserRole;
  ipAddress?: string;
  userAgent?: string;

  // What
  action: ActivityAction;
  category: ActivityCategory;

  // On what
  targetType?: 'USER' | 'GIG' | 'BID' | 'TRANSACTION' | 'REVIEW' | 'REPORT';
  targetId?: ObjectId;

  // Details
  description: string;
  metadata?: Record<string, any>;  // Additional context

  // When
  createdAt: Date;
}
```

#### ActivityAction Enum
```typescript
enum ActivityAction {
  // Auth
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  TOKEN_REFRESH = 'TOKEN_REFRESH',

  // Profile
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  PROFILE_PICTURE_CHANGED = 'PROFILE_PICTURE_CHANGED',

  // Gig
  GIG_CREATED = 'GIG_CREATED',
  GIG_UPDATED = 'GIG_UPDATED',
  GIG_PUBLISHED = 'GIG_PUBLISHED',
  GIG_CLOSED = 'GIG_CLOSED',
  GIG_CANCELLED = 'GIG_CANCELLED',
  GIG_COMPLETED = 'GIG_COMPLETED',

  // Bid
  BID_PLACED = 'BID_PLACED',
  BID_UPDATED = 'BID_UPDATED',
  BID_ACCEPTED = 'BID_ACCEPTED',
  BID_REJECTED = 'BID_REJECTED',
  BID_WITHDRAWN = 'BID_WITHDRAWN',

  // Transaction
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_RELEASED = 'PAYMENT_RELEASED',
  DISPUTE_RAISED = 'DISPUTE_RAISED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  REFUND_ISSUED = 'REFUND_ISSUED',

  // Check-in
  OTP_GENERATED = 'OTP_GENERATED',
  OTP_VERIFIED = 'OTP_VERIFIED',
  EVENT_STARTED = 'EVENT_STARTED',
  EVENT_ENDED = 'EVENT_ENDED',

  // Review
  REVIEW_SUBMITTED = 'REVIEW_SUBMITTED',
  REVIEW_UPDATED = 'REVIEW_UPDATED',
  REVIEW_DELETED = 'REVIEW_DELETED',
  REVIEW_FLAGGED = 'REVIEW_FLAGGED',

  // Report
  REPORT_SUBMITTED = 'REPORT_SUBMITTED',
  REPORT_RESOLVED = 'REPORT_RESOLVED',

  // Verification
  VERIFICATION_SUBMITTED = 'VERIFICATION_SUBMITTED',
  VERIFICATION_APPROVED = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED = 'VERIFICATION_REJECTED',

  // Admin
  USER_BANNED = 'USER_BANNED',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_UNBANNED = 'USER_UNBANNED',
  USER_VERIFIED = 'USER_VERIFIED',
  CONTENT_REMOVED = 'CONTENT_REMOVED',
}
```

### 5.4 Admin Access Control

#### Admin Roles/Permissions
```typescript
enum AdminPermission {
  // User management
  VIEW_USERS = 'VIEW_USERS',
  EDIT_USERS = 'EDIT_USERS',
  BAN_USERS = 'BAN_USERS',

  // Verification
  VIEW_VERIFICATIONS = 'VIEW_VERIFICATIONS',
  APPROVE_VERIFICATIONS = 'APPROVE_VERIFICATIONS',

  // Content moderation
  VIEW_REPORTS = 'VIEW_REPORTS',
  RESOLVE_REPORTS = 'RESOLVE_REPORTS',
  MODERATE_REVIEWS = 'MODERATE_REVIEWS',

  // Transactions
  VIEW_TRANSACTIONS = 'VIEW_TRANSACTIONS',
  RESOLVE_DISPUTES = 'RESOLVE_DISPUTES',
  ISSUE_REFUNDS = 'ISSUE_REFUNDS',

  // Analytics
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
  EXPORT_DATA = 'EXPORT_DATA',

  // Storage
  VIEW_STORAGE = 'VIEW_STORAGE',
  MANAGE_STORAGE = 'MANAGE_STORAGE',

  // Activity logs
  VIEW_ACTIVITY_LOGS = 'VIEW_ACTIVITY_LOGS',

  // Super admin
  MANAGE_ADMINS = 'MANAGE_ADMINS',
  SYSTEM_SETTINGS = 'SYSTEM_SETTINGS',
}
```

#### Admin Roles
```typescript
const AdminRoles = {
  SUPER_ADMIN: [/* all permissions */],

  MODERATOR: [
    'VIEW_USERS',
    'VIEW_REPORTS',
    'RESOLVE_REPORTS',
    'MODERATE_REVIEWS',
    'VIEW_ACTIVITY_LOGS',
  ],

  VERIFIER: [
    'VIEW_USERS',
    'VIEW_VERIFICATIONS',
    'APPROVE_VERIFICATIONS',
  ],

  FINANCE: [
    'VIEW_TRANSACTIONS',
    'RESOLVE_DISPUTES',
    'ISSUE_REFUNDS',
    'VIEW_ANALYTICS',
  ],

  ANALYST: [
    'VIEW_ANALYTICS',
    'EXPORT_DATA',
    'VIEW_ACTIVITY_LOGS',
  ],
};
```

### API Endpoints Required
```
# Analytics
GET    /admin/analytics/dashboard        - Main dashboard data
GET    /admin/analytics/users            - User analytics
GET    /admin/analytics/gigs             - Gig analytics
GET    /admin/analytics/bids             - Bid analytics
GET    /admin/analytics/transactions     - Transaction analytics
GET    /admin/analytics/export           - Export data (CSV/Excel)

# Activity Logs
GET    /admin/activity-logs              - Search activity logs
GET    /admin/activity-logs/user/:userId - User's activity

# Active Users
GET    /admin/users/active               - Currently active users
GET    /admin/users/online               - Users online now (if real-time)
```

---

## 6. User Activity Logging

### Implementation Approach

#### Option 1: Middleware-based (Recommended)
```typescript
// Create a logging middleware that captures all API calls
const activityLogger = (ctx) => {
  const log = {
    user: ctx.user?.userId,
    action: determineAction(ctx.request.method, ctx.path),
    targetType: determineTargetType(ctx.path),
    targetId: ctx.params?.id,
    ipAddress: ctx.request.headers['x-forwarded-for'],
    userAgent: ctx.request.headers['user-agent'],
    metadata: {
      method: ctx.request.method,
      path: ctx.path,
      statusCode: ctx.response.status,
    }
  };

  // Async write to DB (don't block response)
  ActivityLogModel.create(log).catch(console.error);
};
```

#### Option 2: Service-level logging
```typescript
// Call logger explicitly in each service method
class BidsService {
  async placeBid(userId, dto) {
    const bid = await BidModel.create(dto);

    // Log the activity
    await activityLogService.log({
      user: userId,
      action: ActivityAction.BID_PLACED,
      targetType: 'BID',
      targetId: bid._id,
      description: `Placed bid of ₹${bid.amount} on gig`,
    });

    return bid;
  }
}
```

### Log Retention Policy
```
- Keep detailed logs: 90 days
- Keep summary logs: 1 year
- Archive to cold storage: After 1 year
- Delete: After 3 years (or per legal requirements)
```

---

## 7. Priority Order

### Phase 1: Core Bidding Improvements (Current Session)
1. **Auto-reject bids on accept** - When one bid is accepted, others are rejected
2. **Cascade on gig cancel/close** - Reject pending bids automatically
3. **Add /gigs/:id/complete endpoint** - Complete the gig lifecycle

### Phase 2: Payment & Check-in
4. **Transaction/Escrow model** - Hold payments
5. **Event Check-in OTP system** - Verify artist attendance
6. **Payment release flow** - After successful event

### Phase 3: Verification
7. **Artist verification** - Identity + Bank (for payouts)
8. **Venue verification** - Identity + Venue ownership
9. **Admin verification workflow**

### Phase 4: Admin Enhancements
10. **Activity logging system** - Track all actions
11. **Analytics dashboard** - Metrics & reports
12. **Storage management** - Track & cleanup
13. **Admin roles & permissions** - Granular access control

### Phase 5: Nice-to-haves
14. **Notification system** - Push/Email
15. **Real-time features** - WebSocket for live updates
16. **Export functionality** - CSV/Excel reports

---

## Notes

- Payment gateway integration will depend on provider (Razorpay, Stripe, etc.)
- OTP can be generated using simple random number or use a library
- Activity logs should be indexed for efficient querying
- Consider using a separate database/collection for logs (high volume)
- All sensitive data (ID numbers, bank accounts) must be encrypted

---

*Document updated: Corrected to reflect reverse-auction bidding as core feature*
*Bids system is CORE - NOT to be removed*
