import mongoose from 'mongoose';

/**
 * Connect to MongoDB
 */
export async function connectDB(uri: string, dbName: string): Promise<void> {
  try {
    await mongoose.connect(uri, {
      dbName,
    });

    console.log(`✅ MongoDB connected: ${dbName}`);
    console.log(`   Database URI: ${uri.replace(/\/\/.*@/, '//****@')}`); // Hide credentials

    // Log connection events
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB error:', err);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Disconnect from MongoDB (for graceful shutdown)
 */
export async function disconnectDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected gracefully');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
  }
}

/**
 * Check if MongoDB is connected
 */
export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// Export models for convenience
export * from './models';
