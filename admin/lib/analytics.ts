/**
 * Product analytics. PostHog behind a thin wrapper.
 *
 * Nothing outside this file imports `posthog-js` — that keeps the vendor
 * swappable and gives one chokepoint for the PII rule below.
 *
 * Disabled by default: with no NEXT_PUBLIC_POSTHOG_KEY nothing is loaded, no
 * network request is made, and every export is a no-op. The PII guard still
 * runs, so a bad `capture()` fails loudly in local dev even without a key.
 *
 * This is a copy of web/lib/analytics.ts (different event union, no budget
 * banding — admin never touches money). web/ and admin/ are separate pnpm
 * workspace roots with no shared package, so a copy beats standing one up
 * for two consumers.
 *
 * ponytail: duplicated module. Extract to a shared workspace package if a
 * third app needs it or the two copies start drifting.
 *
 * The admin console is internal tooling: page views (automatic) and the
 * moderation actions below, nothing more. Never instrument the KYC screens —
 * they render Aadhaar, PAN, GST and bank details.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
const isDev = process.env.NODE_ENV !== 'production'

export type AnalyticsEvent =
  | 'admin_user_status_changed'
  | 'admin_verification_reviewed'
  | 'admin_report_actioned'

export type Props = Record<string, string | number | boolean | null | undefined>

// ---------------------------------------------------------------------------
// PII guard
//
// This product handles Aadhaar, PAN, GST and bank details. Analytics carries
// IDs, enums, booleans, counts and banded values — nothing else. Violations
// throw in development and are stripped in production (a broken funnel is
// better than leaking a customer's PAN into a third party).
// ---------------------------------------------------------------------------

/** Denied wherever they appear as a word in the key. */
const DENIED = new Set([
  // identity / contact
  'name', 'email', 'mail', 'phone', 'mobile', 'address', 'city', 'pincode', 'dob',
  // KYC / financial identifiers
  'aadhaar', 'aadhar', 'pan', 'gst', 'gstin', 'ifsc', 'bank', 'account', 'upi',
  'passport', 'kyc', 'otp',
  // free text
  'title', 'comment', 'proposal', 'description', 'bio', 'notes', 'text', 'message',
])

/** Denied unless the key also carries a banding marker (see BANDING). */
const MONEY = new Set(['amount', 'price', 'budget', 'rate', 'fee', 'cost', 'total', 'earnings'])
const BANDING = new Set(['band', 'bands', 'bucket', 'range', 'tier'])

/** Longer than this and it is prose, not an enum/ID/band. */
const MAX_VALUE_LENGTH = 64
/** An email address, or a 10+ digit run (phone / Aadhaar / account number). */
const VALUE_PII = /@[^\s@]+\.[a-z]{2,}|(?<!\d)\d{10,}(?!\d)/i

/** `budgetBand` -> ['budget','band'], `budget_max` -> ['budget','max'] */
function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function denyReason(key: string, value: unknown): string | null {
  const parts = words(key)
  const denied = parts.find((p) => DENIED.has(p))
  if (denied) return `"${denied}" is personal or free-text data`
  if (!parts.some((p) => BANDING.has(p))) {
    const money = parts.find((p) => MONEY.has(p))
    if (money) return `"${money}" is an exact monetary value — send a band instead`
  }
  if (typeof value === 'string') {
    if (value.length > MAX_VALUE_LENGTH) return 'the value is free text, not an enum or ID'
    if (VALUE_PII.test(value)) return 'the value looks like an email, phone or ID number'
  }
  return null
}

/**
 * Drop (prod) or reject (dev) any property that violates the PII rule.
 * Exported for `analytics.test.mjs`.
 */
export function scrubProps(props: Props): Props {
  const safe: Props = {}
  for (const [key, value] of Object.entries(props)) {
    const reason = denyReason(key, value)
    if (!reason) {
      safe[key] = value
      continue
    }
    if (isDev) {
      throw new Error(
        `analytics: refusing to send property "${key}" — ${reason}. ` +
          `Send an ID, enum, boolean, count or banded value instead.`
      )
    }
    // production: strip silently, keep the event
  }
  return safe
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type PostHog = typeof import('posthog-js').default

/** Non-null only once init() has been called with a key and the chunk loaded. */
let ready: Promise<PostHog | null> | null = null

function withPostHog(fn: (ph: PostHog) => void): void {
  // Chaining on the load promise (rather than a `ph` ref) means events fired
  // before the chunk lands are queued rather than dropped.
  void ready?.then((ph) => ph && fn(ph))
}

export function initAnalytics(): void {
  if (ready || !KEY || typeof window === 'undefined') return
  // Do Not Track: skip loading entirely, not just opt out after the fact.
  if (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes') return

  ready = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        person_profiles: 'identified_only',
        // Autocapture records input values and element text — a PII firehose.
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        capture_pageview: 'history_change',
        capture_pageleave: true,
        respect_dnt: true,
        capture_exceptions: false,
      })
      return posthog
    })
    .catch(() => null)
}

/** Identify on login. Role and ID only — never name, email or phone. */
export function identify(id: string, role: string): void {
  const traits = scrubProps({ role })
  withPostHog((ph) => ph.identify(id, traits))
}

export function capture(event: AnalyticsEvent, props?: Props): void {
  // Scrub before the enabled-check so the dev guard fires without a key set.
  const safe = props ? scrubProps(props) : undefined
  withPostHog((ph) => ph.capture(event, safe))
}

/** Call on logout so a shared device doesn't cross-attribute two accounts. */
export function reset(): void {
  withPostHog((ph) => ph.reset())
}
