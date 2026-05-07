import { NotificationModel, NotificationType } from '../../db/models';
import { NotFoundException } from '../../plugins/error.plugin';

/**
 * Notifications Service
 * Handles CRUD operations for user notifications
 */
export class NotificationsService {
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

  /**
   * Create a notification (for internal use)
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await NotificationModel.create({
      userId,
      type,
      title,
      message,
      data,
    });
  }
}

export const notificationsService = new NotificationsService();
