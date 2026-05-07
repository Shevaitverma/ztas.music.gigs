import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger as rootLogger } from './logger.service';

// Create child logger for S3 service
const logger = rootLogger.child('S3Service');

/**
 * AWS S3 Service
 * Handles file uploads and deletions
 */
export class S3Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = config.aws.s3Bucket;

    // Check if AWS credentials are provided
    if (!config.aws.accessKeyId || !config.aws.secretAccessKey) {
      logger.warn('AWS credentials not found. S3 service will not function correctly.');
    }

    this.s3Client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }

  /**
   * Upload a file to S3
   * @param fileBuffer File content buffer
   * @param key File path/name in bucket
   * @param contentType MIME type
   */
  async uploadFile(
    fileBuffer: Buffer | Uint8Array,
    key: string,
    contentType: string
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        // ACL: 'public-read', // Use if bucket is public, otherwise use signed URLs
      });

      await this.s3Client.send(command);

      const url = `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
      logger.info(`File uploaded successfully: ${url}`);

      return url;
    } catch (error) {
      logger.error('Error uploading file to S3', error);
      throw error;
    }
  }

  /**
   * Generate a pre-signed URL for uploading
   * (Alternative to server-side upload)
   */
  async getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: config.aws.presignedUrlExpiry,
      });

      return url;
    } catch (error) {
      logger.error('Error generating presigned upload URL', error);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   * @param key File path/name in bucket
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      logger.info(`File deleted: ${key}`);
    } catch (error) {
      logger.error('Error deleting file from S3', error);
      throw error;
    }
  }

  /**
   * Get a pre-signed URL for reading a private file.
   *
   * @param key      S3 object key.
   * @param expiresIn TTL in seconds. Default 3600 (1h). For sensitive
   *                  documents (KYC, bank proof) callers should use 300 (5m).
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      return url;
    } catch (error) {
      logger.error('Error generating signed URL', error);
      throw error;
    }
  }

  /**
   * Convert a stored S3-style object URL back into a key. If the input is
   * already a path (no scheme) it is returned as-is. Returns `null` if the
   * URL does not look like an object in this bucket.
   *
   * Example: https://my-bucket.s3.ap-south-1.amazonaws.com/users/123/...
   *  → `users/123/...`
   */
  resolveKeyFromUrl(input: string): string | null {
    if (!input) return null;
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      return input;
    }
    try {
      const u = new URL(input);
      // Virtual-hosted style: <bucket>.s3.<region>.amazonaws.com/<key>
      // Path-style:           s3.<region>.amazonaws.com/<bucket>/<key>
      if (u.hostname.startsWith(`${this.bucket}.`)) {
        return u.pathname.replace(/^\/+/, '');
      }
      const path = u.pathname.replace(/^\/+/, '');
      if (path.startsWith(`${this.bucket}/`)) {
        return path.slice(this.bucket.length + 1);
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const s3Service = new S3Service();
