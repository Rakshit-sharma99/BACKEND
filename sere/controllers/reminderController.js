/**
 * Reminder Controller — handles user-facing reminder APIs.
 *
 * Endpoints:
 *   GET  /reminders            – fetch pending/delivered in-app reminders
 *   POST /reminders/:id/interact – log interaction (clicked/dismissed)
 *   POST /reminders/watchlist  – add a watch intent
 *   GET  /reminders/watchlist  – get user's watchlist
 *   DELETE /reminders/watchlist/:id – remove a watch intent
 *   POST /reminders/preferences – update preferences (quiet hours, tone, opt-out)
 */

const Reminder = require("../models/reminder");
const UserEngagement = require("../models/userEngagement");
const { publishEvent } = require("../config/kafka");

/**
 * GET /sere/api/v1/reminders
 * Returns in-app reminders for the current user.
 * Query: ?status=delivered&limit=20
 */
const getReminders = async (req, res) => {
  try {
    const user = req.user;
    const status = req.query.status || "delivered";
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const reminders = await Reminder.find({
      userId: user.id,
      status,
      channel: { $in: ["in_app", "chat_nudge"] },
    })
      .sort({ scheduledFor: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      reminders,
      count: reminders.length,
    });
  } catch (error) {
    console.error("getReminders error:", error);
    return res.status(500).json({ error: "Could not fetch reminders." });
  }
};

/**
 * POST /sere/api/v1/reminders/:id/interact
 * Body: { type: "clicked" | "dismissed", actionTaken: boolean }
 */
const interactWithReminder = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { type, actionTaken } = req.body;

    if (!type || !["clicked", "dismissed"].includes(type)) {
      return res.status(400).json({ error: 'type must be "clicked" or "dismissed"' });
    }

    const reminder = await Reminder.findOne({ _id: id, userId: user.id });
    if (!reminder) {
      return res.status(404).json({ error: "Reminder not found." });
    }

    // Update reminder
    const now = new Date();
    reminder.interaction = {
      type,
      at: now,
      actionTaken: actionTaken || false,
      responseTimeMs: reminder.deliveredAt
        ? now.getTime() - reminder.deliveredAt.getTime()
        : 0,
    };
    reminder.status = type;
    await reminder.save();

    // Update engagement profile
    const updateOps = {};
    if (type === "clicked") {
      updateOps.$inc = {
        totalRemindersClicked: 1,
      };
      updateOps.$set = { consecutiveIgnores: 0 };
    } else {
      updateOps.$inc = {
        totalRemindersDismissed: 1,
        consecutiveIgnores: 1,
      };
    }

    const engagement = await UserEngagement.findOneAndUpdate(
      { userId: user.id },
      updateOps,
      { new: true },
    );

    // Recompute click rate
    if (engagement) {
      const total =
        engagement.totalRemindersClicked + engagement.totalRemindersDismissed;
      if (total > 0) {
        engagement.clickRate = engagement.totalRemindersClicked / total;

        // Adapt humor tolerance based on interactions
        if (engagement.consecutiveIgnores >= 5) {
          engagement.humorTolerance = Math.max(0.1, engagement.humorTolerance - 0.1);
        } else if (type === "clicked" && engagement.consecutiveIgnores === 0) {
          engagement.humorTolerance = Math.min(1.0, engagement.humorTolerance + 0.05);
        }

        await engagement.save();
      }
    }

    // Update campaign metrics if this reminder was from a campaign
    if (reminder.trigger?.source === "admin" && reminder.trigger?.ref) {
      const Campaign = require("../models/campaign");
      const incField = type === "clicked" ? "totalClicked" : "totalDismissed";
      await Campaign.findByIdAndUpdate(reminder.trigger.ref, {
        $inc: { [incField]: 1 },
      });
    }

    // Publish interaction event
    publishEvent("reminder.interaction", {
      reminderId: reminder._id,
      userId: user.id,
      type,
      actionTaken,
      reminderType: reminder.type,
    });

    return res.status(200).json({
      success: true,
      message: type === "clicked" ? "Interaction logged!" : "Reminder dismissed.",
    });
  } catch (error) {
    console.error("interactWithReminder error:", error);
    return res.status(500).json({ error: "Could not log interaction." });
  }
};

/**
 * POST /sere/api/v1/reminders/watchlist
 * Body: { type: "event"|"club_post"|"hackathon"|"custom", query: string }
 */
const addWatchlistItem = async (req, res) => {
  try {
    const user = req.user;
    const { type, query } = req.body;

    if (!type || !query) {
      return res.status(400).json({ error: "type and query are required." });
    }

    const validTypes = ["event", "club_post", "hackathon", "custom"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    }

    let engagement = await UserEngagement.findOne({ userId: user.id });
    if (!engagement) {
      engagement = await UserEngagement.create({
        userId: user.id,
        uid: user.uid,
      });
    }

    // Check for duplicates
    const exists = engagement.watchlist.some(
      (w) => w.type === type && w.query.toLowerCase() === query.toLowerCase() && w.active,
    );
    if (exists) {
      return res.status(409).json({ error: "This watchlist item already exists." });
    }

    engagement.watchlist.push({
      type,
      query,
      active: true,
      createdAt: new Date(),
    });
    await engagement.save();

    return res.status(201).json({
      success: true,
      message: `Got it! I'll notify you about "${query}" 🎯`,
      watchlist: engagement.watchlist,
    });
  } catch (error) {
    console.error("addWatchlistItem error:", error);
    return res.status(500).json({ error: "Could not add watchlist item." });
  }
};

/**
 * GET /sere/api/v1/reminders/watchlist
 */
const getWatchlist = async (req, res) => {
  try {
    const user = req.user;

    const engagement = await UserEngagement.findOne({ userId: user.id });
    if (!engagement) {
      return res.status(200).json({ watchlist: [] });
    }

    const activeItems = engagement.watchlist.filter((w) => w.active);
    return res.status(200).json({ watchlist: activeItems });
  } catch (error) {
    console.error("getWatchlist error:", error);
    return res.status(500).json({ error: "Could not fetch watchlist." });
  }
};

/**
 * DELETE /sere/api/v1/reminders/watchlist/:id
 */
const removeWatchlistItem = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    const engagement = await UserEngagement.findOne({ userId: user.id });
    if (!engagement) {
      return res.status(404).json({ error: "Not found." });
    }

    const item = engagement.watchlist.id(id);
    if (!item) {
      return res.status(404).json({ error: "Watchlist item not found." });
    }

    item.active = false;
    await engagement.save();

    return res.status(200).json({
      success: true,
      message: "Watchlist item removed.",
    });
  } catch (error) {
    console.error("removeWatchlistItem error:", error);
    return res.status(500).json({ error: "Could not remove watchlist item." });
  }
};

/**
 * POST /sere/api/v1/reminders/preferences
 * Body: { quietHoursStart, quietHoursEnd, preferredTone, optOut }
 */
const updatePreferences = async (req, res) => {
  try {
    const user = req.user;
    const { quietHoursStart, quietHoursEnd, preferredTone, optOut } = req.body;

    const update = {};
    if (quietHoursStart !== undefined) update.quietHoursStart = quietHoursStart;
    if (quietHoursEnd !== undefined) update.quietHoursEnd = quietHoursEnd;
    if (preferredTone !== undefined) update.preferredTone = preferredTone;
    if (optOut !== undefined) update.optedOut = optOut;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No preferences to update." });
    }

    let engagement = await UserEngagement.findOneAndUpdate(
      { userId: user.id },
      { $set: update },
      { new: true, upsert: true },
    );

    return res.status(200).json({
      success: true,
      message: optOut
        ? "Reminders turned off. You can turn them back on anytime."
        : "Preferences updated! 🎨",
      preferences: {
        quietHoursStart: engagement.quietHoursStart,
        quietHoursEnd: engagement.quietHoursEnd,
        preferredTone: engagement.preferredTone,
        optedOut: engagement.optedOut,
      },
    });
  } catch (error) {
    console.error("updatePreferences error:", error);
    return res.status(500).json({ error: "Could not update preferences." });
  }
};

/**
 * GET /sere/api/v1/reminders/engagement
 * Returns the user's engagement profile (for frontend display).
 */
const getEngagementProfile = async (req, res) => {
  try {
    const user = req.user;

    const engagement = await UserEngagement.findOne({ userId: user.id }).lean();
    if (!engagement) {
      return res.status(200).json({
        lifecycleStage: "new",
        onboarding: {},
        clickRate: 0,
        preferences: {},
      });
    }

    return res.status(200).json({
      lifecycleStage: engagement.lifecycleStage,
      onboarding: engagement.onboarding,
      clickRate: engagement.clickRate,
      totalRemindersReceived: engagement.totalRemindersReceived,
      totalRemindersClicked: engagement.totalRemindersClicked,
      preferences: {
        quietHoursStart: engagement.quietHoursStart,
        quietHoursEnd: engagement.quietHoursEnd,
        preferredTone: engagement.preferredTone,
        optedOut: engagement.optedOut,
      },
    });
  } catch (error) {
    console.error("getEngagementProfile error:", error);
    return res.status(500).json({ error: "Could not fetch profile." });
  }
};

module.exports = {
  getReminders,
  interactWithReminder,
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItem,
  updatePreferences,
  getEngagementProfile,
};
