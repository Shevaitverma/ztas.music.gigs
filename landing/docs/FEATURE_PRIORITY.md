# ZTS Music Platform - Feature Prioritization Matrix

> What to build first and why

---

## Priority Framework

Features are scored on:
- **Impact** (1-5): How much value does this add to users/business?
- **Effort** (1-5): How long/complex to build? (1=easy, 5=hard)
- **Risk** (1-5): What's the risk of NOT having this?
- **Dependencies**: What must be built first?

**Priority Score** = (Impact × 2 + Risk × 2) / Effort

---

## P0: Launch Blockers

> Cannot launch without these

| Feature | Impact | Effort | Risk | Score | Why Critical |
|---------|--------|--------|------|-------|--------------|
| **Rate Limiting** | 3 | 1 | 5 | 16 | Security, abuse prevention |
| **File Uploads** | 5 | 3 | 5 | 6.7 | Gig images, profiles don't work |
| **Payment Gateway** | 5 | 4 | 5 | 5 | Cannot monetize |
| **Email Service** | 4 | 2 | 5 | 9 | Zero user engagement |
| **Basic Notifications** | 4 | 3 | 4 | 5.3 | Users miss opportunities |

### P0 Build Order:
```
Week 1: Rate Limiting → File Uploads
Week 2: Email Service → Redis Setup
Week 3-4: Payment Gateway (Razorpay)
Week 5: Basic Notifications
```

---

## P1: Core Experience

> Essential for good user experience

| Feature | Impact | Effort | Risk | Score | Why Important |
|---------|--------|--------|------|-------|---------------|
| **Escrow System** | 5 | 3 | 4 | 6 | Payment safety |
| **Artist Wallet & Payouts** | 5 | 4 | 4 | 4.5 | Artists need to get paid |
| **Application Tracking (Frontend)** | 4 | 2 | 4 | 8 | Artists can't see bid status |
| **Messaging System** | 5 | 4 | 4 | 4.5 | No communication channel |
| **Profile Completion** | 4 | 3 | 3 | 4.7 | Artists can't showcase work |
| **Reviews & Ratings** | 4 | 3 | 3 | 4.7 | No trust signals |

### P1 Build Order:
```
Week 5-6: Escrow System + Wallet
Week 6-7: Payouts
Week 7-8: Messaging System
Week 8-9: Reviews & Ratings
Week 9-10: Profile Completion + Application Tracking
```

---

## P2: Growth Features

> Important for user retention and growth

| Feature | Impact | Effort | Risk | Score | Why Needed |
|---------|--------|--------|------|-------|------------|
| **Push Notifications** | 4 | 2 | 3 | 7 | Mobile engagement |
| **Advanced Search/Filters** | 4 | 3 | 2 | 4 | Hard to find gigs |
| **Artist Portfolio** | 4 | 3 | 2 | 4 | Showcase talent |
| **Availability Calendar** | 3 | 3 | 2 | 3.3 | Prevent double booking |
| **Saved/Favorites** | 3 | 2 | 1 | 4 | Convenience |
| **Admin Moderation** | 4 | 4 | 3 | 3.5 | Content quality |

### P2 Build Order:
```
Week 10: Push Notifications
Week 11: Advanced Search
Week 12: Artist Portfolio
Week 12-13: Admin Moderation
```

---

## P3: Nice to Have

> Can launch without, add later

| Feature | Impact | Effort | Risk | Score | Notes |
|---------|--------|--------|------|-------|-------|
| **SMS Notifications** | 2 | 2 | 1 | 3 | Most users have internet |
| **Social Login (Apple)** | 2 | 2 | 1 | 3 | Google/Phone sufficient |
| **Invoice PDF** | 3 | 2 | 1 | 4 | Can email details instead |
| **Analytics Dashboard** | 3 | 4 | 1 | 2 | Use external tools |
| **Referral System** | 3 | 3 | 1 | 2.7 | Growth hack |
| **Multi-language** | 3 | 5 | 1 | 1.6 | English first |
| **Contracts/Agreements** | 3 | 4 | 2 | 2.5 | Legal later |

---

## Feature Dependency Graph

```
Rate Limiting (standalone)
    ↓
Redis Setup ─────────────────────┐
    ↓                            │
File Uploads ───────────────┐    │
    ↓                       │    │
Email Service               │    │
    ↓                       │    │
Job Queue (Bull) ←──────────┴────┘
    ↓
┌───────────────────────────────────────────┐
│                                           │
▼                                           ▼
Payment Gateway                       Notifications
    ↓                                       ↓
Escrow System                         Push (FCM)
    ↓
Wallet
    ↓
Payouts
    ↓
Reviews (after payment complete)

Messaging System (parallel, needs Redis)

Profile Completion (needs File Uploads)

Advanced Search (standalone)
```

---

## MVP Feature Set (Minimum to Launch)

### Must Have (Week 1-6):
- [x] Authentication (Firebase) ✅
- [x] User registration/login ✅
- [x] Gig CRUD ✅
- [x] Application/bidding ✅
- [x] Basic gig browsing ✅
- [ ] **Rate limiting**
- [ ] **File uploads (images)**
- [ ] **Email service (transactional)**
- [ ] **Payment gateway (Razorpay)**
- [ ] **Escrow system**

### Should Have (Week 7-10):
- [ ] Wallet & payouts
- [ ] In-app notifications
- [ ] Application tracking UI
- [ ] Basic messaging
- [ ] Profile editing

### Could Have (Week 11+):
- [ ] Reviews & ratings
- [ ] Push notifications
- [ ] Advanced search
- [ ] Artist portfolio

### Won't Have (V1):
- [ ] SMS notifications
- [ ] Video calls
- [ ] Multi-language
- [ ] Mobile apps (PWA first)
- [ ] AI recommendations

---

## User Journey Gaps

### Artist Journey:
| Step | Current State | Gap |
|------|---------------|-----|
| 1. Discover platform | ❌ No marketing | Landing page exists |
| 2. Sign up | ✅ Working | |
| 3. Complete profile | ⚠️ Basic only | No portfolio, no skills |
| 4. Browse gigs | ✅ Working | Limited filters |
| 5. Apply to gig | ✅ Working | |
| 6. Track application | ❌ Missing | Can't see status |
| 7. Get notified | ❌ Missing | No notifications |
| 8. Chat with client | ❌ Missing | No messaging |
| 9. Receive payment | ❌ Missing | No payments |
| 10. Get reviewed | ❌ Missing | No reviews |

### Client Journey:
| Step | Current State | Gap |
|------|---------------|-----|
| 1. Sign up | ✅ Working | |
| 2. Create gig | ✅ Working | No images |
| 3. Publish gig | ✅ Working | |
| 4. Receive applications | ⚠️ Can view | No notifications |
| 5. Review artist profiles | ⚠️ Basic | No portfolio, reviews |
| 6. Chat with artists | ❌ Missing | No messaging |
| 7. Accept bid | ✅ Working | |
| 8. Make payment | ❌ Missing | No payments |
| 9. Gig happens | N/A | |
| 10. Leave review | ❌ Missing | No reviews |

---

## Sprint Planning

### Sprint 1 (Week 1-2): Infrastructure
| Task | Points | Owner |
|------|--------|-------|
| Add rate limiting | 2 | Backend |
| Set up Redis | 3 | Backend |
| Implement file upload (Cloudinary) | 5 | Backend |
| Add image upload to gig form | 3 | Frontend |
| Profile picture upload | 3 | Frontend |

### Sprint 2 (Week 3-4): Email & Notifications
| Task | Points | Owner |
|------|--------|-------|
| Set up SendGrid | 3 | Backend |
| Create email templates | 5 | Backend |
| Set up Bull queue | 3 | Backend |
| Create Notification entity | 3 | Backend |
| Notification API endpoints | 3 | Backend |
| Notification UI | 5 | Frontend |

### Sprint 3 (Week 5-6): Payments
| Task | Points | Owner |
|------|--------|-------|
| Razorpay integration | 8 | Backend |
| Payment entity & service | 5 | Backend |
| Escrow entity & logic | 5 | Backend |
| Checkout UI | 5 | Frontend |
| Payment confirmation flow | 3 | Frontend |

### Sprint 4 (Week 7-8): Wallet & Messaging
| Task | Points | Owner |
|------|--------|-------|
| Wallet entity & service | 5 | Backend |
| Payout integration | 5 | Backend |
| Wallet UI | 5 | Frontend |
| Messaging entity & service | 5 | Backend |
| WebSocket gateway | 5 | Backend |
| Chat UI | 8 | Frontend |

### Sprint 5 (Week 9-10): Reviews & Polish
| Task | Points | Owner |
|------|--------|-------|
| Review entity & service | 5 | Backend |
| Review UI | 5 | Frontend |
| Application tracking UI | 5 | Frontend |
| Profile completion | 5 | Frontend |
| Bug fixes & testing | 8 | Both |

---

## Success Metrics

### Launch Criteria (MVP):
- [ ] 0 critical security issues
- [ ] Payment flow works end-to-end
- [ ] Email delivery rate > 95%
- [ ] Page load time < 3 seconds
- [ ] Error rate < 1%

### Post-Launch KPIs:
| Metric | Target (Month 1) | Target (Month 3) |
|--------|------------------|------------------|
| Registered users | 100 | 500 |
| Gigs posted | 20 | 100 |
| Applications | 50 | 300 |
| Completed bookings | 5 | 30 |
| Payment volume | ₹50,000 | ₹500,000 |
| Avg rating | 4.0+ | 4.2+ |

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Payment failures | Medium | High | Retry logic, manual resolution |
| Payout delays | Medium | High | Clear communication, track status |
| Disputes | Low | High | Clear policies, escrow period |
| Spam/abuse | Medium | Medium | Rate limiting, moderation |
| Low adoption | Medium | High | Focus on one city first |
| Technical debt | High | Medium | Code reviews, testing |

---

## Recommended Launch Strategy

### Phase 1: Soft Launch (Week 10-12)
- Limited to 1-2 cities (e.g., Mumbai, Bangalore)
- Invite-only (100 artists, 20 clients)
- Focus on feedback and bugs
- Manual processes where automation missing

### Phase 2: Public Beta (Week 12-16)
- Open registration
- Still limited cities
- Add features based on feedback
- Scale infrastructure as needed

### Phase 3: Full Launch (Week 16+)
- Pan-India
- Marketing push
- All features complete
- Mobile apps (if needed)

---

## Next Steps

1. **Confirm sprint plan** with team
2. **Set up project board** (GitHub Projects/Linear)
3. **Create accounts** (Razorpay, Cloudinary, SendGrid, Redis)
4. **Start Sprint 1**: Rate limiting + File uploads

Ready to start implementation?
