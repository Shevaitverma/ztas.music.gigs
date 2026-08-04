import type { Types } from 'mongoose';
import { NotificationModel, NotificationType, UserModel } from '../../db/models';
import { NotFoundException } from '../../plugins/error.plugin';
import { emailService } from '../../services/email.service';
import { logger } from '../../services/logger.service';

const notifyLog = logger.child('Notify');

/** Schema caps from notification.model.ts — exceeding either fails validation. */
const TITLE_MAX = 200;
const MESSAGE_MAX = 1000;

/** Clamp to `n` chars, ellipsing when it had to cut. */
export const truncate = (s: string, n: number): string =>
  s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;

export interface NotifyInput {
  userId: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  message: string;
  /**
   * Structured payload. Store ids as STRINGS — that is what the scheduler
   * already writes and what `data.gigId` lookups match on.
   */
  data?: Record<string, unknown>;
}

/**
 * Notifications Service
 * Handles CRUD operations for user notifications
 */
export class NotificationsService {
  /**
   * Single write path for a notification: persists the row and attempts
   * delivery.
   *
   * NEVER throws — a bid, an accept or an OTP must not fail because the
   * notification store or the email provider is down. Call sites may
   * fire-and-forget with `void`.
   */
  async create(input: NotifyInput): Promise<void> {
    // Templates interpolate user-controlled text (gig titles are capped at 200
    // themselves, so `New bid on "${gig.title}"` overflows the 200-char title
    // cap). Clamping here fixes every call site at once — a Mongoose
    // ValidationError would otherwise be swallowed and the notification lost.
    const title = truncate(input.title, TITLE_MAX);
    const message = truncate(input.message, MESSAGE_MAX);

    try {
      await NotificationModel.create({
        userId: input.userId,
        type: input.type,
        title,
        message,
        data: input.data,
      });
    } catch (err) {
      notifyLog.error(`failed to persist ${input.type} for user ${String(input.userId)}`, err);
      return;
    }

    try {
      const user = await UserModel.findById(input.userId).select('email').lean().exec();
      if (!user?.email) {
        // Phone-only signups have no email — in-app notification only.
        notifyLog.info(`no email for user ${String(input.userId)}, skipping ${input.type} delivery`);
        return;
      }
      await emailService.send({ to: user.email, subject: title, text: message });
    } catch (err) {
      notifyLog.error(`failed to deliver ${input.type} for user ${String(input.userId)}`, err);
    }
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(
    userId: string,
    params: { page: number; limit: number; unreadOnly?: boolean }
  ) {
    const filter: Record<string, unknown> = { userId };

    if (params.unreadOnly) {
      filter.isRead = false;
    }

    const skip = (params.page - 1) * params.limit;

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(params.limit)
        .lean()
        .exec(),
      NotificationModel.countDocuments(filter).exec(),
      NotificationModel.countDocuments({ userId, isRead: false }).exec(),
    ]);

    const totalPages = Math.ceil(total / params.limit);

    return {
      data: notifications.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPreviousPage: params.page > 1,
        unreadCount,
      },
    };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      userId,
    }).exec();

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    await notification.save();
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await NotificationModel.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    return { count: result.modifiedCount };
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await NotificationModel.countDocuments({
      userId,
      isRead: false,
    }).exec();

    return { count };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      userId,
    }).exec();

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await notification.deleteOne();
  }
}

export const notificationsService = new NotificationsService();
