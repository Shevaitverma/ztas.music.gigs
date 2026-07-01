# Admin Panel & Landing Site Audit

**Scope:** `admin/` (Next.js 16 moderation console, ~5.5k LOC) and `landing/` (Next.js marketing site, ~2.5k LOC).
**Date:** 2026-06-26
**Method:** Full static read of every source file in both apps + `PROJECT_CONTEXT.md`, `landing/CONTENT_REVAMP.md`, and the relevant server commit (`7ee57a7`, SameSite cookie change). Build/lint attempted (see each part).

Documented intentional decisions/TODOs from `PROJECT_CONTEXT.md` were **verified rather than re-flagged**. Confirmed-good items are listed at the end of each part.

---

# Part A — Admin Panel

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| High | 0 | — |
| Medium | 5 | ADM-001, ADM-002, ADM-003, ADM-005, ADM-009 |
| Low | 5 | ADM-004, ADM-006, ADM-007, ADM-008, ADM-010 |

No High-severity admin defects. The auth gate, PII masking, and the two documented contract gaps are implemented correctly (verified below). The Medium items are real correctness/security gaps worth closing before launch.

---

### ADM-001 — Verification "section" selector never syncs to the first applicable section
- **Severity:** Medium
- **File:** `admin/app/(dashboard)/verifications/[type]/[id]/page.tsx:61` (state), `:22-41` (comment + `applicableSections`)
- **What's wrong:** `const [section, setSection] = useState<VerificationSection>('identity')` is hard-defaulted to `identity` and is never updated when the verification loads. The block comment (lines 22-27) claims "We default to the first applicable pending section when the data loads," but no effect does this. When `identity` is **not** an applicable section (e.g. an artist who submitted only a bank account, or any organiser whose identity sub-doc is absent), the `<select value={section}>` renders a controlled value (`identity`) that is not among its `<option>`s. The browser then visually shows the first real option (e.g. `bank`) while React state still holds `identity`. Clicking **Approve/Reject section** then POSTs `section: 'identity'` for a section the verification doesn't have.
- **Why it matters:** A moderator believes they are approving the visibly-selected section but actually acts on a phantom `identity` section → server 400/no-op, or worse, an approve/reject mis-applied to the wrong record. KYC is the trust spine of a marketplace handling money; mis-targeted approvals are a real integrity risk.
- **Recommended fix:** After the detail query resolves, sync state to the first applicable section, e.g. `useEffect(() => { if (sections.length && !sections.includes(section)) setSection(sections[0]) }, [sections])`. Also disable the action buttons until `sections.length > 0`.

### ADM-002 — Dashboard verifications stat can crash; verifications API doesn't normalise pagination
- **Severity:** Medium
- **File:** `admin/app/(dashboard)/page.tsx:67`; `admin/lib/api/verifications.ts:36-51`
- **What's wrong:** `usersApi.list` and `reportsApi.list` explicitly normalise the server's `pagination` envelope into a synthesised `meta` (see `lib/api/users.ts:41-50`). `verificationsApi.listPending` does **not** — it returns `response.data` typed as `PaginatedData<VerificationListItem>` (which declares `.meta`). Per `PROJECT_CONTEXT.md` the server emits `pagination`, not `meta`. The dashboard then reads `verificationsQuery.data?.meta.total ?? verificationsQuery.data?.data.length ?? 0`. The optional chain is misplaced: `data?.meta` short-circuits only on `data`, so if `data` exists but `.meta` is `undefined`, `.total` throws `TypeError: Cannot read properties of undefined`, and the intended `?? data.length` fallback never runs → the whole dashboard render crashes.
- **Why it matters:** The dashboard is the admin landing page; a shape mismatch (which the type annotation actively hides) takes down the entire console rather than degrading one stat.
- **Recommended fix:** Normalise `verificationsApi.listPending` to a `{ data, meta }` shape like the other two clients, or in the dashboard use `verificationsQuery.data?.meta?.total ?? verificationsQuery.data?.data.length ?? 0` (optional-chain `meta`).

### ADM-003 — Open redirect via `next` query param on login
- **Severity:** Medium
- **File:** `admin/app/(auth)/login/page.tsx:54-55`
- **What's wrong:** After a successful admin login: `const next = searchParams.get('next'); router.replace(next && next.startsWith('/') ? next : '/')`. The guard only checks `startsWith('/')`, which is **true** for protocol-relative URLs like `//evil.com`. Next's router resolves `//evil.com` to `https://evil.com` (a different origin) and performs a hard external navigation.
- **Why it matters:** An attacker sends an admin a link `https://<admin-host>/login?next=//evil.com`; after the admin authenticates they are bounced to the attacker's site — a classic post-auth open redirect, useful for credential-phishing an admin into re-entering Google creds on a lookalike. (The proxy only ever sets `next` to an internal pathname, but the param is attacker-controllable directly.)
- **Recommended fix:** `const safe = next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://') ? next : '/'`.

### ADM-004 — `toast.error()` called during render in the reports list
- **Severity:** Low
- **File:** `admin/app/(dashboard)/reports/page.tsx:32-36`
- **What's wrong:** `if (query.isError) { toast.error(...) }` runs in the component body (render phase), not in an effect. React may render multiple times while the query stays in the error state; each render fires a fresh toast (react-hot-toast does not dedupe these), spamming the UI. It also duplicates the inline error card already rendered at lines 68-81.
- **Why it matters:** Side effects in render are a React anti-pattern (also breaks under Strict Mode double-render) and produce a poor error UX (toast stacking).
- **Recommended fix:** Drop the render-phase toast (the error card is sufficient), or move it into `useEffect(() => { if (query.isError) toast.error(...) }, [query.isError])`.

### ADM-005 — Least-privilege not enforced in UI: any admin tier can act on KYC; nav not gated
- **Severity:** Medium
- **File:** `admin/app/(dashboard)/verifications/[type]/[id]/page.tsx:58-61`; `admin/components/layout/sidebar.tsx:15-22`; `admin/lib/permissions.ts:58-78`
- **What's wrong:** The permission matrix grants `APPROVE_VERIFICATIONS` only to `SUPER_ADMIN` and `VERIFIER`. But the verification approve/reject screen explicitly does **not** check it ("gated server-side by `UserRole.ADMIN` only — we don't gate further here"), and per `PROJECT_CONTEXT.md` the server route is likewise gated only by `UserRole.ADMIN`. Combined with the sidebar exposing every surface (Users/Verifications/Reports/Analytics/Settings) to all admin tiers, a `MODERATOR` or `ANALYST` can open `/verifications/...` and approve/reject KYC. The user-status panel *does* gate on `BAN_USERS` (good), so the inconsistency is specific to verifications.
- **Why it matters:** KYC approval is the highest-trust action on the platform; allowing an analyst to approve identity/bank verifications defeats the entire `AdminRole` tiering. This is a server design choice but the admin panel inherits it and adds no compensating control.
- **Recommended fix:** Gate the verification actions on `usePermission('APPROVE_VERIFICATIONS')` (mirroring the users panel) **and** filter the sidebar `NAV` by the viewer's `adminRole`. Long-term, add the fine-grained permission check to the server route.

### ADM-006 — Sidebar links to non-existent `/analytics` and `/settings`
- **Severity:** Low
- **File:** `admin/components/layout/sidebar.tsx:20-21`
- **What's wrong:** `NAV` includes `/analytics` and `/settings`, but no such routes exist (no pages under `app/(dashboard)/analytics` or `/settings`). Clicking them hits the proxy (an `/auth/me` round-trip) and then a 404.
- **Why it matters:** Dead nav erodes trust in an internal tool and wastes an auth round-trip per click. `PROJECT_CONTEXT.md` lists analytics/settings as "deferred," so these should not be linked yet.
- **Recommended fix:** Remove the two entries (or render them disabled with a "coming soon" affordance) until the pages exist.

### ADM-007 — PII "reveal" audit logging is not implemented (only a dev console breadcrumb)
- **Severity:** Low
- **File:** `admin/components/verifications/pii-field.tsx:29-41`
- **What's wrong:** `PROJECT_CONTEXT.md`'s security posture states "PII fields render masked-by-default … 'Reveal' is per-field, click-to-show, and **logs an audit line**." In practice `handleReveal` only does `console.info('[admin-pii-reveal]', field)` and only when `NODE_ENV !== 'production'`. There is no server-side audit entry tying a reveal to the acting admin.
- **Why it matters:** Verified the *safe* parts (reveal only un-hides the last-4 the server already sent; there is no reveal-full endpoint; the full number is encrypted at rest), so the data-exposure risk is genuinely low. But the documented audit-trail control does not exist — relevant for KYC/DPDP-style compliance once real PII flows.
- **Recommended fix:** Treat as the tracked TODO it is; wire a `POST /admin/audit/pii-reveal { field }` (admin identity from the session) before launch handling real PII. Don't claim the control is present until then.

### ADM-008 — Reports & Verifications filters/pagination are component-state, not URL-synced
- **Severity:** Low
- **File:** `admin/app/(dashboard)/reports/page.tsx:15-17`; `admin/app/(dashboard)/verifications/page.tsx:17`
- **What's wrong:** The Users list correctly syncs filters/pagination to the URL (`users/page.tsx` `parseFilters`/`toQuery` + `router.replace`). Reports (`useState` for `filters`/`page`) and Verifications (`useState` for `typeFilter`) do not. A page refresh, deep link, or browser Back loses the moderator's filter/page state and resets to defaults.
- **Why it matters:** Moderators triage in long sessions; losing the queue position/filter on every reload is a real productivity tax and prevents sharing a filtered queue link. Inconsistent with the Users surface.
- **Recommended fix:** Mirror the Users page's URL-sync pattern for both surfaces.

### ADM-009 — Cross-site auth cookies (SameSite=None) + no CSRF token on admin mutations
- **Severity:** Medium (server-side root cause; documented here because it governs admin security)
- **File:** `server/src/shared/utils/cookies.ts` (commit `7ee57a7`); admin mutations in `admin/lib/api/{users,verifications,reports}.ts`
- **What's wrong:** Commit `7ee57a7` switched production auth cookies to `SameSite=None; Secure` (frontend and API are on different registrable domains). The admin's state-changing calls (ban/suspend, KYC approve/reject, report resolve) are cookie-authenticated `POST/PUT`s with **no anti-CSRF token**. With `SameSite=None`, the browser attaches the auth cookie to cross-site requests; the only remaining CSRF defense is the CORS allowlist + the JSON `Content-Type` forcing a preflight (which a non-allowlisted origin fails).
- **Why it matters:** The CSRF posture now rests entirely on CORS/preflight correctness. Any endpoint that can be invoked as a CORS "simple request" (form-encoded body, or a state-changing GET) would be exploitable cross-site against a logged-in admin. It's a fragile, implicit defense for the highest-privilege accounts.
- **Recommended fix:** Add an explicit CSRF defense for admin mutations (double-submit token or an `Origin`/custom-header assertion on the server), and ensure no state-changing endpoint accepts simple-request content types. Keep the CORS allowlist strict.

### ADM-010 — Verification sections can be re-approved/re-rejected regardless of current status
- **Severity:** Low
- **File:** `admin/app/(dashboard)/verifications/[type]/[id]/page.tsx:206-226`
- **What's wrong:** Approve/Reject are only disabled while a mutation is pending (and, for venues, until a venue is chosen). They are not gated by the selected section's existing status, so a moderator can "approve" an already-approved section or "reject" an already-rejected one.
- **Why it matters:** Re-issuing terminal actions can spam the submitter with duplicate notifications and muddy the audit trail. Lower risk than ADM-001 (server likely rejects), but worth a UI guard.
- **Recommended fix:** Disable the action whose target state already matches the selected section's status; surface the section's current status next to the selector.

## Verified-good (documented decisions confirmed working)
- **Proxy auth gate** (`admin/proxy.ts`): forwards the `Cookie` header to `/auth/me`, asserts `data.role === 'admin'`; non-admin → `/login?error=not_admin`; unauthed/ambiguous → `/login` (fail-closed). A non-admin cannot reach a protected surface. Correct. (Trade-off: API timeouts/5xx classify as `ambiguous` and bounce even valid admins to login — acceptable fail-closed behaviour.)
- **No `GET /admin/users/:id`** contract gap: `usersApi.getById` falls back to the first 100-row list page and the detail page renders a clear "ask an engineer to add the route" notice when not found. Handled gracefully.
- **Dismiss-as-resolve(NO_ACTION)** contract gap: both resolve and dismiss require ≥10-char notes, the action buttons are hidden once the report is terminal (`isTerminal`), and the verdict→action mapping matches the server enum. Correct.
- **PII handling:** server returns pre-masked last-4 only; no reveal-full endpoint; presigned document URLs are rendered as external `<a target="_blank" rel="noopener noreferrer">` and never iframed (`verification-detail-card.tsx`). Safe.
- **User status mutation gating:** Suspend/Ban/Reactivate are correctly gated by current status and by `BAN_USERS`; admin-target rows are read-only. Correct.
- **React Query keys/invalidation:** per-domain key factories are consistent; resolve/dismiss/status mutations invalidate list + detail + entity/activity keys appropriately.

---

# Part B — Landing Site

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| High | 3 | LND-001, LND-002, LND-003 |
| Medium | 5 | LND-004, LND-005, LND-006, LND-007, LND-008 |
| Low | 10 | LND-009 … LND-018 |

The landing site's biggest problems are **truthfulness/conversion**, not code: it sells a USD subscription SaaS with features the product doesn't have, backed by fabricated metrics and a fake review schema — for a pre-launch, India-only, reverse-auction marketplace whose monetisation is entirely unbuilt. It also contradicts the team's own `CONTENT_REVAMP.md`.

---

### LND-001 — Pricing is USD subscription tiers; product is India-only (INR) with an unbuilt commission model
- **Severity:** High
- **File:** `landing/src/components/sections/pricing-section.tsx:19-67`; `landing/src/app/layout.tsx:115-120` (JSON-LD `price:"0", priceCurrency:"USD"`)
- **What's wrong:** The page advertises Free `$0`, Pro `$29/mo`, Business `$99/mo`. The product is India-only (Aadhaar/PAN/GST, INR, Mumbai data — `PROJECT_CONTEXT.md`) and its **planned** monetisation is a commission/take-rate on completed bookings (default 10%, tiered), **not** SaaS subscriptions — and payments/escrow are explicitly deferred (unbuilt). The team's own `landing/CONTENT_REVAMP.md` specifies INR tiers (`₹0/₹499/₹999`) + platform fee, yet the shipped code is USD SaaS. So the pricing contradicts (a) the currency/market, (b) the actual business model, and (c) the team's own spec.
- **Why it matters:** Indian buyers seeing USD pricing is an immediate credibility/conversion killer, and advertising paid tiers that cannot be purchased (no billing exists) is a launch-blocking trust problem.
- **Recommended fix:** Replace with the real model in INR. For a pre-billing launch, present the commission promise honestly ("Free to join. We take a [X]% fee only when you get booked — nothing upfront"), and drop or clearly label any subscription tier that isn't purchasable yet.

### LND-002 — Pricing/feature lists promise capabilities the product doesn't have
- **Severity:** High
- **File:** `landing/src/components/sections/pricing-section.tsx:39-63`; `landing/src/components/sections/features-section.tsx:19-56`
- **What's wrong:** Advertised but unbuilt/deferred per `PROJECT_CONTEXT.md`: "Priority in search" / "Smart Matching" (no ranking — search quality deferred), "Booking calendar sync" (no availability/calendar model — deferred; double-booking is explicitly possible today), "Performance analytics" (admin analytics unbuilt), plus "Featured gig listings," "API access," "Team accounts (5 users)," "Multi-venue management," "Bulk gig posting," and "Dedicated manager." The entire Pro/Business value proposition is essentially vaporware.
- **Why it matters:** Charging for features that don't exist is misrepresentation; even free-tier users will churn/complain when promised matching/analytics/calendar don't work. High legal/reputational risk for a paid product.
- **Recommended fix:** List only shipped capabilities (gig posting, bidding/proposals, profiles, geosearch, escrow+OTP check-in once wired). Mark genuinely-roadmapped items as "Coming soon."

### LND-003 — Fabricated traction metrics and a fake review (aggregateRating) schema
- **Severity:** High
- **File:** `landing/src/components/sections/hero-section.tsx:266-267,445-457`; `cta-section.tsx:96-97`; `landing/src/app/layout.tsx:121-127`
- **What's wrong:** Hero claims "2,500+ artists joined this month" and "5k+ Artists / 2k+ Venues / 10k+ Gigs"; CTA says "Join thousands of venues and artists **already using** ZTS Music." For a pre-launch product these are false. Worse, `layout.tsx` ships JSON-LD `aggregateRating { ratingValue:"4.8", ratingCount:"1250" }` — a fabricated review-snippet schema.
- **Why it matters:** Fake stats are a conversion lie that erodes trust the moment a user finds an empty marketplace. Fabricated `aggregateRating` structured data **violates Google's structured-data policies** and risks a manual action / loss of rich results / domain reputation damage — a real SEO liability, not just an ethics issue.
- **Recommended fix:** Remove the `aggregateRating` block entirely until you have genuine reviews. Replace fabricated counters with honest pre-launch framing (e.g. "Now onboarding artists across [cities]", a waitlist count, or no number). Keep `WebApplication`/`Organization` JSON-LD (those are fine).

### LND-004 — Fake testimonials with stock avatars presented as real customers
- **Severity:** Medium
- **File:** `landing/src/components/sections/testimonials-section.tsx:14-57,127-134`
- **What's wrong:** Six named testimonials (Priya Sharma, Rahul Verma, …) with `i.pravatar.cc` stock avatars and hard-coded 5-star ratings, presented as authentic users of a product that hasn't launched.
- **Why it matters:** Invented testimonials are deceptive advertising (and in some jurisdictions actionable). Discovery that the "customers" are stock photos destroys credibility.
- **Recommended fix:** Remove until you have real, attributable testimonials (with consent). In the interim, replace with founder vision, partner logos, or a "be among the first" message.

### LND-005 — Value proposition describes a different product (one-click booking vs reverse auction)
- **Severity:** Medium
- **File:** `landing/src/components/sections/hero-section.tsx:229-238`; `features-section.tsx:21-24,39-43`
- **What's wrong:** Copy sells "Book Top Talent — One Click Away," "Instant Booking … confirm bookings in minutes," and a "Smart Matching algorithm." The actual product is a **reverse-auction**: clients post a budget, artists submit lower bids/proposals, then negotiation → escrow → OTP check-in. There is no matching algorithm and no one-click booking; the defining bidding mechanic is never mentioned anywhere on the page.
- **Why it matters:** The page sets expectations the product can't meet on first use (no instant booking; you wait for bids). Misaligned expectations crater activation and inflate support load. It also wastes the genuinely-differentiating story (competitive bids + OTP-verified payment release).
- **Recommended fix:** Lead with the real mechanic and its benefits: "Post your gig, get competitive bids from verified artists, pay securely — funds released only after OTP check-in at your event." That is both true and a stronger pitch than generic "one-click."

### LND-006 — "Verified artists" and "secure escrow payments" overstate unbuilt features
- **Severity:** Medium
- **File:** `landing/src/components/sections/features-section.tsx:27-30,45-49`; `how-it-works-section.tsx:55-59`
- **What's wrong:** "Verified Artists … verified reviews, professional credentials" and "Secure Payments … escrow-style payments. Artists get paid" / "Funds are held in escrow … released after a verified OTP check-in." Per `PROJECT_CONTEXT.md`, KYC verification is scaffolded-not-wired and payments/escrow are deferred (no gateway). The OTP check-in primitive exists in the schema, but payment release does not.
- **Why it matters:** "Secure payments / verified artists" are exactly the trust claims a money-handling marketplace must be able to honour. Promising escrow you can't execute is a refund/chargeback and reputation risk.
- **Recommended fix:** Soften to roadmap language until wired ("Escrow-protected payments — releasing soon"), or gate these claims behind the actual launch of the payment + KYC flows. The OTP check-in concept can be shown as "how we'll verify the gig happened."

### LND-007 — Invalid interactive nesting: `<Link><Button>…</Button></Link>` everywhere
- **Severity:** Medium
- **File:** `hero-section.tsx:241-249`; `cta-section.tsx:108-125`; `pricing-section.tsx:187-197`; `navbar.tsx:76-92,127-143`
- **What's wrong:** Every CTA wraps a `<Button>` (renders `<button>`) inside a `<Link>` (renders `<a>`), producing `<a><button>…</button></a>` — a button nested inside an anchor. This is invalid HTML (interactive content inside interactive content), causes accessibility ambiguity (two focusable controls for one action), and can produce React hydration warnings.
- **Why it matters:** Invalid/ambiguous interactive nesting breaks keyboard/AT semantics on the site's primary conversion controls and is non-conformant HTML.
- **Recommended fix:** The local `Button` already supports `asChild` (Radix `Slot`). Use `<Button asChild><Link href=…>…</Link></Button>` so a single `<a>` carries the button styling.

### LND-008 — Referenced OG image and logo assets are missing
- **Severity:** Medium
- **File:** `landing/src/app/layout.tsx:59-62,132,145`; `public/` (contains only `robots.txt`)
- **What's wrong:** Metadata references `/og-image.png` (OpenGraph + Twitter card) and JSON-LD references `${siteUrl}/logo.png`, but `public/` ships only `robots.txt`. Both image files are absent.
- **Why it matters:** Social shares render a broken/empty card (a measurable hit to click-through on shared links), and the Organization logo in structured data 404s.
- **Recommended fix:** Add real `og-image.png` (1200×630) and `logo.png` to `public/`, or remove the references until assets exist.

### LND-009 — "How it works" mislabels the artist flow as "For Venue Owners"
- **Severity:** Low
- **File:** `landing/src/components/sections/how-it-works-section.tsx:14-60,209-217`; `navbar.tsx:15-20`
- **What's wrong:** The array named `artistSteps` actually contains the **client/organiser** flow (Post Your Gig → Review Applications → Book & Perform) and is rendered first with no role label. The array named `venueSteps` contains the **artist** flow (Browse Gigs → Apply & Negotiate "send a proposal with your rate" → Get Paid via escrow/OTP) and is rendered under the heading **"For Venue Owners."** Venue owners don't apply to gigs or get paid — artists do. The variable names and the visible heading are both wrong/swapped. Navbar labels are also muddled ("About" → `#testimonials`, "For Artists" → `#features`, "For Venues" → `#how-it-works`).
- **Why it matters:** A visitor reading "For Venue Owners: send a proposal with your rate… get paid" is actively confused about who does what — directly hurting comprehension and conversion for both sides.
- **Recommended fix:** Relabel: first block "For Clients / Event Organisers," second block "For Artists," and rename the arrays to match. Align navbar labels with the sections they target.

### LND-010 — Footer dead links (incl. Terms/Privacy) and duplicate social link
- **Severity:** Low
- **File:** `landing/src/components/layout/footer.tsx:31-46,108-127`
- **What's wrong:** Blog, Careers, Help Center, Contact, Community, **Privacy, Terms, Cookies** all point to `href="#"`. The social row lists "Instagram" twice (the second should presumably be Twitter/X or Facebook).
- **Why it matters:** Missing Terms/Privacy is a genuine legal/trust gap for a marketplace that will handle payments and PII (and is typically required by payment providers and app stores). Dead links also hurt SEO and perceived completeness.
- **Recommended fix:** Ship at least Terms and Privacy pages before launch; remove or disable other placeholders; fix the duplicate social link.

### LND-011 — Redundant Tailwind v3 config alongside the v4 theme (dead/confusing)
- **Severity:** Low
- **File:** `landing/tailwind.config.ts`; `landing/src/app/globals.css`
- **What's wrong:** The project runs Tailwind v4 (`@tailwindcss/postcss`, `@import "tailwindcss"` + `@theme` in `globals.css`). It also ships a v3-style `tailwind.config.ts` (`hsl(var(--…))` colors, `content` globs, `require("@tailwindcss/typography")`, `darkMode:"class"`). v4 does not auto-load `tailwind.config.ts` (there's no `@config` directive), so that file — including the typography plugin and `content` globs — is effectively ignored. Styling actually works because the tokens are duplicated in `globals.css @theme`; the config file is dead weight that will mislead future edits.
- **Why it matters:** Not a current visual bug, but a maintenance trap: edits to `tailwind.config.ts` silently do nothing.
- **Recommended fix:** Delete `tailwind.config.ts` (and the unused `@tailwindcss/typography` dep) or wire it via `@config` if you actually need the plugin. Keep one source of truth.

### LND-012 — Duplicate `images.unsplash.com` remote pattern
- **Severity:** Low
- **File:** `landing/next.config.mjs:11-18`
- **What's wrong:** `images.unsplash.com` is listed twice in `images.remotePatterns`. Harmless but sloppy. (Note: the hero uses these hosts via raw `<img>`, not `next/image`, so only the `next/image` testimonials avatars on `i.pravatar.cc` actually need a pattern.)
- **Recommended fix:** Remove the duplicate; drop `images.unsplash.com` entirely if no `next/image` consumes it.

### LND-013 — SEO: sitemap uses hash-fragment "URLs"; sitemap/robots hardcode the domain
- **Severity:** Low
- **File:** `landing/src/app/sitemap.ts:13-37`; `landing/public/robots.txt:13`
- **What's wrong:** The sitemap lists `/#features`, `/#how-it-works`, `/#pricing`, `/#testimonials` as distinct entries. Crawlers ignore fragment identifiers; these are not separate URLs and add nothing. Separately, `robots.txt` and `sitemap.ts` hardcode `https://ztsmusic.com`, while metadata uses `NEXT_PUBLIC_SITE_URL`; if deployed elsewhere (the server config points to `gigs.ztas.in`), the sitemap/robots URLs will be wrong.
- **Recommended fix:** Keep only the canonical root in the sitemap (until there are real sub-routes); drive robots' `Sitemap:` line and the sitemap base off the same env var as metadata.

### LND-014 — Performance: continuous rAF re-render loop + unoptimised `<img>`
- **Severity:** Low
- **File:** `landing/src/components/sections/hero-section.tsx:128-154,258-263,331-334,419`
- **What's wrong:** The hero runs a `requestAnimationFrame` loop that calls `setRingRotations` every frame, re-rendering a large orbit subtree continuously; it never pauses when the section scrolls out of view (it caps `delta` but keeps running while the tab is visible). The social-proof avatars and 9 orbit images use raw `<img>` (no `next/image`), so they're unoptimised and have no width/height (CLS).
- **Why it matters:** Constant main-thread setState work hurts INP/scroll smoothness and battery on the most important above-the-fold section; unoptimised hero images hurt LCP.
- **Recommended fix:** Pause the rAF loop when the hero is not intersecting and on `visibilitychange`; drive the rotation via CSS transforms/`ref` rather than per-frame React state; use `next/image` (or fixed-size `<img>`) with explicit dimensions.

### LND-015 — Accessibility: low-contrast text and unlabeled mobile menu control
- **Severity:** Low
- **File:** `landing/src/components/layout/navbar.tsx:95-106`; widespread `text-white/30…/50`
- **What's wrong:** Body copy frequently uses `text-white/40`–`/50` (and footer `text-white/30`) on the near-black `#0c0515` background, below WCAG AA contrast. The mobile menu toggle is an icon-only `<Button size="icon">` with no `aria-label`, and the collapsible menu lacks `aria-expanded`/`aria-controls`.
- **Recommended fix:** Raise secondary-text opacity to meet 4.5:1 (≈`text-white/70` for body); add `aria-label="Open menu"`/`aria-expanded` to the toggle and `aria-controls` to the panel.

### LND-016 — CTA/site domains likely won't resolve at launch
- **Severity:** Low
- **File:** `landing/src/app/layout.tsx:21`; all CTA hrefs (`hero`, `cta`, `pricing`, `navbar`)
- **What's wrong:** Metadata default `siteUrl` is `https://ztsmusic.com` and every CTA points to `https://app.ztsmusic.com/*` (`/register`, `/login`, `/gigs/new`, `/contact`, `/register?plan=pro`). The server's own config (commit `7ee57a7`) names the live domains `gigs.ztas.in` (app) and `gigs-api.zoef.org` (API). If `app.ztsmusic.com` isn't the real app host, **every** conversion link is broken. The `?plan=pro` / `/contact` targets also imply flows that don't exist.
- **Recommended fix:** Point CTAs at the real app domain via an env var (`NEXT_PUBLIC_APP_URL`); remove plan/contact params that have no backing flow.

### LND-017 — Locale/copy is US-generic for an India-only product
- **Severity:** Low
- **File:** `landing/src/app/layout.tsx:65` (`locale:"en_US"`); hero/feature copy
- **What's wrong:** OpenGraph `locale` is `en_US` and copy is generic-US ("Book Live Musicians"), while the product is India-only (the team's `CONTENT_REVAMP.md` specifies `en_IN` + Indian cities/genres, never implemented). Testimonials use Indian names but the surrounding copy/locale/currency don't.
- **Recommended fix:** Set `locale:"en_IN"`, localise copy/currency, and reference Indian cities/genres (Bollywood/Sufi/Ghazal) the catalogue actually targets.

### LND-018 — Lint is broken: removed `next lint` script + crashing ESLint flat config
- **Severity:** Low
- **File:** `landing/package.json:9` (`"lint": "next lint"`); `landing/eslint.config.mjs:12-13`
- **What's wrong:** `next lint` was removed in Next 16, so `pnpm lint` fails immediately (`Invalid project directory … \landing\lint`). Running ESLint directly also crashes (`TypeError: Converting circular structure to JSON`) because the FlatCompat-wrapped `next/core-web-vitals`/`next/typescript` configs are incompatible with the installed ESLint 9.39.1 / `eslint-config-next` 16.1.4. The app cannot be linted in CI or locally as configured. (The admin app already uses `"lint": "eslint"` and lints fine.)
- **Why it matters:** No lint = no automated guard against regressions (unused vars, a11y rules, `no-console`, exhaustive-deps) on the marketing surface; CI lint steps will fail or be silently skipped.
- **Recommended fix:** Change the script to `"lint": "eslint"` (matching admin) and migrate `eslint.config.mjs` to the native flat config recommended by `eslint-config-next` for ESLint 9 (drop the FlatCompat shim), pinning compatible versions.

## Verified-good (landing)
- Metadata is otherwise solid: `metadataBase`, title template, canonical, robots, Twitter card, `WebApplication`/`Organization` JSON-LD (minus the fake rating), and a `viewport`/`themeColor` export.
- `next/image` remote hosts are correctly allow-listed in `next.config.mjs` (so testimonials avatars work).
- `ErrorBoundary` wraps the tree; `framer-motion` is a real dependency; the Tailwind v4 `@theme` tokens (and `text-gradient`/`text-balance` `@utility`) are defined, so the semantic color classes do render.
- ESLint `no-console:"error"` is respected (only `logger.ts`/`error-boundary.tsx` opt out with disables).

---

# Landing conversion & pricing-truthfulness review

**Bottom line:** the page is visually polished but **markets a product that doesn't exist yet** — a USD subscription SaaS with matching/analytics/calendar features, backed by fake traction and reviews — instead of the real thing: a pre-launch, India-only, INR reverse-auction marketplace whose payment/KYC spine is unbuilt. The single highest-leverage change is to make the page *true*, because the true story is also a better pitch.

**Pricing truthfulness — what to change**
1. **Currency & model:** INR, and commission-based, not USD subscriptions. Honest pre-billing framing: *"Free to join. No upfront cost. We earn a small fee only when a booking completes."* Hide any tier that can't be purchased today.
2. **Stop advertising unbuilt features** (search ranking, calendar sync, analytics, API, team/multi-venue, dedicated manager). List only what ships.
3. **Remove fabricated proof:** delete the `aggregateRating` JSON-LD (Google-policy risk), the "2,500+/5k+/10k+/thousands already using" counters, and the stock-photo testimonials. Replace with a waitlist/"first 100 artists" offer.

**Conversion structure — recommendations**
1. **Lead with the real mechanic and the moat:** "Post a gig → get competitive bids from verified artists → pay securely, released only after OTP check-in." This differentiates vs generic booking sites and is truthful. (`PROJECT_CONTEXT.md` even flags reverse-auction's weakness for top supply — consider a "request quotes" framing rather than "lowest bid wins.")
2. **Separate the two audiences cleanly** (fix LND-009): a clear "For Organisers" path and a "For Artists" path, each with its own CTA, instead of the current swapped labels.
3. **Replace fake numbers with a credible offer:** early-access/waitlist, founding-artist perks, city-launch focus (Mumbai first). A specific "now onboarding in Mumbai" beats a fake "10k+ gigs."
4. **Make the trust claims bankable:** only show "escrow-protected" and "verified artists" once those flows are live; until then, present them as the safety model you're building.
5. **Fix the funnel plumbing:** real app domain on every CTA (LND-016), working Terms/Privacy (LND-010), a real OG image (LND-008), and `asChild` CTAs (LND-007). These directly affect whether clicks convert and whether shared links look legitimate.
6. **India-localise** (LND-017): INR, `en_IN`, Indian cities/genres — table stakes for the target market.

---

# Build / Lint results

Environment: Node v22.21.1, pnpm 10.18.3, Windows. Both apps installed from cache (`pnpm install`, exit 0).

## Admin
- **`tsc --noEmit`: PASS** (0 errors).
- **`pnpm lint` (eslint): PASS** — 0 errors, 5 warnings:
  - `components/verifications/pii-field.tsx:26` — `userId` prop defined but never used (corroborates **ADM-007**: the prop is threaded through for audit logging that doesn't happen), plus an unused `eslint-disable no-console` directive at line 36.
  - `lib/api/users.ts:7` — `UserListItem` imported but unused.
  - `components/reports/resolve-dialog.tsx:59` and `components/users/user-filters.tsx:71` — React Compiler "Compilation Skipped: Use of incompatible library" for react-hook-form's `watch()` (these two components opt out of React Compiler memoization; functional, not a defect).

## Landing
- **`tsc --noEmit`: PASS** (0 errors).
- **`pnpm lint`: FAIL (tooling)** — two separate problems, neither caused by the app code:
  1. The `lint` script is `next lint`, which **was removed in Next.js 16**; `pnpm lint` errors with `Invalid project directory provided, no such directory: …\landing\lint` (Next parses `lint` as a positional dir). The admin app already uses the correct `"lint": "eslint"`.
  2. Running ESLint directly (`eslint .`, resolved ESLint 9.39.1) **crashes** loading the flat config: `TypeError: Converting circular structure to JSON` from `@eslint/eslintrc` FlatCompat while extending `next/core-web-vitals`/`next/typescript` (`eslint-config-next` 16.1.4). The landing app therefore cannot be linted as currently configured. Captured as **LND-018**.

(Full `next build` was not run to completion to keep within the time budget; both apps typecheck cleanly and the admin lints cleanly, so no compile-level blockers are expected beyond the runtime/correctness items above.)
