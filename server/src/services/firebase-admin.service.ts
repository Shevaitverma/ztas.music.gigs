import admin from 'firebase-admin';

/**
 * Firebase Admin Service
 * Handles Firebase Admin SDK initialization and operations
 */
export class FirebaseAdminService {
  private firebaseApp: admin.app.App | null = null;
  private initialized = false;

  /**
   * Initialize Firebase Admin SDK
   */
  async initialize(
    projectId: string,
    privateKey: string,
    clientEmail: string
  ): Promise<void> {
    if (this.initialized) {
      console.log('[Firebase] Already initialized');
      return;
    }

    if (!projectId || !privateKey || !clientEmail) {
      console.warn(
        '[Firebase] ⚠️  Credentials not configured. Authentication features will not work.'
      );
      return;
    }

    try {
      // Check if already initialized globally
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.app();
        console.log('[Firebase] ✅ Using existing Firebase Admin SDK instance');
      } else {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey,
            clientEmail,
          }),
        });
        console.log('[Firebase] ✅ Firebase Admin SDK initialized successfully');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[Firebase] ❌ Failed to initialize Firebase Admin SDK:', error);
      throw error;
    }
  }

  /**
   * Get Firebase Auth instance
   */
  getAuth(): admin.auth.Auth {
    if (!this.firebaseApp) {
      throw new Error('Firebase Admin SDK not initialized');
    }
    return this.firebaseApp.auth();
  }

  /**
   * Verify Firebase ID token
   */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await this.getAuth().verifyIdToken(idToken);
    } catch (error) {
      console.error('[Firebase] Failed to verify ID token:', error);
      throw error;
    }
  }

  /**
   * Get user by UID
   */
  async getUserByUid(uid: string): Promise<admin.auth.UserRecord> {
    try {
      return await this.getAuth().getUser(uid);
    } catch (error) {
      console.error(`[Firebase] Failed to get user by UID: ${uid}`, error);
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<admin.auth.UserRecord> {
    try {
      return await this.getAuth().getUserByEmail(email);
    } catch (error) {
      console.error(`[Firebase] Failed to get user by email: ${email}`, error);
      throw error;
    }
  }

  /**
   * Get user by phone number
   */
  async getUserByPhoneNumber(phoneNumber: string): Promise<admin.auth.UserRecord> {
    try {
      return await this.getAuth().getUserByPhoneNumber(phoneNumber);
    } catch (error) {
      console.error(`[Firebase] Failed to get user by phone: ${phoneNumber}`, error);
      throw error;
    }
  }

  /**
   * Create custom token for user
   */
  async createCustomToken(uid: string, claims?: object): Promise<string> {
    try {
      return await this.getAuth().createCustomToken(uid, claims);
    } catch (error) {
      console.error(`[Firebase] Failed to create custom token for UID: ${uid}`, error);
      throw error;
    }
  }

  /**
   * Delete user by UID
   */
  async deleteUser(uid: string): Promise<void> {
    try {
      await this.getAuth().deleteUser(uid);
      console.log(`[Firebase] User deleted: ${uid}`);
    } catch (error) {
      console.error(`[Firebase] Failed to delete user: ${uid}`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const firebaseAdminService = new FirebaseAdminService();
