import { describe, it, expect } from 'bun:test';
import { scrubSentryEvent } from '../plugins/error.plugin';

/**
 * `scrubSentryEvent` used to touch only `event.request`. With
 * `sendDefaultPii:false` the request body is almost never populated — the PII
 * that actually ships to Sentry rides in exception messages (a Mongoose
 * ValidationError naming `aadhaarNumber`, a decrypt error echoing ciphertext),
 * `extra`, `contexts` and `breadcrumbs`. These pin the value-based scrubbing.
 */

const AADHAAR = '123412341234';
const AADHAAR_SPACED = '1234 5678 9012';

describe('scrubSentryEvent — value-based PII redaction', () => {
  it('redacts an Aadhaar number inside an exception message', () => {
    const event = scrubSentryEvent<any>({
      exception: {
        values: [
          {
            type: 'ValidationError',
            value: `aadhaarNumber: Path \`aadhaarNumber\` (${AADHAAR}) is invalid.`,
          },
        ],
      },
    });

    const value = event.exception.values[0].value;
    expect(value).not.toContain(AADHAAR);
    expect(value).toContain('[redacted]');
    // Non-PII context survives so the error is still diagnosable.
    expect(value).toContain('aadhaarNumber');
  });

  it('redacts PII in extra, including hyphen/space-grouped Aadhaar', () => {
    const event = scrubSentryEvent<any>({
      extra: { payload: { id: AADHAAR_SPACED, pan: 'ABCDE1234F' } },
    });

    expect(event.extra.payload.id).toBe('[redacted]');
    expect(event.extra.payload.pan).toBe('[redacted]');
  });

  it('redacts PII nested in contexts', () => {
    const event = scrubSentryEvent<any>({
      contexts: { verification: { doc: { number: AADHAAR } } },
    });

    expect(JSON.stringify(event)).not.toContain(AADHAAR);
  });

  it('redacts ciphertext blobs and JWTs in breadcrumbs', () => {
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${'a'.repeat(30)}.${'b'.repeat(30)}`;
    const event = scrubSentryEvent<any>({
      breadcrumbs: [
        { message: `decrypt failed for enc:v1:${'Zm9v'.repeat(20)}==` },
        { message: `token ${jwt} rejected` },
      ],
    });

    expect(event.breadcrumbs[0].message).toBe('decrypt failed for [redacted]');
    expect(event.breadcrumbs[1].message).toBe('token [redacted] rejected');
  });

  it('still scrubs session headers and sensitive-route bodies', () => {
    const event = scrubSentryEvent<any>({
      request: {
        url: 'https://api.example.com/api/v1/auth/login',
        headers: { Cookie: 'accessToken=abc', Authorization: 'Bearer abc', 'User-Agent': 'curl' },
        cookies: { accessToken: 'abc' },
        data: { password: 'hunter2' },
        query_string: 'otp=123456',
      },
    });

    expect(event.request.headers.Cookie).toBe('[scrubbed]');
    expect(event.request.headers.Authorization).toBe('[scrubbed]');
    expect(event.request.headers['User-Agent']).toBe('curl');
    expect(event.request.cookies).toBeUndefined();
    expect(event.request.data).toBe('[scrubbed]');
    expect(event.request.query_string).toBe('[scrubbed]');
  });

  it('does not hang on cyclic payloads', () => {
    const cyclic: any = { number: AADHAAR };
    cyclic.self = cyclic;

    const event = scrubSentryEvent<any>({ extra: cyclic });
    expect(event.extra.number).toBe('[redacted]');
  });

  it('leaves ordinary stack-trace text alone', () => {
    const value = 'TypeError: x is not a function\n    at /app/src/modules/gigs/gigs.service.ts:42:7';
    const event = scrubSentryEvent<any>({ exception: { values: [{ value }] } });
    expect(event.exception.values[0].value).toBe(value);
  });
});
