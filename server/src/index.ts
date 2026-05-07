import { createApp } from './app';
import { connectDB, disconnectDB } from './db';
import { config } from './config';
import { firebaseAdminService } from './services/firebase-admin.service';
import { schedulerService } from './services/scheduler.service';

const PORT = config.app.port;

// Track if shutdown is in progress
let isShuttingDown = false;

/**
 * Bootstrap the application
 */
async function bootstrap() {
	console.log('🚀 Starting ZTS Music Platform API...');
	console.log(`   Environment: ${config.app.nodeEnv}`);
	console.log(`   Port: ${PORT}`);
	console.log(`   Node Version: ${process.version}`);
	console.log(`   Bun Version: ${Bun.version}`);

	try {
		// 1. Initialize Firebase Admin SDK
		console.log('\n📱 Initializing Firebase Admin SDK...');
		await firebaseAdminService.initialize(config.firebase.projectId, config.firebase.privateKey, config.firebase.clientEmail);

		// 2. Connect to MongoDB
		console.log('\n🗄️  Connecting to MongoDB...');
		await connectDB(config.database.url, config.database.name);

		// 3. Create and start Elysia app
		console.log('\n🌐 Starting HTTP server...');
		const app = createApp();

		const server = app.listen({ port: PORT, hostname: '0.0.0.0' }, () => {
			console.log('\n' + '═'.repeat(60));
			console.log('✅ ZTS Music Platform API is running!');
			console.log('═'.repeat(60));
			console.log(`🌍 Server:        http://localhost:${PORT}`);
			console.log(`📚 API Docs:      http://localhost:${PORT}/api/docs`);
			console.log(`💚 Health Check:  http://localhost:${PORT}/health`);
			console.log(`🔑 API Base:      http://localhost:${PORT}/api/v1`);
			console.log(`🔍 Liveness:      http://localhost:${PORT}/live`);
			console.log(`📡 Readiness:     http://localhost:${PORT}/ready`);
			console.log('═'.repeat(60));
			console.log('\n📝 Logs:\n');
		});

		// 4. Start the scheduler for automated jobs
		console.log('\n⏰ Starting scheduler...');
		schedulerService.start();

		// ===== Graceful Shutdown Handler =====
		const shutdown = async (signal: string) => {
			if (isShuttingDown) {
				console.log('⚠️  Shutdown already in progress...');
				return;
			}

			isShuttingDown = true;
			console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);

			// Set a timeout to force exit if graceful shutdown takes too long
			const forceExitTimeout = setTimeout(() => {
				console.error('❌ Graceful shutdown timed out, forcing exit...');
				process.exit(1);
			}, 10000); // 10 second timeout

			try {
				// 1. Stop the scheduler
				console.log('⏰ Stopping scheduler...');
				schedulerService.stop();
				console.log('   ✅ Scheduler stopped');

				// 2. Stop accepting new connections
				console.log('📤 Stopping HTTP server...');
				app.stop();
				console.log('   ✅ HTTP server stopped');

				// 3. Disconnect from MongoDB
				console.log('🗄️  Disconnecting from MongoDB...');
				await disconnectDB();
				console.log('   ✅ Database disconnected');

				// 4. Clear the force exit timeout
				clearTimeout(forceExitTimeout);

				console.log('\n✅ Graceful shutdown complete');
				process.exit(0);
			} catch (error) {
				console.error('❌ Error during shutdown:', error);
				clearTimeout(forceExitTimeout);
				process.exit(1);
			}
		};

		// Register signal handlers
		process.on('SIGINT', () => shutdown('SIGINT'));
		process.on('SIGTERM', () => shutdown('SIGTERM'));

		// NOTE: intentional fatal errors should call `shutdown('reason')` directly,
		// NOT throw — uncaught exceptions are logged but do not terminate the process.
		process.on('uncaughtException', (error) => {
			console.error('❌ Uncaught Exception (process kept alive):', {
				name: (error as Error)?.name,
				message: (error as Error)?.message,
				stack: (error as Error)?.stack,
				timestamp: new Date().toISOString(),
			});
			// TODO: forward to alerting (Sentry/PagerDuty) when wired up.
		});

		// Handle unhandled promise rejections — log only, never shutdown.
		process.on('unhandledRejection', (reason, promise) => {
			console.error('❌ Unhandled Rejection (process kept alive):', {
				reason: reason instanceof Error
					? { name: reason.name, message: reason.message, stack: reason.stack }
					: reason,
				promise: String(promise),
				timestamp: new Date().toISOString(),
			});
		});
	} catch (error: any) {
		console.error('\n❌ Failed to start server:');
		console.error(error.message);
		if (error.stack) console.error(error.stack);
		process.exit(1);
	}
}

// Start the application
bootstrap();
