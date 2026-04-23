/**
 * Live Notification Controller — REST endpoints for analytics.
 *
 * Endpoints:
 *   GET /sere/api/v1/live/stats    – delivery stats (admin)
 *   GET /sere/api/v1/live/history  – recent live notifications for current user
 */

const LiveNotificationLog = require("../models/liveNotificationLog");

/**
 * GET /sere/api/v1/live/stats
 * Returns aggregate stats for live notification delivery.
 * Query: ?hours=24 (default 24h window)
 */
const getLiveStats = async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await LiveNotificationLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const typeBreakdown = await LiveNotificationLog.aggregate([
      { $match: { createdAt: { $gte: since }, status: "delivered" } },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          dismissed: {
            $sum: { $cond: [{ $ne: ["$dismissedAt", null] }, 1, 0] },
          },
          actioned: {
            $sum: { $cond: [{ $ne: ["$actionTakenAt", null] }, 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const statusMap = {};
    for (const s of stats) {
      statusMap[s._id] = s.count;
    }

    return res.status(200).json({
      window: `${hours}h`,
      totals: {
        delivered: statusMap.delivered || 0,
        suppressed: statusMap.suppressed || 0,
      },
      typeBreakdown,
    });
  } catch (error) {
    console.error("getLiveStats error:", error);
    return res.status(500).json({ error: "Could not fetch live stats." });
  }
};

/**
 * GET /sere/api/v1/live/history
 * Returns recent live notifications for the authenticated user.
 * Query: ?limit=20
 */
const getLiveHistory = async (req, res) => {
  try {
    const user = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const logs = await LiveNotificationLog.find({
      targetUserId: user.id,
      status: "delivered",
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      notifications: logs,
      count: logs.length,
    });
  } catch (error) {
    console.error("getLiveHistory error:", error);
    return res.status(500).json({ error: "Could not fetch live history." });
  }
};

module.exports = {
  getLiveStats,
  getLiveHistory,
};
