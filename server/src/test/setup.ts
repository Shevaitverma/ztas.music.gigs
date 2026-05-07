/**
 * Bun Test Setup
 * This file is preloaded before running tests
 */
import { beforeAll, afterAll } from 'bun:test';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '8081'; // Use different port for tests

// Mock environment variables for testing
process.env.DATABASE_URL = 'mongodb://localhost:27017';
process.env.DATABASE_NAME = 'music-server-test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
process.env.JWT_EXPIRATION = '1h';
process.env.JWT_REFRESH_EXPIRATION = '7d';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.CORS_ORIGIN = 'http://localhost:3000';

beforeAll(async () => {
  console.log('🧪 Test environment initialized');
});

afterAll(async () => {
  console.log('🧹 Test cleanup complete');
});
