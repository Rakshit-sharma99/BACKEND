const { StatusCodes } = require("http-status-codes");
const Session = require("../models/session");

const { redis } = require("../app");
const TTL = 600;


const normalizeCallStack = {
  $addFields: {
    callStack: {
      $cond: [
        { $isArray: "$callStack" },
        "$callStack",
        []
      ]
    }
  }
};

const COMMUNITY_BASE = [
  { $match: { endedAt: { $ne: null } } },

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
  }
];

const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

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
      message: "Average community time today fetched successfully",
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
      message: "Something went wrong"
    });
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
      message: "Average community time last week fetched successfully",
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
      message: "Something went wrong"
    });
  }
};

const AvgCommunityTimeLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(30) }
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
      message: "Average community time last month fetched successfully",
      page: "community",
      metric: "average_time_spent",
      range: "lastMonth",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgCommunityTimeLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const AvgCommunityTimeAllTime = async (req, res) => {
  try {
    const key = "stats:community:avg_time:all_time";
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const result = await Session.aggregate([
      ...COMMUNITY_BASE,

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

      // Average across sessions
      {
        $group: {
          _id: null,
          avgTimeMinutes: { $avg: "$minutes" }
        }
      }
    ]);

    const response = {
      success: true,
      message: "Average community time all time fetched successfully",
      page: "community",
      metric: "average_time_spent",
      range: "allTime",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    };

    await redis.setex(key, TTL, JSON.stringify(response));
    res.status(StatusCodes.OK).json(response);
  } catch (err) {
    console.error("AvgCommunityTimeAllTime error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const TotalCommunityVisitsToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: getStartOfToday() }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      { $match: { callStack: { $regex: "/community/" } } },

      { $count: "totalVisits" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total community visits today fetched successfully",
      page: "community",
      range: "today",
      totalVisits: result[0]?.totalVisits || 0
    });
  } catch (err) {
    console.error("TotalCommunityVisitsToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const TotalCommunityVisitsLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: getDaysAgo(7) }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      // Keep only community calls
      { $match: { callStack: { $regex: "/community/" } } },

      // Count visits
      { $count: "totalVisits" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total community visits last week fetched successfully",
      page: "community",
      range: "lastWeek",
      totalVisits: result[0]?.totalVisits || 0
    });
  } catch (err) {
    console.error("TotalCommunityVisitsLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const TotalCommunityVisitsLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: getDaysAgo(30) }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      // Keep only community calls
      { $match: { callStack: { $regex: "/community/" } } },

      // Count visits
      { $count: "totalVisits" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total community visits last month fetched successfully",
      page: "community",
      range: "lastMonth",
      totalVisits: result[0]?.totalVisits || 0
    });
  } catch (err) {
    console.error("TotalCommunityVisitsLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const TotalCommunityVisitsAllTime = async (req, res) => {
  try {
    const key = "stats:community:total_visits:all_time";
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const result = await Session.aggregate([
      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      // Keep only community calls
      { $match: { callStack: { $regex: "/community/" } } },

      // Count visits
      { $count: "totalVisits" }
    ]);

    const response = {
      success: true,
      message: "Total community visits all time fetched successfully",
      page: "community",
      range: "allTime",
      totalVisits: result[0]?.totalVisits || 0
    };

    await redis.setex(key, TTL, JSON.stringify(response));
    res.status(StatusCodes.OK).json(response);
  } catch (err) {
    console.error("TotalCommunityVisitsAllTime error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const BounceRateCommunityToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getStartOfToday() }
        }
      },

      // ✅ Normalize callStack (CRITICAL)
      normalizeCallStack,

      // Keep only callStack
      { $project: { callStack: 1 } },

      // Index callStack safely
      {
        $project: {
          indexedLogs: {
            $map: {
              input: { $range: [0, { $size: "$callStack" }] },
              as: "idx",
              in: {
                idx: "$$idx",
                log: { $arrayElemAt: ["$callStack", "$$idx"] }
              }
            }
          },
          callStack: 1
        }
      },

      { $unwind: "$indexedLogs" },

      // Community visits only
      { $match: { "indexedLogs.log": { $regex: "/community/" } } },

      // Check if user navigated forward
      {
        $project: {
          hasNextPage: {
            $cond: [
              {
                $lt: [
                  "$indexedLogs.idx",
                  { $subtract: [{ $size: "$callStack" }, 1] }
                ]
              },
              1,
              0
            ]
          }
        }
      },

      // Per-session bounce decision
      {
        $group: {
          _id: "$_id",
          hasNextPage: { $max: "$hasNextPage" }
        }
      },

      // Aggregate bounce rate
      {
        $group: {
          _id: null,
          totalCommunitySessions: { $sum: 1 },
          bouncedSessions: {
            $sum: { $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalCommunitySessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate for community today fetched successfully",
      page: "community",
      metric: "bounce_rate",
      range: "today",
      totalCommunitySessions: data.totalCommunitySessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalCommunitySessions
        ? +((data.bouncedSessions / data.totalCommunitySessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateCommunityToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const BounceRateCommunityLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(7) }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // Keep only callStack
      { $project: { callStack: 1 } },

      // Index callStack safely
      {
        $project: {
          indexedLogs: {
            $map: {
              input: { $range: [0, { $size: "$callStack" }] },
              as: "idx",
              in: {
                idx: "$$idx",
                log: { $arrayElemAt: ["$callStack", "$$idx"] }
              }
            }
          },
          callStack: 1
        }
      },

      { $unwind: "$indexedLogs" },

      // Community visits only
      { $match: { "indexedLogs.log": { $regex: "/community/" } } },

      // Check if user navigated forward
      {
        $project: {
          hasNextPage: {
            $cond: [
              {
                $lt: [
                  "$indexedLogs.idx",
                  { $subtract: [{ $size: "$callStack" }, 1] }
                ]
              },
              1,
              0
            ]
          }
        }
      },

      // Per-session bounce decision
      {
        $group: {
          _id: "$_id",
          hasNextPage: { $max: "$hasNextPage" }
        }
      },

      // Aggregate bounce rate
      {
        $group: {
          _id: null,
          totalCommunitySessions: { $sum: 1 },
          bouncedSessions: {
            $sum: { $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalCommunitySessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate for community last week fetched successfully",
      page: "community",
      metric: "bounce_rate",
      range: "lastWeek",
      totalCommunitySessions: data.totalCommunitySessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalCommunitySessions
        ? +((data.bouncedSessions / data.totalCommunitySessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateCommunityLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const BounceRateCommunityLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(30) }
        }
      },

      // ✅ Normalize callStack (CRITICAL FIX)
      normalizeCallStack,

      // Keep only callStack
      { $project: { callStack: 1 } },

      // Index callStack safely
      {
        $project: {
          indexedLogs: {
            $map: {
              input: { $range: [0, { $size: "$callStack" }] },
              as: "idx",
              in: {
                idx: "$$idx",
                log: { $arrayElemAt: ["$callStack", "$$idx"] }
              }
            }
          },
          callStack: 1
        }
      },

      { $unwind: "$indexedLogs" },

      // Community visits only
      { $match: { "indexedLogs.log": { $regex: "/community/" } } },

      // Detect forward navigation
      {
        $project: {
          hasNextPage: {
            $cond: [
              {
                $lt: [
                  "$indexedLogs.idx",
                  { $subtract: [{ $size: "$callStack" }, 1] }
                ]
              },
              1,
              0
            ]
          }
        }
      },

      // Per-session bounce decision
      {
        $group: {
          _id: "$_id",
          hasNextPage: { $max: "$hasNextPage" }
        }
      },

      // Aggregate bounce rate
      {
        $group: {
          _id: null,
          totalCommunitySessions: { $sum: 1 },
          bouncedSessions: {
            $sum: { $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalCommunitySessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate for community last month fetched successfully",
      page: "community",
      metric: "bounce_rate",
      range: "lastMonth",
      totalCommunitySessions: data.totalCommunitySessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalCommunitySessions
        ? +((data.bouncedSessions / data.totalCommunitySessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateCommunityLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const BounceRateCommunityAllTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      // Only completed sessions
      { $match: { endedAt: { $ne: null } } },

      // ✅ Normalize callStack
      normalizeCallStack,

      // Get last page in session (SAFE now)
      {
        $project: {
          lastLog: { $arrayElemAt: ["$callStack", -1] }
        }
      },

      // Keep only sessions whose LAST page was community
      {
        $match: {
          lastLog: { $regex: "/community/" }
        }
      },

      // Count bounced sessions
      {
        $group: {
          _id: null,
          bouncedSessions: { $sum: 1 }
        }
      }
    ]);

    // Total community sessions (unchanged logic)
    const totalCommunitySessions = await Session.countDocuments({
      callStack: { $elemMatch: { $regex: "/community/" } },
      endedAt: { $ne: null }
    });

    const bouncedSessions = result[0]?.bouncedSessions || 0;

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate for community all time fetched successfully",
      page: "community",
      metric: "bounce_rate",
      range: "allTime",
      totalCommunitySessions,
      bouncedSessions,
      bounceRate: totalCommunitySessions
        ? +((bouncedSessions / totalCommunitySessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateCommunityAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const CommunityVisitTimeClusters = async (req, res) => {
  try {
    const key = "stats:community:clusters:all_time";
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const result = await Session.aggregate([
      ...COMMUNITY_BASE,

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
      }
    ]);

    const clusters = { A: 0, B: 0, C: 0 };

    result.forEach(r => {
      if (r.minutes <= 1) clusters.A++;
      else if (r.minutes >= 2.5 && r.minutes <= 5) clusters.B++;
      else if (r.minutes > 5) clusters.C++;
    });

    const response = {
      success: true,
      message: "Community visit time clusters all time fetched successfully",
      page: "community",
      metric: "visit_time_clusters",
      range: "allTime",
      clusters: {
        "<= 1 min": clusters.A,
        "2.5 - 5 min": clusters.B,
        "> 5 min": clusters.C
      }
    };

    await redis.setex(key, TTL, JSON.stringify(response));
    res.status(StatusCodes.OK).json(response);
  } catch (err) {
    console.error("CommunityVisitTimeClusters error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const PeakCommunityUsageHourly = async (req, res) => {
  try {
    const result = await Session.aggregate([
      // ✅ Normalize callStack (critical safety step)
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      // Keep ONLY community-related APIs
      {
        $match: {
          callStack: {
            $regex: "/community",
            $options: "i"
          }
        }
      },

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

      // Extract hour (0–23)
      {
        $project: {
          hour: { $hour: "$ts" }
        }
      },

      // Count per hour
      {
        $group: {
          _id: "$hour",
          count: { $sum: 1 }
        }
      }
    ]);

    // Normalize to 0–23 (important for graph)
    const hourlyUsage = Array.from({ length: 24 }, (_, hour) => {
      const found = result.find(r => r._id === hour);
      return {
        hour,
        count: found ? found.count : 0
      };
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Peak community usage hourly all time fetched successfully",
      page: "community",
      metric: "peak_usage_hourly",
      range: "allTime",
      hourlyUsage
    });
  } catch (err) {
    console.error("PeakCommunityUsageHourly error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const TopNavigationFromCommunity = async (req, res) => {
  try {
    const result = await Session.aggregate([
      // Only completed sessions
      { $match: { endedAt: { $ne: null } } },

      // ✅ Normalize callStack (CRITICAL FIX)
      normalizeCallStack,

      // Keep only callStack
      { $project: { callStack: 1 } },

      // Safely index callStack
      {
        $project: {
          indexedLogs: {
            $map: {
              input: { $range: [0, { $size: "$callStack" }] },
              as: "idx",
              in: {
                idx: "$$idx",
                log: { $arrayElemAt: ["$callStack", "$$idx"] }
              }
            }
          },
          callStack: 1
        }
      },

      { $unwind: "$indexedLogs" },

      // ✅ MATCH COMMUNITY
      {
        $match: {
          "indexedLogs.log": {
            $regex: "/community",
            $options: "i"
          }
        }
      },

      // ✅ NEXT PAGE AFTER COMMUNITY
      {
        $project: {
          nextLog: {
            $arrayElemAt: [
              "$callStack",
              { $add: ["$indexedLogs.idx", 1] }
            ]
          }
        }
      },

      { $match: { nextLog: { $ne: null } } },

      // ✅ NORMALIZE DESTINATION
      {
        $project: {
          page: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: "$nextLog", regex: "/events", options: "i" } }, then: "events" },
                { case: { $regexMatch: { input: "$nextLog", regex: "/home", options: "i" } }, then: "home" },
                { case: { $regexMatch: { input: "$nextLog", regex: "/faq", options: "i" } }, then: "faq" },
                { case: { $regexMatch: { input: "$nextLog", regex: "/clubs", options: "i" } }, then: "clubs" },
                { case: { $regexMatch: { input: "$nextLog", regex: "/community", options: "i" } }, then: "community" }
              ],
              default: "others"
            }
          }
        }
      },

      // Aggregate results
      {
        $group: {
          _id: "$page",
          count: { $sum: 1 }
        }
      },

      { $sort: { count: -1 } },
      { $limit: 5 },

      {
        $project: {
          _id: 0,
          page: "$_id",
          count: 1
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Top navigations from community fetched successfully",
      page: "community",
      metric: "top_navigation_from_community",
      range: "allTime",
      topNavigations: result
    });
  } catch (err) {
    console.error("TopNavigationFromCommunity error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const TotalCommunityTimeAllTime = async (req, res) => {
  try {
    const key = "stats:community:total_time:all_time";
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const result = await Session.aggregate([
      ...COMMUNITY_BASE,

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

      // Total time across all sessions
      {
        $group: {
          _id: null,
          totalTimeMinutes: { $sum: "$minutes" }
        }
      }
    ]);

    const response = {
      success: true,
      page: "community",
      metric: "total_time_spent",
      range: "allTime",
      totalTimeMinutes: result[0]
        ? +result[0].totalTimeMinutes.toFixed(2)
        : 0
    };

    await redis.setex(key, TTL, JSON.stringify(response));
    res.status(StatusCodes.OK).json(response);
  } catch (err) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success : false,
      message: "Something went wrong"
    });
  }
};

const SingleHitCommunitySessionsToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getStartOfToday() }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Exactly one community hit
      { $match: { communityHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit community sessions today fetched successfully",
      page: "community",
      metric: "single_hit_sessions",
      range: "today",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitCommunitySessionsToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const SingleHitCommunitySessionsLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(7) }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Exactly one community hit
      { $match: { communityHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit community sessions last week fetched successfully",
      page: "community",
      metric: "single_hit_sessions",
      range: "lastWeek",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitCommunitySessionsLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const SingleHitCommunitySessionsLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(30) }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Exactly one community hit
      { $match: { communityHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit community sessions last month fetched successfully",
      page: "community",
      metric: "single_hit_sessions",
      range: "lastMonth",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitCommunitySessionsLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const SingleHitCommunitySessionsAllTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Exactly one community hit
      { $match: { communityHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit community sessions all time fetched successfully",
      page: "community",
      metric: "single_hit_sessions",
      range: "allTime",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitCommunitySessionsAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const AvgRequestsPerCommunityVisitToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getStartOfToday() }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Sessions with at least one community hit
      { $match: { communityRequests: { $gt: 0 } } },

      // Average requests per session
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$communityRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per community visit today fetched successfully",
      page: "community",
      metric: "avg_requests_per_visit",
      range: "today",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerCommunityVisitToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const AvgRequestsPerCommunityVisitLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(7) }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Sessions with at least one community hit
      { $match: { communityRequests: { $gt: 0 } } },

      // Average requests per session
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$communityRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per community visit last week fetched successfully",
      page: "community",
      metric: "avg_requests_per_visit",
      range: "lastWeek",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerCommunityVisitLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const AvgRequestsPerCommunityVisitLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(30) }
        }
      },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Sessions with at least one community hit
      { $match: { communityRequests: { $gt: 0 } } },

      // Average requests per session
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$communityRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per community visit last month fetched successfully",
      page: "community",
      metric: "avg_requests_per_visit",
      range: "lastMonth",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerCommunityVisitLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const AvgRequestsPerCommunityVisitAllTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      {
        $group: {
          _id: "$_id",
          communityRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/community/"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      // Sessions with at least one community hit
      { $match: { communityRequests: { $gt: 0 } } },

      // Average requests per session
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$communityRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per community visit all time fetched successfully",
      page: "community",
      metric: "avg_requests_per_visit",
      range: "allTime",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const CommunityToEventConversionRate = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },

      // ✅ Normalize callStack (CRITICAL here)
      normalizeCallStack,

      {
        $project: {
          callStack: 1,

          // First occurrence of community
          communityIndex: {
            $indexOfArray: [
              {
                $map: {
                  input: "$callStack",
                  as: "log",
                  in: {
                    $cond: [
                      {
                        $regexMatch: {
                          input: "$$log",
                          regex: "/community/"
                        }
                      },
                      "community",
                      null
                    ]
                  }
                }
              },
              "community"
            ]
          },

          // First occurrence of event
          eventIndex: {
            $indexOfArray: [
              {
                $map: {
                  input: "$callStack",
                  as: "log",
                  in: {
                    $cond: [
                      {
                        $regexMatch: {
                          input: "$$log",
                          regex: "/event"
                        }
                      },
                      "event",
                      null
                    ]
                  }
                }
              },
              "event"
            ]
          }
        }
      },

      // Must have visited community
      { $match: { communityIndex: { $gte: 0 } } },

      // Determine conversion
      {
        $project: {
          converted: {
            $cond: [
              {
                $and: [
                  { $gte: ["$eventIndex", 0] },
                  { $gt: ["$eventIndex", "$communityIndex"] }
                ]
              },
              1,
              0
            ]
          }
        }
      },

      {
        $group: {
          _id: null,
          totalCommunitySessions: { $sum: 1 },
          convertedSessions: { $sum: "$converted" }
        }
      }
    ]);

    const data = result[0] || {
      totalCommunitySessions: 0,
      convertedSessions: 0
    };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Community to event conversion rate all time fetched successfully",
      page: "community",
      metric: "community_to_event_conversion_rate",
      range: "allTime",
      totalCommunitySessions: data.totalCommunitySessions,
      convertedSessions: data.convertedSessions,
      conversionRate: data.totalCommunitySessions
        ? +(
          (data.convertedSessions / data.totalCommunitySessions) *
          100
        ).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("CommunityToEventConversionRate error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const ReturningCommunityUsers = async (req, res) => {
  try {
    const result = await Session.aggregate([
      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      // Keep only community visits
      { $match: { callStack: { $regex: "/community/" } } },

      // Group by user and collect unique sessions
      {
        $group: {
          _id: "$userId",
          sessions: { $addToSet: "$_id" }
        }
      },

      // Count sessions per user
      {
        $project: {
          sessionCount: { $size: "$sessions" }
        }
      },

      // Returning users = more than 1 session
      { $match: { sessionCount: { $gt: 1 } } },

      { $count: "returningUsers" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Returning community users all time fetched successfully",
      page: "community",
      metric: "returning_users",
      range: "allTime",
      returningUsers: result[0]?.returningUsers || 0
    });
  } catch (err) {
    console.error("ReturningCommunityUsers error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const MedianCommunityTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      // Only completed sessions
      { $match: { endedAt: { $ne: null } } },

      // ✅ Normalize callStack
      normalizeCallStack,

      // ✅ Safe unwind
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },

      // Keep only community calls
      { $match: { callStack: { $regex: "/community/" } } },

      // Extract timestamp from callStack
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

      // Sort for median calculation
      { $sort: { minutes: 1 } },

      // Collect times
      {
        $group: {
          _id: null,
          times: { $push: "$minutes" }
        }
      },

      // Compute median
      {
        $project: {
          medianCommunityTime: {
            $let: {
              vars: { size: { $size: "$times" } },
              in: {
                $cond: [
                  // Odd length
                  { $eq: [{ $mod: ["$$size", 2] }, 1] },
                  {
                    $arrayElemAt: [
                      "$times",
                      { $floor: { $divide: ["$$size", 2] } }
                    ]
                  },
                  // Even length
                  {
                    $avg: [
                      {
                        $arrayElemAt: [
                          "$times",
                          { $subtract: [{ $divide: ["$$size", 2] }, 1] }
                        ]
                      },
                      {
                        $arrayElemAt: [
                          "$times",
                          { $divide: ["$$size", 2] }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Median community time spent all time fetched successfully",
      page: "community",
      metric: "median_time_spent",
      range: "allTime",
      medianTimeMinutes: result[0]?.medianCommunityTime
        ? +result[0].medianCommunityTime.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("MedianCommunityTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

module.exports = {
  AvgCommunityTimeToday,
  AvgCommunityTimeLastWeek,
  AvgCommunityTimeLastMonth,
  AvgCommunityTimeAllTime,
  TotalCommunityVisitsToday,
  TotalCommunityVisitsLastWeek,
  TotalCommunityVisitsLastMonth,
  TotalCommunityVisitsAllTime,
  TopNavigationFromCommunity,
  TotalCommunityTimeAllTime,
  CommunityVisitTimeClusters,
  BounceRateCommunityToday,
  BounceRateCommunityLastWeek,
  BounceRateCommunityLastMonth,
  BounceRateCommunityAllTime,
  SingleHitCommunitySessionsToday,
  SingleHitCommunitySessionsLastWeek,
  SingleHitCommunitySessionsLastMonth,
  SingleHitCommunitySessionsAllTime,
  PeakCommunityUsageHourly,
  AvgRequestsPerCommunityVisitToday,
  AvgRequestsPerCommunityVisitLastWeek,
  AvgRequestsPerCommunityVisitLastMonth,
  AvgRequestsPerCommunityVisitAllTime,
  CommunityToEventConversionRate,
  ReturningCommunityUsers,
  MedianCommunityTime
}