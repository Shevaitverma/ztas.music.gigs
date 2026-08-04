import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import { NotificationModel, NotificationType, UserModel } from '../db/models';
import { notificationsService } from '../modules/notifications/notifications.service';
import { emailService } from '../services/email.service';
import { config } from '../config';

/**
 * These run without MongoDB: the model calls are spied on. What is under test
 * is the notify helper's contract, not Mongoose.
 */

/** Fake the `findById(...).select(...).lean().exec()` chain. */
const mockUser = (user: { email?: string } | null) =>
  spyOn(UserModel, 'findById').mockReturnValue({
    select: () => ({ lean: () => ({ exec: async () => user }) }),
  } as any);

const restore: Array<{ mockRestore: () => void }> = [];
const track = <T extends { mockRestore: () => void }>(s: T) => (restore.push(s), s);

afterEach(() => {
  restore.splice(0).forEach((s) => s.mockRestore());
});

const input = {
  userId: 'user-1',
  type: NotificationType.NEW_BID,
  title: 'New bid',
  message: 'Someone bid on your gig',
  data: { gigId: 'gig-1', bidId: 'bid-1', amount: 5000 },
};

describe('notificationsService.create', () => {
  it('writes a notification row and delivers to the user email', async () => {
    const create = track(spyOn(NotificationModel, 'create').mockResolvedValue({} as any));
    track(mockUser({ email: 'artist@example.com' }));
    const send = track(spyOn(emailService, 'send').mockResolvedValue(true));

    await notificationsService.create(input);

    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0]![0] as any;
    expect(row.userId).toBe('user-1');
    expect(row.type).toBe(NotificationType.NEW_BID);
    // ids are stored as strings, matching what the scheduler writes
    expect(row.data).toEqual({ gigId: 'gig-1', bidId: 'bid-1', amount: 5000 });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: 'artist@example.com',
      subject: 'New bid',
    });
  });

  it('still writes the row and does not throw when email delivery throws', async () => {
    const create = track(spyOn(NotificationModel, 'create').mockResolvedValue({} as any));
    track(mockUser({ email: 'artist@example.com' }));
    track(spyOn(emailService, 'send').mockRejectedValue(new Error('provider down')));

    await notificationsService.create(input);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the notification row itself cannot be written', async () => {
    track(spyOn(NotificationModel, 'create').mockRejectedValue(new Error('mongo down')));
    const send = track(spyOn(emailService, 'send').mockResolvedValue(true));

    await notificationsService.create(input);

    expect(send).not.toHaveBeenCalled();
  });

  it('persists a notification whose template overflows the 200-char title cap', async () => {
    // Gig titles are themselves capped at 200 (gig.model.ts), so
    // `New bid on "<200 chars>"` is 213 — over notification.model.ts's 200-char
    // cap. That threw a Mongoose ValidationError which `create` swallowed, so
    // the notification vanished silently.
    const gigTitle = 'A'.repeat(200);
    const create = track(spyOn(NotificationModel, 'create').mockResolvedValue({} as any));
    track(mockUser({ email: 'artist@example.com' }));
    track(spyOn(emailService, 'send').mockResolvedValue(true));

    await notificationsService.create({ ...input, title: `New bid on "${gigTitle}"` });

    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0]![0] as any;
    expect(row.title.length).toBeLessThanOrEqual(200);
    expect(row.title.startsWith('New bid on "AAA')).toBe(true);
    expect(row.title.endsWith('…')).toBe(true);
  });

  it('leaves a title that already fits untouched', async () => {
    const create = track(spyOn(NotificationModel, 'create').mockResolvedValue({} as any));
    track(mockUser({ email: 'artist@example.com' }));
    track(spyOn(emailService, 'send').mockResolvedValue(true));

    await notificationsService.create(input);

    expect((create.mock.calls[0]![0] as any).title).toBe('New bid');
  });

  it('does not throw when the failure it logs is cyclic (logger JSON.stringify)', async () => {
    // Call sites use `void create(...)`, so a throw inside the catch block —
    // logger.format's JSON.stringify choking on a cycle or a BigInt — becomes
    // an unhandled rejection that takes the process down.
    const cyclic: any = new Error('mongo down');
    cyclic.self = cyclic;
    cyclic.big = BigInt(1);
    track(spyOn(NotificationModel, 'create').mockRejectedValue(cyclic));

    expect(await notificationsService.create(input).then(() => 'ok')).toBe('ok');
  });

  it('skips delivery for phone-only users with no email', async () => {
    track(spyOn(NotificationModel, 'create').mockResolvedValue({} as any));
    track(mockUser({}));
    const send = track(spyOn(emailService, 'send').mockResolvedValue(true));

    await notificationsService.create(input);

    expect(send).not.toHaveBeenCalled();
  });
});

describe('emailService.send when disabled', () => {
  it('is off by default in test/CI and reports success without sending', async () => {
    expect(config.email.enabled).toBe(false);
    expect(await emailService.send({ to: 'a@b.com', subject: 's', text: 't' })).toBe(true);
  });

  it('no-ops when enabled but the API key is missing', async () => {
    const original = { enabled: config.email.enabled, apiKey: config.email.apiKey };
    config.email.enabled = true;
    config.email.apiKey = '';
    try {
      expect(await emailService.send({ to: 'a@b.com', subject: 's', text: 't' })).toBe(true);
    } finally {
      Object.assign(config.email, original);
    }
  });
});
