# ZTS Music Platform - Infrastructure Decisions

> Key technology choices and trade-offs

---

## 1. Payment Gateway

### Options Comparison

| Criteria | Razorpay | Stripe | PayU |
|----------|----------|--------|------|
| **India Focus** | ✅ Excellent | ⚠️ Limited | ✅ Good |
| **Documentation** | ✅ Great | ✅ Excellent | ⚠️ Average |
| **UPI Support** | ✅ Native | ❌ No | ✅ Yes |
| **Pricing** | 2% per txn | 2.9% + ₹3 | 2% per txn |
| **Payouts** | ✅ Razorpay X | ⚠️ Manual | ⚠️ Limited |
| **Setup Time** | 1-3 days | 1-2 weeks | 3-5 days |
| **Escrow Support** | ✅ Route | ⚠️ Connect | ❌ No |
| **Min KYC** | PAN + Bank | GST required | PAN + Bank |

### Recommendation: **Razorpay**

**Why:**
1. Best for India market (UPI, Netbanking, Cards)
2. Razorpay X for easy artist payouts
3. Route API for escrow/split payments
4. Quick setup, good documentation
5. Lower fees for domestic transactions

### Razorpay Products to Use:
| Product | Purpose |
|---------|---------|
| **Payment Gateway** | Accept payments from clients |
| **Razorpay X** | Payout to artists (bank transfer) |
| **Route** | Split payments (artist + platform fee) |

### Implementation Steps:
1. Create Razorpay account (business)
2. Complete KYC (PAN, Bank account, address proof)
3. Get API keys (test + live)
4. Integrate Standard Checkout
5. Set up webhooks for payment events
6. Integrate Razorpay X for payouts
7. Test with test cards/UPI

---

## 2. File Storage

### Options Comparison

| Criteria | Cloudinary | AWS S3 | Firebase Storage |
|----------|------------|--------|------------------|
| **Image Optimization** | ✅ Built-in | ❌ Need Lambda | ❌ Manual |
| **Transformations** | ✅ URL-based | ❌ No | ❌ No |
| **Audio Support** | ⚠️ Limited | ✅ Full | ✅ Full |
| **CDN** | ✅ Included | ⚠️ CloudFront extra | ✅ Included |
| **Free Tier** | 25GB + 25K transforms | 5GB | 5GB |
| **Pricing** | Pay per transform | Very cheap storage | Moderate |
| **SDK** | ✅ Node.js | ✅ Node.js | ✅ Already using |

### Recommendation: **Hybrid Approach**

| File Type | Storage | Reason |
|-----------|---------|--------|
| **Images** | Cloudinary | Auto-optimization, thumbnails, transformations |
| **Audio** | AWS S3 | Cheaper for large files, streaming support |
| **Documents** | AWS S3 | Simple storage, cost-effective |

### Cloudinary Configuration:
```
- Auto format (webp for modern browsers)
- Auto quality (compression)
- Max image size: 5MB upload → optimize to ~200KB
- Generate thumbnails: 150x150, 400x400, 800x800
- Face detection for profile pics
```

### S3 Configuration:
```
- Bucket: zts-music-files
- Region: ap-south-1 (Mumbai)
- Folders: /audio, /documents
- Max upload: 50MB (audio), 10MB (docs)
- CloudFront CDN for delivery
- Presigned URLs for uploads
```

### Implementation Steps:
1. Create Cloudinary account
2. Create AWS account + S3 bucket
3. Set up CloudFront distribution
4. Configure CORS on S3
5. Create upload service with Multer
6. Add file validation (type, size)
7. Implement cleanup for orphaned files

---

## 3. Email Service

### Options Comparison

| Criteria | SendGrid | Mailgun | AWS SES |
|----------|----------|---------|---------|
| **Free Tier** | 100/day forever | 5K/month (3 months) | 62K/month (EC2) |
| **Deliverability** | ✅ Excellent | ✅ Very Good | ⚠️ Needs warmup |
| **Templates** | ✅ Visual editor | ✅ Templates | ⚠️ Basic |
| **Analytics** | ✅ Full | ✅ Full | ⚠️ Basic |
| **API** | ✅ Excellent | ✅ Good | ⚠️ Complex |
| **Pricing** | $15/40K emails | $35/50K emails | $0.10/1K emails |
| **Setup** | 1 day | 1 day | 2-3 days |

### Recommendation: **SendGrid**

**Why:**
1. Best free tier for starting (100 emails/day = 3000/month)
2. Excellent deliverability
3. Easy template management
4. Great Node.js SDK
5. Scales well as you grow

### Email Templates Needed:
| Template | Variables | Trigger |
|----------|-----------|---------|
| **welcome** | name, role | Signup complete |
| **gig-posted** | gigTitle, gigCity, gigDate | Gig published |
| **new-application** | artistName, gigTitle, bidAmount | Artist applies |
| **application-accepted** | gigTitle, clientName, amount | Bid accepted |
| **application-rejected** | gigTitle | Bid rejected |
| **payment-received** | amount, gigTitle | Payment success |
| **payout-sent** | amount, bankLast4 | Payout complete |
| **gig-reminder** | gigTitle, venue, dateTime | 24h before gig |
| **review-request** | gigTitle, otherPartyName | 24h after gig |

### Implementation Steps:
1. Create SendGrid account
2. Verify sender domain (DNS records)
3. Create API key
4. Design email templates (Handlebars)
5. Create email service with queue
6. Set up tracking (opens, clicks)
7. Handle bounces and unsubscribes

---

## 4. Caching (Redis)

### Options Comparison

| Criteria | Redis Cloud | AWS ElastiCache | Upstash |
|----------|-------------|-----------------|---------|
| **Free Tier** | 30MB | None | 10K requests/day |
| **Managed** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Persistence** | ✅ Yes | ✅ Yes | ✅ Yes |
| **India Region** | ✅ Mumbai | ✅ Mumbai | ❌ No |
| **Setup** | Easy | Complex | Very Easy |
| **Pricing** | $5/100MB | $15+/node | Pay per request |

### Recommendation: **Redis Cloud (Free Tier) → Upstash for Production**

**Why:**
1. Redis Cloud: 30MB free, sufficient for development
2. Upstash: Serverless, pay-per-use, great for variable traffic
3. Both: Zero server management

### What to Cache:
| Data | TTL | Invalidation |
|------|-----|--------------|
| Gig listings | 5 min | On create/update/delete |
| Gig details | 10 min | On update |
| User profiles (public) | 15 min | On update |
| Available cities | 1 hour | On new gig city |
| Search results | 5 min | Time-based |
| Session data | 24 hours | On logout |
| Rate limiting | 1 min | Auto-expire |

### Redis Uses:
| Use Case | Purpose |
|----------|---------|
| **API Caching** | Cache GET responses |
| **Session Store** | Store JWT sessions |
| **Rate Limiting** | Track request counts |
| **Job Queue** | Bull queue backend |
| **Real-time** | Pub/sub for WebSocket |

### Implementation Steps:
1. Create Redis Cloud account
2. Create free 30MB database
3. Get connection string
4. Install cache-manager-redis-store
5. Configure NestJS CacheModule
6. Add cache decorators to endpoints
7. Implement cache invalidation

---

## 5. Job Queue

### Options Comparison

| Criteria | Bull (Redis) | Agenda (MongoDB) | AWS SQS |
|----------|--------------|------------------|---------|
| **Backend** | Redis | MongoDB | AWS |
| **NestJS Support** | ✅ @nestjs/bull | ⚠️ Manual | ⚠️ Manual |
| **Dashboard** | ✅ Bull Board | ⚠️ Agendash | ⚠️ AWS Console |
| **Retry Logic** | ✅ Built-in | ✅ Built-in | ✅ Built-in |
| **Scheduling** | ✅ Cron | ✅ Cron | ❌ No |
| **Priority** | ✅ Yes | ✅ Yes | ✅ FIFO |

### Recommendation: **Bull with Redis**

**Why:**
1. Native NestJS integration (@nestjs/bull)
2. Already using Redis for caching
3. Great monitoring with Bull Board
4. Supports retries, delays, priorities
5. Cron-like scheduling

### Queues to Create:
| Queue | Purpose | Priority | Retry |
|-------|---------|----------|-------|
| **email** | Send emails | Normal | 3 times |
| **notification** | Push notifications | High | 2 times |
| **payment** | Process payments | Critical | 5 times |
| **payout** | Artist payouts | Normal | 3 times |
| **cleanup** | File cleanup, expired data | Low | 1 time |
| **analytics** | Track events | Low | 0 |

### Implementation Steps:
1. Install @nestjs/bull and bull
2. Configure Bull with Redis connection
3. Create queue module
4. Define job processors
5. Add Bull Board for monitoring
6. Set up retry policies
7. Handle failed jobs

---

## 6. Real-time Communication

### Options Comparison

| Criteria | Socket.io | Pusher | Firebase RTDB |
|----------|-----------|--------|---------------|
| **Self-hosted** | ✅ Yes | ❌ SaaS | ❌ SaaS |
| **NestJS** | ✅ @nestjs/websockets | ⚠️ SDK | ⚠️ SDK |
| **Scaling** | ⚠️ Need Redis | ✅ Auto | ✅ Auto |
| **Free Tier** | N/A | 200K msg/day | 1GB storage |
| **Pricing** | Server cost | $50/1M msg | Pay per ops |
| **Features** | Full control | Presence, Channels | Sync, Offline |

### Recommendation: **Socket.io with Redis Adapter**

**Why:**
1. Full control over implementation
2. NestJS native support
3. No per-message cost
4. Can scale with Redis adapter
5. Existing Firebase for auth only

### Socket.io Events:
| Event | Direction | Purpose |
|-------|-----------|---------|
| `message:send` | Client → Server | Send message |
| `message:new` | Server → Client | New message received |
| `message:typing` | Both | Typing indicator |
| `message:read` | Client → Server | Mark as read |
| `notification:new` | Server → Client | New notification |
| `user:online` | Server → Client | User came online |

### Implementation Steps:
1. Install @nestjs/websockets and socket.io
2. Create WebSocket gateway
3. Add authentication middleware
4. Implement chat events
5. Add Redis adapter for scaling
6. Handle reconnection logic
7. Implement heartbeat/ping

---

## 7. Push Notifications

### Options Comparison

| Criteria | Firebase FCM | OneSignal | AWS SNS |
|----------|--------------|-----------|---------|
| **Free** | ✅ Unlimited | 10K subscribers | Pay per msg |
| **Web Push** | ✅ Yes | ✅ Yes | ⚠️ Limited |
| **Mobile** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Already Using** | ✅ Firebase Auth | ❌ New service | ❌ New service |
| **Segmentation** | ⚠️ Manual | ✅ Built-in | ⚠️ Limited |

### Recommendation: **Firebase Cloud Messaging (FCM)**

**Why:**
1. Already using Firebase for auth
2. Completely free
3. Works on web and mobile
4. Good SDK for Node.js
5. Reliable delivery

### Implementation Steps:
1. Enable FCM in Firebase console
2. Generate server key
3. Add firebase-admin to backend
4. Create notification service
5. Store FCM tokens on frontend
6. Send to backend on login
7. Handle token refresh

---

## 8. SMS Service (Optional)

### Options Comparison

| Criteria | MSG91 | Twilio | AWS SNS |
|----------|-------|--------|---------|
| **India Focus** | ✅ Best | ⚠️ Expensive | ⚠️ Limited |
| **DLT Compliance** | ✅ Handled | ⚠️ Manual | ⚠️ Manual |
| **Free Credits** | 5000 SMS | $15 | None |
| **Per SMS** | ₹0.15-0.25 | ₹0.50+ | ₹0.50+ |
| **OTP Support** | ✅ Built-in | ✅ Verify | ❌ Manual |

### Recommendation: **MSG91 (if needed)**

**Note:** Firebase Phone Auth handles OTP already. SMS service only needed for:
- Transactional alerts (payment received, gig reminder)
- If users have no internet

### Decision: **Skip for MVP, add later if needed**

---

## 9. Monitoring & Error Tracking

### Options Comparison

| Criteria | Sentry | LogRocket | Datadog |
|----------|--------|-----------|---------|
| **Error Tracking** | ✅ Excellent | ✅ Good | ✅ Excellent |
| **Session Replay** | ⚠️ Limited | ✅ Best | ✅ Yes |
| **Free Tier** | 5K errors/mo | 1K sessions/mo | 14-day trial |
| **Backend** | ✅ Node.js | ❌ Frontend only | ✅ Full stack |
| **APM** | ⚠️ Basic | ❌ No | ✅ Full |

### Recommendation: **Sentry (Free Tier)**

**Why:**
1. 5K errors/month free
2. Works on both frontend and backend
3. Great error grouping and context
4. Source map support
5. Release tracking

### Implementation Steps:
1. Create Sentry account
2. Create projects (backend, web, admin)
3. Install @sentry/node and @sentry/nextjs
4. Configure DSN
5. Add error boundaries (React)
6. Tag releases
7. Set up alerts

---

## 10. Deployment

### Options Comparison

| Criteria | Railway | Render | AWS |
|----------|---------|--------|-----|
| **Ease** | ✅ Very Easy | ✅ Easy | ⚠️ Complex |
| **Free Tier** | $5 credit/mo | 750 hrs/mo | 12 months |
| **Auto Deploy** | ✅ GitHub | ✅ GitHub | ⚠️ CodePipeline |
| **Database** | ✅ Managed | ✅ Managed | ⚠️ Setup needed |
| **Scaling** | ✅ Auto | ✅ Auto | ✅ Full control |
| **India Region** | ❌ No | ❌ No | ✅ Mumbai |

### Recommendation: **Railway for Start → AWS for Scale**

**Phase 1 (MVP):**
- Railway for backend
- Vercel for frontend (Next.js)
- MongoDB Atlas (free tier)
- Redis Cloud (free tier)

**Phase 2 (Scale):**
- AWS ECS/EKS for backend
- Vercel or AWS Amplify for frontend
- MongoDB Atlas (dedicated)
- AWS ElastiCache

---

## Summary: Recommended Stack

| Component | Choice | Free Tier | Cost at Scale |
|-----------|--------|-----------|---------------|
| **Payment** | Razorpay | N/A | 2% per txn |
| **Images** | Cloudinary | 25GB | ~$89/mo |
| **Audio/Files** | AWS S3 | 5GB | ~$5/mo |
| **Email** | SendGrid | 100/day | $15/mo |
| **Cache/Queue** | Redis Cloud/Upstash | 30MB | ~$10/mo |
| **Push** | Firebase FCM | Unlimited | Free |
| **Real-time** | Socket.io | N/A | Server cost |
| **Errors** | Sentry | 5K/mo | $26/mo |
| **Backend Host** | Railway | $5/mo | ~$20/mo |
| **Frontend Host** | Vercel | Unlimited | Free/Pro |
| **Database** | MongoDB Atlas | 512MB | ~$50/mo |

**Estimated Monthly Cost:**
- MVP/Free Tier: **~$0-20/month**
- 1000 users: **~$100-150/month**
- 10000 users: **~$300-500/month**

---

## Action Items

### Accounts to Create:
1. [ ] Razorpay Business Account
2. [ ] Cloudinary Account
3. [ ] AWS Account (for S3)
4. [ ] SendGrid Account
5. [ ] Redis Cloud Account
6. [ ] Sentry Account
7. [ ] Railway Account (for deployment)

### Environment Variables to Set:
```env
# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Redis
REDIS_URL=

# Sentry
SENTRY_DSN=

# Platform
PLATFORM_FEE_PERCENT=15
MIN_PAYOUT_AMOUNT=500
```

---

## Questions to Answer Before Starting

1. **Commission Model:**
   - What % platform fee? (Recommendation: 15%)
   - Who pays fee - client or deduct from artist?
   - GST on platform fee?

2. **Payout Policy:**
   - Minimum payout amount? (Recommendation: ₹500)
   - Payout frequency? (Recommendation: On-demand after 24h of gig)
   - Hold period after gig? (Recommendation: 24 hours)

3. **Escrow Policy:**
   - How long to hold after gig? (Recommendation: 24h auto-release)
   - Dispute window? (Recommendation: 7 days)
   - Cancellation refund policy?

4. **File Limits:**
   - Max images per gig? (Recommendation: 5)
   - Max portfolio items? (Recommendation: 10)
   - Max audio duration? (Recommendation: 5 minutes)

5. **Review Policy:**
   - Review window after gig? (Recommendation: 14 days)
   - Both reviews before visible? (Recommendation: Yes, or 14 days)
   - Allow review responses? (Recommendation: Yes)

Let me know your answers and we can finalize the implementation!
