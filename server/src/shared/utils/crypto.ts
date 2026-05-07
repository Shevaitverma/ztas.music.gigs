/**
 * Field-Level Encryption Utilities
 *
 * Uses AES-256-GCM (authenticated encryption) for encrypting sensitive PII at rest.
 * Key is sourced from `config.encryptionKey` (32-byte hex from `ENCRYPTION_KEY` env).
 *
 * Encrypted payload format (base64): iv(12) | authTag(16) | ciphertext
 *
 * In dev, if no key is set, a fixed dev key is used and a warning is logged. NEVER
 * use the fallback key in production.
 */

import crypto from 'node:crypto';
import { config } from '../../config';
import { logger } from '../../services/logger.service';

const cryptoLogger = logger.child('Crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

// Sentinel that flags an already-encrypted payload (so re-encrypting is a no-op).
const ENCRYPTED_PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;
let warnedDevFallback = false;

/**
 * Resolve the active encryption key. Throws in production if missing/invalid.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = config.encryptionKey;

  if (raw && raw.length >= 64) {
    // Hex-encoded 32-byte key
    try {
      const buf = Buffer.from(raw, 'hex');
      if (buf.length === KEY_LENGTH) {
        cachedKey = buf;
        return cachedKey;
      }
    } catch {
      // fall through to error/dev fallback
    }
  }

  if (config.app.nodeEnv === 'production') {
    throw new Error(
      'ENCRYPTION_KEY is required in production and must be 32 bytes (64 hex chars).'
    );
  }

  if (!warnedDevFallback) {
    cryptoLogger.warn(
      'ENCRYPTION_KEY missing or invalid; using insecure dev fallback. ' +
        'Set ENCRYPTION_KEY (64 hex chars) for any non-local environment.'
    );
    warnedDevFallback = true;
  }

  // Deterministic dev fallback derived from a fixed string. NOT for production.
  cachedKey = crypto.createHash('sha256').update('zts-dev-fallback-encryption-key').digest();
  return cachedKey;
}

let warnedLegacyAadFallback = false;

/**
 * Instrumentation counters for the AAD migration. Bumped from `decryptPii`:
 * - `aad`    : AAD-bound decrypt succeeded on first try (already migrated row)
 * - `legacy` : AAD failed and the legacy non-AAD fallback succeeded (un-migrated row)
 *
 * Used by the `scripts/reencrypt-pii-with-aad.ts` migration tool to estimate
 * impact (and verify idempotency on a second run). Counts only successful
 * decrypts; `Failed to decrypt field` errors throw before incrementing.
 */
const cryptoFallbackCounter = { aad: 0, legacy: 0 };

export function getCryptoFallbackCounter(): { aad: number; legacy: number } {
  return { aad: cryptoFallbackCounter.aad, legacy: cryptoFallbackCounter.legacy };
}

export function resetCryptoFallbackCounter(): void {
  cryptoFallbackCounter.aad = 0;
  cryptoFallbackCounter.legacy = 0;
}

/**
 * Encrypt a plaintext string with an AAD binding (e.g. `"users.panNumber"`).
 * The AAD is authenticated by GCM but not stored in the ciphertext, so an
 * attacker cannot transplant ciphertext between fields/collections.
 *
 * Returns a base64 payload prefixed with `enc:v1:`. If `plaintext` is already
 * encrypted (has the prefix), returns it unchanged.
 */
export function encryptPii(
  plaintext: string | undefined | null,
  aad: string
): string | undefined {
  if (plaintext === undefined || plaintext === null || plaintext === '') {
    return plaintext === '' ? '' : undefined;
  }
  if (typeof plaintext !== 'string') {
    return plaintext;
  }
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }
  if (!aad || typeof aad !== 'string') {
    throw new Error('encryptPii requires a non-empty AAD string');
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  return ENCRYPTED_PREFIX + payload;
}

/**
 * Decrypt a payload produced by {@link encryptPii}, verifying the AAD.
 *
 * MIGRATION: existing rows were encrypted without AAD. If AAD verification
 * fails, we retry decryption WITHOUT AAD so legacy rows still read. A one-time
 * warning is logged per process.
 *
 * TODO(crypto-aad-migration): remove the `decryptWithoutAad` fallback once a
 * migration sweep has re-encrypted every PII field with AAD bindings.
 */
export function decryptPii(
  payload: string | undefined | null,
  aad: string
): string | undefined {
  if (payload === undefined || payload === null || payload === '') {
    return payload === '' ? '' : undefined;
  }
  if (typeof payload !== 'string') {
    return payload;
  }
  if (!payload.startsWith(ENCRYPTED_PREFIX)) {
    // Legacy plaintext value — return as-is so existing rows still read.
    return payload;
  }
  if (!aad || typeof aad !== 'string') {
    throw new Error('decryptPii requires a non-empty AAD string');
  }

  const key = getKey();
  const buf = Buffer.from(payload.slice(ENCRYPTED_PREFIX.length), 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    cryptoFallbackCounter.aad++;
    return plaintext.toString('utf8');
  } catch (aadErr) {
    // Legacy fallback: rows encrypted before AAD binding was added have no AAD.
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      cryptoFallbackCounter.legacy++;
      if (!warnedLegacyAadFallback) {
        cryptoLogger.warn(
          'Decrypted PII field using legacy non-AAD path. Re-encrypt rows with ' +
            'AAD bindings; the fallback will be removed after the migration sweep.'
        );
        warnedLegacyAadFallback = true;
      }
      return plaintext.toString('utf8');
    } catch (legacyErr) {
      cryptoLogger.error('Failed to decrypt encrypted field (AAD + legacy)', {
        aadErr,
        legacyErr,
      });
      throw new Error('Failed to decrypt field');
    }
  }
}

/**
 * @deprecated Use {@link encryptPii} with an AAD binding instead.
 * Retained for backward compatibility during AAD migration.
 */
export function encrypt(plaintext: string | undefined | null): string | undefined {
  if (plaintext === undefined || plaintext === null || plaintext === '') {
    return plaintext === '' ? '' : undefined;
  }
  if (typeof plaintext !== 'string') {
    return plaintext;
  }
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  return ENCRYPTED_PREFIX + payload;
}

/**
 * @deprecated Use {@link decryptPii} with an AAD binding instead.
 * Retained for backward compatibility during AAD migration.
 */
export function decrypt(payload: string | undefined | null): string | undefined {
  if (payload === undefined || payload === null || payload === '') {
    return payload === '' ? '' : undefined;
  }
  if (typeof payload !== 'string') {
    return payload;
  }
  if (!payload.startsWith(ENCRYPTED_PREFIX)) {
    return payload;
  }

  try {
    const key = getKey();
    const buf = Buffer.from(payload.slice(ENCRYPTED_PREFIX.length), 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    cryptoLogger.error('Failed to decrypt encrypted field', err);
    throw new Error('Failed to decrypt field');
  }
}

/**
 * Mask a sensitive string to show only the last `visible` chars.
 * Returns plaintext if the input is shorter than `visible`.
 */
export function maskLast(value: string | undefined | null, visible: number = 4): string {
  if (!value) return '';
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(Math.max(0, value.length - visible)) + value.slice(-visible);
}

/**
 * True if the given string is in our encrypted format.
 */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}
