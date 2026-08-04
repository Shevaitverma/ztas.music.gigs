// Run: node --test lib/analytics.test.mjs   (from web/ or admin/)
// Guards the PII rule in lib/analytics.ts. NODE_ENV is unset here, so the
// module is in "dev" mode and violations throw.
import assert from 'node:assert/strict'
import test from 'node:test'
import { scrubProps } from './analytics.ts'

const denied = [
  { name: 'Asha Rao' },
  { artist_name: 'Asha Rao' },
  { stageName: 'Asha' },
  { user_email: 'a@b.com' },
  { phone: '9876543210' },
  { aadhaar: '123412341234' },
  { pan_number: 'ABCDE1234F' },
  { gstin: '27ABCDE1234F1Z5' },
  { bank_account: '000123456789' },
  { gig_title: 'Sangeet night' },
  { comment: 'They were great' },
  { proposal: 'I can do this' },
  { bid_amount: 12000 },
  { budget_max: 50000 },
  { baseRate: 8000 },
  // caught by value, not key
  { ref: 'contact me at asha@example.com' },
  { ref: '9876543210' },
  { ref: 'x'.repeat(65) },
]

for (const props of denied) {
  test(`rejects ${JSON.stringify(props)}`, () => {
    assert.throws(() => scrubProps(props), /refusing to send property/)
  })
}

test('allows IDs, enums, booleans, counts and banded values', () => {
  const safe = {
    gig_id: '68b0f3a2c1d4e5f60718293a',
    role: 'artist',
    category: 'LIVE_BAND',
    budget_band: '25k-50k',
    amount_bucket: '5k-10k',
    is_first_bid: true,
    rating: 4,
    direction: 'client_to_artist',
    reason: 'too_far',
    feature: 'payments',
    bid_count: 7,
  }
  assert.deepEqual(scrubProps(safe), safe)
})
