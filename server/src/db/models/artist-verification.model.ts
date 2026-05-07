import { Schema, model, Document, Types } from 'mongoose';
import { VerificationStatus, IdentityDocType } from '../../shared/enums';
import { encryptPii, decryptPii } from '../../shared/utils/crypto';

// Per-field AAD bindings prevent ciphertext from being moved between fields.
const aadIdentityNumber = (v: string | undefined | null) =>
  encryptPii(v, 'artistVerifications.identity.number');
const aadIdentityNumberGet = (v: string | undefined | null) =>
  decryptPii(v, 'artistVerifications.identity.number');
const aadAccountNumber = (v: string | undefined | null) =>
  encryptPii(v, 'artistVerifications.bankAccount.accountNumber');
const aadAccountNumberGet = (v: string | undefined | null) =>
  decryptPii(v, 'artistVerifications.bankAccount.accountNumber');
const aadIfsc = (v: string | undefined | null) =>
  encryptPii(v, 'artistVerifications.bankAccount.ifscCode');
const aadIfscGet = (v: string | undefined | null) =>
  decryptPii(v, 'artistVerifications.bankAccount.ifscCode');

/**
 * Identity Verification Subdocument (Artist)
 */
export interface ArtistIdentityVerification {
  type: IdentityDocType;
  number: string; // Should be encrypted at rest
  documentUrl: string;
  selfieUrl: string;
  status: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  rejectionReason?: string;
}

/**
 * Professional Verification Subdocument
 * Verifies artist's professional credentials/portfolio
 */
export interface ProfessionalVerification {
  portfolioReviewed: boolean;
  videoLinksVerified: boolean;
  audioSamplesVerified: boolean;
  status: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  notes?: string;
}

/**
 * Bank Account Verification Subdocument
 * Required for receiving payments
 */
export interface BankAccountVerification {
  accountHolderName: string;
  accountNumber: string; // Should be encrypted at rest
  ifscCode: string;
  bankName: string;
  proofDocUrl: string; // Cancelled cheque or bank statement
  upiId?: string;
  status: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  rejectionReason?: string;
}

/**
 * ArtistVerification Interface
 * Tracks verification status for artists
 */
export interface ArtistVerification extends Document {
  user: Types.ObjectId;
  identity?: ArtistIdentityVerification;
  professional?: ProfessionalVerification;
  bankAccount?: BankAccountVerification;
  overallStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Identity Verification Schema (Artist)
 */
const ArtistIdentityVerificationSchema = new Schema<ArtistIdentityVerification>(
  {
    type: {
      type: String,
      required: true,
      enum: Object.values(IdentityDocType),
    },
    // SECURITY (C6): identity number encrypted at rest.
    number: {
      type: String,
      required: true,
      set: aadIdentityNumber,
      get: aadIdentityNumberGet,
    },
    documentUrl: {
      type: String,
      required: true,
    },
    selfieUrl: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: String,
  },
  { _id: false, toObject: { getters: true }, toJSON: { getters: true } }
);

/**
 * Professional Verification Schema
 */
const ProfessionalVerificationSchema = new Schema<ProfessionalVerification>(
  {
    portfolioReviewed: {
      type: Boolean,
      default: false,
    },
    videoLinksVerified: {
      type: Boolean,
      default: false,
    },
    audioSamplesVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.NOT_SUBMITTED,
    },
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: String,
  },
  { _id: false }
);

/**
 * Bank Account Verification Schema
 */
const BankAccountVerificationSchema = new Schema<BankAccountVerification>(
  {
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
    },
    // SECURITY (C6): bank account number + IFSC encrypted at rest.
    accountNumber: {
      type: String,
      required: true,
      set: aadAccountNumber,
      get: aadAccountNumberGet,
    },
    ifscCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      set: aadIfsc,
      get: aadIfscGet,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    proofDocUrl: {
      type: String,
      required: true,
    },
    upiId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: String,
  },
  { _id: false, toObject: { getters: true }, toJSON: { getters: true } }
);

/**
 * ArtistVerification Schema
 */
const ArtistVerificationSchema = new Schema<ArtistVerification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    identity: {
      type: ArtistIdentityVerificationSchema,
    },
    professional: {
      type: ProfessionalVerificationSchema,
    },
    bankAccount: {
      type: BankAccountVerificationSchema,
    },
    overallStatus: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.NOT_SUBMITTED,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for admin queries
ArtistVerificationSchema.index({ overallStatus: 1, updatedAt: -1 });

/**
 * Pre-save hook to calculate overall status
 */
ArtistVerificationSchema.pre('save', function () {
  const hasIdentity = !!this.identity;
  const hasBankAccount = !!this.bankAccount;

  // At minimum, identity and bank account are required for full verification
  if (!hasIdentity && !hasBankAccount) {
    this.overallStatus = VerificationStatus.NOT_SUBMITTED;
    return;
  }

  const identityStatus = this.identity?.status || VerificationStatus.NOT_SUBMITTED;
  const bankStatus = this.bankAccount?.status || VerificationStatus.NOT_SUBMITTED;
  // Professional verification is optional for basic verification
  const professionalStatus = this.professional?.status || VerificationStatus.NOT_SUBMITTED;

  // If any required field is rejected, overall is rejected
  if (identityStatus === VerificationStatus.REJECTED || bankStatus === VerificationStatus.REJECTED) {
    this.overallStatus = VerificationStatus.REJECTED;
    return;
  }

  // If any required field is under review, overall is under review
  if (identityStatus === VerificationStatus.UNDER_REVIEW || bankStatus === VerificationStatus.UNDER_REVIEW) {
    this.overallStatus = VerificationStatus.UNDER_REVIEW;
    return;
  }

  // If any required field is pending, overall is pending
  if (identityStatus === VerificationStatus.PENDING || bankStatus === VerificationStatus.PENDING) {
    this.overallStatus = VerificationStatus.PENDING;
    return;
  }

  // Both identity and bank must be verified for overall to be verified
  if (identityStatus === VerificationStatus.VERIFIED && bankStatus === VerificationStatus.VERIFIED) {
    this.overallStatus = VerificationStatus.VERIFIED;
    return;
  }

  // Otherwise, keep as not submitted or pending
  this.overallStatus = VerificationStatus.PENDING;
});

/**
 * ArtistVerification Model
 */
export const ArtistVerificationModel = model<ArtistVerification>(
  'ArtistVerification',
  ArtistVerificationSchema
);
