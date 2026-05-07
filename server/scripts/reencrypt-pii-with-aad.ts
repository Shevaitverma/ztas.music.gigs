/**
 * One-shot PII re-encryption migration: bind AAD to existing ciphertext.
 *
 * BACKGROUND
 * ----------
 * PII fields on `OrganizerVerification` and `ArtistVerification` are encrypted
 * at rest with AES-256-GCM via `src/shared/utils/crypto.ts`. Older rows were
 * encrypted WITHOUT AAD; `decryptPii` currently has a legacy fallback that
 * retries without AAD when the AAD path fails (and emits a one-time warning).
 *
 * This script reads every encrypted PII field through the model getters
 * (which transparently use the legacy fallback for un-migrated rows) and
 * re-saves the document so the model setters re-encrypt the value WITH AAD.
 *
 * AFFECTED FIELDS
 *   OrganizerVerification:
 *     - identity.number
 *     - business.gstNumber
 *     - business.panNumber
 *   ArtistVerification:
 *     - identity.number
 *     - bankAccount.accountNumber
 *     - bankAccount.ifscCode
 *
 * USAGE
 * -----
 *   bun run scripts/reencrypt-pii-with-aad.ts --help
 *
 *   # Dry-run + verify (no writes; reports AAD vs. legacy decrypt counts):
 *   bun run scripts/reencrypt-pii-with-aad.ts --dry-run --verify-only
 *
 *   # Verify only (read every doc, count which path was used, no writes):
 *   bun run scripts/reencrypt-pii-with-aad.ts --verify-only
 *
 *   # Test on N docs first:
 *   bun run scripts/reencrypt-pii-with-aad.ts --limit 5 --dry-run
 *
 *   # Real migration (writes!):
 *   bun run scripts/reencrypt-pii-with-aad.ts
 *
 * WARNINGS
 * --------
 *   - This is a ONE-SHOT migration. Re-running is idempotent (already-AAD
 *     ciphertext re-encrypts cleanly), but wasteful — the second run will
 *     show 0 legacy fallbacks and just rewrite every PII row again.
 *   - After a successful production run, delete the legacy fallback path in
 *     `src/shared/utils/crypto.ts` (search for `TODO(crypto-aad-migration)`).
 *
 * SAFETY
 * ------
 *   - Reuses the app's `connectDB` from `src/db/index.ts` so connection options
 *     and config match exactly.
 *   - `--dry-run` skips `doc.save()` entirely.
 *   - `--help` exits before touching the DB.
 */

import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/db';
import {
  OrganizerVerificationModel,
  ArtistVerificationModel,
} from '../src/db/models';
import { config } from '../src/config';
import {
  getCryptoFallbackCounter,
  resetCryptoFallbackCounter,
} from '../src/shared/utils/crypto';

// ---------- CLI parsing ----------

interface CliOptions {
  dryRun: boolean;
  verifyOnly: boolean;
  limit: number | null;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    verifyOnly: false,
    limit: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--verify-only') opts.verifyOnly = true;
    else if (a === '--limit') {
      const next = argv[++i];
      if (!next) throw new Error('--limit requires a number');
      const n = Number(next);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit must be a positive integer, got: ${next}`);
      }
      opts.limit = Math.floor(n);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
reencrypt-pii-with-aad — one-shot AAD migration

Flags:
  --help, -h        Show this help and exit (no DB connection).
  --dry-run         Read & decrypt every PII field but skip doc.save().
  --verify-only     Don't migrate; report AAD vs. legacy decrypt counts.
  --limit N         Process only the first N docs per collection (testing).

Examples:
  bun run scripts/reencrypt-pii-with-aad.ts --help
  bun run scripts/reencrypt-pii-with-aad.ts --verify-only
  bun run scripts/reencrypt-pii-with-aad.ts --dry-run --limit 5
  bun run scripts/reencrypt-pii-with-aad.ts
`);
}

// ---------- Migration core ----------

interface FieldSpec {
  /** Human label for logs. */
  label: string;
  /** Read decrypted value from a (lean=false) Mongoose doc. */
  read: (doc: any) => string | undefined;
  /** Write plaintext back to the doc so the setter re-encrypts with AAD. */
  write: (doc: any, value: string) => void;
}

const ORGANIZER_FIELDS: FieldSpec[] = [
  {
    label: 'identity.number',
    read: (d) => d.identity?.number,
    write: (d, v) => {
      if (d.identity) d.identity.number = v;
    },
  },
  {
    label: 'business.gstNumber',
    read: (d) => d.business?.gstNumber,
    write: (d, v) => {
      if (d.business) d.business.gstNumber = v;
    },
  },
  {
    label: 'business.panNumber',
    read: (d) => d.business?.panNumber,
    write: (d, v) => {
      if (d.business) d.business.panNumber = v;
    },
  },
];

const ARTIST_FIELDS: FieldSpec[] = [
  {
    label: 'identity.number',
    read: (d) => d.identity?.number,
    write: (d, v) => {
      if (d.identity) d.identity.number = v;
    },
  },
  {
    label: 'bankAccount.accountNumber',
    read: (d) => d.bankAccount?.accountNumber,
    write: (d, v) => {
      if (d.bankAccount) d.bankAccount.accountNumber = v;
    },
  },
  {
    label: 'bankAccount.ifscCode',
    read: (d) => d.bankAccount?.ifscCode,
    write: (d, v) => {
      if (d.bankAccount) d.bankAccount.ifscCode = v;
    },
  },
];

interface CollectionStats {
  collection: string;
  processed: number;
  migrated: number;
  skipped: number;
  errors: number;
  fieldsSeen: number;
  /** Counter snapshot diffs (just for this collection's run). */
  aadDecrypts: number;
  legacyDecrypts: number;
  errorDetails: Array<{ id: string; field: string; error: string }>;
}

async function processCollection(
  modelName: string,
  // Use any to keep this generic across both verification models.
  Model: mongoose.Model<any>,
  fields: FieldSpec[],
  opts: CliOptions
): Promise<CollectionStats> {
  const stats: CollectionStats = {
    collection: modelName,
    processed: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    fieldsSeen: 0,
    aadDecrypts: 0,
    legacyDecrypts: 0,
    errorDetails: [],
  };

  const before = getCryptoFallbackCounter();

  let query = Model.find({});
  if (opts.limit !== null) query = query.limit(opts.limit);

  const cursor = query.cursor();

  for (
    let doc = await cursor.next();
    doc !== null;
    doc = await cursor.next()
  ) {
    stats.processed++;
    let docHadAnyData = false;
    let docDecryptedSuccessfully = true;

    // Read every PII field via the getter (decrypt + count).
    const decryptedValues: Array<{ field: FieldSpec; value: string }> = [];
    for (const field of fields) {
      try {
        const v = field.read(doc);
        if (typeof v === 'string' && v.length > 0) {
          docHadAnyData = true;
          stats.fieldsSeen++;
          decryptedValues.push({ field, value: v });
        }
      } catch (err) {
        stats.errors++;
        docDecryptedSuccessfully = false;
        stats.errorDetails.push({
          id: String(doc._id),
          field: field.label,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!docHadAnyData) {
      stats.skipped++;
      continue;
    }

    if (opts.verifyOnly || opts.dryRun) {
      // Just counted — don't write. Tally docs that *would* be re-saved
      // (`migrated` here means "had data and decrypted cleanly").
      if (docDecryptedSuccessfully) stats.migrated++;
      continue;
    }

    if (!docDecryptedSuccessfully) {
      // Don't risk re-saving a partially-decrypted doc.
      continue;
    }

    // Re-assign each decrypted value so the setter re-encrypts WITH AAD.
    for (const { field, value } of decryptedValues) {
      field.write(doc, value);
    }

    try {
      await doc.save();
      stats.migrated++;
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push({
        id: String(doc._id),
        field: '(save)',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const after = getCryptoFallbackCounter();
  stats.aadDecrypts = after.aad - before.aad;
  stats.legacyDecrypts = after.legacy - before.legacy;

  return stats;
}

function printStats(all: CollectionStats[]): void {
  console.log('\n=== Migration Summary ===\n');
  const rows = all.map((s) => ({
    collection: s.collection,
    processed: s.processed,
    migrated: s.migrated,
    skipped: s.skipped,
    errors: s.errors,
    fieldsSeen: s.fieldsSeen,
    aadDecrypts: s.aadDecrypts,
    legacyDecrypts: s.legacyDecrypts,
  }));
  console.table(rows);

  for (const s of all) {
    if (s.errorDetails.length > 0) {
      console.log(`\nErrors in ${s.collection}:`);
      for (const e of s.errorDetails.slice(0, 25)) {
        console.log(`  - _id=${e.id} field=${e.field} :: ${e.error}`);
      }
      if (s.errorDetails.length > 25) {
        console.log(`  ... and ${s.errorDetails.length - 25} more`);
      }
    }
  }

  const totalLegacy = all.reduce((n, s) => n + s.legacyDecrypts, 0);
  const totalAad = all.reduce((n, s) => n + s.aadDecrypts, 0);
  const totalFields = totalLegacy + totalAad;

  if (totalFields > 0) {
    const pct = ((totalLegacy / totalFields) * 100).toFixed(1);
    console.log(
      `\nDecrypt path: ${totalLegacy}/${totalFields} field reads (${pct}%) used the legacy non-AAD fallback.`
    );
    if (totalLegacy === 0) {
      console.log(
        'All rows already use AAD-bound ciphertext — the legacy fallback in crypto.ts is dead code.'
      );
    }
  } else {
    console.log('\nNo encrypted PII fields decrypted in this run.');
  }
}

// ---------- Entrypoint ----------

async function main(): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(
      `Argument error: ${err instanceof Error ? err.message : String(err)}`
    );
    printHelp();
    process.exit(2);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const mode = opts.verifyOnly
    ? 'VERIFY-ONLY'
    : opts.dryRun
      ? 'DRY-RUN'
      : 'LIVE';
  console.log(`Mode: ${mode}${opts.limit ? ` (limit=${opts.limit})` : ''}`);
  console.log(`Database: ${config.database.name}`);

  await connectDB(config.database.url, config.database.name);
  resetCryptoFallbackCounter();

  const results: CollectionStats[] = [];
  try {
    results.push(
      await processCollection(
        'OrganizerVerification',
        OrganizerVerificationModel as unknown as mongoose.Model<any>,
        ORGANIZER_FIELDS,
        opts
      )
    );
    results.push(
      await processCollection(
        'ArtistVerification',
        ArtistVerificationModel as unknown as mongoose.Model<any>,
        ARTIST_FIELDS,
        opts
      )
    );
  } finally {
    printStats(results);
    await disconnectDB();
  }

  const totalErrors = results.reduce((n, s) => n + s.errors, 0);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  // Best-effort disconnect.
  disconnectDB().finally(() => process.exit(1));
});
