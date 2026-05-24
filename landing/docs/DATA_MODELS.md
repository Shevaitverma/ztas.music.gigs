# ZTS Music Platform - Data Models Design

> Complete schema design for all features (existing + new)

---

## Table of Contents
1. [Existing Models (Reference)](#existing-models)
2. [Payment System Models](#payment-system-models)
3. [Messaging Models](#messaging-models)
4. [Notification Models](#notification-models)
5. [Review & Rating Models](#review--rating-models)
6. [Media/Upload Models](#mediaupload-models)
7. [Extended User Models](#extended-user-models)
8. [Relationships Diagram](#relationships-diagram)

---

## Existing Models

### User (Current)
| Field | Type | Description |
|-------|------|-------------|
| _id | ObjectId | Primary key |
| firebaseUid | String | Firebase auth ID |
| email | String | User email |
| phone | String | Phone number |
| name | String | Display name |
| profilePicture | String | URL |
| role | Enum | ARTIST, CLIENT, ADMIN |
| status | Enum | ACTIVE, INACTIVE, BANNED, SUSPENDED, PENDING |
| authProvider | Enum | GOOGLE, PHONE, EMAIL |
| isVerified | Boolean | Admin verified |
| artistProfile | Object | Artist-specific data |
| clientProfile | Object | Client-specific data |
| refreshToken | String | JWT refresh token |
| joinedAt | Date | Registration date |
| lastLoginAt | Date | Last login |

### Gig (Current)
| Field | Type | Description |
|-------|------|-------------|
| _id | ObjectId | Primary key |
| title | String | Gig title |
| description | String | Details |
| category | Enum | LIVE_BAND, DJ, SOLO_SINGER, etc. |
| budget | Object | { min, max, currency } |
| venue | Object | { name, address, city, state, pincode, coordinates } |
| eventTiming | Object | { date, startTime, endTime, durationMinutes } |
| status | Enum | DRAFT, LIVE, CLOSED, COMPLETED, CANCELLED |
| postedBy | ObjectId | Reference to User |
| images | [String] | Image URLs |
| requirements | String | Special requirements |
| equipmentProvided | [String] | Equipment list |
| preferredGenres | [String] | Genre preferences |
| viewCount | Number | View counter |
| applicationCount | Number | Application counter |

### Application (Current)
| Field | Type | Description |
|-------|------|-------------|
| _id | ObjectId | Primary key |
| gig | ObjectId | Reference to Gig |
| applicant | ObjectId | Reference to User (Artist) |
| bidAmount | Number | Proposed amount |
| proposal | String | Cover letter |
| status | Enum | PENDING, ACCEPTED, REJECTED, WITHDRAWN |
| createdAt | Date | Submission time |

### Venue (Current)
| Field | Type | Description |
|-------|------|-------------|
| _id | ObjectId | Primary key |
| owner | ObjectId | Reference to User |
| name | String | Venue name |
| address | String | Street address |
| city | String | City |
| state | String | State |
| pincode | String | PIN code |
| capacity | Number | Max capacity |
| hasSound | Boolean | Sound system available |
| hasStage | Boolean | Stage available |
| hasLighting | Boolean | Lighting available |
| coordinates | Object | { lat, lng } |

---

## Payment System Models

### Payment
> Records every payment transaction

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| **References** |
| gig | ObjectId | Yes | Which gig |
| application | ObjectId | Yes | Which accepted application |
| payer | ObjectId | Yes | Client (who pays) |
| payee | ObjectId | Yes | Artist (who receives) |
| **Amounts** |
| gigAmount | Number | Yes | Artist's bid amount |
| platformFee | Number | Yes | Our commission (15%) |
| gstAmount | Number | Yes | GST on platform fee (18%) |
| totalAmount | Number | Yes | Total charged to client |
| currency | String | Yes | INR (default) |
| **Razorpay** |
| razorpayOrderId | String | Yes | Razorpay order ID |
| razorpayPaymentId | String | No | Filled after payment |
| razorpaySignature | String | No | Verification signature |
| **Status** |
| status | Enum | Yes | PENDING, COMPLETED, FAILED, REFUNDED |
| method | String | No | card, upi, netbanking, wallet |
| **Timestamps** |
| createdAt | Date | Auto | Order created |
| completedAt | Date | No | Payment completed |
| refundedAt | Date | No | If refunded |

**Indexes:**
- `{ payer: 1, createdAt: -1 }` - Client's payment history
- `{ payee: 1, createdAt: -1 }` - Artist's received payments
- `{ razorpayOrderId: 1 }` - Webhook lookup
- `{ status: 1 }` - Filter by status

---

### Escrow
> Holds payment until gig completion

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| payment | ObjectId | Yes | Reference to Payment |
| gig | ObjectId | Yes | Reference to Gig |
| artist | ObjectId | Yes | Artist receiving funds |
| **Amounts** |
| amount | Number | Yes | Amount held (gigAmount) |
| **Status** |
| status | Enum | Yes | HELD, RELEASED, REFUNDED, DISPUTED |
| **Timestamps** |
| heldAt | Date | Yes | When funds were held |
| releaseEligibleAt | Date | Yes | When can be released (gig date + 24h) |
| releasedAt | Date | No | When released to artist |
| refundedAt | Date | No | When refunded to client |
| **Dispute** |
| isDisputed | Boolean | No | Is under dispute |
| disputeReason | String | No | Why disputed |
| disputeRaisedBy | ObjectId | No | Who raised dispute |
| disputeRaisedAt | Date | No | When raised |
| disputeResolvedBy | ObjectId | No | Admin who resolved |
| disputeResolution | String | No | Resolution notes |
| disputeResolvedAt | Date | No | When resolved |

**Escrow States Flow:**
```
HELD (payment successful)
  ↓
  ├── RELEASED (gig completed + 24h, no dispute)
  │
  ├── REFUNDED (gig cancelled before event)
  │
  └── DISPUTED (either party raises dispute)
        ↓
        ├── RELEASED (admin decides for artist)
        └── REFUNDED (admin decides for client)
```

---

### Wallet
> Artist's earnings wallet

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| user | ObjectId | Yes | Owner (Artist) |
| **Balances** |
| pendingBalance | Number | Yes | In escrow, not yet available |
| availableBalance | Number | Yes | Can be withdrawn |
| totalEarnings | Number | Yes | Lifetime earnings |
| totalWithdrawn | Number | Yes | Lifetime withdrawals |
| **Bank Account** |
| bankAccount.accountNumber | String | No | Encrypted |
| bankAccount.ifscCode | String | No | IFSC code |
| bankAccount.accountHolderName | String | No | Name on account |
| bankAccount.bankName | String | No | Bank name |
| bankAccount.isVerified | Boolean | No | Bank verified via penny drop |
| **Razorpay (for payouts)** |
| razorpayContactId | String | No | Razorpay contact |
| razorpayFundAccountId | String | No | Razorpay fund account |
| **Settings** |
| autoPayout | Boolean | No | Auto-payout when threshold reached |
| autoPayoutThreshold | Number | No | Threshold amount |
| **Timestamps** |
| createdAt | Date | Auto | |
| updatedAt | Date | Auto | |

---

### WalletTransaction
> Every wallet credit/debit

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| wallet | ObjectId | Yes | Reference to Wallet |
| **Transaction** |
| type | Enum | Yes | CREDIT, DEBIT |
| category | Enum | Yes | GIG_PAYMENT, PAYOUT, REFUND, ADJUSTMENT, BONUS |
| amount | Number | Yes | Transaction amount |
| balanceAfter | Number | Yes | Balance after this transaction |
| **References** |
| relatedPayment | ObjectId | No | If from payment |
| relatedPayout | ObjectId | No | If payout |
| relatedGig | ObjectId | No | Related gig |
| relatedEscrow | ObjectId | No | Related escrow |
| **Meta** |
| description | String | Yes | Human-readable description |
| createdAt | Date | Auto | |

---

### Payout
> Artist withdrawal requests

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| wallet | ObjectId | Yes | Reference to Wallet |
| user | ObjectId | Yes | Artist |
| **Amount** |
| amount | Number | Yes | Payout amount |
| **Status** |
| status | Enum | Yes | PENDING, PROCESSING, COMPLETED, FAILED |
| **Razorpay** |
| razorpayPayoutId | String | No | Razorpay payout ID |
| razorpayStatus | String | No | Razorpay status |
| utr | String | No | Bank UTR number |
| **Bank (snapshot)** |
| bankSnapshot.last4 | String | Yes | Last 4 digits |
| bankSnapshot.ifsc | String | Yes | IFSC |
| bankSnapshot.bankName | String | Yes | Bank name |
| **Error** |
| failureReason | String | No | If failed |
| **Timestamps** |
| requestedAt | Date | Yes | When requested |
| processedAt | Date | No | When processing started |
| completedAt | Date | No | When completed |

---

## Messaging Models

### Conversation
> Chat thread between two users

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| **Participants** |
| participants | [ObjectId] | Yes | Always 2 users |
| **Context (optional)** |
| gig | ObjectId | No | If about a gig |
| application | ObjectId | No | If about an application |
| **Last Message Preview** |
| lastMessage.content | String | No | Message preview |
| lastMessage.sender | ObjectId | No | Who sent |
| lastMessage.sentAt | Date | No | When |
| **Per-Participant Data** |
| participantData | Array | Yes | See below |
| **Timestamps** |
| createdAt | Date | Auto | |
| updatedAt | Date | Auto | |

**participantData Array:**
```
[{
  user: ObjectId,
  unreadCount: Number,
  lastReadAt: Date,
  lastSeenAt: Date,
  isArchived: Boolean,
  isMuted: Boolean,
  isBlocked: Boolean
}]
```

**Indexes:**
- `{ participants: 1 }` - Find conversations for user
- `{ 'lastMessage.sentAt': -1 }` - Sort by recent
- `{ gig: 1 }` - Find conversation for gig

---

### Message
> Individual message in conversation

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| conversation | ObjectId | Yes | Parent conversation |
| sender | ObjectId | Yes | Who sent |
| **Content** |
| content | String | No | Text content (empty if only attachment) |
| contentType | Enum | Yes | TEXT, IMAGE, AUDIO, DOCUMENT, SYSTEM |
| **Attachments** |
| attachments | Array | No | See below |
| **Status** |
| status | Enum | Yes | SENDING, SENT, DELIVERED, READ, FAILED |
| deliveredAt | Date | No | |
| readAt | Date | No | |
| **Soft Delete** |
| isDeleted | Boolean | No | Deleted for everyone |
| deletedFor | [ObjectId] | No | Deleted for specific users |
| **Timestamps** |
| createdAt | Date | Auto | |

**attachments Array:**
```
[{
  type: 'IMAGE' | 'AUDIO' | 'DOCUMENT',
  url: String,
  thumbnailUrl: String,
  name: String,
  size: Number,
  mimeType: String
}]
```

**Indexes:**
- `{ conversation: 1, createdAt: -1 }` - Messages in conversation
- `{ sender: 1 }` - Messages by user

---

## Notification Models

### Notification
> In-app and push notifications

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| user | ObjectId | Yes | Recipient |
| **Content** |
| type | Enum | Yes | See notification types below |
| title | String | Yes | Notification title |
| body | String | Yes | Notification body |
| icon | String | No | Icon URL/name |
| **Action** |
| actionUrl | String | No | Deep link / route |
| actionData | Object | No | Additional data |
| **References** |
| relatedGig | ObjectId | No | |
| relatedUser | ObjectId | No | |
| relatedApplication | ObjectId | No | |
| relatedPayment | ObjectId | No | |
| relatedConversation | ObjectId | No | |
| **Status** |
| isRead | Boolean | Yes | Has been read |
| readAt | Date | No | |
| **Delivery Channels** |
| channels.inApp | Boolean | Yes | Stored in-app |
| channels.push | Boolean | Yes | Sent via FCM |
| channels.email | Boolean | Yes | Sent via email |
| channels.sms | Boolean | No | Sent via SMS |
| **Delivery Status** |
| delivery.push.sent | Boolean | No | |
| delivery.push.sentAt | Date | No | |
| delivery.email.sent | Boolean | No | |
| delivery.email.sentAt | Date | No | |
| **Timestamps** |
| createdAt | Date | Auto | |
| expiresAt | Date | No | Auto-delete after |

**Notification Types:**
| Type | Title Example | Trigger |
|------|---------------|---------|
| NEW_APPLICATION | "New bid on your gig" | Artist applies |
| APPLICATION_ACCEPTED | "Your bid was accepted!" | Client accepts |
| APPLICATION_REJECTED | "Update on your application" | Client rejects |
| NEW_MESSAGE | "New message from {name}" | Message received |
| PAYMENT_RECEIVED | "Payment of ₹X received" | Payment successful |
| PAYOUT_SENT | "₹X sent to your bank" | Payout completed |
| GIG_REMINDER | "Gig tomorrow: {title}" | 24h before gig |
| REVIEW_REQUEST | "How was your gig?" | 24h after gig |
| GIG_CANCELLED | "Gig cancelled: {title}" | Gig cancelled |
| PROFILE_VERIFIED | "You're now verified!" | Admin verifies |
| ESCROW_RELEASED | "Payment released!" | Escrow released |

---

### NotificationPreferences
> User's notification settings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| user | ObjectId | Yes | User reference |
| **Global Toggles** |
| pushEnabled | Boolean | Yes | Master push toggle |
| emailEnabled | Boolean | Yes | Master email toggle |
| smsEnabled | Boolean | Yes | Master SMS toggle |
| **Per-Category** |
| categories.applications | Object | Yes | { push, email, sms } |
| categories.messages | Object | Yes | { push, email, sms } |
| categories.payments | Object | Yes | { push, email, sms } |
| categories.reminders | Object | Yes | { push, email, sms } |
| categories.marketing | Object | Yes | { push, email, sms } |
| **Quiet Hours** |
| quietHours.enabled | Boolean | No | |
| quietHours.start | String | No | "22:00" |
| quietHours.end | String | No | "08:00" |
| quietHours.timezone | String | No | "Asia/Kolkata" |
| **FCM Tokens** |
| fcmTokens | Array | No | [{ token, deviceId, platform, createdAt }] |
| **Timestamps** |
| createdAt | Date | Auto | |
| updatedAt | Date | Auto | |

---

## Review & Rating Models

### Review
> Post-gig reviews

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| **Participants** |
| reviewer | ObjectId | Yes | Who wrote review |
| reviewee | ObjectId | Yes | Who is being reviewed |
| reviewerRole | Enum | Yes | ARTIST or CLIENT |
| **Context** |
| gig | ObjectId | Yes | Which gig |
| application | ObjectId | Yes | Which application |
| **Rating** |
| overallRating | Number | Yes | 1-5 stars |
| **Detailed Ratings (optional)** |
| detailedRatings.professionalism | Number | No | 1-5 |
| detailedRatings.communication | Number | No | 1-5 |
| detailedRatings.punctuality | Number | No | 1-5 |
| detailedRatings.quality | Number | No | 1-5 (performance/venue) |
| **Review Content** |
| title | String | No | Review headline |
| comment | String | Yes | Review text |
| **Visibility** |
| isVisible | Boolean | Yes | Show publicly |
| visibleAfter | Date | No | When becomes visible |
| **Moderation** |
| status | Enum | Yes | PENDING, APPROVED, REJECTED, FLAGGED |
| flagReason | String | No | Why flagged |
| flaggedBy | ObjectId | No | Who flagged |
| moderatedBy | ObjectId | No | Admin who reviewed |
| moderationNotes | String | No | Admin notes |
| **Response** |
| response | String | No | Reviewee's response |
| respondedAt | Date | No | |
| **Timestamps** |
| createdAt | Date | Auto | |
| updatedAt | Date | Auto | |

**Review Visibility Logic:**
```
1. After gig completion, both parties have 14 days to review
2. Reviews are hidden until:
   - Both parties submit, OR
   - 14 days pass
3. After visible, reviewee can respond
```

**Indexes:**
- `{ reviewee: 1, isVisible: 1, createdAt: -1 }` - Public reviews for user
- `{ gig: 1 }` - Reviews for a gig
- `{ reviewer: 1 }` - Reviews by user

---

### UserRatingStats
> Aggregated rating statistics (denormalized for performance)

| Field | Type | Description |
|-------|------|-------------|
| _id | ObjectId | Same as User _id |
| user | ObjectId | User reference |
| **Aggregate Stats** |
| totalReviews | Number | Total reviews received |
| averageRating | Number | Overall average (1-5) |
| ratingDistribution | Object | { 1: count, 2: count, ... 5: count } |
| **Detailed Averages** |
| avgProfessionalism | Number | |
| avgCommunication | Number | |
| avgPunctuality | Number | |
| avgQuality | Number | |
| **Recent** |
| recentReviews | [ObjectId] | Last 5 review IDs |
| lastReviewAt | Date | |
| **Timestamps** |
| updatedAt | Date | Last recalculated |

---

## Media/Upload Models

### Media
> Uploaded files (images, audio, documents)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | ObjectId | Auto | Primary key |
| user | ObjectId | Yes | Uploader |
| **File Info** |
| type | Enum | Yes | IMAGE, AUDIO, VIDEO, DOCUMENT |
| purpose | Enum | Yes | See purposes below |
| **Storage** |
| provider | Enum | Yes | CLOUDINARY, S3 |
| publicId | String | Yes | Provider's ID |
| url | String | Yes | Full URL |
| secureUrl | String | Yes | HTTPS URL |
| thumbnailUrl | String | No | For images/videos |
| **Original File** |
| originalName | String | Yes | Original filename |
| mimeType | String | Yes | MIME type |
| size | Number | Yes | Size in bytes |
| **Dimensions (images/videos)** |
| dimensions.width | Number | No | |
| dimensions.height | Number | No | |
| **Duration (audio/video)** |
| duration | Number | No | Seconds |
| **References** |
| attachedTo.type | String | No | 'user', 'gig', 'message', 'review' |
| attachedTo.id | ObjectId | No | |
| **Status** |
| isProcessed | Boolean | Yes | Processing complete |
| isDeleted | Boolean | No | Soft deleted |
| **Timestamps** |
| createdAt | Date | Auto | |
| deletedAt | Date | No | |

**Purpose Enum:**
- `PROFILE_PICTURE` - User avatar
- `GIG_IMAGE` - Gig photos
- `GIG_COVER` - Gig cover image
- `PORTFOLIO_AUDIO` - Artist sample
- `PORTFOLIO_VIDEO` - Artist video
- `PORTFOLIO_IMAGE` - Artist photo
- `CHAT_ATTACHMENT` - Message attachment
- `DOCUMENT` - ID proof, contracts
- `VENUE_IMAGE` - Venue photos

---

## Extended User Models

### Enhanced Artist Profile
> Add to existing User.artistProfile

| Field | Type | Description |
|-------|------|-------------|
| **Bio & About** |
| bio | String | About the artist |
| tagline | String | Short tagline |
| **Media** |
| profileVideo | ObjectId | Intro video (ref: Media) |
| coverImage | ObjectId | Profile cover (ref: Media) |
| **Portfolio** |
| portfolio | Array | See below |
| **Skills** |
| primarySkill | String | Main talent |
| skills | [String] | All skills |
| genres | [String] | Music genres |
| instruments | [String] | Instruments played |
| languages | [String] | Can perform in |
| **Experience** |
| experienceYears | Number | Years of experience |
| gigCount | Number | Gigs on platform |
| notableWork | [String] | Notable gigs/achievements |
| **Availability** |
| availabilityStatus | Enum | AVAILABLE, BUSY, NOT_ACCEPTING |
| blockedDates | [Date] | Unavailable dates |
| preferredCities | [String] | Preferred locations |
| willingToTravel | Boolean | |
| travelRadius | Number | KM willing to travel |
| **Pricing** |
| rateType | Enum | HOURLY, PER_GIG, NEGOTIABLE |
| hourlyRate.min | Number | |
| hourlyRate.max | Number | |
| currency | String | INR |
| **Social** |
| socialLinks.instagram | String | |
| socialLinks.youtube | String | |
| socialLinks.spotify | String | |
| socialLinks.website | String | |
| **Stats (calculated)** |
| stats.completedGigs | Number | |
| stats.averageRating | Number | |
| stats.totalReviews | Number | |
| stats.responseRate | Number | % |
| stats.avgResponseTime | Number | Hours |

**portfolio Array:**
```
[{
  type: 'AUDIO' | 'VIDEO' | 'IMAGE',
  media: ObjectId (ref: Media),
  title: String,
  description: String,
  isFeatured: Boolean,
  order: Number
}]
```

---

### Enhanced Client Profile
> Add to existing User.clientProfile

| Field | Type | Description |
|-------|------|-------------|
| **Company/Venue** |
| companyName | String | Business name |
| companyType | Enum | VENUE, EVENT_MANAGER, INDIVIDUAL, CORPORATE |
| **Contact** |
| businessEmail | String | |
| businessPhone | String | |
| website | String | |
| **Address** |
| address.street | String | |
| address.city | String | |
| address.state | String | |
| address.pincode | String | |
| **Stats** |
| stats.totalGigsPosted | Number | |
| stats.completedGigs | Number | |
| stats.averageRating | Number | |
| stats.totalReviews | Number | |
| **Saved** |
| savedVenues | [ObjectId] | Ref: Venue |
| savedArtists | [ObjectId] | Ref: User |

---

## Relationships Diagram

```
                                    ┌─────────────┐
                                    │    User     │
                                    │  (Artist/   │
                                    │   Client)   │
                                    └──────┬──────┘
                                           │
           ┌───────────────────────────────┼───────────────────────────────┐
           │                               │                               │
           ▼                               ▼                               ▼
    ┌─────────────┐                ┌─────────────┐                ┌─────────────┐
    │   Wallet    │                │    Gig      │                │   Venue     │
    │ (Artist)    │                │ (Client)    │                │ (Client)    │
    └──────┬──────┘                └──────┬──────┘                └─────────────┘
           │                               │
           │                               ▼
           │                       ┌─────────────┐
           │                       │ Application │
           │                       │  (Artist)   │
           │                       └──────┬──────┘
           │                               │
           │         ┌─────────────────────┼─────────────────────┐
           │         │                     │                     │
           ▼         ▼                     ▼                     ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   ┌─────────────┐
    │   Payout    │  │   Payment   │  │Conversation │   │   Review    │
    └─────────────┘  └──────┬──────┘  └──────┬──────┘   └─────────────┘
                            │                │
                            ▼                ▼
                     ┌─────────────┐  ┌─────────────┐
                     │   Escrow    │  │   Message   │
                     └─────────────┘  └─────────────┘


    ┌─────────────┐         ┌─────────────┐
    │Notification │         │    Media    │
    │   (User)    │         │   (User)    │
    └─────────────┘         └─────────────┘
```

---

## Database Indexes Summary

### High-Priority Indexes

```javascript
// Users
{ firebaseUid: 1 }                    // unique
{ email: 1 }                          // unique, sparse
{ phone: 1 }                          // unique, sparse
{ role: 1, status: 1 }                // admin filters

// Gigs
{ status: 1, 'eventTiming.date': 1 }  // active gigs
{ 'venue.city': 1, status: 1 }        // city browse
{ postedBy: 1, status: 1 }            // my gigs
{ category: 1, status: 1 }            // category filter

// Applications
{ gig: 1, applicant: 1 }              // unique
{ applicant: 1, status: 1 }           // my applications
{ gig: 1, status: 1 }                 // gig's applications

// Payments
{ razorpayOrderId: 1 }                // webhook lookup
{ payer: 1, createdAt: -1 }           // payment history
{ payee: 1, createdAt: -1 }           // received payments

// Conversations
{ participants: 1 }                    // find user's chats
{ 'lastMessage.sentAt': -1 }          // sort by recent

// Messages
{ conversation: 1, createdAt: -1 }    // chat history

// Notifications
{ user: 1, isRead: 1, createdAt: -1 } // user's notifications

// Reviews
{ reviewee: 1, isVisible: 1 }         // public reviews
{ gig: 1 }                            // gig reviews
```

---

## Next Steps

1. Review these models with the team
2. Decide on optional fields
3. Create MongoDB schemas in NestJS
4. Set up indexes
5. Create seed data for testing

Need any modifications to these models?
