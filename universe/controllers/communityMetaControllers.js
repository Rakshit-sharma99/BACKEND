const { StatusCodes } = require("http-status-codes");
const Session = require("../models/session");

const AvgCommunityTimeToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getStartOfToday() }
        }
      },
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      { $match: { callStack: { $regex: "/community/" } } },

      {
        $addFields: {
          ts: {
            $toDate: {
              $substrBytes: [
                "$callStack",
                1,
                { $subtract: [{ $indexOfBytes: ["$callStack", "]"] }, 1] }
              ]
            }
          }
        }
      },

      // Per-session first & last hit
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },

      // Session duration
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },

      { $match: { minutes: { $gt: 0 } } },

      // Average across sessions
      {
        $group: {
          _id: null,
          avgTimeMinutes: { $avg: "$minutes" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      page: "community",
      metric: "average_time_spent",
      range: "today",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgCommunityTimeToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
        success: false,
        message: "Something went wrong" });
  }
};

const AvgCommunityTimeLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(7) }
        }
      },
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      // Keep only community calls
      { $match: { callStack: { $regex: "/community/" } } },

      // Extract timestamp
      {
        $addFields: {
          ts: {
            $toDate: {
              $substrBytes: [
                "$callStack",
                1,
                { $subtract: [{ $indexOfBytes: ["$callStack", "]"] }, 1] }
              ]
            }
          }
        }
      },

      // First & last timestamps per session
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },

      // Session duration in minutes
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },

      { $match: { minutes: { $gt: 0 } } },

      // Average time
      {
        $group: {
          _id: null,
          avgTimeMinutes: { $avg: "$minutes" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      page: "community",
      metric: "average_time_spent",
      range: "lastWeek",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgCommunityTimeLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ 
        success: false,
        message: "Something went wrong" });
  }
};

module.exports = {
  AvgCommunityTimeToday,
  AvgCommunityTimeLastWeek
}