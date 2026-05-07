import {
  OrganizerVerificationModel,
  ArtistVerificationModel,
  OrganizerVerification,
  ArtistVerification,
} from '../../db/models';
import {
  NotFoundException,
  BadRequestException,
} from '../../plugins/error.plugin';
import { VerificationStatus } from '../../shared/enums';
import { maskLast } from '../../shared/utils/crypto';
import { s3Service } from '../../services/s3.service';
import { logger } from '../../services/logger.service';
import type {
  SubmitOrganizerIdentityDto,
  SubmitBusinessDto,
  SubmitVenueDto,
  SubmitArtistIdentityDto,
  SubmitBankAccountDto,
  AdminApproveVerificationDto,
  AdminRejectVerificationDto,
  AdminUpdateProfessionalDto,
  VerificationStatusResponse,
  AdminVerificationListResponse,
} from './verification.schemas';

/**
 * Verification Service
 * Handles verification workflow for organizers and artists
 */
export class VerificationService {
  // ===================================
  // ORGANIZER VERIFICATION
  // ===================================

  /**
   * Submit identity verification (Organizer)
   */
  async submitOrganizerIdentity(
    userId: string,
    dto: SubmitOrganizerIdentityDto
  ): Promise<VerificationStatusResponse> {
    let verification = await OrganizerVerificationModel.findOne({ user: userId }).exec();

    if (!verification) {
      verification = new OrganizerVerificationModel({
        user: userId,
        overallStatus: VerificationStatus.NOT_SUBMITTED,
      });
    }

    // Check if already verified
    if (verification.identity?.status === VerificationStatus.VERIFIED) {
      throw new BadRequestException('Identity is already verified');
    }

    verification.identity = {
      type: dto.type,
      number: dto.number,
      documentUrl: dto.documentUrl,
      selfieUrl: dto.selfieUrl,
      status: VerificationStatus.PENDING,
    };

    await verification.save();
    return await this.transformOrganizerResponse(verification);
  }

  /**
   * Submit business verification (Organizer)
   */
  async submitBusiness(
    userId: string,
    dto: SubmitBusinessDto
  ): Promise<VerificationStatusResponse> {
    let verification = await OrganizerVerificationModel.findOne({ user: userId }).exec();

    if (!verification) {
      verification = new OrganizerVerificationModel({
        user: userId,
        overallStatus: VerificationStatus.NOT_SUBMITTED,
      });
    }

    if (verification.business?.status === VerificationStatus.VERIFIED) {
      throw new BadRequestException('Business is already verified');
    }

    verification.business = {
      type: dto.type,
      name: dto.name,
      panNumber: dto.panNumber,
      gstNumber: dto.gstNumber,
      registrationDocUrl: dto.registrationDocUrl,
      status: VerificationStatus.PENDING,
    };

    await verification.save();
    return await this.transformOrganizerResponse(verification);
  }

  /**
   * Submit venue verification (Organizer)
   */
  async submitVenue(
    userId: string,
    dto: SubmitVenueDto
  ): Promise<VerificationStatusResponse> {
    let verification = await OrganizerVerificationModel.findOne({ user: userId }).exec();

    if (!verification) {
      verification = new OrganizerVerificationModel({
        user: userId,
        overallStatus: VerificationStatus.NOT_SUBMITTED,
      });
    }

    // Add the venue to the list
    verification.venues.push({
      name: dto.name,
      address: dto.address,
      city: dto.city,
      proofType: dto.proofType,
      proofDocUrl: dto.proofDocUrl,
      photosUrls: dto.photosUrls || [],
      coordinates: dto.coordinates,
      status: VerificationStatus.PENDING,
    });

    await verification.save();
    return await this.transformOrganizerResponse(verification);
  }

  /**
   * Get organizer verification status
   */
  async getOrganizerStatus(userId: string): Promise<VerificationStatusResponse> {
    const verification = await OrganizerVerificationModel.findOne({ user: userId }).exec();

    if (!verification) {
      // Return empty status
      return {
        id: '',
        userId,
        type: 'organizer',
        overallStatus: VerificationStatus.NOT_SUBMITTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return await this.transformOrganizerResponse(verification);
  }

  // ===================================
  // ARTIST VERIFICATION
  // ===================================

  /**
   * Submit identity verification (Artist)
   */
  async submitArtistIdentity(
    userId: string,
    dto: SubmitArtistIdentityDto
  ): Promise<VerificationStatusResponse> {
    let verification = await ArtistVerificationModel.findOne({ user: userId }).exec();

    if (!verification) {
      verification = new ArtistVerificationModel({
        user: userId,
        overallStatus: VerificationStatus.NOT_SUBMITTED,
      });
    }

    if (verification.identity?.status === VerificationStatus.VERIFIED) {
      throw new BadRequestException('Identity is already verified');
    }

    verification.identity = {
      type: dto.type,
      number: dto.number,
      documentUrl: dto.documentUrl,
      selfieUrl: dto.selfieUrl,
      status: VerificationStatus.PENDING,
    };

    await verification.save();
    return await this.transformArtistResponse(verification);
  }

  /**
   * Submit bank account verification (Artist)
   */
  async submitBankAccount(
    userId: string,
    dto: SubmitBankAccountDto
  ): Promise<VerificationStatusResponse> {
    let verification = await ArtistVerificationModel.findOne({ user: userId }).exec();

    if (!verification) {
      verification = new ArtistVerificationModel({
        user: userId,
        overallStatus: VerificationStatus.NOT_SUBMITTED,
      });
    }

    if (verification.bankAccount?.status === VerificationStatus.VERIFIED) {
      throw new BadRequestException('Bank account is already verified');
    }

    verification.bankAccount = {
      accountHolderName: dto.accountHolderName,
      accountNumber: dto.accountNumber,
      ifscCode: dto.ifscCode,
      bankName: dto.bankName,
      proofDocUrl: dto.proofDocUrl,
      upiId: dto.upiId,
      status: VerificationStatus.PENDING,
    };

    await verification.save();
    return await this.transformArtistResponse(verification);
  }

  /**
   * Get artist verification status
   */
  async getArtistStatus(userId: string): Promise<VerificationStatusResponse> {
    const verification = await ArtistVerificationModel.findOne({ user: userId }).exec();

    if (!verification) {
      return {
        id: '',
        userId,
        type: 'artist',
        overallStatus: VerificationStatus.NOT_SUBMITTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return await this.transformArtistResponse(verification);
  }

  // ===================================
  // ADMIN FUNCTIONS
  // ===================================

  /**
   * List all verifications (Admin)
   */
  async listVerifications(params: {
    type?: 'organizer' | 'artist';
    status?: VerificationStatus;
    page?: number;
    limit?: number;
  }): Promise<AdminVerificationListResponse> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (params.status) filter.overallStatus = params.status;

    const results: VerificationStatusResponse[] = [];
    let total = 0;

    if (!params.type || params.type === 'organizer') {
      const [organizers, orgCount] = await Promise.all([
        OrganizerVerificationModel.find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        OrganizerVerificationModel.countDocuments(filter).exec(),
      ]);
      const transformed = await Promise.all(
        organizers.map((v) => this.transformOrganizerResponse(v))
      );
      results.push(...transformed);
      total += orgCount;
    }

    if (!params.type || params.type === 'artist') {
      const [artists, artistCount] = await Promise.all([
        ArtistVerificationModel.find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        ArtistVerificationModel.countDocuments(filter).exec(),
      ]);
      const transformed = await Promise.all(
        artists.map((v) => this.transformArtistResponse(v))
      );
      results.push(...transformed);
      total += artistCount;
    }

    return {
      data: results,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get verification details (Admin)
   */
  async getVerificationDetails(
    verificationId: string,
    type: 'organizer' | 'artist'
  ): Promise<VerificationStatusResponse> {
    if (type === 'organizer') {
      const verification = await OrganizerVerificationModel.findById(verificationId).exec();
      if (!verification) throw new NotFoundException('Verification not found');
      return await this.transformOrganizerResponse(verification);
    } else {
      const verification = await ArtistVerificationModel.findById(verificationId).exec();
      if (!verification) throw new NotFoundException('Verification not found');
      return await this.transformArtistResponse(verification);
    }
  }

  /**
   * Approve verification section (Admin)
   */
  async approveVerification(
    adminId: string,
    dto: AdminApproveVerificationDto
  ): Promise<VerificationStatusResponse> {
    const now = new Date();

    // Try organizer first
    const organizerVerification = await OrganizerVerificationModel.findById(dto.verificationId).exec();

    if (organizerVerification) {
      // Organizer verification
      if (dto.section === 'identity' && organizerVerification.identity) {
        organizerVerification.identity.status = VerificationStatus.VERIFIED;
        organizerVerification.identity.verifiedAt = now;
        organizerVerification.identity.verifiedBy = adminId as any;
      } else if (dto.section === 'business' && organizerVerification.business) {
        organizerVerification.business.status = VerificationStatus.VERIFIED;
        organizerVerification.business.verifiedAt = now;
        organizerVerification.business.verifiedBy = adminId as any;
      } else if (dto.section === 'venue' && dto.venueId) {
        const venue = organizerVerification.venues.find((v: any) => v._id?.toString() === dto.venueId);
        if (venue) {
          venue.status = VerificationStatus.VERIFIED;
          venue.verifiedAt = now;
          venue.verifiedBy = adminId as any;
        }
      } else {
        throw new BadRequestException('Invalid section for organizer verification');
      }

      organizerVerification.markModified('identity');
      organizerVerification.markModified('business');
      organizerVerification.markModified('venues');
      await organizerVerification.save();
      return await this.transformOrganizerResponse(organizerVerification);
    }

    // Try artist
    const artistVerification = await ArtistVerificationModel.findById(dto.verificationId).exec();
    if (!artistVerification) throw new NotFoundException('Verification not found');

    if (dto.section === 'identity' && artistVerification.identity) {
      artistVerification.identity.status = VerificationStatus.VERIFIED;
      artistVerification.identity.verifiedAt = now;
      artistVerification.identity.verifiedBy = adminId as any;
    } else if (dto.section === 'bank' && artistVerification.bankAccount) {
      artistVerification.bankAccount.status = VerificationStatus.VERIFIED;
      artistVerification.bankAccount.verifiedAt = now;
      artistVerification.bankAccount.verifiedBy = adminId as any;
    } else if (dto.section === 'professional') {
      if (!artistVerification.professional) {
        artistVerification.professional = {
          portfolioReviewed: false,
          videoLinksVerified: false,
          audioSamplesVerified: false,
          status: VerificationStatus.NOT_SUBMITTED,
        };
      }
      artistVerification.professional.status = VerificationStatus.VERIFIED;
      artistVerification.professional.verifiedAt = now;
      artistVerification.professional.verifiedBy = adminId as any;
    } else {
      throw new BadRequestException('Invalid section for artist verification');
    }

    artistVerification.markModified('identity');
    artistVerification.markModified('bankAccount');
    artistVerification.markModified('professional');
    await artistVerification.save();
    return await this.transformArtistResponse(artistVerification);
  }

  /**
   * Reject verification section (Admin)
   */
  async rejectVerification(
    adminId: string,
    dto: AdminRejectVerificationDto
  ): Promise<VerificationStatusResponse> {
    // Try organizer first
    const organizerVerification = await OrganizerVerificationModel.findById(dto.verificationId).exec();

    if (organizerVerification) {
      if (dto.section === 'identity' && organizerVerification.identity) {
        organizerVerification.identity.status = VerificationStatus.REJECTED;
        organizerVerification.identity.rejectionReason = dto.reason;
      } else if (dto.section === 'business' && organizerVerification.business) {
        organizerVerification.business.status = VerificationStatus.REJECTED;
        organizerVerification.business.rejectionReason = dto.reason;
      } else if (dto.section === 'venue' && dto.venueId) {
        const venue = organizerVerification.venues.find((v: any) => v._id?.toString() === dto.venueId);
        if (venue) {
          venue.status = VerificationStatus.REJECTED;
          venue.rejectionReason = dto.reason;
        }
      } else {
        throw new BadRequestException('Invalid section for organizer verification');
      }

      organizerVerification.markModified('identity');
      organizerVerification.markModified('business');
      organizerVerification.markModified('venues');
      await organizerVerification.save();
      return await this.transformOrganizerResponse(organizerVerification);
    }

    // Try artist
    const artistVerification = await ArtistVerificationModel.findById(dto.verificationId).exec();
    if (!artistVerification) throw new NotFoundException('Verification not found');

    if (dto.section === 'identity' && artistVerification.identity) {
      artistVerification.identity.status = VerificationStatus.REJECTED;
      artistVerification.identity.rejectionReason = dto.reason;
    } else if (dto.section === 'bank' && artistVerification.bankAccount) {
      artistVerification.bankAccount.status = VerificationStatus.REJECTED;
      artistVerification.bankAccount.rejectionReason = dto.reason;
    } else {
      throw new BadRequestException('Invalid section for artist verification');
    }

    artistVerification.markModified('identity');
    artistVerification.markModified('bankAccount');
    await artistVerification.save();
    return await this.transformArtistResponse(artistVerification);
  }

  /**
   * Update professional verification (Admin)
   */
  async updateProfessional(
    adminId: string,
    dto: AdminUpdateProfessionalDto
  ): Promise<VerificationStatusResponse> {
    const verification = await ArtistVerificationModel.findById(dto.verificationId).exec();
    if (!verification) throw new NotFoundException('Verification not found');

    if (!verification.professional) {
      verification.professional = {
        portfolioReviewed: false,
        videoLinksVerified: false,
        audioSamplesVerified: false,
        status: VerificationStatus.NOT_SUBMITTED,
      };
    }

    if (dto.portfolioReviewed !== undefined) {
      verification.professional.portfolioReviewed = dto.portfolioReviewed;
    }
    if (dto.videoLinksVerified !== undefined) {
      verification.professional.videoLinksVerified = dto.videoLinksVerified;
    }
    if (dto.audioSamplesVerified !== undefined) {
      verification.professional.audioSamplesVerified = dto.audioSamplesVerified;
    }
    if (dto.notes !== undefined) {
      verification.professional.notes = dto.notes;
    }

    // If all are verified, mark status as verified
    if (
      verification.professional.portfolioReviewed &&
      verification.professional.videoLinksVerified &&
      verification.professional.audioSamplesVerified
    ) {
      verification.professional.status = VerificationStatus.VERIFIED;
      verification.professional.verifiedAt = new Date();
      verification.professional.verifiedBy = adminId as any;
    } else {
      verification.professional.status = VerificationStatus.UNDER_REVIEW;
    }

    verification.markModified('professional');
    await verification.save();
    return await this.transformArtistResponse(verification);
  }

  // ===================================
  // TRANSFORM HELPERS (C6: mask PII, presign sensitive URLs at 5min TTL)
  // ===================================

  /** TTL for KYC / bank-doc presigned URLs. */
  private static readonly DOC_PRESIGN_TTL_SECONDS = 300; // 5 minutes

  /**
   * Best-effort presign for a stored doc URL. If the URL doesn't resolve to
   * an S3 key in our bucket, it's returned as-is (legacy / external URLs).
   */
  private async presignDoc(input?: string): Promise<string | undefined> {
    if (!input) return undefined;
    try {
      const key = s3Service.resolveKeyFromUrl(input);
      if (!key) return input;
      return await s3Service.getSignedUrl(key, VerificationService.DOC_PRESIGN_TTL_SECONDS);
    } catch (err) {
      // Don't blow up the whole response if a single presign fails.
      logger
        .child('VerificationService')
        .warn('Failed to presign verification doc URL', {
          err: (err as Error)?.message,
        });
      return undefined;
    }
  }

  private async transformOrganizerResponse(
    verification: OrganizerVerification
  ): Promise<VerificationStatusResponse> {
    const identity = verification.identity;
    const business = verification.business;

    const [
      identityDocUrl,
      identitySelfieUrl,
      businessRegUrl,
      ...venueUrls
    ] = await Promise.all([
      this.presignDoc(identity?.documentUrl),
      this.presignDoc(identity?.selfieUrl),
      this.presignDoc(business?.registrationDocUrl),
      ...verification.venues.map((v: any) => this.presignDoc(v.proofDocUrl)),
    ]);

    return {
      id: verification._id.toString(),
      userId: verification.user.toString(),
      type: 'organizer',
      overallStatus: verification.overallStatus,
      identity: identity
        ? {
            status: identity.status,
            verifiedAt: identity.verifiedAt,
            rejectionReason: identity.rejectionReason,
            numberMasked: maskLast(identity.number, 4),
            documentUrl: identityDocUrl,
            selfieUrl: identitySelfieUrl,
          }
        : undefined,
      business: business
        ? {
            status: business.status,
            verifiedAt: business.verifiedAt,
            rejectionReason: business.rejectionReason,
            panMasked: maskLast(business.panNumber, 4),
            gstMasked: business.gstNumber ? maskLast(business.gstNumber, 4) : undefined,
            registrationDocUrl: businessRegUrl,
          }
        : undefined,
      venues: verification.venues.map((v: any, idx: number) => ({
        id: v._id?.toString() || '',
        name: v.name,
        city: v.city,
        status: v.status,
        verifiedAt: v.verifiedAt,
        rejectionReason: v.rejectionReason,
        proofDocUrl: venueUrls[idx],
      })),
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
    };
  }

  private async transformArtistResponse(
    verification: ArtistVerification
  ): Promise<VerificationStatusResponse> {
    const identity = verification.identity;
    const bank = verification.bankAccount;

    const [identityDocUrl, identitySelfieUrl, bankProofUrl] = await Promise.all([
      this.presignDoc(identity?.documentUrl),
      this.presignDoc(identity?.selfieUrl),
      this.presignDoc(bank?.proofDocUrl),
    ]);

    return {
      id: verification._id.toString(),
      userId: verification.user.toString(),
      type: 'artist',
      overallStatus: verification.overallStatus,
      identity: identity
        ? {
            status: identity.status,
            verifiedAt: identity.verifiedAt,
            rejectionReason: identity.rejectionReason,
            numberMasked: maskLast(identity.number, 4),
            documentUrl: identityDocUrl,
            selfieUrl: identitySelfieUrl,
          }
        : undefined,
      professional: verification.professional
        ? {
            status: verification.professional.status,
            portfolioReviewed: verification.professional.portfolioReviewed,
            videoLinksVerified: verification.professional.videoLinksVerified,
            audioSamplesVerified: verification.professional.audioSamplesVerified,
            verifiedAt: verification.professional.verifiedAt,
            notes: verification.professional.notes,
          }
        : undefined,
      bankAccount: bank
        ? {
            status: bank.status,
            verifiedAt: bank.verifiedAt,
            rejectionReason: bank.rejectionReason,
            accountNumberMasked: maskLast(bank.accountNumber, 4),
            ifscMasked: maskLast(bank.ifscCode, 4),
            proofDocUrl: bankProofUrl,
          }
        : undefined,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
    };
  }
}
