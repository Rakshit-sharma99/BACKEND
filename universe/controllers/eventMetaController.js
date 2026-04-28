const Session = require("../models/session");
const { redis } = require("../app");
const { StatusCodes } = require("http-status-codes");

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

const EVENT_BASE = [
  { $match: { endedAt: { $ne: null } } },
  normalizeCallStack,
  {
    $unwind: {
      path: "$callStack",
      preserveNullAndEmptyArrays: false
    }
  },
  {
    $match: {
      callStack: {
        $regex: "/event",
        $options: "i"
      }
    }
  },
  {
    $addFields: {
      ts: {
        $toDate: {
          $substrBytes: [
            "$callStack",
            1,
            {
              $subtract: [
                { $indexOfBytes: ["$callStack", "]"] },
                1
              ]
            }
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

const AvgEventTimeToday = async (req, res) => {
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
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      {
        $addFields: {
          ts: {
            $toDate: {
              $substrBytes: [
                "$callStack",
                1,
                {
                  $subtract: [
                    { $indexOfBytes: ["$callStack", "]"] },
                    1
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },
      { $match: { minutes: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgTimeMinutes: { $avg: "$minutes" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average event time today fetched successfully",
      page: "event",
      metric: "average_time_spent",
      range: "today",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgEventTimeToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const AvgEventTimeLastWeek = async (req, res) => {
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
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      {
        $addFields: {
          ts: {
            $toDate: {
              $substrBytes: [
                "$callStack",
                1,
                {
                  $subtract: [
                    { $indexOfBytes: ["$callStack", "]"] },
                    1
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },
      { $match: { minutes: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgTimeMinutes: { $avg: "$minutes" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average event time last week fetched successfully",
      page: "event",
      metric: "average_time_spent",
      range: "lastWeek",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgEventTimeLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const AvgEventTimeLastMonth = async (req, res) => {
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
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      {
        $addFields: {
          ts: {
            $toDate: {
              $substrBytes: [
                "$callStack",
                1,
                {
                  $subtract: [
                    { $indexOfBytes: ["$callStack", "]"] },
                    1
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },
      { $match: { minutes: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgTimeMinutes: { $avg: "$minutes" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average event time last month fetched successfully",
      page: "event",
      metric: "average_time_spent",
      range: "lastMonth",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgEventTimeLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const AvgEventTimeAllTime = async (req, res) => {
  try {
    const key = "stats:event:avg_time:all_time";
    const cached = await redis.get(key);

    if (cached) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Average event time all time fetched successfully (cached)",
        ...JSON.parse(cached)
      });
    }

    const result = await Session.aggregate([
      ...EVENT_BASE,
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },
      { $match: { minutes: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgTimeMinutes: { $avg: "$minutes" }
        }
      }
    ]);

    const response = {
      page: "event",
      metric: "average_time_spent",
      range: "allTime",
      avgTimeMinutes: result[0]
        ? +result[0].avgTimeMinutes.toFixed(2)
        : 0
    };

    await redis.setex(key, TTL, JSON.stringify(response));

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average event time all time fetched successfully",
      ...response
    });
  } catch (err) {
    console.error("AvgEventTimeAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const TotalEventVisitsToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
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
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      { $count: "totalVisits" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total event visits today fetched successfully",
      page: "event",
      range: "today",
      totalVisits: result[0]?.totalVisits || 0
    });
  } catch (err) {
    console.error("TotalEventVisitsToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const TotalEventVisitsLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
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
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      { $count: "totalVisits" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total event visits last week fetched successfully",
      page: "event",
      range: "lastWeek",
      totalVisits: result[0]?.totalVisits || 0
    });
  } catch (err) {
    console.error("TotalEventVisitsLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const TotalEventVisitsLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
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
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      { $count: "totalVisits" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total event visits last month fetched successfully",
      page: "event",
      range: "lastMonth",
      totalVisits: result[0]?.totalVisits || 0
    });
  } catch (err) {
    console.error("TotalEventVisitsLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const TotalEventVisitsAllTime = async (req, res) => {
  try {
    const key = "stats:event:total_visits:all_time";
    const cached = await redis.get(key);
    if (cached) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Total event visits all time fetched successfully (cached)",
        ...JSON.parse(cached)
      });
    }

    const result = await Session.aggregate([
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      { $count: "totalVisits" }
    ]);

    const response = {
      page: "event",
      range: "allTime",
      totalVisits: result[0]?.totalVisits || 0
    };

    await redis.setex(key, TTL, JSON.stringify(response));
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total event visits all time fetched successfully",
      ...response
    });
  } catch (err) {
    console.error("TotalEventVisitsAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const TopNavigationFromEvent = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      { $project: { callStack: 1 } },
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
      {
        $match: {
          "indexedLogs.log": {
            $regex: "/event",
            $options: "i"
          }
        }
      },
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
      message: "Top navigation from event fetched successfully",
      page: "event",
      metric: "top_navigation_from_event",
      range: "allTime",
      topNavigations: result
    });
  } catch (err) {
    console.error("TopNavigationFromEvent error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const TotalEventTimeAllTime = async (req, res) => {
  try {
    const key = "stats:event:total_time:all_time";
    const cached = await redis.get(key);
    if (cached) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Total event time all time fetched successfully (cached)",
        ...JSON.parse(cached)
      });
    }

    const result = await Session.aggregate([
      ...EVENT_BASE,
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },
      { $match: { minutes: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalTimeMinutes: { $sum: "$minutes" }
        }
      }
    ]);

    const response = {
      page: "event",
      metric: "total_time_spent",
      range: "allTime",
      totalTimeMinutes: result[0]
        ? +result[0].totalTimeMinutes.toFixed(2)
        : 0
    };

    await redis.setex(key, TTL, JSON.stringify(response));
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Total event time all time fetched successfully",
      ...response
    });
  } catch (err) {
    console.error("TotalEventTimeAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const EventVisitTimeClusters = async (req, res) => {
  try {
    const key = "stats:event:clusters:all_time";
    const cached = await redis.get(key);
    if (cached) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Event visit time clusters fetched successfully (cached)",
        ...JSON.parse(cached)
      });
    }

    const result = await Session.aggregate([
      ...EVENT_BASE,
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },
      { $match: { minutes: { $gt: 0 } } }
    ]);

    const clusters = {
      A: 0,
      B: 0,
      C: 0
    };

    result.forEach(r => {
      if (r.minutes <= 1) clusters.A++;
      else if (r.minutes >= 2.5 && r.minutes <= 5) clusters.B++;
      else if (r.minutes > 5) clusters.C++;
    });

    const response = {
      page: "event",
      metric: "visit_time_clusters",
      range: "allTime",
      clusters: {
        "<= 1 min": clusters.A,
        "2.5 - 5 min": clusters.B,
        "> 5 min": clusters.C
      }
    };

    await redis.setex(key, TTL, JSON.stringify(response));
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Event visit time clusters fetched successfully",
      ...response
    });
  } catch (err) {
    console.error("EventVisitTimeClusters error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const BounceRateEventToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getStartOfToday() }
        }
      },
      normalizeCallStack,
      { $project: { callStack: 1 } },
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
      {
        $match: {
          "indexedLogs.log": {
            $regex: "/event",
            $options: "i"
          }
        }
      },
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
      {
        $group: {
          _id: "$_id",
          hasNextPage: { $max: "$hasNextPage" }
        }
      },
      {
        $group: {
          _id: null,
          totalEventSessions: { $sum: 1 },
          bouncedSessions: {
            $sum: {
              $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0]
            }
          }
        }
      }
    ]);

    const data = result[0] || { totalEventSessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate event today fetched successfully",
      page: "event",
      metric: "bounce_rate",
      range: "today",
      totalEventSessions: data.totalEventSessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalEventSessions
        ? +((data.bouncedSessions / data.totalEventSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateEventToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const BounceRateEventLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(7) }
        }
      },
      normalizeCallStack,
      { $project: { callStack: 1 } },
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
      {
        $match: {
          "indexedLogs.log": { $regex: "/event", $options: "i" }
        }
      },
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
      {
        $group: {
          _id: "$_id",
          hasNextPage: { $max: "$hasNextPage" }
        }
      },
      {
        $group: {
          _id: null,
          totalEventSessions: { $sum: 1 },
          bouncedSessions: {
            $sum: {
              $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0]
            }
          }
        }
      }
    ]);

    const data = result[0] || { totalEventSessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate event last week fetched successfully",
      page: "event",
      metric: "bounce_rate",
      range: "lastWeek",
      totalEventSessions: data.totalEventSessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalEventSessions
        ? +((data.bouncedSessions / data.totalEventSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateEventLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const BounceRateEventLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(30) }
        }
      },
      normalizeCallStack,
      { $project: { callStack: 1 } },
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
      {
        $match: {
          "indexedLogs.log": {
            $regex: "/event",
            $options: "i"
          }
        }
      },
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
      {
        $group: {
          _id: "$_id",
          hasNextPage: { $max: "$hasNextPage" }
        }
      },
      {
        $group: {
          _id: null,
          totalEventSessions: { $sum: 1 },
          bouncedSessions: {
            $sum: {
              $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0]
            }
          }
        }
      }
    ]);

    const data = result[0] || {
      totalEventSessions: 0,
      bouncedSessions: 0
    };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate event last month fetched successfully",
      page: "event",
      metric: "bounce_rate",
      range: "lastMonth",
      totalEventSessions: data.totalEventSessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalEventSessions
        ? +((data.bouncedSessions / data.totalEventSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateEventLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const BounceRateEventAllTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      {
        $project: {
          lastLog: { $arrayElemAt: ["$callStack", -1] }
        }
      },
      {
        $match: {
          lastLog: { $regex: "/event", $options: "i" }
        }
      },
      {
        $group: {
          _id: null,
          bouncedSessions: { $sum: 1 }
        }
      }
    ]);

    const totalEventSessions = await Session.countDocuments({
      callStack: { $elemMatch: { $regex: "/event", $options: "i" } },
      endedAt: { $ne: null }
    });

    const bouncedSessions = result[0]?.bouncedSessions || 0;

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate event all time fetched successfully",
      page: "event",
      metric: "bounce_rate",
      range: "allTime",
      totalEventSessions,
      bouncedSessions,
      bounceRate: totalEventSessions
        ? +((bouncedSessions / totalEventSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateEventAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const SingleHitEventSessionsToday = async (req, res) => {
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
      {
        $group: {
          _id: "$_id",
          eventHits: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventHits: 1 } },
      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit event sessions today fetched successfully",
      page: "event",
      metric: "single_hit_sessions",
      range: "today",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitEventSessionsToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const SingleHitEventSessionsLastWeek = async (req, res) => {
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
      {
        $group: {
          _id: "$_id",
          eventHits: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventHits: 1 } },
      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit event sessions last week fetched successfully",
      page: "event",
      metric: "single_hit_sessions",
      range: "lastWeek",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitEventSessionsLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const SingleHitEventSessionsLastMonth = async (req, res) => {
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
      {
        $group: {
          _id: "$_id",
          eventHits: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventHits: 1 } },
      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit event sessions last month fetched successfully",
      page: "event",
      metric: "single_hit_sessions",
      range: "lastMonth",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitEventSessionsLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const SingleHitEventSessionsAllTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $group: {
          _id: "$_id",
          eventHits: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventHits: 1 } },
      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit event sessions all time fetched successfully",
      page: "event",
      metric: "single_hit_sessions",
      range: "allTime",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitEventSessionsAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const PeakEventUsageHourly = async (req, res) => {
  try {
    const result = await Session.aggregate([
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      {
        $addFields: {
          ts: {
            $toDate: {
              $substrBytes: [
                "$callStack",
                1,
                {
                  $subtract: [
                    { $indexOfBytes: ["$callStack", "]"] },
                    1
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $project: {
          hour: { $hour: "$ts" }
        }
      },
      {
        $group: {
          _id: "$hour",
          count: { $sum: 1 }
        }
      }
    ]);

    const hourlyUsage = Array.from({ length: 24 }, (_, hour) => {
      const found = result.find(r => r._id === hour);
      return {
        hour,
        count: found ? found.count : 0
      };
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Peak event usage hourly fetched successfully",
      page: "event",
      metric: "peak_usage_hourly",
      range: "allTime",
      hourlyUsage
    });
  } catch (err) {
    console.error("PeakEventUsageHourly error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const AvgRequestsPerEventVisitToday = async (req, res) => {
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
      {
        $group: {
          _id: "$_id",
          eventRequests: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$eventRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per event visit today fetched successfully",
      page: "event",
      metric: "avg_requests_per_visit",
      range: "today",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerEventVisitToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const AvgRequestsPerEventVisitLastWeek = async (req, res) => {
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
      {
        $group: {
          _id: "$_id",
          eventRequests: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$eventRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per event visit last week fetched successfully",
      page: "event",
      metric: "avg_requests_per_visit",
      range: "lastWeek",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerEventVisitLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const AvgRequestsPerEventVisitLastMonth = async (req, res) => {
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
      {
        $group: {
          _id: "$_id",
          eventRequests: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$eventRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per event visit last month fetched successfully",
      page: "event",
      metric: "avg_requests_per_visit",
      range: "lastMonth",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerEventVisitLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const AvgRequestsPerEventVisitAllTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $group: {
          _id: "$_id",
          eventRequests: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/event", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { eventRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$eventRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per event visit all time fetched successfully",
      page: "event",
      metric: "avg_requests_per_visit",
      range: "allTime",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerEventVisitAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const EventToClubConversionRate = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      {
        $project: {
          callStack: 1,
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
                          regex: "/event",
                          options: "i"
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
          },
          clubIndex: {
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
                          regex: "/clubs",
                          options: "i"
                        }
                      },
                      "club",
                      null
                    ]
                  }
                }
              },
              "club"
            ]
          }
        }
      },
      { $match: { eventIndex: { $gte: 0 } } },
      {
        $project: {
          converted: {
            $cond: [
              {
                $and: [
                  { $gte: ["$clubIndex", 0] },
                  { $gt: ["$clubIndex", "$eventIndex"] }
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
          totalEventSessions: { $sum: 1 },
          convertedSessions: { $sum: "$converted" }
        }
      }
    ]);

    const data = result[0] || {
      totalEventSessions: 0,
      convertedSessions: 0
    };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Event to club conversion rate fetched successfully",
      page: "event",
      metric: "event_to_club_conversion_rate",
      range: "allTime",
      totalEventSessions: data.totalEventSessions,
      convertedSessions: data.convertedSessions,
      conversionRate: data.totalEventSessions
        ? +((data.convertedSessions / data.totalEventSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("EventToClubConversionRate error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const ReturningEventUsers = async (req, res) => {
  try {
    const result = await Session.aggregate([
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      {
        $group: {
          _id: "$userId",
          sessions: { $addToSet: "$_id" }
        }
      },
      {
        $project: {
          sessionCount: { $size: "$sessions" }
        }
      },
      { $match: { sessionCount: { $gt: 1 } } },
      { $count: "returningUsers" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Returning event users fetched successfully",
      page: "event",
      metric: "returning_users",
      range: "allTime",
      returningUsers: result[0]?.returningUsers || 0
    });
  } catch (err) {
    console.error("ReturningEventUsers error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

const MedianEventTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      {
        $unwind: {
          path: "$callStack",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          callStack: {
            $regex: "/event",
            $options: "i"
          }
        }
      },
      {
        $addFields: {
          ts: {
            $toDate: {
              $substrBytes: [
                "$callStack",
                1,
                {
                  $subtract: [
                    { $indexOfBytes: ["$callStack", "]"] },
                    1
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: "$_id",
          firstTs: { $min: "$ts" },
          lastTs: { $max: "$ts" }
        }
      },
      {
        $project: {
          minutes: {
            $divide: [{ $subtract: ["$lastTs", "$firstTs"] }, 60000]
          }
        }
      },
      { $match: { minutes: { $gt: 0 } } },
      { $sort: { minutes: 1 } },
      {
        $group: {
          _id: null,
          times: { $push: "$minutes" }
        }
      },
      {
        $project: {
          medianEventTime: {
            $let: {
              vars: { size: { $size: "$times" } },
              in: {
                $cond: [
                  { $eq: [{ $mod: ["$$size", 2] }, 1] },
                  {
                    $arrayElemAt: [
                      "$times",
                      { $floor: { $divide: ["$$size", 2] } }
                    ]
                  },
                  {
                    $avg: [
                      {
                        $arrayElemAt: [
                          "$times",
                          {
                            $subtract: [
                              { $divide: ["$$size", 2] },
                              1
                            ]
                          }
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
      message: "Median event time fetched successfully",
      page: "event",
      metric: "median_time_spent",
      range: "allTime",
      medianTimeMinutes: result[0]?.medianEventTime
        ? +result[0].medianEventTime.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("MedianEventTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

module.exports = {
  AvgEventTimeToday,
  AvgEventTimeLastWeek,
  AvgEventTimeLastMonth,
  AvgEventTimeAllTime,
  TotalEventVisitsToday,
  TotalEventVisitsLastWeek,
  TotalEventVisitsLastMonth,
  TotalEventVisitsAllTime,
  TopNavigationFromEvent,
  TotalEventTimeAllTime,
  EventVisitTimeClusters,
  BounceRateEventToday,
  BounceRateEventLastWeek,
  BounceRateEventLastMonth,
  BounceRateEventAllTime,
  SingleHitEventSessionsToday,
  SingleHitEventSessionsLastWeek,
  SingleHitEventSessionsLastMonth,
  SingleHitEventSessionsAllTime,
  PeakEventUsageHourly,
  AvgRequestsPerEventVisitToday,
  AvgRequestsPerEventVisitLastWeek,
  AvgRequestsPerEventVisitLastMonth,
  AvgRequestsPerEventVisitAllTime,
  EventToClubConversionRate,
  ReturningEventUsers,
  MedianEventTime
};