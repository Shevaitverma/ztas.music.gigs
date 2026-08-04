import { describe, it, expect } from 'bun:test';
import { Schema, model } from 'mongoose';
import { encryptPii, decryptPii } from '../shared/utils/crypto';

/**
 * Regression: Mongoose applies built-in transforms (`trim`, `uppercase`,
 * `lowercase`) AFTER custom `set` functions. Co-declaring one with an
 * encrypting setter uppercases the *ciphertext*, turning the `enc:v1:` sentinel
 * into `ENC:V1:`. Because base64 is case-sensitive that is irreversible, and
 * `decryptPii` then sees no prefix and silently returns the mangled value as if
 * it were a legacy plaintext row — a silent PII corruption + disclosure.
 *
 * This bit `artistVerifications.bankAccount.ifscCode`, which carried
 * `uppercase: true`. The fix normalises inside the setter instead. These tests
 * pin both the mechanism and the fix so it cannot regress.
 */

const AAD = 'artistVerifications.bankAccount.ifscCode';

const encryptingSetter = (v: unknown) =>
  encryptPii(typeof v === 'string' ? v.trim().toUpperCase() : (v as string), AAD);

describe('PII setter ordering', () => {
  it('demonstrates the hazard: a built-in transform runs after the setter and corrupts ciphertext', () => {
    const Broken = model(
      'BrokenIfsc',
      new Schema({
        ifscCode: { type: String, uppercase: true, set: (v: unknown) => encryptPii(v as string, AAD) },
      })
    );

    const raw = new Broken({ ifscCode: 'sbin0001234' }).toObject({ getters: false }) as {
      ifscCode: string;
    };

    // The sentinel has been uppercased — this is the corruption.
    expect(raw.ifscCode.startsWith('enc:v1:')).toBe(false);
    expect(raw.ifscCode.startsWith('ENC:V1:')).toBe(true);

    // And it is unrecoverable: no prefix means decryptPii passes it through
    // verbatim rather than throwing, so nothing surfaces the data loss.
    expect(decryptPii(raw.ifscCode, AAD)).toBe(raw.ifscCode);
  });

  it('normalising inside the setter keeps the ciphertext intact and round-trips', () => {
    const Fixed = model(
      'FixedIfsc',
      new Schema({ ifscCode: { type: String, set: encryptingSetter } })
    );

    const raw = new Fixed({ ifscCode: '  sbin0001234  ' }).toObject({ getters: false }) as {
      ifscCode: string;
    };

    expect(raw.ifscCode.startsWith('enc:v1:')).toBe(true);
    // Normalisation still happened — just before encryption, not after.
    expect(decryptPii(raw.ifscCode, AAD)).toBe('SBIN0001234');
  });

  it('the real ArtistVerification schema declares no post-setter transforms on ifscCode', async () => {
    const { ArtistVerificationModel } = await import('../db/models');
    const path = ArtistVerificationModel.schema.path('bankAccount.ifscCode') as unknown as {
      options: { uppercase?: boolean; lowercase?: boolean; trim?: boolean };
    };

    expect(path.options.uppercase).toBeUndefined();
    expect(path.options.lowercase).toBeUndefined();
    expect(path.options.trim).toBeUndefined();
  });
});
