# ZTS Music Platform - User Flow Diagrams

## Overview

This document outlines the complete user journeys for the ZTS Music Platform, a **reverse-auction marketplace** connecting **Venues/Event Organizers** with **Artists** for live music gigs.

**Core Concept**: Venues post gigs with a maximum budget, and artists compete by bidding lower amounts. The venue selects the best combination of quality and price.

---

## Table of Contents

1. [User Roles](#user-roles)
2. [Gig Lifecycle](#gig-lifecycle)
3. [Core Flow: Reverse Auction Bidding](#core-flow-reverse-auction-bidding)
4. [Venue (Event Organizer) Journey](#venue-event-organizer-journey)
5. [Artist Journey](#artist-journey)
6. [Bidding System Flow](#bidding-system-flow)
7. [Payment & Escrow Flow](#payment--escrow-flow)
8. [Event Check-in OTP Flow](#event-check-in-otp-flow)
9. [Review System Flow](#review-system-flow)
10. [Report System Flow](#report-system-flow)
11. [API Endpoints Summary](#api-endpoints-summary)

---

## User Roles

| Role | Description | Can Do |
|------|-------------|--------|
| **CLIENT** | Venues, event organizers, wedding planners | Create gigs with max budget, accept bids, pay to escrow, review artists |
| **ARTIST** | Musicians, bands, DJs, singers | Browse gigs, place competitive bids, perform, receive payment, review venues |
| **ADMIN** | Platform administrators | Moderate content, manage users, resolve disputes, approve verifications |

---

## Gig Lifecycle

```
┌─────────┐     ┌──────┐     ┌────────┐     ┌────────┐     ┌───────────┐
│  DRAFT  │────▶│ LIVE │────▶│ BOOKED │────▶│ CLOSED │────▶│ COMPLETED │
└─────────┘     └──────┘     └────────┘     └────────┘     └───────────┘
     │              │             │              │
     │              │             │              │
     ▼              ▼             ▼              ▼
┌───────────────────────────────────────────────────────────────────────┐
│                           CANCELLED                                    │
└───────────────────────────────────────────────────────────────────────┘
```

### Status Descriptions

| Status | Description | Who Can Trigger | Next States |
|--------|-------------|-----------------|-------------|
| **DRAFT** | Gig created but not visible to artists | Venue creates gig | LIVE, CANCELLED |
| **LIVE** | Gig visible, accepting bids from artists | Venue publishes | BOOKED, CLOSED, CANCELLED |
| **BOOKED** | Bid accepted, waiting for payment → event | System (on bid accept) | CLOSED, CANCELLED |
| **CLOSED** | Event day passed, no more bids accepted | Venue closes | COMPLETED, CANCELLED |
| **COMPLETED** | Event finished successfully, payment released | After OTP check-in | - (terminal) |
| **CANCELLED** | Event cancelled at any stage | Venue cancels | - (terminal) |

---

## Core Flow: Reverse Auction Bidding

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE PLATFORM FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  1. VENUE posts gig with MAX budget (e.g., ₹10,000)
              │
              ▼
  2. Gig appears to ARTISTS (filtered by location + availability)
              │
              ▼
  3. Artists place BIDS (competing lower: ₹9,000 → ₹8,500 → ₹8,000...)
              │
              ▼
  4. Venue reviews bids + artist profiles/portfolios/reviews
              │
              ▼
  5. Venue ACCEPTS one bid (quality + price consideration)
              │
              ▼
  ┌───────────────────────────────────────────────────────────┐
  │  • Selected bid → ACCEPTED                                 │
  │  • Other pending bids → AUTO-REJECTED                      │
  │  • Gig status → BOOKED                                     │
  │  • Transaction created → PENDING_PAYMENT                   │
  └───────────────────────────────────────────────────────────┘
              │
              ▼
  6. Venue PAYS the bid amount to platform
              │
              ▼
  ┌───────────────────────┐
  │   MONEY IN ESCROW     │ ◄── Platform holds funds safely
  └───────────────────────┘
              │
              ▼
  7. Event day: Venue generates OTP, Artist enters OTP (check-in)
              │
              ▼
  8. Event happens, both parties confirm END EVENT
              │
              ▼
  9. Gig → COMPLETED, Payment RELEASED to artist (minus platform cut)
              │
              ▼
  10. Both parties can leave REVIEWS for each other
```

---

## Venue (Event Organizer) Journey

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        VENUE JOURNEY                                          │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  1. SIGNUP  │───▶│ 2. CREATE   │───▶│ 3. PUBLISH  │───▶│ 4. RECEIVE  │
│   /LOGIN    │    │    GIG      │    │    GIG      │    │    BIDS     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                   ┌───────────────────────────────────────────┘
                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 5. REVIEW   │───▶│ 6. ACCEPT   │───▶│ 7. PAY TO   │───▶│ 8. EVENT    │
│   ARTISTS   │    │    BID      │    │   ESCROW    │    │    DAY      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                   ┌───────────────────────────────────────────┘
                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 9. SHARE    │───▶│ 10. END     │───▶│ 11. LEAVE   │
│    OTP      │    │    EVENT    │    │   REVIEW    │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Step-by-Step Details

#### Step 1: Signup/Login
```
Method: POST /api/v1/auth/phone/verify  OR  POST /api/v1/auth/google/verify
Body: { idToken, role: "client", name: "Grand Ballroom Events" }
Result: User created with role=CLIENT, JWT tokens returned
```

#### Step 2: Create Gig
```
Method: POST /api/v1/gigs
Auth: Required (CLIENT only)
Body: {
  title: "Wedding Reception Band Needed",
  description: "Looking for a 5-piece band for wedding reception...",
  category: "LIVE_BAND",
  budget: {
    min: 0,           // Not used in reverse auction
    max: 10000,       // ◄── MAX budget (artists bid lower)
    currency: "INR"
  },
  venue: {
    name: "Grand Ballroom",
    address: "123 Wedding Lane",
    city: "Mumbai",
    coordinates: { lat: 19.076, lng: 72.877 }
  },
  eventTiming: {
    date: "2024-03-15T00:00:00Z",
    startTime: "19:00",
    endTime: "23:00"
  }
}
Result: Gig created with status=DRAFT
```

#### Step 3: Publish Gig
```
Method: POST /api/v1/gigs/:id/publish
Auth: Required (Gig owner only)
Result: Gig status changes DRAFT → LIVE
        Now visible to artists who can start bidding
```

#### Step 4: Receive Bids
```
Method: GET /api/v1/bids/gig/:gigId
Auth: Required (Gig owner only)
Result: List of bids with artist info
[
  { artist: {...}, amount: 9000, proposal: "...", status: "PENDING" },
  { artist: {...}, amount: 8500, proposal: "...", status: "PENDING" },
  { artist: {...}, amount: 8000, proposal: "...", status: "PENDING" }
]
```

#### Step 5: Review Artist Profiles
```
Method: GET /api/v1/users/:artistId (public profile)
        GET /api/v1/reviews/user/:artistId (reviews)
        GET /api/v1/reviews/user/:artistId/stats (rating stats)
Result: View artist portfolio, videos, ratings, past reviews
        Make informed decision beyond just lowest price
```

#### Step 6: Accept Bid
```
Method: PUT /api/v1/bids/:bidId/status
Body: { status: "ACCEPTED" }
Result:
  - Selected bid status → ACCEPTED
  - All other pending bids → REJECTED (auto)
  - Gig status → BOOKED
  - Transaction created → PENDING_PAYMENT
```

#### Step 7: Pay to Escrow
```
Method: POST /api/v1/transactions/:id/pay
Result:
  - Payment processed via gateway (Razorpay/Stripe)
  - Transaction status → ESCROW
  - Money held safely by platform
```

#### Step 8: Event Day Arrives
```
Gig is BOOKED and paid
Transaction is in ESCROW
Venue prepares to host the event
```

#### Step 9: Share OTP with Artist
```
Method: POST /api/v1/checkin/generate-otp/:gigId
        GET /api/v1/checkin/otp/:gigId
Auth: Required (Gig owner only)
Result: 6-digit OTP generated (e.g., "482917")
        Venue verbally shares this with artist on arrival
```

#### Step 10: End Event
```
Method: POST /api/v1/checkin/end-event/:gigId
Auth: Required (Both parties must confirm)
Result:
  - Both venue and artist click "End Event"
  - Gig status → COMPLETED
  - Payment → RELEASED to artist (minus platform cut)
```

#### Step 11: Leave Review for Artist
```
Method: POST /api/v1/reviews
Body: {
  gigId: "...",
  rating: 5,
  ratings: {
    professionalism: 5,
    quality: 5,
    value: 4,
    communication: 5
  },
  title: "Amazing performance!",
  comment: "The band exceeded our expectations...",
  wouldRecommend: true
}
Result: Review created (type: CLIENT_TO_ARTIST)
```

---

## Artist Journey

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ARTIST JOURNEY                                        │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  1. SIGNUP  │───▶│ 2. COMPLETE │───▶│ 3. BROWSE   │───▶│ 4. PLACE    │
│   /LOGIN    │    │   PROFILE   │    │    GIGS     │    │    BID      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                   ┌───────────────────────────────────────────┘
                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 5. WAIT FOR │───▶│ 6. BID      │───▶│ 7. EVENT    │───▶│ 8. ENTER    │
│  RESPONSE   │    │  ACCEPTED   │    │    DAY      │    │    OTP      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                   ┌───────────────────────────────────────────┘
                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 9. PERFORM  │───▶│ 10. END     │───▶│ 11. GET     │───▶ LEAVE REVIEW
│   AT EVENT  │    │    EVENT    │    │    PAID     │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Step-by-Step Details

#### Step 1: Signup/Login
```
Method: POST /api/v1/auth/phone/verify
Body: { idToken, role: "artist", name: "The Jazz Collective" }
Result: User created with role=ARTIST
```

#### Step 2: Complete Profile (Onboarding)
```
Method: PUT /api/v1/users/me/artist-profile
Body: {
  stageName: "The Jazz Collective",
  bio: "5-piece jazz band with 10 years experience...",
  performanceTypes: ["BAND", "ACOUSTIC"],
  genres: ["JAZZ", "BLUES", "FUSION"],
  instruments: ["SAXOPHONE", "PIANO", "BASS", "DRUMS"],
  languages: ["ENGLISH", "HINDI"],
  yearsOfExperience: 10,
  baseRate: 8000,  // ◄── Artist's typical rate (for reference)
  location: {
    city: "Mumbai",
    geoPoint: {
      type: "Point",
      coordinates: [72.877, 19.076]  // [lng, lat]
    }
  },
  videoLinks: ["https://youtube.com/..."],
  audioSamples: ["https://soundcloud.com/..."],
  instagramHandle: "@thejazzcollective",
  onboardingComplete: true
}
Result: Profile updated, artist now visible and can bid
```

#### Step 3: Browse/Search Gigs
```
# Search by city
Method: GET /api/v1/gigs?city=Mumbai&status=LIVE

# Search nearby (geolocation-based)
Method: GET /api/v1/gigs/nearby?lat=19.076&lng=72.877&distance=50000

# Filter by category/budget
Method: GET /api/v1/gigs?category=LIVE_BAND&maxBudget=15000

Result: List of LIVE gigs matching criteria
        Shows max budget so artist knows ceiling for bidding
```

#### Step 4: Place Bid (Competitive Pricing)
```
Method: POST /api/v1/bids
Body: {
  gigId: "...",
  amount: 8000,  // ◄── LOWER than venue's max budget of ₹10,000
  proposal: "We are a professional jazz band perfect for your wedding.
             We've performed at 50+ weddings and can customize our
             setlist to your preferences..."
}
Result: Bid created with status=PENDING

Strategy: Bid lower to be more competitive, but balance with quality
```

#### Step 5: Wait for Response / Check Status
```
Method: GET /api/v1/bids/my
Result: List of your bids with status
        - PENDING: Waiting for venue decision
        - ACCEPTED: You got the gig! 🎉
        - REJECTED: Venue chose another artist
```

#### Step 6: Bid Accepted
```
Notification received (when implemented)
Bid status → ACCEPTED
Gig status → BOOKED
Venue will pay to escrow
```

#### Step 7: Event Day Arrives
```
Transaction is in ESCROW (venue has paid)
Artist arrives at venue
Ready to perform
```

#### Step 8: Enter OTP (Check-in)
```
Method: POST /api/v1/checkin/verify-otp
Body: {
  gigId: "...",
  otp: "482917"  // ◄── OTP provided verbally by venue
}
Result:
  - OTP verified
  - Check-in status → CHECKED_IN
  - Event officially started
```

#### Step 9: Perform at Event
```
Artist performs their set
Delivers the service as promised
```

#### Step 10: End Event
```
Method: POST /api/v1/checkin/end-event/:gigId
Auth: Required (Both parties must confirm)
Result:
  - Gig status → COMPLETED
  - Payment released from escrow
```

#### Step 11: Get Paid
```
Automatic after both parties confirm event end
Transaction status → RELEASED → COMPLETED
Artist receives: Bid amount - Platform cut
Example: ₹8,000 bid - 10% cut = ₹7,200 to artist
```

---

## Bidding System Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    REVERSE AUCTION BIDDING                                    │
└──────────────────────────────────────────────────────────────────────────────┘

  Venue posts gig: "Max Budget: ₹10,000"
                        │
                        ▼
           ┌────────────────────────┐
           │     GIG IS LIVE        │
           │  Artists can now bid   │
           └────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐     ┌─────────┐     ┌─────────┐
   │Artist A │     │Artist B │     │Artist C │
   │Bid: ₹9k │     │Bid: ₹8.5k│    │Bid: ₹8k │
   └─────────┘     └─────────┘     └─────────┘
        │               │               │
        └───────────────┴───────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │  Venue reviews bids    │
           │  + artist profiles     │
           │  + reviews & ratings   │
           └────────────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │  Venue accepts         │
           │  Artist B (₹8,500)     │  ◄── Quality + Price balance
           │  (not always lowest!)  │
           └────────────────────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────────────┐
  │  Artist A: REJECTED (auto)                       │
  │  Artist B: ACCEPTED ✓                            │
  │  Artist C: REJECTED (auto)                       │
  │  Gig: BOOKED                                     │
  │  Transaction: PENDING_PAYMENT                    │
  └─────────────────────────────────────────────────┘
```

### Bid State Machine

```
                          Artist places bid
                               │
                               ▼
                        ┌─────────────┐
                        │   PENDING   │
                        └─────────────┘
                         │     │     │
           ┌─────────────┘     │     └─────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  ACCEPTED   │     │  REJECTED   │     │  WITHDRAWN  │
    └─────────────┘     └─────────────┘     └─────────────┘
           │                   ▲                   ▲
           │                   │                   │
           ▼                   │                   │
    ┌─────────────┐      Auto-reject         Artist withdraws
    │ Gig→BOOKED  │      other bids          before decision
    │ Create Txn  │
    └─────────────┘
```

### Bidding Rules

| Action | Who | Conditions |
|--------|-----|------------|
| Place Bid | Artist | Gig is LIVE, not own gig, no existing bid |
| Update Bid | Artist | Bid is PENDING, can only lower amount |
| Accept Bid | Venue | Gig is LIVE, bid is PENDING |
| Reject Bid | Venue | Bid is PENDING |
| Withdraw Bid | Artist | Bid is PENDING (before venue decides) |

### What Happens on Accept?

```
1. Selected bid status → ACCEPTED
2. All other pending bids → REJECTED (automatic)
3. Gig status → BOOKED
4. gig.acceptedBid = bidId
5. gig.acceptedArtist = artistId
6. Transaction created with bid amount
7. Notifications sent (when implemented)
```

---

## Payment & Escrow Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT & ESCROW FLOW                                  │
└──────────────────────────────────────────────────────────────────────────────┘

     Bid Accepted
          │
          ▼
  ┌───────────────┐
  │ TRANSACTION   │
  │ CREATED       │
  │ (PENDING_     │
  │  PAYMENT)     │
  └───────────────┘
          │
          ▼
  Venue pays via Razorpay/Stripe
          │
          ▼
  ┌───────────────┐
  │   ESCROW      │ ◄── Platform holds ₹8,500
  └───────────────┘
          │
          │ Event day...
          │ OTP verified...
          │ Event completed...
          ▼
     ┌────┴────┐
     │         │
No Dispute   Dispute
     │         │
     ▼         ▼
┌─────────┐ ┌─────────┐
│ RELEASED│ │ HOLD    │
└─────────┘ └─────────┘
     │         │
     ▼         ▼
Artist gets  Admin
₹7,650      resolves
(after 10%   │
cut)    ┌────┴────┐
        │         │
    Artist    Venue
    Wins      Wins
        │         │
        ▼         ▼
    Release   Refund
    Payment   Venue
```

### Transaction Statuses

| Status | Description |
|--------|-------------|
| PENDING_PAYMENT | Bid accepted, waiting for venue to pay |
| ESCROW | Venue paid, money held by platform |
| RELEASED | Event completed, money sent to artist |
| COMPLETED | Transaction fully settled |
| DISPUTED | Dispute raised, under review |
| REFUNDED | Money returned to venue (dispute resolution) |

---

## Event Check-in OTP Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      EVENT CHECK-IN OTP FLOW                                  │
└──────────────────────────────────────────────────────────────────────────────┘

  Gig: BOOKED
  Transaction: ESCROW (paid)
  Event day arrives
           │
           ▼
  ┌─────────────────────┐
  │   VENUE'S APP       │
  │  ┌─────────────┐    │
  │  │ OTP: 482917 │    │ ◄── Generated 30 mins before event
  │  └─────────────┘    │
  └─────────────────────┘
           │
           │ Venue verbally tells artist: "482917"
           ▼
  ┌─────────────────────┐
  │   ARTIST'S APP      │
  │  Enter OTP: [____]  │
  │  [Verify Check-in]  │
  └─────────────────────┘
           │
           ▼
  OTP Correct?
     │         │
    YES        NO
     │         │
     ▼         ▼
┌──────────┐  ┌──────────────┐
│ CHECKED  │  │ Invalid OTP  │
│   IN ✓   │  │ Try again    │
└──────────┘  │ (max 3 tries)│
     │        └──────────────┘
     │
     │ Event happens...
     │ Artist performs...
     ▼
┌─────────────────────────┐
│   "END EVENT" button    │
│   appears for BOTH:     │
│   • Venue clicks ✓      │
│   • Artist clicks ✓     │
└─────────────────────────┘
     │
     ▼
  Both confirmed?
     │         │
    YES        NO
     │         │
     ▼         ▼
┌──────────┐  Wait for
│ EVENT    │  other party
│ ENDED ✓  │
└──────────┘
     │
     ▼
┌─────────────────────┐
│ Gig → COMPLETED     │
│ Payment → RELEASED  │
│ Artist gets paid!   │
└─────────────────────┘
```

### OTP Rules

- 6-digit numeric code
- Generated at event start time (or 30 mins before)
- Valid until event end time + 1 hour buffer
- Can be regenerated (max 3 times)
- Optional: GPS location verification

---

## Review System Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        REVIEW FLOW                                            │
└──────────────────────────────────────────────────────────────────────────────┘

                    Gig must be COMPLETED
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  VENUE reviews      │         │  ARTIST reviews     │
│     ARTIST          │         │     VENUE           │
│ (CLIENT_TO_ARTIST)  │         │ (ARTIST_TO_CLIENT)  │
└─────────────────────┘         └─────────────────────┘
           │                               │
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Review PUBLISHED   │         │  Review PUBLISHED   │
└─────────────────────┘         └─────────────────────┘
           │                               │
           │         ┌─────────┐           │
           └────────▶│ REVIEWEE│◀──────────┘
                     │RESPONDS │
                     └─────────┘
```

### Review Features

- **Rating**: 1-5 stars overall
- **Rating Breakdown**: professionalism, quality, value, communication
- **Recommendation**: Would you recommend? Yes/No
- **Response**: Reviewee can respond once
- **Edit Window**: 48 hours to edit own review
- **Flagging**: Anyone can flag inappropriate reviews

---

## Report System Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        REPORT WORKFLOW                                        │
└──────────────────────────────────────────────────────────────────────────────┘

  User reports issue
         │
         ▼
  ┌─────────────┐
  │   PENDING   │ ◄─── Auto-priority calculated
  └─────────────┘
         │
         ▼
  ┌─────────────┐
  │UNDER_REVIEW │ ◄─── Admin assigns to themselves
  └─────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────────┐
│NEEDS   │ │INVESTIGATING│
│INFO    │ └────────────┘
└────────┘       │
    │            │
    └────┬───────┘
         ▼
  ┌─────────────┐
  │  RESOLVED   │ ◄─── Action taken
  └─────────────┘
```

### Report Categories

| Category | Description |
|----------|-------------|
| USER_BEHAVIOR | Harassment, unprofessional conduct |
| GIG_CONTENT | Misleading gig descriptions |
| PAYMENT | Payment disputes |
| PROFILE_CONTENT | Fake profiles, stolen content |
| SAFETY | Safety concerns at events |
| SPAM | Promotional spam |

---

## API Endpoints Summary

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/phone/verify | Phone OTP login/signup | No |
| POST | /auth/google/verify | Google login/signup | No |
| POST | /auth/refresh | Refresh access token | No |
| POST | /auth/logout | Logout | Yes |
| GET | /auth/me | Get current user | Yes |

### Users
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /users/me | Get my profile | Yes |
| PUT | /users/me | Update my profile | Yes |
| PUT | /users/me/artist-profile | Update artist profile | Yes (Artist) |
| GET | /users/:id | Get public profile | No |
| GET | /users/artists | Search artists | No |

### Gigs
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /gigs | Search gigs | No |
| GET | /gigs/nearby | Search nearby gigs | No |
| GET | /gigs/cities | Get available cities | No |
| GET | /gigs/:id | Get gig details | No |
| POST | /gigs | Create gig | Yes (Venue) |
| PUT | /gigs/:id | Update gig | Yes (Owner) |
| DELETE | /gigs/:id | Delete gig | Yes (Owner) |
| POST | /gigs/:id/publish | Publish gig | Yes (Owner) |
| POST | /gigs/:id/close | Close gig | Yes (Owner) |
| POST | /gigs/:id/cancel | Cancel gig | Yes (Owner) |
| POST | /gigs/:id/complete | Complete gig | Yes (Owner) |

### Bids (Primary Flow)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /bids | Place bid | Yes (Artist) |
| GET | /bids/my | Get my bids | Yes (Artist) |
| GET | /bids/gig/:gigId | Get gig bids | Yes (Venue) |
| PUT | /bids/:id | Update bid amount | Yes (Artist) |
| PUT | /bids/:id/status | Accept/Reject bid | Yes (Venue) |
| DELETE | /bids/:id | Withdraw bid | Yes (Artist) |

### Applications (Secondary/Optional)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /applications | Apply to gig | Yes (Artist) |
| GET | /applications/my | Get my applications | Yes (Artist) |
| GET | /applications/gig/:gigId | Get gig applications | Yes (Venue) |
| PUT | /applications/:id/status | Update status | Yes |

### Transactions (Future)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /transactions/initiate | Create transaction | System |
| POST | /transactions/:id/pay | Pay to escrow | Yes (Venue) |
| POST | /transactions/:id/release | Release payment | System |
| POST | /transactions/:id/dispute | Raise dispute | Yes |
| POST | /transactions/:id/resolve | Resolve dispute | Yes (Admin) |
| GET | /transactions/my | Get my transactions | Yes |
| GET | /transactions/:id | Get transaction details | Yes |

### Check-in (Future)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /checkin/generate-otp/:gigId | Generate OTP | Yes (Venue) |
| GET | /checkin/otp/:gigId | Get current OTP | Yes (Venue) |
| POST | /checkin/verify-otp | Verify OTP | Yes (Artist) |
| POST | /checkin/end-event/:gigId | End event | Yes (Both) |
| GET | /checkin/status/:gigId | Get check-in status | Yes |

### Reviews
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /reviews | Create review | Yes |
| GET | /reviews | Search reviews | No |
| GET | /reviews/:id | Get review | No |
| GET | /reviews/user/:userId | Get user reviews | No |
| GET | /reviews/user/:userId/stats | Get rating stats | No |
| GET | /reviews/gig/:gigId | Get gig reviews | No |
| PUT | /reviews/:id | Update own review | Yes |
| POST | /reviews/:id/response | Respond to review | Yes |
| POST | /reviews/:id/flag | Flag review | Yes |
| DELETE | /reviews/:id | Delete own review | Yes |

### Reports
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /reports | Create report | Yes |
| GET | /reports/my | Get my reports | Yes |
| GET | /reports/:id | Get report | Yes |
| PUT | /reports/:id | Update own report | Yes |
| GET | /reports/admin/search | Admin: Search | Yes (Admin) |
| PUT | /reports/admin/:id | Admin: Update | Yes (Admin) |
| POST | /reports/admin/:id/resolve | Admin: Resolve | Yes (Admin) |

---

## System Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZTS MUSIC PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐         ┌──────────────┐         ┌──────────┐                │
│  │  VENUES  │◄───────▶│   PLATFORM   │◄───────▶│  ARTISTS │                │
│  └──────────┘         └──────────────┘         └──────────┘                │
│       │                      │                      │                       │
│       │                      │                      │                       │
│       ▼                      ▼                      ▼                       │
│  ┌──────────┐         ┌──────────────┐         ┌──────────┐                │
│  │ Post Gig │         │    ESCROW    │         │Place Bid │                │
│  │ Max ₹10k │         │   Payment    │         │  ₹8,000  │                │
│  └──────────┘         └──────────────┘         └──────────┘                │
│       │                      │                      │                       │
│       └──────────────────────┼──────────────────────┘                       │
│                              │                                              │
│                              ▼                                              │
│                   ┌──────────────────┐                                     │
│                   │  EVENT HAPPENS   │                                     │
│                   │   OTP Check-in   │                                     │
│                   └──────────────────┘                                     │
│                              │                                              │
│                              ▼                                              │
│                   ┌──────────────────┐                                     │
│                   │ Payment Released │                                     │
│                   │ Artist: ₹7,200   │                                     │
│                   │ Platform: ₹800   │                                     │
│                   └──────────────────┘                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*Document updated: January 2025*
*Reflects reverse-auction bidding as the core platform flow*
*Bids system is PRIMARY, Applications are SECONDARY*
