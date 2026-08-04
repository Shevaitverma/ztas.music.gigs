import { config } from '../config';
import { logger } from './logger.service';

const log = logger.child('Email');

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text body. No templating — keep messages short and readable. */
  text: string;
}

let client: { emails: { send: (opts: Record<string, unknown>) => Promise<{ error?: unknown }> } } | null = null;

/**
 * Email delivery.
 *
 * Exported as an object (not bare functions) so tests and any future provider
 * swap can replace `emailService.send` without touching call sites.
 *
 * Never throws. Returns false when delivery failed so callers can log; no
 * caller is expected to change behaviour based on it.
 */
export const emailService = {
  async send(msg: EmailMessage): Promise<boolean> {
    if (!config.email.enabled || !config.email.apiKey) {
      log.info(`disabled — would have sent to ${msg.to}: "${msg.subject}"`, { text: msg.text });
      return true;
    }

    try {
      if (!client) {
        // Imported lazily so the SDK never loads in dev/CI where email is off.
        const { Resend } = await import('resend');
        client = new Resend(config.email.apiKey) as unknown as typeof client;
      }

      const { error } = await client!.emails.send({
        from: config.email.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      });

      if (error) {
        // ponytail: one attempt, no retry/queue. Add a queue post-beta if the
        // failure rate in these logs turns out to be non-trivial.
        log.error(`send failed to ${msg.to}: "${msg.subject}"`, error);
        return false;
      }
      return true;
    } catch (err) {
      log.error(`send threw for ${msg.to}: "${msg.subject}"`, err);
      return false;
    }
  },
};
