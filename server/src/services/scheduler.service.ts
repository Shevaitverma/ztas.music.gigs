import { GigModel, BidModel, NotificationModel, NotificationType, EventCheckInModel } from '../db/models';
import { GigStatus, BidStatus, CheckInStatus } from '../shared/enums';

/**
 * Scheduler Service
 * Handles automated tasks for the platform:
 * - Event reminders (24h and 2h before)
 * - Auto-close expired gigs
 * - Auto-complete gigs after event
 */
export class SchedulerService {
  private intervals: NodeJS.Timeout[] = [];
  private isRunning = false;

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting scheduled jobs...');
    this.isRunning = true;

    // Event reminders - run every hour
    this.intervals.push(
      setInterval(() => {
        this.sendEventReminders().catch((err) =>
          console.error('[Scheduler] Event reminders error:', err)
        );
      }, 60 * 60 * 1000) // 1 hour
    );

    // Auto-close expired gigs - run every 15 minutes
    this.intervals.push(
      setInterval(() => {
        this.autoCloseExpiredGigs().catch((err) =>
          console.error('[Scheduler] Auto-close error:', err)
        );
      }, 15 * 60 * 1000) // 15 minutes
    );

    // Auto-complete gigs - run every hour
    this.intervals.push(
      setInterval(() => {
        this.autoCompleteGigs().catch((err) =>
          console.error('[Scheduler] Auto-complete error:', err)
        );
      }, 60 * 60 * 1000) // 1 hour
    );

    // Run immediately on startup
    this.runAllJobs();

    console.log('[Scheduler] All jobs started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log('[Scheduler] Stopping scheduled jobs...');
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals = [];
    this.isRunning = false;
    console.log('[Scheduler] All jobs stopped');
  }

  /**
   * Run all jobs immediately (used on startup)
   */
  private async runAllJobs() {
    console.log('[Scheduler] Running initial job sweep...');
    await Promise.allSettled([
      this.sendEventReminders(),
      this.autoCloseExpiredGigs(),
      this.autoCompleteGigs(),
    ]);
    console.log('[Scheduler] Initial job sweep complete');
  }

  /**
   * Send event reminders for upcoming events (24h and 2h before)
   */
  async sendEventReminders(): Promise<void> {
    const now = new Date();

    // Find booked gigs with events in the next 24-26 hours (for 24h reminder)
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in26Hours = new Date(now.getTime() + 26 * 60 * 60 * 1000);

    // Find booked gigs with events in the next 2-3 hours (for 2h reminder)
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const in3Hours = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    // 24h reminders
    const gigs24h = await GigModel.find({
      status: GigStatus.BOOKED,
      'eventTiming.date': { $gte: in24Hours, $lt: in26Hours },
    })
      .populate('postedBy', 'name')
      .populate('acceptedArtist', 'name')
      .lean()
      .exec();

    for (const gig of gigs24h) {
      await this.createReminderNotification(gig, NotificationType.EVENT_REMINDER_24H, '24 hours');
    }

    // 2h reminders
    const gigs2h = await GigModel.find({
      status: GigStatus.BOOKED,
      'eventTiming.date': { $gte: in2Hours, $lt: in3Hours },
    })
      .populate('postedBy', 'name')
      .populate('acceptedArtist', 'name')
      .lean()
      .exec();

    for (const gig of gigs2h) {
      await this.createReminderNotification(gig, NotificationType.EVENT_REMINDER_2H, '2 hours');
    }

    if (gigs24h.length > 0 || gigs2h.length > 0) {
      console.log(`[Scheduler] Sent ${gigs24h.length} 24h reminders, ${gigs2h.length} 2h reminders`);
    }
  }

  /**
   * Create reminder notifications for both client and artist
   */
  private async createReminderNotification(
    gig: any,
    type: NotificationType,
    timeframe: string
  ): Promise<void> {
    const notifications = [];

    // Notification for client
    if (gig.postedBy?._id) {
      const existingClient = await NotificationModel.findOne({
        userId: gig.postedBy._id,
        type,
        'data.gigId': gig._id.toString(),
      });

      if (!existingClient) {
        notifications.push({
          userId: gig.postedBy._id,
          type,
          title: `Event Reminder: ${gig.title}`,
          message: `Your event "${gig.title}" is starting in ${timeframe}. Make sure everything is ready!`,
          data: { gigId: gig._id.toString() },
        });
      }
    }

    // Notification for artist
    if (gig.acceptedArtist?._id) {
      const existingArtist = await NotificationModel.findOne({
        userId: gig.acceptedArtist._id,
        type,
        'data.gigId': gig._id.toString(),
      });

      if (!existingArtist) {
        notifications.push({
          userId: gig.acceptedArtist._id,
          type,
          title: `Event Reminder: ${gig.title}`,
          message: `Your performance at "${gig.title}" is starting in ${timeframe}. Get ready to rock!`,
          data: { gigId: gig._id.toString() },
        });
      }
    }

    if (notifications.length > 0) {
      await NotificationModel.insertMany(notifications);
    }
  }

  /**
   * Auto-close gigs with past event dates (LIVE → CLOSED)
   */
  async autoCloseExpiredGigs(): Promise<void> {
    const now = new Date();

    // Capture the exact set of gigs about to be closed BEFORE flipping status,
    // so the follow-up bid-rejection sweep does not match historical CLOSED
    // gigs (which would re-run BidModel.updateMany every tick).
    const gigsToClose = await GigModel.find({
      status: GigStatus.LIVE,
      'eventTiming.date': { $lt: now },
    })
      .select('_id postedBy title')
      .lean()
      .exec();

    if (gigsToClose.length === 0) {
      return;
    }

    const gigIds = gigsToClose.map((g) => g._id);

    const result = await GigModel.updateMany(
      { _id: { $in: gigIds } },
      { status: GigStatus.CLOSED }
    );

    if (result.modifiedCount > 0) {
      console.log(`[Scheduler] Auto-closed ${result.modifiedCount} expired gigs`);

      // Reject pending bids only on the gigs we just closed in this sweep.
      for (const gig of gigsToClose) {
        await BidModel.updateMany(
          { gigId: gig._id, status: BidStatus.PENDING },
          { status: BidStatus.REJECTED }
        );

        // Notify the client
        const existing = await NotificationModel.findOne({
          userId: gig.postedBy,
          type: NotificationType.GIG_AUTO_CLOSED,
          'data.gigId': gig._id.toString(),
        });

        if (!existing) {
          await NotificationModel.create({
            userId: gig.postedBy,
            type: NotificationType.GIG_AUTO_CLOSED,
            title: 'Gig Auto-Closed',
            message: `Your gig "${gig.title}" has been automatically closed as the event date has passed.`,
            data: { gigId: gig._id.toString() },
          });
        }
      }
    }
  }

  /**
   * Auto-complete gigs 24 hours after the event (BOOKED/CLOSED → COMPLETED)
   */
  async autoCompleteGigs(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Lower bound on the sweep window: after 30 days an unconfirmed gig ages out
    // of the candidate set so we don't re-scan it (and re-query its check-in)
    // on every tick forever. Anything older needs manual/admin resolution.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Candidates: actually-booked gigs (have an accepted artist) whose event was
    // 24h–30d ago. Requiring `acceptedArtist` excludes auto-closed *unbooked*
    // expired gigs — they had no performer and must never be marked COMPLETED.
    const gigsToComplete = await GigModel.find({
      status: { $in: [GigStatus.BOOKED, GigStatus.CLOSED] },
      acceptedArtist: { $exists: true, $ne: null },
      'eventTiming.date': { $lt: twentyFourHoursAgo, $gte: thirtyDaysAgo },
    })
      .select('_id postedBy acceptedArtist title status')
      .lean()
      .exec();

    let completed = 0;
    let flaggedForReview = 0;

    for (const gig of gigsToComplete) {
      // SECURITY (SRV-007): the OTP dual end-event confirmation is the ground
      // truth that "this gig actually happened". The timer must NOT mark a gig
      // COMPLETED unless both parties confirmed the event ended — COMPLETED
      // opens two-way reviews today and, once escrow is wired, would AUTO-RELEASE
      // funds. So only EVENT_ENDED check-ins are auto-completed; any other state
      // means the event was never confirmed, and the gig is moved to CLOSED for
      // manual review instead. When payments exist, this branch must open a
      // dispute / hold escrow — never release on the timer path.
      const checkIn = await EventCheckInModel.findOne({ gig: gig._id })
        .select('status')
        .lean()
        .exec();

      if (checkIn?.status === CheckInStatus.EVENT_ENDED) {
        await GigModel.updateOne({ _id: gig._id }, { status: GigStatus.COMPLETED });
        completed++;

        // Notify both client and artist
        const notifications = [];

        if (gig.postedBy) {
          const existingClient = await NotificationModel.findOne({
            userId: gig.postedBy,
            type: NotificationType.GIG_AUTO_COMPLETED,
            'data.gigId': gig._id.toString(),
          });

          if (!existingClient) {
            notifications.push({
              userId: gig.postedBy,
              type: NotificationType.GIG_AUTO_COMPLETED,
              title: 'Gig Completed',
              message: `Your gig "${gig.title}" has been marked as completed. Don't forget to leave a review!`,
              data: { gigId: gig._id.toString() },
            });
          }
        }

        if (gig.acceptedArtist) {
          const existingArtist = await NotificationModel.findOne({
            userId: gig.acceptedArtist,
            type: NotificationType.GIG_AUTO_COMPLETED,
            'data.gigId': gig._id.toString(),
          });

          if (!existingArtist) {
            notifications.push({
              userId: gig.acceptedArtist,
              type: NotificationType.GIG_AUTO_COMPLETED,
              title: 'Gig Completed',
              message: `Your performance at "${gig.title}" has been marked as completed. Great job!`,
              data: { gigId: gig._id.toString() },
            });
          }
        }

        if (notifications.length > 0) {
          await NotificationModel.insertMany(notifications);
        }
      } else if (gig.status === GigStatus.BOOKED) {
        // A booked event whose date passed WITHOUT a confirmed end-of-event
        // check-in. Do NOT complete (that would open reviews and, once escrow is
        // wired, release funds). Downgrade to CLOSED (manual-review state) and
        // notify the client once. Gigs that are ALREADY CLOSED are intentionally
        // left untouched here — they were closed via the normal flow, so we
        // don't re-transition or send a misleading "no check-in" notice; they
        // remain completable via the OTP flow or the manual complete endpoint.
        await GigModel.updateOne({ _id: gig._id }, { status: GigStatus.CLOSED });
        flaggedForReview++;

        if (gig.postedBy) {
          const existing = await NotificationModel.findOne({
            userId: gig.postedBy,
            type: NotificationType.GIG_AUTO_CLOSED,
            'data.gigId': gig._id.toString(),
          });

          if (!existing) {
            await NotificationModel.create({
              userId: gig.postedBy,
              type: NotificationType.GIG_AUTO_CLOSED,
              title: 'Event Confirmation Needed',
              message: `Your booked gig "${gig.title}" passed its event date without a confirmed end-of-event check-in. Please confirm the event so it can be completed.`,
              data: { gigId: gig._id.toString() },
            });
          }
        }
      }
    }

    if (completed > 0) {
      console.log(`[Scheduler] Auto-completed ${completed} confirmed gigs`);
    }
    if (flaggedForReview > 0) {
      console.log(
        `[Scheduler] Flagged ${flaggedForReview} unconfirmed gigs for manual review (not completed)`
      );
    }
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();
