# Web Frontend Audit

Scope: `E:\shevait-projects\ztas.music.gigs\web` (user-facing Next.js 16 / React 19 app — client + artist roles).
Date: 2026-06-26. Method: full static review of `app/**`, `lib/**`, `components/**`, `middleware.ts`. Build/lint attempted (see "Build / lint").

This audit cross-checks the architecture documented in `PROJECT_CONTEXT.md`. The httpOnly-cookie auth flow, ws-ticket flow, and "payments deferred" notes were **verified** rather than re-flagged where they hold; where the documented design is undermined by the implementation it is called out.

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | WEB-001 |
| High | 3 | WEB-002, WEB-003, WEB-004 |
| Medium | 7 | WEB-005 … WEB-011 |
| Low | 9 | WEB-012 … WEB-020 |

The single most important fact: **a client can post a gig, receive bids, and accept one — but the funnel dead-ends the moment a bid is accepted.** There is no booking-management, check-in, completion, review, payment, or payout UI. The revenue spine is not wired (WEB-001), and the post-booking CTA 404s (WEB-002).

---

## WEB-001 — No payment / escrow / payout / check-in UI anywhere (revenue spine absent)
- **Severity:** Critical (revenue blocker)
- **Files:** `lib/api/checkin.ts` (entire module unused), `app/(dashboard)/artist/earnings/page.tsx:19-34,83,159`, `lib/types.ts:142-164` (Transaction type unused)
- **What's wrong:** `checkinApi` (generate-otp / verify-otp / end-event / status) is fully implemented in the API layer but **imported by zero components** (verified by grep). The `earnings` page renders hardcoded `earningsStats = { totalEarnings: 0, … }` and a non-functional "Add Bank Account" button (`hasBankAccount = false` constant). There is no Razorpay/UPI flow, no escrow status display, no payout request, and no OTP check-in screen. The `Transaction` type is defined but never fetched.
- **Why it matters:** The product "MUST generate revenue at launch." The OTP-check-in → dual end-event confirmation → escrow release → payout chain is the documented moat and the only way money moves. None of it is reachable from the UI. Even after a successful booking, neither side can transact. `PROJECT_CONTEXT.md` lists payments as "deliberately deferred" — this finding **confirms** that deferral is total on the frontend and is the gating blocker for launch revenue.
- **Recommended fix:** Build the post-booking surface (see WEB-002) hosting: client→artist payment intent, escrow state, OTP generation/verification for check-in, dual end-event confirmation, and payout/bank-account capture on the artist earnings page wired to real endpoints.

## WEB-002 — Post-booking dead-end: "Manage Event" route does not exist (404)
- **Severity:** High
- **File:** `app/(dashboard)/client/gigs/[id]/page.tsx:247-251`
- **What's wrong:** For a `BOOKED` gig the only CTA is `<Link href={`/client/gigs/${gigId}/manage`}>Manage Event</Link>`. There is no `app/(dashboard)/client/gigs/[id]/manage/` route (verified against the route tree). Clicking it 404s.
- **Why it matters:** This is the exact screen a client lands on right after accepting a bid (gig → BOOKED). The happy path terminates at a 404. Combined with WEB-001, the client has no way to manage, check-in, complete, or pay for the event they just booked.
- **Recommended fix:** Implement the `manage` route as the event-lifecycle hub (check-in OTP, end-event confirmation, payment, post-event review), or remove the link until built.

## WEB-003 — WebSocket message listener is wiped during the initial auth bootstrap
- **Severity:** High
- **File:** `lib/hooks/use-bids-socket.ts:326-354` (registration effect) vs `:417-442` (logout effect)
- **What's wrong:** `userAtom` starts `null` (`lib/atoms/auth.ts:7`) and is only populated after the `/auth/me` query resolves. On mount, effects run top-to-bottom: (1) the registration effect adds `handleMessage` to `globalWsListeners` and calls `getOrCreateWebSocket()`; (3) the `user === null` effect immediately runs and calls `globalWsListeners.clear()` + closes the socket (it treats "not yet loaded" as "logged out"). The registration effect's deps are `[handleMessage]` (stable), so it **never re-runs** and the listener is **never re-added**. When `user` later resolves to a value, the effect's `else` branch only flips `globalWsLoggedOut = false` — it does not re-register the listener or reconnect.
- **Why it matters:** On every normal page load of the two pages that use this hook (`client/gigs/[id]` and `artist/gigs/[id]`), real-time bid events (`BID_PLACED`, `NEW_LOWER_BID`/outbid toast, `BID_ACCEPTED`/`BID_REJECTED`) are silently dropped and their cache invalidations never fire. The live reverse-auction — the core differentiator — appears connected (the "Live" badge can still flip via the 1s `readyState` poll) but delivers no updates. Data only refreshes from the current user's own mutations, never from the counterparty's actions.
- **Recommended fix:** Distinguish "auth still loading" from "logged out". Gate the teardown on an explicit logged-out transition (e.g. track previous user id, or use `isLoading` from `useAuth`) instead of `user === null`; and/or re-add the listener whenever the socket is (re)created.

## WEB-004 — Open redirect via `?next=` after login
- **Severity:** High (security)
- **File:** `app/(auth)/login/page.tsx:39,122,128` (`redirectTo = searchParams.get('next')` → `router.push(redirectTo)`)
- **What's wrong:** The post-login redirect target is taken verbatim from the attacker-controllable `next` query parameter with no validation that it is a same-origin relative path. `router.push('https://evil.example')` performs a real navigation. A link such as `/login?next=https://evil.example` redirects the user off-site immediately after they authenticate.
- **Why it matters:** Classic open-redirect → phishing / token-handoff vector on the highest-trust moment of the funnel (just after auth). The middleware only ever *writes* internal pathnames into `next`, but the login page *reads* it untrusted.
- **Recommended fix:** Accept only relative paths: reject values that don't start with a single `/` (and not `//`), or parse with `new URL(next, location.origin)` and confirm `origin` matches before navigating. Apply the same guard wherever `next` is consumed.

## WEB-005 — "View artist" link on every bid points to a non-existent route (404)
- **Severity:** Medium
- **File:** `app/(dashboard)/client/gigs/[id]/page.tsx:369` (`<Link href={`/artists/${bid.artistId}`}>`)
- **What's wrong:** The artist profile route is `app/(dashboard)/client/artists/[id]`, i.e. `/client/artists/:id`. The bid card links to `/artists/:id`, which has no route → 404.
- **Why it matters:** Clients cannot vet an artist before accepting their bid — a key trust step in the booking decision. Every "view artist" button on the bid list is broken.
- **Recommended fix:** Change the href to `/client/artists/${bid.artistId}`.

## WEB-006 — "Edit Gig" route does not exist (404)
- **Severity:** Medium
- **File:** `app/(dashboard)/client/gigs/[id]/page.tsx:237-239,243-245` (`/client/gigs/${gigId}/edit`)
- **What's wrong:** Both the DRAFT "Edit" and LIVE "Edit Gig" buttons link to `/client/gigs/:id/edit`, which has no route. `gigsApi.update`/`useUpdateGig` exist but no edit page consumes them.
- **Why it matters:** Clients cannot correct a typo, budget, date, or venue after posting. For a DRAFT gig this is the natural pre-publish step; for LIVE gigs there is no recovery short of delete + repost (which drops existing bids).
- **Recommended fix:** Implement the `edit` route reusing the create-gig form/schema, or hide the buttons until built.

## WEB-007 — Onboarding saves client profile in the wrong wire shape (data lost)
- **Severity:** Medium
- **Files:** `app/(auth)/onboarding/page.tsx:76-90` and `lib/api/users.ts:14-16` vs `app/(dashboard)/client/profile/page.tsx:78-97`
- **What's wrong:** Client onboarding calls `usersApi.updateProfile({ companyName, city })` — a flat top-level shape. The canonical shape used everywhere else (profile edit, and reads) is nested: `updateMe({ name, clientProfile: { companyName, location: { city } } })`, and reads come from `user.clientProfile.companyName` / `user.clientProfile.location.city`. The flat onboarding payload will not populate `clientProfile`, so the company/city collected during onboarding is silently dropped server-side.
- **Why it matters:** First-run data capture for clients is lost; the profile then shows empty company/city right after onboarding, undermining trust and any city-based matching.
- **Recommended fix:** Make onboarding send the same nested `clientProfile` shape (and confirm the server contract for `PUT /users/me`).

## WEB-008 — Discover search box is non-functional
- **Severity:** Medium
- **File:** `app/(dashboard)/artist/discover/page.tsx:39,55-70`
- **What's wrong:** The `q`/`search` value is bound to the input and synced to the URL, but it is **never** included in the query key or passed to `gigsApi.getAll(...)` (and `GigFilters` has no search field). Typing in the search box changes nothing in the results.
- **Why it matters:** Discovery is how artists find gigs to bid on (supply side of the funnel). A visibly-present search that does nothing is both a dead feature and a trust problem.
- **Recommended fix:** Add a `search`/`q` field to `GigFilters` + `gigsApi.getAll`, include it in the query key, and confirm the server search param name. If the backend has no text search, remove the input.

## WEB-009 — No way to leave a review (two-way review moat has no creation UI)
- **Severity:** Medium
- **Files:** `lib/api/reviews.ts:5,33,37` (`create`/`update`/`respond` unused), `app/(dashboard)/artist/reviews/page.tsx` (read-only)
- **What's wrong:** `reviewsApi.create`, `update`, and `respond` are never called anywhere (grep-verified). The reviews page only displays incoming reviews; there is no review form for either side and no "respond to review" control.
- **Why it matters:** Two-way reviews are a stated moat and a retention/trust driver. With no post-event flow (WEB-001/002) and no create UI, the review graph can never be populated through the product.
- **Recommended fix:** Add a review-creation step to the post-event/manage flow for both client→artist and artist→client, plus a response control on the reviews page.

## WEB-010 — Onboarding completion is never enforced
- **Severity:** Medium
- **Files:** `app/(auth)/login/page.tsx:118-128`, `app/(auth)/register/page.tsx:74-79`, `lib/atoms/auth.ts:22-24` (`isOnboardingCompleteAtom` unused)
- **What's wrong:** Routing to `/onboarding` depends on `response.isNewUser`. A user who completed signup but abandoned onboarding (`artistProfile.onboardingComplete === false`) logs back in with `isNewUser` falsy and is sent straight to `/artist`. No guard (middleware or `RoleGuard`) checks `onboardingComplete`; `isOnboardingCompleteAtom` is defined but never read.
- **Why it matters:** Artists can reach the dashboard, discover, and bid with an empty profile (no stage name, base rate, genres) — degrading match quality and client trust, and producing bids from blank profiles.
- **Recommended fix:** Gate dashboards on `onboardingComplete` (redirect to `/onboarding` when false), or drive routing off the fetched user object rather than the transient `isNewUser` flag.

## WEB-011 — Newly created gigs are DRAFT with no clear publish nudge in the create flow
- **Severity:** Medium (funnel friction)
- **File:** `app/(dashboard)/client/gigs/new/page.tsx:90-108` → redirects to `/client/gigs/:id`; publish lives only on the detail page (`app/(dashboard)/client/gigs/[id]/page.tsx:227-241`)
- **What's wrong:** `gigsApi.create` produces a DRAFT gig; the create wizard's final button says "Create Gig" and then drops the user on the detail page where they must separately click "Publish Gig". Discover only lists `status: 'LIVE'`, so an unpublished gig receives zero bids and zero artist visibility.
- **Why it matters:** A client who completes the entire 4-step wizard but doesn't notice the second "Publish" action gets no bids and assumes the marketplace is dead. This is a silent top-of-funnel leak.
- **Recommended fix:** Either auto-publish on create, or make the wizard's final action "Create & Publish", or show a prominent persistent banner on DRAFT gigs. (The dashboard draft banner exists but the wizard exit doesn't reinforce it.)

## WEB-012 — `clearAuthAndRedirect` writes to the wrong jotai store
- **Severity:** Low
- **Files:** `lib/api/client.ts:171-179` (`getDefaultStore().set(userAtom, null)`) vs `lib/providers/index.tsx:12` (`<JotaiProvider>` with no `store` prop → isolated store)
- **What's wrong:** The app wraps the tree in a Provider-scoped jotai store, but the axios interceptor clears `userAtom` on the module-level default store. The UI's `user` state is therefore not actually cleared by this path; it only works because the subsequent `window.location.href = '/login'` hard-reloads. If the hard nav is skipped (already on `/login`), the in-memory clear is a no-op.
- **Why it matters:** Latent correctness bug; masked today by the redirect.
- **Recommended fix:** Pass an explicit shared store to `<Provider store={…}>` and reuse it in the interceptor, or route logout through `AuthProvider.logout` which already targets the correct store.

## WEB-013 — `asChild` Button silently drops `leftIcon`/`rightIcon`
- **Severity:** Low (cosmetic)
- **File:** `components/ui/button.tsx:65-72`
- **What's wrong:** When `asChild` is true, only the child element is cloned with merged className; `leftIcon`/`rightIcon` are not rendered. Several CTAs pass both (`client/page.tsx` "Post a Gig" + Plus, `app/error.tsx`/`not-found.tsx` "Go Home" + Home, `client/gigs/page.tsx` "Post New Gig" + Plus).
- **Why it matters:** Icons silently disappear from key buttons; purely visual.
- **Recommended fix:** Inject the icons into the cloned child's children, or document that `asChild` does not support icon slots.

## WEB-014 — Status-tab counts are computed from already-filtered data
- **Severity:** Low
- **Files:** `app/(dashboard)/client/gigs/page.tsx:44-53`, `app/(dashboard)/artist/bids/page.tsx:43-48`
- **What's wrong:** Counts are derived from the current (server-filtered) result set. When a non-"all" status filter is active, every other tab shows `0` and "All" shows only the filtered subset count.
- **Why it matters:** Misleading navigation; users think they have no gigs/bids in other states.
- **Recommended fix:** Fetch counts unfiltered (or from a stats endpoint) independent of the active filter.

## WEB-015 — Inconsistent role casing (`=== 'artist'` vs `.toUpperCase()`)
- **Severity:** Low
- **File:** `components/layout/header.tsx:42` (`user?.role === 'artist'`)
- **What's wrong:** Most of the app compares roles case-insensitively (`role?.toUpperCase() === 'ARTIST'`), but the header avatar link uses a strict lowercase compare. If the server ever returns `ARTIST`, an artist's avatar links to `/client/profile`.
- **Why it matters:** Fragile; fine only while the server guarantees lowercase.
- **Recommended fix:** Use the same case-normalized comparison (or the `isArtistAtom`) everywhere.

## WEB-016 — Links to `/terms` and `/privacy` 404
- **Severity:** Low
- **Files:** `app/(dashboard)/settings/page.tsx:35`, `app/(auth)/register/page.tsx:219-225`
- **What's wrong:** Settings ("Terms & Privacy Policy") and the registration footer link to `/terms` and `/privacy`, which have no routes.
- **Why it matters:** Broken legal links; relevant for app-store / compliance review and user trust at signup.
- **Recommended fix:** Add the pages or point to hosted policy URLs.

## WEB-017 — DatePicker parses `YYYY-MM-DD` as UTC (off-by-one outside IST)
- **Severity:** Low
- **File:** `components/ui/date-picker.tsx:51,57` (`new Date(value)`); paired with write `format(date, 'yyyy-MM-dd')` (`:90`)
- **What's wrong:** `new Date('2026-06-26')` is parsed as UTC midnight; rendering with local `format` can show the previous day for timezones behind UTC. The app is India-only (UTC+5:30, ahead of UTC), so it is correct there, but it is a latent bug for any non-IST user/test environment.
- **Why it matters:** Event dates could display/serialize one day off outside IST.
- **Recommended fix:** Parse as local date (`parseISO`/`new Date(y, m-1, d)`) rather than relying on UTC string parsing.

## WEB-018 — Dead "Edit Bid" control
- **Severity:** Low
- **File:** `app/(dashboard)/artist/bids/[id]/page.tsx:125-133`
- **What's wrong:** The "Edit Bid" button has no `onClick`. (Editing actually happens on the gig detail page when outbid.)
- **Why it matters:** Dead control; user confusion.
- **Recommended fix:** Wire it to the gig detail bid form or remove it.

## WEB-019 — Admin role in the web app redirects to a 404
- **Severity:** Low
- **Files:** `app/(auth)/login/page.tsx:125`, `app/(auth)/register/page.tsx:77`, `app/page.tsx:23`, `middleware.ts:5`
- **What's wrong:** If an `admin` user authenticates in the *web* app, routing sends them to `/admin`, which exists only in the separate admin app (no `/admin` route here). `middleware.ts` even lists `/admin` as protected. Result: authenticated admin → 404.
- **Why it matters:** Edge case (admins use `:3001`), but a confusing dead-end if it happens.
- **Recommended fix:** Either bounce admin to the admin app URL or surface an explicit "use the admin portal" message.

## WEB-020 — Accepting a bid does not invalidate the "My Gigs" list cache
- **Severity:** Low
- **File:** `app/(dashboard)/client/gigs/[id]/page.tsx:97-109` (inline `acceptBidMutation`)
- **What's wrong:** The inline accept mutation invalidates `['gig', gigId]` and `['bids','gig',gigId]` but not `['gigs','my']`. (The unused `useAcceptBid` hook in `lib/hooks/use-bids.ts:85-100` does invalidate it.) The My Gigs list / client dashboard can show the gig as still LIVE until its own refetch.
- **Why it matters:** Brief stale status across views after a booking.
- **Recommended fix:** Add `queryClient.invalidateQueries({ queryKey: ['gigs','my'] })` to the inline mutation, or use the existing hook.

---

## Verified-as-correct (documented decisions that hold up)
- **httpOnly cookie auth:** `lib/api/client.ts` sets `withCredentials: true`, attaches no Bearer header, and refreshes via `/auth/refresh` with singleflight (`refreshPromise`). No tokens in `localStorage`/`sessionStorage`/`document.cookie` (grep-clean). ✔
- **Middleware `/auth/me` gate:** `middleware.ts` forwards the `Cookie` header to `/auth/me` with a 3s `AbortController` and `cache: 'no-store'`; sensible failure-mode policy (ambiguous→login on protected, ambiguous→through on auth routes). ✔
- **Structured new-user signup:** `isRequiresRoleResponse` branch → role selection → `/auth/complete-signup` (`lib/api/auth.ts`, `login`/`register` pages). ✔
- **ws-ticket flow:** `getWsTicket()` per (re)connect, `?ticket=` on the WS URL, exponential backoff with jitter, per-room refcount (`use-bids-socket.ts`). The refcount/backoff machinery is correct — its only defect is WEB-003. ✔ (mechanics) / ✖ (listener lifecycle)
- **No `dangerouslySetInnerHTML`, no `eval`, no client secrets:** grep-clean. Firebase web config reads public `NEXT_PUBLIC_*` with project id hardcoded `"zts-music"` (public per Firebase) — matches `PROJECT_CONTEXT.md`. ✔
- **Zod on key forms:** gig create (`lib/schemas/gig.ts`, `safeParse` in `client/gigs/new`), role selection (`lib/schemas/auth.ts`), and careful non-coercing number parsing in create-gig budget and onboarding years-of-experience. ✔

---

## Build / lint

**Result: could not complete within the time budget — relying on static review (as permitted by the task).**

- `pnpm install` was started at the beginning of the audit and was still running past the ~4-minute budget. At the time of writing, `node_modules` is only partially populated: `node_modules/typescript`, `node_modules/.bin/eslint`, and `node_modules/.bin/next` were all absent.
- `npx tsc --noEmit` could not run — it resolved to the global `tsc` stub package ("This is not the tsc command you are looking for") because the local `typescript` package was not yet installed. There is no `typecheck` script in `package.json` (only `dev`/`build`/`start`/`lint`).
- `pnpm lint` (eslint) could not run for the same reason (eslint binary not yet present).

No compile/lint errors are reported here because the tools could not execute, **not** because the code is known clean. The findings above are from manual review. Recommended follow-up once install completes: `pnpm lint` and `npx tsc --noEmit` (add a `"typecheck": "tsc --noEmit"` script). Note one likely-noisy area for a strict typecheck: `lib/api/users.ts` (`getMe`/`updateMe`/`getById` return the `ApiResponse<User>` envelope while some callers unwrap `.data` and others don't — e.g. `client/artists/[id]/page.tsx:33` unwraps, onboarding ignores the result).

---

## Revenue-funnel walkthrough

### Client happy path (post gig → accept bid → … → pay)
1. **Signup/role** — Google sign-in → `requiresRole` → choose "Client" → `/auth/complete-signup`. ✔ Works.
2. **Onboarding** — collects company/city, but via the wrong wire shape, so it is **lost** (WEB-007). User still reaches `/client`. ⚠
3. **Post a gig** — 4-step wizard with zod validation. ✔ Works, but the gig is created as **DRAFT** and the wizard exits to the detail page without strongly steering the user to **Publish** (WEB-011). If they miss "Publish Gig", the gig is invisible in Discover and gets **0 bids**. ⚠ (silent leak)
4. **Publish** — "Publish Gig" on the detail page → LIVE. ✔ Works.
5. **Receive bids** — bids list renders, sorted lowest-first, with a "Lowest" badge. ✔ But the per-bid **"view artist"** button 404s (WEB-005), so the client can't vet artists; and **real-time** new-bid toasts/refresh are dead on a fresh load (WEB-003) — the list only updates on manual refetch. ⚠
6. **Accept a bid** — confirm modal → `PUT /bids/:id/status {ACCEPTED}` → gig → BOOKED. ✔ Mutation works (minor stale-list cache, WEB-020).
7. **Manage the booked event** — **BREAKS HERE.** The only CTA is "Manage Event" → `/client/gigs/:id/manage` which **does not exist → 404** (WEB-002). There is no check-in, completion, review, or payment screen (WEB-001). **The client cannot pay, and the platform cannot take its cut.** ✖ Funnel terminates.
8. Editing a gig at any point also 404s (WEB-006). ✖

**Net:** Client funnel works through *accept bid*, then dead-ends with no payment path.

### Artist happy path (discover → bid → win → get paid)
1. **Signup/role/onboarding** — choose "Artist", single-step onboarding (stage name/city/experience) saved correctly via the nested `location` shape. ✔ But onboarding is not enforced, so an artist can skip it and still bid (WEB-010). ⚠
2. **Discover gigs** — lists LIVE gigs, filters work, already-applied gigs excluded. ✔ But the **search box does nothing** (WEB-008). ⚠
3. **Place a bid** — reverse-auction validation (must be below current lowest / within budget), proposal ≥20 chars, `POST /bids`. ✔ Works.
4. **Stay competitive / get outbid** — the bid form auto-opens when outbid and lets the artist lower the amount. ✔ But the **outbid push** (`NEW_LOWER_BID` toast + auto-refresh) is dead on a fresh page load because the WS listener was wiped (WEB-003); the artist only learns they were outbid on a manual refresh/refetch. ⚠ (core real-time value degraded)
5. **Win the bid** — on acceptance the bid detail shows "Congratulations!" and client contact info (email/phone). ✔ (The `BID_ACCEPTED` toast suffers the same WS issue.)
6. **Perform & check in** — **BREAKS HERE.** No OTP check-in screen, no end-event confirmation UI (`checkinApi` unused) (WEB-001). ✖
7. **Get paid** — **BREAKS HERE.** `earnings` is a hardcoded zeros placeholder; "Add Bank Account"/"Add Payment Method" buttons are inert; no payout request, no transaction history (WEB-001). ✖
8. **Get reviewed / build reputation** — no review can be created by anyone (WEB-009); ratings shown on profiles/bids are hardcoded ("4.9", "4.8", "28 reviews"). ✖

**Net:** Artist funnel works through *win the bid + see client contact*, then dead-ends — no check-in, no payout, no reviews. In practice the only way money could change hands is **off-platform** (the bid detail hands over the client's email/phone), which is precisely the disintermediation risk flagged in `PROJECT_CONTEXT.md`.

### Where the funnel breaks (one line)
Both sides complete **bid → accept**; everything after the booking (check-in, completion, payment, payout, reviews) is unbuilt, and the client's post-booking CTA 404s — so the platform collects no revenue at launch.
