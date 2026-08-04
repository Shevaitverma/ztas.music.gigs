# Backend Migration Plan — Bun/TypeScript → Go

**Version:** 2.0 — **v1.0 failed cross-check. Read §0.5 before anything else.**
**Date:** 2026-08-04
**Source system:** `server/` — Bun 1.3 + Elysia 1.4 + Mongoose 9 + MongoDB Atlas, 18,257 LOC
**Target:** Production-grade Go 1.23+ service, containerised, observable, tested

---

## 0. Recommendation before you commit

**Stated once, then this plan proceeds as requested in full.**

The audit dated 2026-08-04 found that this product cannot collect a rupee, cannot deliver a notification, cannot complete a booking, and has never had a user. None of those failures is caused by TypeScript or Bun. A faithful rewrite of 18k LOC to Go is **14–20 engineer-weeks** during which the product gains **zero customer-visible capability** and the security fixes just landed must be re-implemented in a second language.

Three options, ranked by what I'd actually advise:

| | Approach | Time to revenue | Rewrite cost | Verdict |
|---|---|---|---|---|
| **A** | Keep Bun. Build payments/notifications now. | ~10 weeks | ₹0 | **Best business outcome** |
| **B** | **Strangler.** New services in Go (starting with payments); migrate existing modules behind a stable API as capacity allows. | ~12 weeks | Incremental, never blocking | **Best if Go is a firm requirement** — this plan is built for it |
| **C** | Big-bang rewrite, then resume features. | ~26 weeks | 14–20 weeks up front | Highest risk, ships nothing meanwhile |

**This plan implements B, with a defined path to complete replacement.** Option B gives you a genuinely Go backend, lets the payment layer be greenfield Go (the part that most benefits from a typed, concurrent, well-tooled runtime), and never leaves the product unshippable. If you want C instead, §12 gives the big-bang cutover variant — say so and I'll re-sequence.

**Non-negotiable regardless of option:** do not start until the three compatibility landmines in §4 have a written, tested answer. Each can silently corrupt production data.

---

## 0.5 Cross-check verdict — v1.0 was NOT safe to execute

Four independent reviewers (Go architecture, applied crypto, MongoDB/data, DevOps/SRE) were instructed to refute this plan. **All four returned "not safe as written."** The failures were not in the strategy — the strangler approach, the closed fix-list, and the §0 recommendation all survived. They were in the assumption that a shared-database migration is a rewrite. **It is not; it has entirely different failure modes, and v1.0 did not analyse them.**

### The finding that would have cost money

**The reverse-auction floor silently disappears in a naive Go port.** `grep "Types.ObjectId(" src/` returns **zero results** across 18k LOC — every ObjectId comparison in this codebase relies on Mongoose's implicit filter casting. Go's driver does none of it and, critically, **does not error — it matches nothing.**

So `getLowestBid(dto.gigId)` (`bids.service.ts:25`) with a string `gigId` returns `nil` in Go. `placeBid` then takes the `else` branch at `:107-113` — the "this is the first bid" path — and **the entire "must beat the current lowest" invariant vanishes.** An artist bids at `budget.max` against a standing lowest a fraction of that, and wins. No error, no log, and **no differential test catches it unless the fixtures happen to seed three competing bids on one gig.**

That is the product's core mechanic, defeated by a type coercion. Twelve further sites fail the same way — bidders 404 on gigs they bid on, "my bids" reads empty, check-in 404s every time, the outbid notification never fires.

**Mandatory:** one `mustObjectID(string)` at the **transport boundary**, never in the repository, plus a lint rule forbidding raw strings in filter construction. A malformed ID must become a 400 — Mongoose throws `CastError` today and the error plugin maps it to 4xx; Go's silence turns a 400 into a 200-with-empty-body.

### Corrections that must land before any Go code

| # | Finding | Why it's fatal |
|---|---|---|
| **C1** | **Missing `omitempty` on optional ObjectIDs** | Go marshals nil to **BSON null**, which is a *present* field. `bids.service.ts:399-400` claims a gig with `acceptedBid: {$exists: false}`. Every gig Go touches becomes **permanently unbookable by Bun** — silent, unrecoverable without a data fix. |
| **C2** | **Mongoose `autoIndex` is on** (`db/index.ts:8`) | Bun reissues `createIndexes` for every declared index on **every boot**. Any index `cmd/migrate` changes is recreated on the next Bun restart or scale-up. **The migration cannot hold.** One-line fix, must precede Phase 0. |
| **C3** | **The index count is ~85, not 38** | 38 is exactly the `schema.index()` calls. It misses ~47 **field-level** declarations — including the `venue.geoPoint` **2dsphere**, without which `$geoNear` (`gigs.service.ts:721`) **hard-errors** and nearby-search 500s; and `firebaseUid` **unique**, without which duplicate auth accounts become possible. Derive the list from `getIndexes()` on **production**, never from the models. |
| **C4** | **No backfill for `acceptedApplicant`** | Deleting it without backfilling `acceptedArtist` makes legacy-flow artists **404 on their own booked gig** and re-breaks the exact review bug fixed in the last commit. |
| **C5** | **The plan violates its own "no dual writes" rule** | Bun's scheduler writes gigs and bids (`scheduler.service.ts:207,217,282,335`) until **Phase 8** — four phases after Go takes ownership in Phase 4, including a non-transactional `status: COMPLETED` write that can land mid-`acceptBid`. Move the gig/bid-mutating jobs in Phase 4. |
| **C6** | **WebSocket fan-out is in-process** | `bids.routes.ts` uses Bun's `server.publish` — no Redis, no cross-process path. Go owning `POST /bids` in Phase 4 means **zero realtime for clients still on Bun until Phase 7 (~7.5 weeks of dead bid book)**. Worse, §2's in-memory hub contradicts §2.3's "stateless, horizontally scalable" — with 2+ replicas a bid on replica A never reaches a subscriber on replica B, **permanently, post-migration**. The hub must fan out over Redis from day one. |
| **C7** | **Secrets management is absent entirely** | Not one word across 15 sections. And `ENCRYPTION_KEY` has **no key identifier in the ciphertext**, so rotation requires decrypt-and-rewrite of every PII row under a global outage. This is greenfield — add a key-version byte now (`enc:v2:<keyid>:`) or it is irreversible after Phase 3. Also: `FIREBASE_PRIVATE_KEY` is a PEM with literal `\n` escapes that Node convention un-escapes and Go's `os.Getenv` does not. |
| **C8** | **`select: false` has no Go equivalent** | `password`, `refreshToken`, `loginAttempts` are excluded from every Mongoose query by default. Go returns them on every `FindOne`. The realistic failure is `json.Marshal` of a user struct into an API response — **leaking the argon2 hash and refresh-token SHA**. Use separate read models so it's a compile error. |
| **C9** | **The transaction sketch is v1 driver API** | `mongo.SessionContext` **was removed in v2**, which §2.1 mandates. More importantly the callback **runs multiple times** on retry — so no WS broadcast, no notification insert, no business-event log may happen inside it. Session propagation is also silent-fail: a repository closing over the wrong `ctx` executes **outside** the transaction with no error. |
| **C10** | **Three business-logic Mongoose hooks are unaccounted for** | `overallStatus` (both verification models) and report `priority` are **derived, persisted, and indexed**. Go writing a sub-status without recomputing leaves the record **invisible to the admin queue**. |

### The timeline was roughly half

18.5 engineer-weeks did not include the difftest harness (budgeted nowhere), BSON compatibility work, OpenAPI contract tests, or transport golden files for 101 routes. Reviewer estimate: **~32.5 engineer-weeks**, rising to **~42** if the team's Go experience is nil (R7 is still unanswered). Phases 1→2→3 are serially dependent, so a second engineer does not halve it. **Realistic calendar: 24–28 weeks, not 11–12.**

Note this makes v1.0 internally inconsistent: §0 prices a big-bang rewrite at 14–20 weeks, then offers a strangler at 18.5 — but a strangler is strictly *more* work than a big-bang (dual-running, difftest, per-phase cutover, rollback compatibility). **This materially strengthens the §0 recommendation: at genuinely zero users, the strangler machinery is several weeks of infrastructure protecting nobody.**

### The highest-leverage two days in the whole plan

A **`compat` test suite**, built in Phase 0: write each of the 11 documents from Go, read it in Bun, mutate it in Bun, read it back in Go, and assert **raw BSON equality** against a Bun-written fixture — field presence, BSON type codes, `__v`, subdocument `_id`s. That one suite mechanically catches C1, C8, C10 and the whole BSON-divergence class, and it is what converts "the strangler is risky" into "the strangler is verified."

### Also corrected in place

§3.1 constants verified (`IV_LENGTH`=12 ✅, prefix `enc:v1:`, AAD is field-path-only — `PROJECT_CONTEXT.md` was wrong); key derivation spec added; the legacy-fallback advice **reversed** (keep it — v1.0's "omit the branch" was a code-cleanliness argument applied to a data-loss risk, and it directly contradicts the rollback plan); §3.3 corrected from one JWT secret to **two**; §4.1's `EncryptedString` **retracted** — it could not decrypt (the unmarshaller never sees the AAD) and its "compile-time impossibility" claim was false, since `bson.M{"$set": ...}` takes `any`. Replaced with a `Sealed` type; estimate drops 1.5 weeks → ~2 days.

---

## 1. What actually has to move

Measured, not estimated:

| Dimension | Count | Notes |
|---|---|---|
| Route registrations | **114** | across 12 modules |
| Domain modules | 12 | admin 17, gigs 15, verification 12, bids 11, reviews 11, reports 10, auth 8, users 8, checkin 7, venues 6, notifications 5, applications 4 |
| Mongoose models | 13 | 2,042 LOC of schema |
| WebSocket gateways | 2 | `/ws/bids`, `/admin/ws` |
| `.populate()` call sites | **62** | ⚠️ no equivalent in Go — see §4.2 |
| Declared indexes | 38 | must be re-created explicitly |
| Aggregation pipelines | 15 | mechanical translation |
| Mongoose `pre`/`post` hooks | 37 | ⚠️ includes PII crypto — see §4.1 |
| Bun-specific API uses | 36 | `Bun.env` ×23, `Bun.nanoseconds` ×6, `Bun.password` ×3, `Bun.hash` ×2, `gzipSync`, `version` |
| Existing tests | 26 | ⚠️ near-zero real coverage — see §9 |

### Do NOT port (deleting is the cheapest migration)

The audit identified code that should not survive the rewrite. Porting it doubles its cost forever.

| Drop | Why | Saves |
|---|---|---|
| `applications` module + model | Dead duplicate of `bids`; forces dual cross-rejection in every accept path | ~470 LOC, 4 routes |
| `venues` module | No evident consumer; held the only unescaped-regex vuln | ~350 LOC, 6 routes |
| `Gig.acceptedApplicant` | Deprecated, still queried; root cause of the June review bug | schema drift |
| Admin analytics endpoints | Query wrong field names, return hardcoded zeros | ~3 routes |
| `performance.utils.ts` | `Bun.hash`/`Bun.nanoseconds` wrappers; Go stdlib covers this | ~90 LOC |
| Compression plugin | Reverse proxy / `gzip` middleware does this | ~50 LOC |

**Revised scope: ~101 routes, 10 modules, 11 models.** Agree this deletion list before writing Go, in writing.

---

## 2. Target architecture

Standard Go layout, no framework magic, no DI container.

```
server-go/
├── cmd/
│   ├── api/main.go              # HTTP + WS server entrypoint
│   ├── worker/main.go           # scheduler/jobs — separate process (see §2.3)
│   └── migrate/main.go          # index creation + data migrations
├── internal/
│   ├── config/                  # env parsing + validation, fail-fast
│   ├── httpx/                   # router setup, middleware chain, error mapping
│   │   ├── middleware/          # auth, cors, csrf, ratelimit, logging, recover
│   │   └── response/            # envelope + problem+json
│   ├── domain/                  # entities + interfaces. NO db/http imports.
│   │   ├── gig/  bid/  user/  review/  report/  checkin/  verification/
│   ├── store/mongo/             # repository impls, one file per aggregate
│   ├── service/                 # use-cases, orchestration, transactions
│   ├── transport/http/          # handlers: decode → validate → service → encode
│   ├── transport/ws/            # hub, client, rooms
│   ├── platform/
│   │   ├── crypto/              # AES-GCM PII, argon2, JWT
│   │   ├── firebase/            # ID token verification
│   │   ├── s3/                  # presigned URLs
│   │   ├── queue/               # asynq wrapper
│   │   └── obs/                 # otel, slog, sentry
│   └── job/                     # scheduler jobs as pure functions
├── migrations/                  # numbered, idempotent
├── api/openapi.yaml             # generated, contract-tested
├── Dockerfile
├── docker-compose.yml
└── Makefile
```

**Dependency rule, enforced in CI:** `domain` imports nothing from `store`, `transport`, or `platform`. Verified with `go-arch-lint` or a `depguard` linter rule. This is the single most valuable structural difference from the current codebase, where `bids.service.ts` imports Mongoose models directly and is therefore untestable without a database — the direct cause of the 2.8% coverage on core logic.

### 2.1 Library selection

Chosen for boring longevity, not benchmarks. Every pick is stdlib-adjacent and replaceable.

| Concern | Choice | Why this and not the alternative |
|---|---|---|
| Router | **`chi`** | `net/http`-native, `http.Handler` all the way down, no custom context. Gin/Fiber lock you into their types; Fiber isn't even `net/http`-compatible (fasthttp), which forfeits the middleware ecosystem and complicates HTTP/2. |
| Mongo | **official `mongo-go-driver` v2** | Only real option. Note: **no ODM.** No Mongoose equivalent exists and you should not want one — see §4. |
| Validation | **`go-playground/validator`** + hand-written decoders | Struct tags cover 90%; complex rules (bid amount vs gig budget) belong in the domain layer anyway, where they're testable. |
| Config | **`env` (caarlos0)** + fail-fast validation | Mirrors the existing `config/index.ts` fail-fast behaviour, which is good and must be preserved. |
| Logging | **`log/slog`** (stdlib) JSON handler | Structured, zero-dep, trace-correlatable. Replaces the bespoke `logger.service.ts`. |
| Tracing/metrics | **OpenTelemetry** → OTLP | The current system has *no* observability. §10. |
| Errors | **`sentry-go`** | Closes the "crashed replica keeps passing health checks" finding. |
| Jobs/scheduler | **`asynq`** (Redis) | Replaces in-process `setInterval`, which is the current hard scaling ceiling. Gives retries, idempotency, dead-letter, and leader-free distribution. |
| Rate limiting | **`redis_rate`** | Replaces the in-process `Map` — which the audit proved has *never executed* and would OOM behind a load balancer anyway. |
| WebSocket | **`coder/websocket`** | Modern, `context`-aware, no `gorilla` maintenance question. |
| Auth tokens | **`golang-jwt/jwt/v5`** | HS256 compatible with existing tokens. |
| Firebase | **`firebase.google.com/go/v4`** | Official; `VerifyIDToken` is a drop-in for the current use. |
| S3 | **`aws-sdk-go-v2`** + presigner | Direct equivalent. |
| Testing | stdlib `testing` + **`testify/require`** + **`testcontainers-go`** | Real MongoDB in tests. Non-negotiable given §4. |
| Migrations | hand-rolled `cmd/migrate` | 38 indexes + PII re-encryption. A library adds nothing here. |

**Deliberately rejected:** GORM (not for Mongo), Fiber (not `net/http`), Wire/fx (compile-time DI is unnecessary at this size — constructor injection in `main.go` is clearer), Echo (fine, but chi is thinner).

### 2.2 Concurrency and transactions

The audit found three data-corruption windows in `acceptBid` caused by compensating rollback instead of transactions. **Do not port that pattern.** Atlas is a replica set, so:

```go
func (s *BidService) Accept(ctx context.Context, bidID, userID string) (*domain.Bid, error) {
    sess, err := s.client.StartSession()
    if err != nil { return nil, err }
    defer sess.EndSession(ctx)

    out, err := sess.WithTransaction(ctx, func(sc mongo.SessionContext) (any, error) {
        // claim bid, claim gig, cross-reject siblings — all or nothing.
        // No rollback branch. No W1/W2/W3 windows.
    })
    ...
}
```
This single change eliminates the double-booking class the current comment claims to prevent but doesn't.

### 2.3 Process split

The current server runs HTTP, WebSockets, and three `setInterval` jobs in one process — so N replicas produce N concurrent sweeps. Split:

- `cmd/api` — stateless, horizontally scalable, no timers.
- `cmd/worker` — `asynq` consumer; scheduled jobs registered once, distributed by Redis. Scale independently.

---

## 3. Byte-exact compatibility contracts

The Go service must interoperate with **data written by the Bun service** and **tokens held by live clients**. These are not design choices; they are constraints. Each gets a golden-vector test (§9.2).

### 3.1 PII encryption — AES-256-GCM with AAD

Verified wire format from `crypto.ts:117-121`:

```
value = ENCRYPTED_PREFIX + base64( iv ‖ authTag ‖ ciphertext )
        AES-256-GCM, AAD = field-path string (e.g. "artistVerifications.identity.number")
```

Go equivalent — note `gcm.Seal` appends the tag *after* the ciphertext, so the order must be rewritten:

```go
func EncryptPII(plaintext, aad string, key []byte) (string, error) {
    block, err := aes.NewCipher(key)                      // key = 32 bytes
    if err != nil { return "", err }
    gcm, err := cipher.NewGCM(block)                      // 12-byte nonce, 16-byte tag
    if err != nil { return "", err }
    iv := make([]byte, gcm.NonceSize())
    if _, err := rand.Read(iv); err != nil { return "", err }

    sealed := gcm.Seal(nil, iv, []byte(plaintext), []byte(aad)) // = ciphertext‖tag
    ct, tag := sealed[:len(sealed)-16], sealed[len(sealed)-16:]

    payload := make([]byte, 0, len(iv)+16+len(ct))
    payload = append(payload, iv...)   // Node order: iv ‖ tag ‖ ciphertext
    payload = append(payload, tag...)
    payload = append(payload, ct...)
    return Prefix + base64.StdEncoding.EncodeToString(payload), nil
}
```

**✅ CONSTANTS NOW VERIFIED against source (were assumptions in v1.0):**

| Constant | Value | Source |
|---|---|---|
| `IV_LENGTH` | **12** — `cipher.NewGCM` is correct, `NewGCMWithNonceSize` NOT needed | `crypto.ts:20` |
| `AUTH_TAG_LENGTH` | **16** | `crypto.ts:21` |
| `ENCRYPTED_PREFIX` | **`enc:v1:`** (lowercase, trailing colon) | `crypto.ts:25` |
| Wire order | `iv ‖ tag ‖ ct` | `crypto.ts:123` |
| Base64 | standard, **padded** | `crypto.ts:123` |
| AAD | **field path only — NO userId suffix.** Exactly 6 literals | `artist-verification.model.ts:6-17`, `organizer-verification.model.ts:12-22` |

⚠️ **`PROJECT_CONTEXT.md:54` documents the AAD as `"users.panNumber|<userId>"`. That is wrong on both counts** — there is no `users.panNumber` field (PAN lives at `organizerVerifications.business.panNumber`) and no AAD carries a userId. An engineer trusting that doc will thread a userId through the Go repository and produce ciphertext Bun cannot read. *(Doc corrected 2026-08-04.)*

Because AAD is statically derivable from the field path, Go needs only a **6-entry `map[string]string`** mirroring the Mongoose setters. Nothing is threaded through the call stack.

### 3.1a Key derivation — MUST be replicated exactly (omitted from v1.0)

`crypto.ts:38-49` has two Node-specific behaviours Go will not reproduce by default:

1. **The guard is `raw.length >= 64`, not `== 64`, and Node's hex decoder is prefix-tolerant.** `Buffer.from(s,'hex')` stops at the first non-hex char and returns what it decoded — it does not throw. So a key of 64 valid hex chars **plus a trailing newline** (length 65) decodes to exactly 32 bytes and is *accepted*. `config/index.ts:99` does not trim. This is live in any `.env`-file or Docker-secret deployment. Go's `hex.DecodeString` errors — so either the service refuses to boot, or somebody "fixes" it by trimming and **Go then derives a different key than Bun reading the same env var, making every PII row written by one unreadable by the other.**
   → Go must decode the longest valid hex prefix and require exactly 32 bytes.
2. **The dev fallback is `sha256("zts-dev-fallback-encryption-key")`** (`crypto.ts:66`) — deterministic and hardcoded. Reproduce byte-for-byte, or every local DB and **every golden-vector fixture generated on a dev box** encodes the wrong key.

Also: `config/index.ts:100` validates only `length < 64` in production — **not** that it is hex. A 64-char non-hex key passes config validation and throws at the first PII write. The startup self-test (§4.1) is therefore **mandatory, not defence-in-depth**.

### 3.1b Decrypt — where the crashes live

The encrypt snippet above is the easy half. Decrypt needs:
- **Bounds check before slicing.** `buf[:12]`, `buf[12:28]` on a truncated row **panics**. Node's `subarray` clamps and fails cleanly. Require `len(buf) >= gcm.NonceSize()+gcm.Overhead()` first. This is reachable from any malformed row.
- **Re-concatenate for Go:** `gcm.Open(nil, iv, append(ct, tag...), []byte(aad))` — Go wants `ct‖tag`, the wire has `tag‖ct`.
- **Base64 strictness.** Node ignores invalid chars and tolerates missing padding; Go's `StdEncoding` errors on both. On error, retry `RawStdEncoding` after stripping whitespace — the difference between one bad row and one dead admin page.
- **Empty/null passthrough.** `crypto.ts:104-106` returns `''` unchanged and `undefined` for null. A naive port encrypts the empty string.
- **`crypto/rand`, never `math/rand`.** Both expose `Read` and compile identically. GCM nonce reuse leaks the authentication key, not just plaintext. Enforce with a linter.

### 3.1c The legacy no-AAD fallback — keep it, contrary to v1.0

v1.0 said: run the migration, then omit the branch. **That was wrong, and the reasoning was a code-cleanliness argument applied to a data-loss risk.** The premise (Bun can no longer write non-AAD rows) holds today — the deprecated `encrypt()` at `crypto.ts:197-215` has zero call sites. But legacy rows reappear three ways the plan didn't cover:

1. **Rollback (§11).** Rolling Bun back to a pre-AAD image during dual-run resurrects the old setters. *Your rollback plan and your omit-the-branch plan are mutually incompatible.*
2. **Restore from a pre-migration backup** — precisely when you least want a second incident.
3. **The migration does not guarantee zero.** `reencrypt-pii-with-aad.ts:263-266` **skips documents that fail to decrypt**, and the "0 legacy" banner at `:328-332` counts only *successful* decrypts. A run reporting `legacyDecrypts === 0` with `errors > 0` has left un-migrated rows and says nothing about them. `--limit` runs print the same reassuring banner over a partial sweep.

**Corrected gate:** `--verify-only` must report `legacyDecrypts === 0` **AND `errors === 0`** over the full collection, twice, a week apart. Then **keep the fallback in Go** behind a counter and an alert for one release cycle. It is ~15 lines.

### 3.2 Admin password hashing — argon2id

`auth.service.ts:64` uses `Bun.password.hash(password, { algorithm: 'argon2id', ... })`, producing a **PHC string**: `$argon2id$v=19$m=<mem>,t=<time>,p=<par>$<b64salt>$<b64hash>`.

Go has no `Bun.password`. Use `golang.org/x/crypto/argon2` with a PHC parser (`matthewhartstonge/argon2` or ~60 lines hand-rolled). **The parameters must be read from the stored string, not hardcoded** — otherwise every existing admin is locked out.

Also port the **dummy-hash timing defence** (`auth.service.ts:54`): verify against a constant dummy hash when the user doesn't exist, so response time doesn't leak account existence.

### 3.3 JWT

HS256, single `JWT_SECRET`, namespaced by a `type` claim: `access` (1h), `refresh` (7d), `signup` (10m), `ws-ticket` (30s). Claims: `sub`, `firebaseUid`, `email`, `phoneNumber`, `type`.

**Preserve exactly.** Any change invalidates every live session. The auth middleware must reject non-`access` types — the current `app.ts:114` check is correct and load-bearing.

### 3.4 Refresh tokens

Stored as **SHA-256 hex** of the JWT, compared with `crypto/subtle.ConstantTimeCompare`. Rotation with reuse-detection revoke. Port faithfully — the audit confirmed this is correctly implemented today.

**Delete on the way over:** the legacy plaintext-refresh-token branch (`auth.service.ts:509-517`), whose cutover date of 2026-05-21 has passed.

### 3.5 Cookies

`accessToken` / `refreshToken`, `HttpOnly`, `Secure`, `SameSite=None` in prod / `Lax` in dev, same paths and max-ages. Any drift logs every user out.

### 3.6 Check-in OTP

6 digits via CSPRNG (`crypto/rand.Int`, **not** `math/rand`), constant-time compare, 5-strike / 15-min DB lockout. Port exactly — this is one of the few controls the audit found genuinely working.

---

## 4. The three landmines

Everything else is mechanical. These three can silently destroy data, and each needs a decision **before** implementation.

### 4.1 🔴 PII encryption is implemented as Mongoose setters — Go has no equivalent

`artist-verification.model.ts:92-93` wires crypto into the schema:

```ts
number: { set: aadIdentityNumber, get: aadIdentityNumberGet }
```

Encryption is therefore **invisible at every call site**. Services read and write plaintext; Mongoose transparently encrypts on save and decrypts on read. The Go driver has **no hooks, no setters, no getters**.

**Failure mode if handled naively:** a developer writes `collection.UpdateOne(ctx, filter, bson.M{"$set": bson.M{"identity.number": aadhaar}})` and **stores an Aadhaar number in plaintext**. Nothing errors. Nothing warns. It is discovered in a breach.

**Required design — encryption at the type layer, not the call site:**

```go
// EncryptedString marshals itself encrypted and unmarshals decrypted.
// The AAD is bound to the field path via the aad struct tag on the parent.
type EncryptedString struct {
    plain string
    aad   string   // set by the repository before write
}

func (e EncryptedString) MarshalBSONValue() (bsontype.Type, []byte, error) { /* encrypt */ }
func (e *EncryptedString) UnmarshalBSONValue(t bsontype.Type, b []byte) error { /* decrypt */ }
```

This makes plaintext storage a **compile-time impossibility** for those fields — strictly better than the Mongoose version, which relies on always going through the model.

**Plus three defence-in-depth requirements:**
1. A `go vet`-style custom linter, or a CI grep, failing any `$set` on a known-PII field path outside the designated repository.
2. An integration test asserting the **raw BSON** in MongoDB starts with the encrypted prefix — reading through the type would pass even if encryption were removed.
3. A startup self-test: encrypt→decrypt a canary value, and decrypt one known production-format fixture. Fail fast on key misconfiguration rather than corrupting writes.

**Effort: 1.5 weeks, and it is the highest-risk item in the migration.**

### 4.2 🟠 62 `.populate()` calls have no Go equivalent

Mongoose's `populate` issues a hidden second query and grafts documents in. The Go driver does not. Each of the 62 sites becomes either:

- **`$lookup` aggregation** — one round trip, more code, and the only correct option when you then filter or sort on the joined field; or
- **explicit second query + in-memory join** — simpler, and often *faster* than `$lookup` on small result sets.

**Two bugs to fix rather than port:**
- `bids.service.ts:611` sorts on a populated path (`'gigId.eventTiming.date'`). **Mongo cannot do this** — it is silently a no-op today. The Go version must sort in memory after the join, or use `$lookup` + `$sort`.
- `bids.service.ts:603-609` double-populates the same path, silently discarding the field projection and hydrating full gig documents. Collapse to one projection-preserving join.

Budget **~15 minutes per site with tests**: ≈ 2 weeks. This is the single largest mechanical line item.

### 4.3 🟠 Elysia's implicit request context becomes explicit

Elysia's `.derive()` injects `user` into every handler's context. The auth derive also performs a **Mongo lookup per request** (`app.ts:126`) so bans take effect immediately — a good security decision with no caching.

In Go: `context.Context` + a typed accessor.

```go
type ctxKey struct{}
func UserFrom(ctx context.Context) (*domain.AuthUser, bool) {
    u, ok := ctx.Value(ctxKey{}).(*domain.AuthUser); return u, ok
}
```

**Improve while translating:** add a 5–10s TTL cache (`ristretto` or a plain sharded map) keyed by user ID. Preserves ~99% of the revocation benefit, removes ~99% of the queries.

**And carry forward the scoping lesson.** The audit proved Elysia's default-local hook scope meant the rate limiter **never ran**. Go's explicit `chi` middleware chain makes this class of bug structurally impossible — a genuine argument in favour of the migration. The new middleware order must be asserted by test:

```
recover → requestID → logger → cors → csrf(origin) → ratelimit → auth → route
```

---

## 5. Migration sequence (strangler)

A reverse proxy fronts both services. Routes move in vertical slices; the client never knows.

```
            ┌──────────────┐
 clients ──▶│  proxy /     │──▶ Bun  (not yet migrated)
            │  ingress     │──▶ Go   (migrated slices)
            └──────────────┘
                    │
       both read/write the SAME MongoDB + Redis
```

**Shared-state rules while both run:**
- Same `JWT_SECRET`, `ENCRYPTION_KEY`, cookie config. A session must work on either.
- Redis is shared: one rate-limit namespace, one job queue. **Only one service may own the scheduler** — disable Bun's `setInterval` jobs the moment Go's worker takes them.
- No dual writes to the same aggregate in the same phase. Slices move whole.

### Phase order — by risk, dependency, and business value

| Ph | Slice | Routes | Why here | Est. |
|---|---|---|---|---|
| **0** | Foundation: config, mongo, logging, otel, middleware chain, error mapping, Docker, CI. **No routes.** | 0 | Everything depends on it. Prove the chain with `/health`. | 2w |
| **1** | Crypto + auth read path: JWT verify, auth middleware, `/auth/me`, `/auth/ws-ticket` | 3 | Highest-risk contracts (§3) proven first, on low-traffic endpoints, while Bun still owns token *issuance*. | 1.5w |
| **2** | Full auth: google/phone verify, login, refresh, logout, complete-signup | 8 | Token issuance moves only after verification is proven. | 2w |
| **3** | Users + verification (KYC) — includes the `EncryptedString` work (§4.1) | 20 | The PII landmine, isolated in one slice with real data tests. | 2.5w |
| **4** | Gigs + bids — includes transactional `Accept` (§2.2) | 26 | Core domain. Fixes the corruption windows. | 3w |
| **5** | Check-in + reviews | 18 | The moat. Ship the Bun-side UI first so it isn't dark code twice. | 2w |
| **6** | Reports + notifications + admin | 32 | Lowest external risk; internal tooling. | 2.5w |
| **7** | WebSockets: both gateways → one Go hub | 2 | Move last; needs `ws-ticket` (Ph 1) and bid events (Ph 4). | 1.5w |
| **8** | Worker: scheduler jobs → asynq. **Decommission Bun.** | — | Only after every route has moved. | 1.5w |

**Total ≈ 18.5 engineer-weeks.** With two engineers and Ph 3/4 partially parallel: **~11–12 calendar weeks**. Single engineer: ~20 weeks.

**Each phase is done when:** routes return byte-identical responses under the §9.3 differential harness · integration tests pass against real Mongo · traces appear in the collector · the proxy has cut over · Bun's copy is deleted (not commented out).

---

## 6. Dockerisation

The current Dockerfile cannot pass its own healthcheck on any non-compose deploy (wrong port, and `wget` isn't in the base image), and builds an artifact nothing exercises. Go fixes this properly: a static binary in a distroless image.

**⚠️ v1.0's Dockerfile failed review with four disqualifying defects. Corrected version:**

```dockerfile
# syntax=docker/dockerfile:1.7
# ---------- build ----------
# Debian, not alpine: `go test -race` needs CGO_ENABLED=1 + a C toolchain, which
# alpine lacks. And if anyone ever flips CGO on, a musl binary will NOT run on
# distroless/static (no libc) — a runtime "not found" on a binary that exists.
FROM --platform=$BUILDPLATFORM golang:1.25@sha256:<pin> AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked go mod download

# Narrow copy: a README edit must not bust the build cache, and `COPY . .`
# without a .dockerignore drags .env and .git into a cached layer you may push.
COPY cmd/ cmd/
COPY internal/ internal/
COPY migrations/ migrations/

ARG TARGETOS TARGETARCH
ARG VERSION=dev
ARG COMMIT=unknown
# ./cmd/... → api, worker AND migrate in one image, so the migrator is
# guaranteed to be the same commit as the app.
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build \
      -trimpath \
      -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
      -o /out/ ./cmd/...

# ---------- run ----------
FROM gcr.io/distroless/static-debian12:nonroot@sha256:<pin>
COPY --from=build /out/ /

ARG VERSION=dev
ARG COMMIT=unknown
LABEL org.opencontainers.image.source="https://github.com/<org>/<repo>" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}"

ENV TZ=UTC
# NUMERIC uid. Kubernetes cannot resolve the string "nonroot" against the image,
# so `runAsNonRoot: true` — the default in any hardened cluster — refuses to
# start the pod: "image has non-numeric user (nonroot), cannot verify".
USER 65532:65532
EXPOSE 8080

ENTRYPOINT ["/api"]
# Exec form takes no shell, so this works on distroless. Reads $PORT from the
# same env the server does — which is what actually fixes the port-mismatch bug.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/api", "healthcheck"]
```

**Corrections from review, each a real defect in v1.0:**

| # | v1.0 defect | Fix |
|---|---|---|
| **D1** | `USER nonroot:nonroot` — **shipping blocker** | Numeric `65532:65532`. This is the single most common distroless deployment failure. |
| **D2** | **No multi-arch.** The team is on darwin/arm64; `docker build` produces an arm64 image that dies with `exec format error` on an amd64 host — and CI's amd64 image won't run locally | `--platform=$BUILDPLATFORM` + `TARGETOS/TARGETARCH` + `buildx --platform linux/amd64,linux/arm64`. Free at `CGO_ENABLED=0`. |
| **D3** | **Removing `HEALTHCHECK` was justified by a factual error.** v1.0 claimed orchestrators "probe over the network" — only Kubernetes does. **Compose `healthcheck.test` and ECS `healthCheck.command` both execute inside the container**, exactly like `HEALTHCHECK`. So v1.0 handed the same unsolvable problem to compose — and **breaks `docker compose up` today**, because `docker-compose.yml:43-45` gates `web` on `condition: service_healthy` | Make the binary its own probe: ~15 lines in `main.go` handling `os.Args[1] == "healthcheck"`. Kubernetes ignores `HEALTHCHECK` entirely, so it costs nothing there. |
| **D4** | **`GOMAXPROCS`/`GOMEMLIMIT` unaddressed** — Go <1.25 reads `NumCPU()` from the *host*, not the cgroup. On a 64-core node with `cpu: 500m` it spawns 64 Ps and gets CFS-throttled into tail-latency hell | Pin Go ≥1.25 (container-aware by default) or `go.uber.org/automaxprocs`; set `GOMEMLIMIT` to ~85% of the memory limit. |
| **D5** | Go 1.23 is **out of support**; both base images on mutable tags, so "reproducible builds" was false | Current stable, pinned by digest. |
| **D6** | Trivy on distroless is **security theatre** — ~4 OS packages, permanently green, while 100% of the real surface is statically-linked Go modules | `govulncheck ./...` as the actual gate (call-graph reachability), Trivy retained only for base drift. |

**Also required, and absent from v1.0:** `import _ "time/tzdata"` — distroless *does* ship tzdata today (the CA-cert claim was correct), but relying on an undocumented base-image property means `time.LoadLocation("Asia/Kolkata")` starts failing at runtime if you ever move to `scratch`. 450 KB removes the dependency, and given the timezone bug below it is on the notification path.

**`/live` vs `/ready` — v1.0 had this backwards.** It said `/live` flips to 503 on SIGTERM. Load balancers drain on **readiness**; returning 503 on liveness tells the kubelet the container is dead and it may `SIGKILL` mid-drain. Correct order: SIGTERM → `/ready` 503 → sleep ~5s for endpoint propagation → `srv.Shutdown`. `/live` stays 200 until exit. And `/ready` must **not** gate on Redis — a Redis blip would fail readiness on every replica simultaneously and take a serving system to zero. Redis health is an alert; the rate limiter fails open.

**Compose needs four new services from zero** (there is no MongoDB in `docker-compose.yml` today — local dev points at Atlas), including a **single-node replica set**, which transactions require and which is fiddly enough to burn a day per developer:

```yaml
  mongo:
    image: mongo:8
    command: ["--replSet","rs0","--bind_ip_all"]
    healthcheck:
      test: >
        mongosh --quiet --eval
        'try { rs.status().ok } catch { rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo:27017"}]}).ok }'
      interval: 5s
      start_period: 30s
```
with `?replicaSet=rs0&directConnection=true`. For tests use `testcontainers-go`'s `mongodb` module with `WithReplicaSet()` — don't hand-roll the initiate.

**Deliberate choices, each addressing a defect in the current setup:**

| Choice | Rationale |
|---|---|
| **distroless, not alpine** | No shell, no package manager, ~2 MB base. Final image **~20 MB vs the current 162 MB.** Removes the entire shell-based attack surface. |
| **No `HEALTHCHECK` in the Dockerfile** | This is the fix for the current bug. Distroless has no shell *and* no `wget`/`curl` — any Dockerfile healthcheck would fail exactly as today's does. **Health checking belongs to the orchestrator** (`livenessProbe`/`readinessProbe`, ECS `healthCheck`, compose `test`), which probes over the network and knows the real port. Ship `/live` and `/ready` endpoints and let the platform call them. |
| **`USER nonroot`** | Non-root by construction, no `groupadd` needed. |
| **`CGO_ENABLED=0`** | Static binary; no glibc, no runtime linking surprises. |
| **`-trimpath`, pinned `-ldflags`** | Reproducible builds; no absolute paths leaked into binaries. |
| **Cache mounts** | Fast CI without vendoring. |
| **`PORT` from env, default 8080** | Never hardcode. The current 8085/8080 split is exactly this bug. |

**Readiness must mean ready.** The current `/ready` only checks `mongoose.readyState`, and `/live` is a static literal — so a corrupted process passes both forever. In Go:
- `/live` → process is running and not shutting down. Flips to 503 on `SIGTERM` so the LB drains before exit.
- `/ready` → Mongo ping **and** Redis ping **and** crypto self-test passed, each with a timeout.

**Graceful shutdown** (absent today): trap `SIGTERM` → stop accepting → `srv.Shutdown(ctx)` with a 30s deadline → close WS with code 1001 → drain asynq → close Mongo/Redis.

`docker-compose.yml` for local dev brings up mongo (replica-set mode, **required** for transactions §2.2), redis, api, worker, and an OTLP collector.

---

## 7. Testing strategy

The current suite is 26 tests with **2.8% coverage on core logic**, and `gigs-status.test.ts` asserts a locally re-declared copy of the transition table against itself — it would pass if the implementation were deleted. **Do not carry that standard into Go.**

Targets, enforced in CI:

| Layer | Approach | Gate |
|---|---|---|
| Domain | Pure unit tests, no I/O. Bid rules, state machines, permissions. | **≥85%** |
| Store | `testcontainers-go` + real MongoDB replica set | ≥70% |
| Service | Real Mongo, mocked Firebase/S3/queue | ≥75% |
| Transport | `httptest` golden-file request/response | all 101 routes |
| Overall | | **≥70%, no drops** |

### 7.1 Golden vectors — the safety net for §3

Generate fixtures **from the running Bun service** and commit them:

- 20 PII ciphertexts (multiple AADs, incl. empty string and unicode) → Go must decrypt all.
- 10 argon2id PHC hashes with known passwords → Go must verify all.
- JWTs of each type, valid and expired → identical accept/reject.
- Refresh-token SHA-256 pairs.
- Cookie `Set-Cookie` header strings → byte-identical.

**If any golden test fails, the migration stops.** These run on every commit, forever.

### 7.2 Differential testing — the phase gate

Before each phase cuts over, replay identical requests against Bun and Go and diff:

```
harness/difftest --routes=phase4.txt --bun=http://bun:8080 --go=http://go:8080
  → compares status, headers (minus Date/X-Request-ID), and normalised JSON
```

Seed a shared database snapshot; run read-only routes first, then writes against isolated fixtures. **A phase cuts over only at zero unexplained diffs.** Every intentional diff must be an entry on the agreed fix-list (§8).

---

## 8. Fix-while-porting list — explicit and bounded

The hardest discipline in a rewrite is resisting improvement, because every unplanned change breaks differential testing. **These fixes are approved; everything else ports faithfully and is fixed afterwards.**

| # | Fix | Source finding |
|---|---|---|
| 1 | `acceptBid` in a real transaction | 3 corruption windows |
| 2 | Rate limiter actually executes (Redis) | never ran — Elysia scoping |
| 3 | `bidCount` decremented on mass-rejection | permanent counter drift |
| 4 | `updateBidAmount` checks gig status | lets artists bid on awarded gigs |
| 5 | Sort on populated path → in-memory/`$lookup` | silent no-op |
| 6 | Partial unique index on `{gigId, artistId}` where PENDING | withdraw→re-bid returns 500 |
| 7 | Duplicate-key → 409, not 500 | affects 5 collections |
| 8 | `sortBy` allowlist | 32 MB sort abort → 500 |
| 9 | Upload: MIME magic-byte check, 5 MB cap, UUID key | unvalidated uploads |
| 10 | `POST /gigs/:id/complete` requires artist counter-confirmation | unilateral completion; becomes fund release |
| 11 | Notification TTL index (90d) | unbounded growth |
| 12 | `UpdateGig` array caps match `CreateGig` | 16 MB BSON risk |
| 13 | Real `/ready`, graceful shutdown, fatal errors are fatal | crashed replicas serve traffic |
| 14 | Scheduler → asynq with idempotency keys | N replicas = N sweeps |

Items 1–14 are **behaviour changes by design**; the difftest harness must be told to expect them.

---

## 9. Observability — building in what doesn't exist

Today: no metrics, no tracing, no error tracking, no analytics; one `// TODO: Sentry` comment. Greenfield is the moment to fix it.

- **`slog`** JSON to stdout, every line carrying `trace_id`, `request_id`, `user_id`. Never log tokens or PII — enforced by a `slog` middleware that redacts known-sensitive keys.
- **OpenTelemetry** traces on HTTP, Mongo, Redis, S3, Firebase. Export OTLP.
- **RED metrics** per route + Mongo pool saturation + queue depth.
- **Sentry** on panics and 5xx, with release tagging from `-ldflags` version.
- **Business events** emitted as structured logs from day one: `gig.posted`, `bid.placed`, `bid.accepted`, `checkin.verified`, `payment.captured`. The audit's largest limitation was having no usage data — do not repeat that.

---

## 10. CI/CD

Extends the pipeline just added:

```
lint      → golangci-lint (errcheck, gosec, staticcheck, depguard for §2 layering)
test      → go test -race -cover ./...   [gate: ≥70%]
golden    → §7.1 vectors                 [gate: 100%]
build     → docker build, trivy scan     [gate: no HIGH/CRITICAL]
difftest  → §7.2 against Bun             [gate: 0 unexplained diffs]
publish   → tagged image, SBOM (syft)
deploy    → staging → smoke → manual gate → production canary 10% → 100%
```

`-race` is non-negotiable given the WS hub and job workers.

---

## 11. Rollback

Every phase must be reversible in **under 5 minutes**, because shared-database migrations are the ones that ruin weekends.

1. **Proxy revert** — route the slice back to Bun. Primary mechanism; instant. **This is why Bun's code is deleted only after a phase has soaked in production**, not at cutover.
2. **Schema compatibility** — Go must not write fields Bun can't read during any phase where rollback is live. New fields are additive and optional; no renames until Bun is decommissioned.
3. **Data migrations** are separately reversible, or additive-only.
4. **Kill switch** per phase via env flag, no redeploy.

**Point of no return:** Phase 8. After the scheduler moves and Bun is decommissioned, rollback means a redeploy of the old service. Take a full Atlas snapshot immediately before.

---

## 12. If you choose big-bang instead

Same phases, same contracts, but no proxy and no differential testing against a live Bun — which removes the strongest correctness signal available. Cutover becomes a single dated event with a full-snapshot rollback and a several-hour maintenance window. **Add ~4 weeks of stabilisation** for defects that the strangler would have caught one slice at a time. Only sensible if there are genuinely zero users — which, today, is arguably true and is the one real argument for it.

---

## 13. Risk register

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | PII silently written in plaintext | **M** | **Critical** | §4.1 type-level encryption + raw-BSON assertions + CI grep + startup self-test |
| R2 | Crypto format mismatch → unreadable KYC | **M** | **Critical** | §7.1 golden vectors before any code; run the AAD re-encryption on Bun first |
| R3 | argon2 param mismatch locks out all admins | M | High | Parse params from the stored PHC string; golden vectors |
| R4 | 62 populate translations introduce subtle wrong data | **H** | High | Differential testing per route; review each as its own PR |
| R5 | Scope creep — "fix it while we're here" | **H** | High | §8 fix-list is closed; anything else is a follow-up ticket |
| R6 | Migration stalls half-done, two stacks forever | **M** | **High** | Phase gates with deletion of Bun code; a phase isn't done until its Bun copy is gone |
| R7 | Team lacks production Go experience | ? | High | **Unknown — needs answering.** If yes, add 30% and start with Ph 0–1 as a learning slice |
| R8 | Business ships nothing for 3 months | **H** | **High** | The §0 recommendation. If Go is firm, do payments as greenfield Go in Ph 0–2 in parallel |
| R9 | Transactions require a replica set | L | Med | Atlas already is one; local compose must run `--replSet` |
| R10 | Rate limiter enabled for the first time causes an outage | M | High | It has never run. Log-only mode first, tune, then enforce |

---

## 14. What I need from you before implementation

1. **Confirm option B (strangler) vs C (big-bang).**
2. **Approve the deletion list** (§1) — this is scope, not cleanup.
3. **Approve the fix-list** (§8) as closed.
4. **Team size and Go experience** (R7) — the timeline swings ±40%.
5. **Run `reencrypt-pii-with-aad.ts` to completion on Bun now**, so Go never inherits the legacy fallback.
6. **Confirm `IV_LENGTH`, `ENCRYPTED_PREFIX`, and argon2 parameters** from the running production config.

---

## 15. Summary

| | |
|---|---|
| Scope after deletions | ~101 routes, 10 modules, 11 models |
| Effort | ~18.5 engineer-weeks; 11–12 calendar weeks with 2 engineers |
| Highest risk | PII encryption losing its implicit Mongoose wiring (§4.1) |
| Biggest mechanical cost | 62 `populate` translations (§4.2) |
| Genuine wins | Real transactions · a rate limiter that runs · process-split scheduler · 20 MB image · enforced layering · observability · tests that mean something |
| Honest caveat | None of this makes the product earn money. That is still §0. |

*Next: this plan goes to independent review agents (architecture, security/crypto, data/Mongo, DevOps) instructed to attack it. Findings will be folded in before any code is written.*
