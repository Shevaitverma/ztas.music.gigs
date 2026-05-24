# ZTS Music Platform - Frontend Implementation Plan

> What to build in the web and admin apps

---

## Current State

### Web App (ai.zts.music.web)
| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✅ Complete | Phone OTP, Google |
| Home page | ✅ Complete | Hero, gig preview |
| Gig browsing | ✅ Complete | List, basic search |
| Gig details | ✅ Complete | View, apply |
| Gig creation | ✅ Complete | 3-step wizard |
| Apply to gig | ✅ Complete | Bid dialog |
| Profile page | ⚠️ Basic | View only, no edit |
| Messages | ❌ Stub | Empty placeholder |
| Settings | ❌ Missing | |

### Admin App (ai.zts.music.admin)
| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✅ Complete | Email/password |
| Dashboard | ⚠️ Basic | 4 metrics |
| User list | ✅ Complete | Paginated table |
| Gig list | ✅ Complete | Paginated table |
| Settings | ❌ Stub | Placeholder |
| User actions | ❌ Missing | Verify, ban |
| Gig actions | ❌ Missing | Moderate |

---

## Web App: Features to Build

### 1. Application Tracking Page
**Route:** `/applications`

**User Story:** As an artist, I want to see all my submitted applications and their status.

**UI Components:**
- Tab navigation: All | Pending | Accepted | Rejected
- Application card with:
  - Gig title, date, location
  - My bid amount
  - Status badge (color-coded)
  - Client info (name, avatar)
  - Date applied
  - Action buttons (Withdraw, View Gig, Message)
- Empty state for each tab
- Loading skeleton

**Data Needed:**
```typescript
GET /applications/my?status=PENDING
Response: {
  data: Application[],
  meta: { total, page, pages }
}
```

---

### 2. Profile Editing
**Route:** `/profile/edit`

**User Story:** As a user, I want to update my profile information.

**UI Components:**
- Avatar upload with preview
- Form sections:
  - Basic Info (name, bio, phone)
  - Artist-specific (genres, skills, experience, hourly rate)
  - Client-specific (company name, type)
  - Social links
- Save button with loading state
- Success/error feedback

**Data Needed:**
```typescript
PATCH /users/me
Body: UpdateProfileDto
```

---

### 3. Artist Portfolio Page
**Route:** `/profile` (enhanced) or `/portfolio`

**User Story:** As an artist, I want to showcase my work samples.

**UI Components:**
- Portfolio grid (images, audio, videos)
- Add media button
- Media upload modal:
  - Drag & drop zone
  - Type selection (audio/image/video)
  - Title, description fields
- Reorder capability (drag)
- Delete with confirmation
- Audio player for samples
- Video embed/player

**Data Needed:**
```typescript
POST /upload/audio
POST /upload/image
PATCH /users/me/portfolio
```

---

### 4. Messaging/Chat Interface
**Route:** `/messages` and `/messages/:conversationId`

**User Story:** As a user, I want to communicate with artists/clients about gigs.

**UI Components:**
- Conversation list (left sidebar on desktop):
  - User avatar, name
  - Last message preview
  - Unread count badge
  - Timestamp
- Chat area (right side):
  - Header with user info
  - Message bubbles (mine vs theirs)
  - Message input with send button
  - Typing indicator
  - Scroll to bottom on new message
- Empty state (no conversations)
- Start conversation from gig/application

**Real-time:**
- WebSocket connection
- New message events
- Typing indicators
- Read receipts

**Data Needed:**
```typescript
GET /conversations
GET /conversations/:id/messages
POST /conversations/:id/messages
WebSocket: message:new, message:typing
```

---

### 5. Notifications Center
**Route:** `/notifications` or dropdown

**User Story:** As a user, I want to see all my notifications.

**UI Components:**
- Bell icon with unread count in header
- Dropdown panel (desktop):
  - Notification list
  - Mark all as read
  - View all link
- Full page (mobile):
  - Notification cards
  - Swipe to dismiss
- Notification item:
  - Icon by type
  - Title, description
  - Timestamp
  - Read/unread state
  - Click to navigate

**Data Needed:**
```typescript
GET /notifications?page=1&limit=20
PATCH /notifications/:id/read
PATCH /notifications/read-all
```

---

### 6. Payment Flow
**Routes:** Part of gig acceptance flow

**User Story:** As a client, I want to pay for an accepted artist's services.

**UI Components:**
- Accept bid confirmation dialog
- Payment summary:
  - Artist's bid amount
  - Platform fee breakdown
  - GST
  - Total amount
- Razorpay checkout integration
- Loading state during payment
- Success confirmation page
- Failed payment retry option

**Integration:**
```typescript
POST /payments/create-order
→ Get razorpayOrderId
→ Open Razorpay checkout
→ On success: POST /payments/verify
```

---

### 7. Wallet & Earnings (Artist)
**Route:** `/wallet`

**User Story:** As an artist, I want to see my earnings and request payouts.

**UI Components:**
- Balance overview:
  - Pending (in escrow)
  - Available (can withdraw)
  - Total earnings
- Transaction history:
  - Type icon
  - Description
  - Amount (+/-)
  - Date
  - Balance after
- Payout request button
- Bank account management:
  - Add/edit bank details
  - Verification status
- Payout history

**Data Needed:**
```typescript
GET /wallet
GET /wallet/transactions
POST /wallet/payout-request
POST /wallet/bank-account
```

---

### 8. Reviews & Ratings
**Routes:** `/reviews/pending`, review UI on gig page

**User Story:** As a user, I want to leave reviews after gigs.

**UI Components:**
- Pending reviews banner (after gig)
- Review modal:
  - Star rating (1-5)
  - Optional detailed ratings
  - Comment textarea
  - Submit button
- Reviews on profile:
  - Average rating display
  - Rating distribution
  - Review cards
  - Response option
- Reviews on gig page (completed gigs)

**Data Needed:**
```typescript
GET /reviews/pending
POST /reviews
GET /reviews/user/:id
```

---

### 9. Advanced Search & Filters
**Route:** `/gigs` (enhanced)

**User Story:** As a user, I want to find gigs with specific criteria.

**UI Components:**
- Filter sidebar/drawer:
  - City dropdown (with search)
  - Category multi-select
  - Genre multi-select
  - Budget range slider
  - Date range picker
  - Only show: Live gigs toggle
- Active filter chips
- Clear all filters button
- Sort dropdown:
  - Date (newest/soonest)
  - Budget (high/low)
  - Posted (recent)
- Result count display
- URL-synced filters (nuqs)

**Data Needed:**
```typescript
GET /gigs?city=Mumbai&category=DJ&budgetMin=5000&budgetMax=20000&dateFrom=2024-01-01
GET /gigs/cities  // For city dropdown
```

---

### 10. Settings Page
**Route:** `/settings`

**User Story:** As a user, I want to manage my account settings.

**UI Components:**
- Navigation tabs:
  - Account
  - Notifications
  - Privacy
  - Security
- Account section:
  - Email/phone display
  - Change password (if email login)
- Notifications section:
  - Push notifications toggle
  - Email notifications toggle
  - Per-category toggles
- Privacy section:
  - Profile visibility
  - Show email/phone
- Security section:
  - Active sessions
  - Logout all devices
  - Delete account

**Data Needed:**
```typescript
GET /notifications/preferences
PATCH /notifications/preferences
PATCH /users/me/settings
DELETE /users/me  // Account deletion
```

---

## Admin App: Features to Build

### 1. User Detail & Actions
**Route:** `/users/:id`

**UI Components:**
- User profile display
- Action buttons:
  - Verify User
  - Ban User
  - Suspend User
  - Reset Password
- Activity log
- Gigs posted (if client)
- Applications (if artist)
- Reviews received

---

### 2. User Moderation Queue
**Route:** `/users/pending`

**UI Components:**
- List of unverified users
- Quick action buttons
- Document upload review (KYC)
- Approve/Reject workflow
- Rejection reason input

---

### 3. Gig Moderation
**Route:** `/gigs/:id` (enhanced)

**UI Components:**
- Gig details view
- Applications list
- Action buttons:
  - Approve (if draft)
  - Reject
  - Flag
  - Delete
- Moderation notes
- Status history

---

### 4. Content Flagging Queue
**Route:** `/moderation`

**UI Components:**
- Flagged content list:
  - Gigs
  - Reviews
  - Messages (if reported)
- Flag reason display
- Quick actions:
  - Remove content
  - Warn user
  - Ban user
  - Dismiss flag

---

### 5. Analytics Dashboard
**Route:** `/` (enhanced)

**UI Components:**
- Charts:
  - User signups over time
  - Gigs posted over time
  - Completed bookings
  - Revenue (platform fees)
- Top cities
- Top categories
- Recent activity feed
- Key metrics with trends

---

### 6. Dispute Resolution
**Route:** `/disputes`

**UI Components:**
- Active disputes list
- Dispute details:
  - Gig info
  - Both parties info
  - Messages/evidence
  - Timeline
- Resolution actions:
  - Release to artist
  - Refund to client
  - Partial refund

---

### 7. Settings Management
**Route:** `/settings` (enhanced)

**UI Components:**
- Platform settings:
  - Commission percentage
  - Minimum payout
  - Escrow hold period
- Email templates
- Notification settings
- API keys management

---

## Component Library Additions

### New UI Components Needed:
| Component | Package | Purpose |
|-----------|---------|---------|
| DatePicker | Custom or radix | Date selection |
| Slider | radix-ui/slider | Budget range |
| Tabs | radix-ui/tabs | Tab navigation |
| Avatar Upload | Custom | Profile pictures |
| Audio Player | Custom | Portfolio playback |
| Star Rating | Custom | Reviews |
| Chat Bubble | Custom | Messages |
| Skeleton | Custom | Loading states |
| Toast | sonner | Notifications |
| Modal/Sheet | radix-ui/dialog | Mobile modals |
| Dropdown Menu | radix-ui/dropdown | Actions menu |

### Recommended Packages:
```json
{
  "dependencies": {
    "@radix-ui/react-tabs": "^1.0.0",
    "@radix-ui/react-slider": "^1.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-avatar": "^1.0.0",
    "sonner": "^1.0.0",
    "react-dropzone": "^14.0.0",
    "date-fns": "^3.0.0",
    "socket.io-client": "^4.0.0"
  }
}
```

---

## State Management Plan

### Jotai Atoms to Create:
```typescript
// auth.ts (existing)
tokenAtom

// notifications.ts (new)
unreadCountAtom
notificationsAtom

// chat.ts (new)
conversationsAtom
activeConversationAtom
messagesAtom
typingUsersAtom

// filters.ts (new)
gigFiltersAtom

// wallet.ts (new)
walletBalanceAtom
```

### React Query Keys:
```typescript
// Standardized query keys
['auth', 'user']
['gigs', filters]
['gigs', id]
['applications', 'my', status]
['conversations']
['conversations', id, 'messages']
['notifications', page]
['wallet']
['wallet', 'transactions']
['reviews', 'user', userId]
['reviews', 'pending']
```

---

## Routing Structure

### Web App Routes:
```
/                           # Home
/login                      # Login/Signup
/gigs                       # Browse gigs
/gigs/new                   # Create gig
/gigs/:id                   # Gig details
/gigs/:id/edit              # Edit gig (owner)
/applications               # My applications (artist)
/my-gigs                    # My gigs (client)
/messages                   # Conversations list
/messages/:id               # Chat
/notifications              # All notifications
/profile                    # My profile
/profile/edit               # Edit profile
/profile/portfolio          # Manage portfolio (artist)
/wallet                     # Earnings & payouts (artist)
/settings                   # Settings
/u/:userId                  # Public user profile
```

### Admin Routes:
```
/                           # Dashboard
/login                      # Admin login
/users                      # User list
/users/pending              # Pending verification
/users/:id                  # User detail
/gigs                       # Gig list
/gigs/:id                   # Gig detail
/applications               # All applications
/disputes                   # Dispute queue
/moderation                 # Flagged content
/settings                   # Platform settings
```

---

## Mobile-First Design Considerations

### Responsive Breakpoints:
```css
/* Mobile first */
sm: 640px   /* Large phones */
md: 768px   /* Tablets */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
```

### Mobile-Specific UI:
| Desktop | Mobile |
|---------|--------|
| Sidebar navigation | Bottom navigation |
| Filter sidebar | Filter drawer/modal |
| Split view chat | Full screen chat |
| Dropdown menus | Bottom sheets |
| Hover states | Tap states |
| Tables | Cards/lists |

### PWA Enhancements:
- [ ] Add to home screen prompt
- [ ] Offline page
- [ ] Background sync for messages
- [ ] Push notification permission
- [ ] App-like navigation (no browser chrome)

---

## Performance Optimization

### Code Splitting:
```typescript
// Lazy load heavy pages
const Chat = dynamic(() => import('./pages/chat'), { ssr: false })
const Wallet = dynamic(() => import('./pages/wallet'))
```

### Image Optimization:
- Use Next.js Image component
- Cloudinary transformations for thumbnails
- Lazy load below-fold images
- WebP format with fallback

### Caching Strategy:
- TanStack Query stale times
- Service worker caching (PWA)
- Static page generation where possible

---

## Testing Plan

### Unit Tests:
- Utility functions
- Custom hooks
- State atoms

### Component Tests:
- Form validation
- User interactions
- Loading/error states

### E2E Tests (Playwright):
- Login flow
- Gig creation
- Application flow
- Payment flow
- Chat flow

### Test Priority:
1. Payment flow (critical)
2. Authentication
3. Gig CRUD
4. Application flow
5. Messaging

---

## Build Order by Sprint

### Sprint 1-2: Infrastructure
- [ ] File upload integration
- [ ] Image display in gigs
- [ ] Profile picture upload
- [ ] Basic skeleton loaders

### Sprint 3: Notifications
- [ ] Notification bell icon
- [ ] Notification dropdown
- [ ] Notification page
- [ ] Push notification permission

### Sprint 4: Payments
- [ ] Payment summary component
- [ ] Razorpay checkout integration
- [ ] Payment success/failure pages
- [ ] Transaction history

### Sprint 5: Wallet
- [ ] Wallet dashboard
- [ ] Transaction list
- [ ] Payout request flow
- [ ] Bank account form

### Sprint 6: Messaging
- [ ] Conversation list
- [ ] Chat interface
- [ ] WebSocket integration
- [ ] Typing indicators

### Sprint 7: Reviews
- [ ] Review prompt
- [ ] Review form
- [ ] Rating display
- [ ] Reviews list

### Sprint 8: Profile & Search
- [ ] Profile editor
- [ ] Portfolio manager
- [ ] Advanced filters
- [ ] Search improvements

### Sprint 9: Admin
- [ ] User actions
- [ ] Moderation queue
- [ ] Analytics charts
- [ ] Settings forms

### Sprint 10: Polish
- [ ] Loading states
- [ ] Error handling
- [ ] Empty states
- [ ] Mobile optimizations
- [ ] Accessibility audit

---

## Design System Notes

### Colors (Dark Theme):
```css
--background: #09090b       /* zinc-950 */
--foreground: #fafafa       /* zinc-50 */
--primary: #6366f1          /* indigo-500 */
--primary-hover: #4f46e5    /* indigo-600 */
--secondary: #27272a        /* zinc-800 */
--muted: #71717a            /* zinc-500 */
--success: #22c55e          /* green-500 */
--warning: #f59e0b          /* amber-500 */
--error: #ef4444            /* red-500 */
```

### Typography:
- Font: Geist (already configured)
- Headings: Bold, larger sizes
- Body: Regular, readable line height
- Captions: Smaller, muted color

### Spacing:
- Use Tailwind spacing scale
- Consistent padding: 4, 6, 8
- Card padding: 4-6
- Section spacing: 8-12

---

Ready to start building any of these features? Let me know which one to tackle first!
