import { Elysia } from 'elysia';
import { config } from '../config';

/**
 * Compression Plugin
 * Provides gzip compression for response bodies
 * Uses Bun's native gzipSync for maximum performance
 */
export const compressionPlugin = (options: { threshold?: number } = {}) => {
  const threshold = options.threshold ?? 1024; // Minimum size to compress (1KB)

  return new Elysia({ name: 'compression' })
    .onAfterHandle(({ response, set, request }) => {
      // Skip if no response or it's a special type
      if (!response) return;
      if (response instanceof ReadableStream) return;
      if (response instanceof Response) return;
      if (response instanceof Blob) return;

      // Check if client accepts gzip
      const acceptEncoding = request.headers.get('accept-encoding') || '';
      if (!acceptEncoding.includes('gzip')) return;

      // Only compress JSON/text responses
      let body: string;
      
      if (typeof response === 'string') {
        body = response;
      } else if (typeof response === 'object') {
        try {
          body = JSON.stringify(response);
        } catch {
          return; // Can't serialize, skip compression
        }
      } else {
        return;
      }

      // Skip small responses
      if (body.length < threshold) return;

      // Compress using Bun's native gzip
      try {
        const compressed = Bun.gzipSync(Buffer.from(body));
        
        // Only use compressed version if it's actually smaller
        if (compressed.length < body.length) {
          set.headers['Content-Encoding'] = 'gzip';
          set.headers['Content-Length'] = String(compressed.length);
          set.headers['Vary'] = 'Accept-Encoding';
          
          return new Response(compressed, {
            headers: {
              'Content-Type': typeof response === 'object' ? 'application/json' : 'text/plain',
              'Content-Encoding': 'gzip',
              'Content-Length': String(compressed.length),
            },
          });
        }
      } catch (error) {
        // Compression failed, return original
        if (config.app.nodeEnv === 'development') {
          console.warn('[Compression] Failed to compress response:', error);
        }
      }
    });
};
