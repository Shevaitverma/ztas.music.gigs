# ZTS Music Platform - Implementation Plan

> Comprehensive plan to make ZTS production-ready

## Table of Contents
1. [Phase Overview](#phase-overview)
2. [Phase 1: Foundation](#phase-1-foundation-infrastructure)
3. [Phase 2: Payments](#phase-2-payment-system)
4. [Phase 3: Communication](#phase-3-communication-trust)
5. [Phase 4: Polish](#phase-4-polish-optimization)
6. [Data Models](#data-models)
7. [API Specifications](#api-specifications)

---

## Phase Overview

| Phase | Focus | Duration | Priority |
|-------|-------|----------|----------|
| **Phase 1** | Infrastructure (Redis, Files, Email, Rate Limiting) | 2 weeks | CRITICAL |
| **Phase 2** | Payment System (Razorpay, Escrow, Payouts) | 2-3 weeks | CRITICAL |
| **Phase 3** | Communication & Trust (Messaging, Notifications, Reviews) | 2-3 weeks | HIGH |
| **Phase 4** | Polish (Search, Admin, Profiles) | 2 weeks | MEDIUM |

---

## Phase 1: Foundation Infrastructure

### 1.1 Rate Limiting (Day 1)

**Backend Tasks:**
- [ ] Install `@nestjs/throttler`
- [ ] Configure global throttler guard
- [ ] Set limits: 100 requests/minute for general, 5 requests/minute for auth
- [ ] Add custom rate limit decorators for specific endpoints
- [ ] Log rate limit violations

**Files to modify:**
- `src/app.module.ts` - Add ThrottlerModule
- `src/modules/auth/auth.controller.ts` - Stricter limits on auth
- Create `src/common/decorators/throttle.decorator.ts`

**Configuration:**
```typescript
// Default limits
THROTTLE_TTL=60        // 60 seconds
THROTTLE_LIMIT=100     // 100 requests per TTL

// Auth endpoints
AUTH_THROTTLE_LIMIT=5  // 5 attempts per minute
```

---

### 1.2 Redis Setup (Days 2-3)

**Backend Tasks:**
- [ ] Install `@nestjs/cache-manager` and `cache-manager-redis-store`
- [ ] Create Redis configuration
- [ ] Implement cache interceptor for GET endpoints
- [ ] Add cache invalidation on mutations
- [ ] Set up Redis for Bull queue (later for jobs)

**What to cache:**
| Endpoint | TTL | Invalidate On |
|----------|-----|---------------|
| `GET /gigs` | 5 min | Gig create/update/delete |
| `GET /gigs/cities` | 1 hour | Gig create with new city |
| `GET /gigs/:id` | 10 min | Gig update |
| `GET /users/:id` (public) | 15 min | User update |

**Files to create:**
- `src/config/redis.config.ts`
- `src/common/interceptors/cache.interceptor.ts`
- `src/common/decorators/cache-key.decorator.ts`

---

### 1.3 File Upload System (Days 4-7)

**Decision: Cloudinary for images, S3 for audio/documents**

**Backend Tasks:**
- [ ] Install `cloudinary`, `multer`, `@nestjs/platform-express`
- [ ] Create FileUpload module
- [ ] Implement image upload (profile pics, gig images)
- [ ] Implement audio upload (artist samples) - S3
- [ ] Add file validation (type, size)
- [ ] Generate thumbnails for images
- [ ] Create file deletion cleanup

**Endpoints to create:**
```
POST /upload/image          - Upload single image
POST /upload/images         - Upload multiple images (max 5)
POST /upload/audio          - Upload audio file
DELETE /upload/:publicId    - Delete uploaded file
```

**File size limits:**
| Type | Max Size | Allowed Formats |
|------|----------|-----------------|
| Image | 5MB | jpg, png, webp |
| Audio | 50MB | mp3, wav, m4a |
| Document | 10MB | pdf |

**Files to create:**
- `src/modules/upload/upload.module.ts`
- `src/modules/upload/upload.controller.ts`
- `src/modules/upload/upload.service.ts`
- `src/modules/upload/cloudinary.provider.ts`
- `src/modules/upload/s3.provider.ts`
- `src/common/pipes/file-validation.pipe.ts`

---

### 1.4 Email Service (Days 8-10)

**Decision: SendGrid (reliable, good free tier)**

**Backend Tasks:**
- [ ] Install `@sendgrid/mail`
- [ ] Create Email module with queue support
- [ ] Create email templates (HTML)
- [ ] Implement transactional emails
- [ ] Add email tracking (opens, clicks)

**Email Templates to create:**
| Template | Trigger |
|----------|---------|
| `welcome` | User signup |
| `gig-posted` | Client posts gig |
| `new-application` | Artist applies to gig |
| `application-accepted` | Client accepts bid |
| `application-rejected` | Client rejects bid |
| `gig-reminder` | 24h before gig |
| `payment-received` | Payment confirmed |
| `payout-sent` | Artist payout processed |
| `password-reset` | Password reset request |

**Files to create:**
- `src/modules/email/email.module.ts`
- `src/modules/email/email.service.ts`
- `src/modules/email/templates/` (HTML templates)
- `src/modules/email/email.processor.ts` (Bull queue processor)

---

### 1.5 Job Queue with Bull (Days 11-12)

**Backend Tasks:**
- [ ] Install `@nestjs/bull` and `bull`
- [ ] Configure Bull with Redis
- [ ] Create queues for async tasks
- [ ] Add job retry logic
- [ ] Create job monitoring

**Queues to create:**
| Queue | Purpose |
|-------|---------|
| `email` | Send emails asynchronously |
| `notification` | Push notifications |
| `cleanup` | File cleanup, expired gigs |
| `payout` | Process artist payouts |

**Files to create:**
- `src/modules/queue/queue.module.ts`
- `src/modules/queue/processors/email.processor.ts`
- `src/modules/queue/processors/notification.processor.ts`

---

## Phase 2: Payment System

### 2.1 Payment Gateway - Razorpay (Days 1-5)

**Backend Tasks:**
- [ ] Install `razorpay`
- [ ] Create Payments module
- [ ] Implement order creation
- [ ] Implement payment verification
- [ ] Handle webhooks
- [ ] Store transaction records

**Payment Flow:**
```
1. Client accepts artist bid
2. Backend creates Razorpay order (amount = bid + platform fee)
3. Frontend shows Razorpay checkout
4. User completes payment
5. Razorpay sends webhook
6. Backend verifies signature
7. Mark payment as completed
8. Hold in escrow until gig completion
```

**Endpoints:**
```
POST /payments/create-order     - Create Razorpay order
POST /payments/verify           - Verify payment signature
POST /payments/webhook          - Razorpay webhook handler
GET  /payments/history          - User's payment history
GET  /payments/:id              - Payment details
```

---

### 2.2 Escrow System (Days 6-8)

**Backend Tasks:**
- [ ] Create Escrow entity
- [ ] Hold payment on successful transaction
- [ ] Release to artist on gig completion
- [ ] Handle disputes
- [ ] Implement refund flow

**Escrow States:**
```
HELD → RELEASED (gig completed)
HELD → REFUNDED (gig cancelled)
HELD → DISPUTED (conflict)
DISPUTED → RELEASED/REFUNDED (admin resolution)
```

---

### 2.3 Wallet & Payouts (Days 9-12)

**Backend Tasks:**
- [ ] Create Wallet entity for artists
- [ ] Track earnings (pending, available, withdrawn)
- [ ] Implement payout requests
- [ ] Integrate Razorpay Route (for payouts)
- [ ] Add bank account management
- [ ] Minimum payout threshold (₹500)

**Endpoints:**
```
GET  /wallet                    - Artist's wallet
GET  /wallet/transactions       - Wallet transactions
POST /wallet/payout-request     - Request payout
GET  /wallet/payout-history     - Payout history
POST /wallet/bank-account       - Add bank account
```

---

### 2.4 Invoicing (Days 13-14)

**Backend Tasks:**
- [ ] Generate PDF invoices
- [ ] Include GST breakdown
- [ ] Store invoice records
- [ ] Email invoice on payment

---

## Phase 3: Communication & Trust

### 3.1 Messaging System (Days 1-5)

**Backend Tasks:**
- [ ] Create Message and Conversation entities
- [ ] Implement WebSocket gateway
- [ ] Create REST endpoints for history
- [ ] Add typing indicators
- [ ] Implement read receipts
- [ ] File sharing in messages

**WebSocket Events:**
```
// Client → Server
message:send        - Send new message
message:typing      - User is typing
message:read        - Mark messages as read

// Server → Client
message:new         - New message received
message:typing      - Other user typing
message:delivered   - Message delivered
```

**REST Endpoints:**
```
GET  /conversations              - User's conversations
GET  /conversations/:id          - Conversation with messages
POST /conversations              - Start new conversation
POST /conversations/:id/messages - Send message (fallback)
```

---

### 3.2 Notifications System (Days 6-9)

**Backend Tasks:**
- [ ] Create Notification entity
- [ ] Implement notification service
- [ ] Integrate Firebase Cloud Messaging
- [ ] Create notification preferences
- [ ] In-app notification storage

**Notification Types:**
| Type | Push | Email | In-App |
|------|------|-------|--------|
| New application | ✓ | ✓ | ✓ |
| Application status | ✓ | ✓ | ✓ |
| New message | ✓ | - | ✓ |
| Payment received | ✓ | ✓ | ✓ |
| Gig reminder | ✓ | ✓ | ✓ |
| Review request | - | ✓ | ✓ |

**Endpoints:**
```
GET  /notifications              - User's notifications
PATCH /notifications/:id/read    - Mark as read
PATCH /notifications/read-all    - Mark all as read
GET  /notifications/preferences  - Get preferences
PATCH /notifications/preferences - Update preferences
```

---

### 3.3 Reviews & Ratings (Days 10-14)

**Backend Tasks:**
- [ ] Create Review entity
- [ ] Implement review submission (after gig)
- [ ] Calculate aggregate ratings
- [ ] Add review moderation
- [ ] Display on profiles

**Review Flow:**
```
1. Gig marked as COMPLETED
2. System sends review request (3 days after)
3. Both parties can review (within 14 days)
4. Reviews visible after both submit OR 14 days pass
```

**Endpoints:**
```
POST /reviews                    - Submit review
GET  /reviews/user/:userId       - User's reviews
GET  /reviews/gig/:gigId         - Gig's reviews
GET  /reviews/pending            - Reviews to submit
```

---

## Phase 4: Polish & Optimization

### 4.1 Advanced Search (Days 1-3)
- [ ] Full-text search with MongoDB Atlas Search
- [ ] Geo-based search (nearby gigs)
- [ ] Faceted filters
- [ ] Saved searches

### 4.2 Profile Completion (Days 4-6)
- [ ] Artist portfolio uploads
- [ ] Skills/genres management
- [ ] Availability calendar
- [ ] Bank account verification
- [ ] Profile completion percentage

### 4.3 Admin Enhancements (Days 7-10)
- [ ] User verification workflow
- [ ] Content moderation queue
- [ ] Dispute resolution panel
- [ ] Analytics dashboard
- [ ] System settings

### 4.4 Performance & Security (Days 11-14)
- [ ] API response optimization
- [ ] Database query optimization
- [ ] Security audit
- [ ] Load testing
- [ ] Error monitoring (Sentry)

---

## Data Models

### Payment Schema
```typescript
// src/modules/payments/entities/payment.entity.ts
{
  _id: ObjectId,

  // References
  gig: ObjectId (ref: Gig),
  application: ObjectId (ref: Application),
  payer: ObjectId (ref: User),        // Client
  payee: ObjectId (ref: User),        // Artist

  // Amounts
  gigAmount: Number,                   // Artist's bid amount
  platformFee: Number,                 // Our commission
  gstAmount: Number,                   // GST on platform fee
  totalAmount: Number,                 // Total charged to client

  // Razorpay
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,

  // Status
  status: Enum ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],

  // Metadata
  currency: String (default: 'INR'),
  method: String,                      // 'card', 'upi', 'netbanking'

  createdAt: Date,
  updatedAt: Date,
  completedAt: Date
}
```

### Escrow Schema
```typescript
// src/modules/payments/entities/escrow.entity.ts
{
  _id: ObjectId,

  payment: ObjectId (ref: Payment),
  gig: ObjectId (ref: Gig),

  amount: Number,

  status: Enum ['HELD', 'RELEASED', 'REFUNDED', 'DISPUTED'],

  heldAt: Date,
  releasedAt: Date,
  refundedAt: Date,

  // If disputed
  disputeReason: String,
  disputeResolvedBy: ObjectId (ref: User),  // Admin
  disputeResolution: String,

  createdAt: Date,
  updatedAt: Date
}
```

### Wallet Schema
```typescript
// src/modules/wallet/entities/wallet.entity.ts
{
  _id: ObjectId,

  user: ObjectId (ref: User),

  // Balances
  pendingBalance: Number,              // In escrow
  availableBalance: Number,            // Can withdraw
  totalEarnings: Number,               // Lifetime
  totalWithdrawn: Number,              // Lifetime

  // Bank Details (encrypted)
  bankAccount: {
    accountNumber: String (encrypted),
    ifscCode: String,
    accountHolderName: String,
    bankName: String,
    isVerified: Boolean
  },

  // Razorpay Contact ID (for payouts)
  razorpayContactId: String,
  razorpayFundAccountId: String,

  createdAt: Date,
  updatedAt: Date
}
```

### Wallet Transaction Schema
```typescript
// src/modules/wallet/entities/wallet-transaction.entity.ts
{
  _id: ObjectId,

  wallet: ObjectId (ref: Wallet),

  type: Enum ['CREDIT', 'DEBIT'],
  category: Enum ['GIG_PAYMENT', 'PAYOUT', 'REFUND', 'ADJUSTMENT'],

  amount: Number,
  balanceAfter: Number,

  // References
  relatedPayment: ObjectId (ref: Payment),
  relatedPayout: ObjectId (ref: Payout),
  relatedGig: ObjectId (ref: Gig),

  description: String,

  createdAt: Date
}
```

### Payout Schema
```typescript
// src/modules/wallet/entities/payout.entity.ts
{
  _id: ObjectId,

  wallet: ObjectId (ref: Wallet),
  user: ObjectId (ref: User),

  amount: Number,

  status: Enum ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],

  // Razorpay Payout
  razorpayPayoutId: String,
  razorpayStatus: String,

  // Bank Details (snapshot)
  bankAccount: {
    accountNumber: String (last 4 digits),
    ifscCode: String,
    bankName: String
  },

  failureReason: String,

  requestedAt: Date,
  processedAt: Date,
  completedAt: Date,

  createdAt: Date,
  updatedAt: Date
}
```

### Conversation Schema
```typescript
// src/modules/messaging/entities/conversation.entity.ts
{
  _id: ObjectId,

  participants: [ObjectId] (ref: User),  // Always 2

  // Context (optional)
  gig: ObjectId (ref: Gig),
  application: ObjectId (ref: Application),

  lastMessage: {
    content: String,
    sender: ObjectId,
    sentAt: Date
  },

  // Per-participant data
  participantData: [{
    user: ObjectId,
    unreadCount: Number,
    lastReadAt: Date,
    isArchived: Boolean,
    isMuted: Boolean
  }],

  createdAt: Date,
  updatedAt: Date
}
```

### Message Schema
```typescript
// src/modules/messaging/entities/message.entity.ts
{
  _id: ObjectId,

  conversation: ObjectId (ref: Conversation),
  sender: ObjectId (ref: User),

  content: String,

  // Attachments
  attachments: [{
    type: Enum ['IMAGE', 'AUDIO', 'DOCUMENT'],
    url: String,
    name: String,
    size: Number
  }],

  // Status
  status: Enum ['SENT', 'DELIVERED', 'READ'],

  deliveredAt: Date,
  readAt: Date,

  // Soft delete
  isDeleted: Boolean,
  deletedAt: Date,

  createdAt: Date
}
```

### Notification Schema
```typescript
// src/modules/notifications/entities/notification.entity.ts
{
  _id: ObjectId,

  user: ObjectId (ref: User),

  type: Enum [
    'NEW_APPLICATION',
    'APPLICATION_ACCEPTED',
    'APPLICATION_REJECTED',
    'NEW_MESSAGE',
    'PAYMENT_RECEIVED',
    'PAYOUT_SENT',
    'GIG_REMINDER',
    'REVIEW_REQUEST',
    'GIG_CANCELLED',
    'PROFILE_VERIFIED'
  ],

  title: String,
  body: String,

  // Action
  actionUrl: String,                   // Deep link
  actionData: Object,                  // Extra data

  // References
  relatedGig: ObjectId (ref: Gig),
  relatedUser: ObjectId (ref: User),
  relatedApplication: ObjectId (ref: Application),

  // Status
  isRead: Boolean,
  readAt: Date,

  // Delivery
  channels: {
    inApp: Boolean,
    push: Boolean,
    email: Boolean
  },

  createdAt: Date
}
```

### Notification Preferences Schema
```typescript
// src/modules/notifications/entities/notification-preferences.entity.ts
{
  _id: ObjectId,

  user: ObjectId (ref: User),

  // Global
  pushEnabled: Boolean,
  emailEnabled: Boolean,

  // Per-type settings
  preferences: {
    newApplication: { push: Boolean, email: Boolean },
    applicationStatus: { push: Boolean, email: Boolean },
    newMessage: { push: Boolean, email: Boolean },
    payments: { push: Boolean, email: Boolean },
    reminders: { push: Boolean, email: Boolean },
    marketing: { push: Boolean, email: Boolean }
  },

  // Quiet hours
  quietHours: {
    enabled: Boolean,
    start: String,              // "22:00"
    end: String                 // "08:00"
  },

  createdAt: Date,
  updatedAt: Date
}
```

### Review Schema
```typescript
// src/modules/reviews/entities/review.entity.ts
{
  _id: ObjectId,

  // Who reviewed whom
  reviewer: ObjectId (ref: User),
  reviewee: ObjectId (ref: User),

  // Context
  gig: ObjectId (ref: Gig),
  application: ObjectId (ref: Application),

  // Rating (1-5)
  rating: Number,

  // Detailed ratings
  detailedRatings: {
    professionalism: Number,
    communication: Number,
    quality: Number,             // For artist: performance, For client: venue/organization
    punctuality: Number
  },

  // Review text
  comment: String,

  // Visibility
  isVisible: Boolean,            // Hidden until both review or 14 days

  // Moderation
  isApproved: Boolean,
  isFlagged: Boolean,
  flagReason: String,
  moderatedBy: ObjectId (ref: User),

  createdAt: Date,
  updatedAt: Date
}
```

### File/Media Schema
```typescript
// src/modules/upload/entities/media.entity.ts
{
  _id: ObjectId,

  user: ObjectId (ref: User),

  type: Enum ['IMAGE', 'AUDIO', 'DOCUMENT', 'VIDEO'],
  purpose: Enum ['PROFILE_PICTURE', 'GIG_IMAGE', 'PORTFOLIO', 'CHAT_ATTACHMENT', 'DOCUMENT'],

  // Storage
  provider: Enum ['CLOUDINARY', 'S3'],
  publicId: String,
  url: String,
  thumbnailUrl: String,

  // Metadata
  originalName: String,
  mimeType: String,
  size: Number,                  // bytes

  // For audio/video
  duration: Number,              // seconds

  // For images
  dimensions: {
    width: Number,
    height: Number
  },

  createdAt: Date
}
```

### Artist Profile Extension
```typescript
// Add to User entity - artistProfile subdocument
artistProfile: {
  bio: String,

  // Portfolio
  portfolio: [{
    type: Enum ['AUDIO', 'VIDEO', 'IMAGE'],
    media: ObjectId (ref: Media),
    title: String,
    description: String
  }],

  // Skills & Genres
  skills: [String],
  genres: [String],
  instruments: [String],

  // Experience
  experience: {
    years: Number,
    notableGigs: [String],
    achievements: [String]
  },

  // Availability
  availability: {
    status: Enum ['AVAILABLE', 'BUSY', 'NOT_ACCEPTING'],
    calendar: [{                 // Blocked dates
      date: Date,
      reason: String
    }]
  },

  // Pricing
  hourlyRate: {
    min: Number,
    max: Number,
    currency: String
  },

  // Location
  location: {
    city: String,
    state: String,
    willingToTravel: Boolean,
    travelRadius: Number          // km
  },

  // Stats (calculated)
  stats: {
    totalGigs: Number,
    completedGigs: Number,
    averageRating: Number,
    totalReviews: Number,
    responseRate: Number,         // % of applications
    responseTime: Number          // avg hours to respond
  }
}
```

---

## API Specifications

### Payments API

```yaml
# Create Order
POST /api/v1/payments/create-order
Body:
  applicationId: string (required)
Response:
  orderId: string
  amount: number
  currency: string
  razorpayOrderId: string

# Verify Payment
POST /api/v1/payments/verify
Body:
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
Response:
  success: boolean
  payment: Payment

# Webhook (Razorpay → Our Server)
POST /api/v1/payments/webhook
Headers:
  X-Razorpay-Signature: string
Body: Razorpay webhook payload

# Get Payment History
GET /api/v1/payments/history?page=1&limit=10
Response:
  data: Payment[]
  meta: PaginationMeta
```

### Wallet API

```yaml
# Get Wallet
GET /api/v1/wallet
Response:
  pendingBalance: number
  availableBalance: number
  totalEarnings: number
  bankAccount: BankAccount | null

# Get Transactions
GET /api/v1/wallet/transactions?page=1&limit=20
Response:
  data: WalletTransaction[]
  meta: PaginationMeta

# Request Payout
POST /api/v1/wallet/payout-request
Body:
  amount: number
Response:
  payout: Payout

# Add Bank Account
POST /api/v1/wallet/bank-account
Body:
  accountNumber: string
  ifscCode: string
  accountHolderName: string
Response:
  bankAccount: BankAccount
```

### Messaging API

```yaml
# Get Conversations
GET /api/v1/conversations
Response:
  data: Conversation[]

# Get Conversation Messages
GET /api/v1/conversations/:id?page=1&limit=50
Response:
  conversation: Conversation
  messages: Message[]
  meta: PaginationMeta

# Start Conversation
POST /api/v1/conversations
Body:
  participantId: string
  gigId?: string
  applicationId?: string
  initialMessage: string
Response:
  conversation: Conversation

# Send Message
POST /api/v1/conversations/:id/messages
Body:
  content: string
  attachments?: string[]  # Media IDs
Response:
  message: Message
```

### Notifications API

```yaml
# Get Notifications
GET /api/v1/notifications?page=1&limit=20&unreadOnly=false
Response:
  data: Notification[]
  meta: PaginationMeta
  unreadCount: number

# Mark as Read
PATCH /api/v1/notifications/:id/read
Response:
  success: boolean

# Mark All as Read
PATCH /api/v1/notifications/read-all
Response:
  success: boolean
  count: number

# Get Preferences
GET /api/v1/notifications/preferences
Response:
  preferences: NotificationPreferences

# Update Preferences
PATCH /api/v1/notifications/preferences
Body:
  pushEnabled?: boolean
  emailEnabled?: boolean
  preferences?: object
Response:
  preferences: NotificationPreferences

# Register FCM Token
POST /api/v1/notifications/fcm-token
Body:
  token: string
  deviceId: string
Response:
  success: boolean
```

### Reviews API

```yaml
# Submit Review
POST /api/v1/reviews
Body:
  gigId: string
  rating: number (1-5)
  detailedRatings?: object
  comment: string
Response:
  review: Review

# Get User Reviews
GET /api/v1/reviews/user/:userId?page=1&limit=10
Response:
  data: Review[]
  meta: PaginationMeta
  averageRating: number
  totalReviews: number

# Get Pending Reviews
GET /api/v1/reviews/pending
Response:
  data: [{
    gig: Gig
    reviewee: User
    dueDate: Date
  }]
```

### Upload API

```yaml
# Upload Image
POST /api/v1/upload/image
Content-Type: multipart/form-data
Body:
  file: File
  purpose: 'PROFILE_PICTURE' | 'GIG_IMAGE' | 'PORTFOLIO'
Response:
  media: Media

# Upload Audio
POST /api/v1/upload/audio
Content-Type: multipart/form-data
Body:
  file: File
  title?: string
Response:
  media: Media

# Delete Media
DELETE /api/v1/upload/:id
Response:
  success: boolean
```

---

## Environment Variables (New)

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# AWS S3 (for audio)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_S3_BUCKET=zts-music-files

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@ztsmusic.com
SENDGRID_FROM_NAME=ZTS Music

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Platform Settings
PLATFORM_FEE_PERCENTAGE=15
GST_PERCENTAGE=18
MIN_PAYOUT_AMOUNT=500
```

---

## Next Steps

1. **Start with Phase 1.1** - Add rate limiting (quick win)
2. **Set up Redis** - Foundation for caching and queues
3. **Implement file uploads** - Unblocks profile/portfolio features
4. **Add email service** - Critical for user engagement

Ready to start implementing? Let's begin with rate limiting and Redis setup.
