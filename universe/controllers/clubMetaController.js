const Session = require("../models/session");
const { redis } = require("../app.js");
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

const CLUB_BASE = [
    { $match: { endedAt: { $ne: null } } },
    {
        $addFields: {
            callStack: {
                $cond: [
                    { $isArray: "$callStack" },
                    "$callStack",
                    []
                ]
            }
        }
    },
    {
        $unwind: {
            path: "$callStack",
            preserveNullAndEmptyArrays: false
        }
    },
    {
        $match: {
            callStack: { $regex: "/club", $options: "i" }
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

const AvgClubTimeToday = async (req, res) => {
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
                    callStack: { $regex: "/club", $options: "i" }
                }
            },

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
            page: "clubs",
            metric: "average_time_spent",
            range: "today",
            avgTimeMinutes: result[0]
                ? +result[0].avgTimeMinutes.toFixed(2)
                : 0
        });
    } catch (err) {
        console.error("AvgClubTimeToday error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const AvgClubTimeLastWeek = async (req, res) => {
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
                    callStack: { $regex: "/club", $options: "i" }
                }
            },

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
            page: "clubs",
            metric: "average_time_spent",
            range: "lastWeek",
            avgTimeMinutes: result[0]
                ? +result[0].avgTimeMinutes.toFixed(2)
                : 0
        });
    } catch (err) {
        console.error("AvgClubTimeLastWeek error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const AvgClubTimeLastMonth = async (req, res) => {
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
                    callStack: { $regex: "/club", $options: "i" }
                }
            },

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
            page: "clubs",
            metric: "average_time_spent",
            range: "lastMonth",
            avgTimeMinutes: result[0]
                ? +result[0].avgTimeMinutes.toFixed(2)
                : 0
        });
    } catch (err) {
        console.error("AvgClubTimeLastMonth error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const AvgClubTimeAllTime = async (req, res) => {
    try {
        const key = "stats:club:avg_time:all_time";
        const cached = await redis.get(key);
        if (cached) return res.status(StatusCodes.OK).json({
            success: true,
            ...JSON.parse(cached)
        });

        const result = await Session.aggregate([
            ...CLUB_BASE,
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
            success: true,
            page: "clubs",
            metric: "average_time_spent",
            range: "allTime",
            avgTimeMinutes: result[0]
                ? +result[0].avgTimeMinutes.toFixed(2)
                : 0
        };

        await redis.setex(key, TTL, JSON.stringify(response));
        res.status(StatusCodes.OK).json(response);
    } catch (err) {
        console.error("AvgClubTimeAllTime error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const TotalClubVisitsToday = async (req, res) => {
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
                    callStack: { $regex: "/club", $options: "i" }
                }
            },

            { $count: "totalVisits" }
        ]);

        return res.status(StatusCodes.OK).json({
            success: true,
            page: "clubs",
            range: "today",
            totalVisits: result[0]?.totalVisits || 0
        });
    } catch (err) {
        console.error("TotalClubVisitsToday error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const TotalClubVisitsLastWeek = async (req, res) => {
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
                    callStack: { $regex: "/club", $options: "i" }
                }
            },

            { $count: "totalVisits" }
        ]);

        return res.status(StatusCodes.OK).json({
            success: true,
            page: "clubs",
            range: "lastWeek",
            totalVisits: result[0]?.totalVisits || 0
        });
    } catch (err) {
        console.error("TotalClubVisitsLastWeek error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const TotalClubVisitsLastMonth = async (req, res) => {
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
                    callStack: { $regex: "/club", $options: "i" }
                }
            },

            { $count: "totalVisits" }
        ]);

        return res.status(StatusCodes.OK).json({
            success: true,
            page: "clubs",
            range: "lastMonth",
            totalVisits: result[0]?.totalVisits || 0
        });
    } catch (err) {
        console.error("TotalClubVisitsLastMonth error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const TotalClubVisitsAllTime = async (req, res) => {
    try {
        const key = "stats:club:total_visits:all_time";
        const cached = await redis.get(key);
        if (cached) return res.status(StatusCodes.OK).json({
            success: true,
            ...JSON.parse(cached)
        });

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
                    callStack: { $regex: "/club", $options: "i" }
                }
            },

            { $count: "totalVisits" }
        ]);

        const response = {
            page: "clubs",
            range: "allTime",
            totalVisits: result[0]?.totalVisits || 0
        };

        await redis.setex(key, TTL, JSON.stringify(response));
        res.status(StatusCodes.OK).json({
            success: true,
            ...response
        });
    } catch (err) {
        console.error("TotalClubVisitsAllTime error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const TopNavigationFromClub = async (req, res) => {
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
                        $regex: "/club",
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
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$nextLog",
                                            regex: "/events",
                                            options: "i"
                                        }
                                    },
                                    then: "events"
                                },
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$nextLog",
                                            regex: "/home",
                                            options: "i"
                                        }
                                    },
                                    then: "home"
                                },
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$nextLog",
                                            regex: "/faq",
                                            options: "i"
                                        }
                                    },
                                    then: "faq"
                                },
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$nextLog",
                                            regex: "/clubs",
                                            options: "i"
                                        }
                                    },
                                    then: "clubs"
                                },
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$nextLog",
                                            regex: "/community",
                                            options: "i"
                                        }
                                    },
                                    then: "community"
                                }
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
            page: "clubs",
            metric: "top_navigation_from_club",
            range: "allTime",
            topNavigations: result
        });
    } catch (err) {
        console.error("TopNavigationFromClub error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const TotalClubTimeAllTime = async (req, res) => {
    try {
        const key = "stats:club:total_time:all_time";
        const cached = await redis.get(key);
        if (cached) return res.status(StatusCodes.OK).json({
            success: true,
            ...JSON.parse(cached)
        });

        const result = await Session.aggregate([
            ...CLUB_BASE,
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
                        $divide: [
                            { $subtract: ["$lastTs", "$firstTs"] },
                            60000
                        ]
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
            page: "clubs",
            metric: "total_time_spent",
            range: "allTime",
            totalTimeMinutes: result[0]
                ? +result[0].totalTimeMinutes.toFixed(2)
                : 0
        };

        await redis.setex(key, TTL, JSON.stringify(response));
        return res.status(StatusCodes.OK).json({
            success: true,
            ...response
        });
    } catch (err) {
        console.error("TotalClubTimeAllTime error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const ClubVisitTimeClusters = async (req, res) => {
    try {
        const key = "stats:club:clusters:all_time";
        const cached = await redis.get(key);
        if (cached) return res.status(StatusCodes.OK).json({
            success: true,
            ...JSON.parse(cached)
        });

        const result = await Session.aggregate([
            ...CLUB_BASE,
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
                        $divide: [
                            { $subtract: ["$lastTs", "$firstTs"] },
                            60000
                        ]
                    }
                }
            },
            {
                $match: {
                    minutes: { $gt: 0 }
                }
            }
        ]);

        const clusters = {
            A: 0, // <= 1 min
            B: 0, // 2.5 - 5 min
            C: 0  // > 5 min
        };

        result.forEach(r => {
            if (r.minutes <= 1) clusters.A++;
            else if (r.minutes >= 2.5 && r.minutes <= 5) clusters.B++;
            else if (r.minutes > 5) clusters.C++;
        });

        const response = {
            page: "clubs",
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
            ...response
        });
    } catch (err) {
        console.error("ClubVisitTimeClusters error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            msg: "Internal Server Error"
        });
    }
};

const BounceRateClubToday = async (req, res) => {
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
          "indexedLogs.log": { $regex: "/club", $options: "i" }
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
          totalClubSessions: { $sum: 1 },
          bouncedSessions: {
            $sum: { $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalClubSessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate of clubs today",
      page: "clubs",
      metric: "bounce_rate",
      range: "today",
      totalClubSessions: data.totalClubSessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalClubSessions
        ? +((data.bouncedSessions / data.totalClubSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateClubToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const BounceRateClubLastWeek = async (req, res) => {
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
          "indexedLogs.log": { $regex: "/club", $options: "i" }
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
          totalClubSessions: { $sum: 1 },
          bouncedSessions: {
            $sum: { $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalClubSessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate of clubs last week",
      page: "clubs",
      metric: "bounce_rate",
      range: "lastWeek",
      totalClubSessions: data.totalClubSessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalClubSessions
        ? +((data.bouncedSessions / data.totalClubSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateClubLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const BounceRateClubLastMonth = async (req, res) => {
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
          "indexedLogs.log": { $regex: "/club", $options: "i" }
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
          totalClubSessions: { $sum: 1 },
          bouncedSessions: {
            $sum: { $cond: [{ $eq: ["$hasNextPage", 0] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalClubSessions: 0, bouncedSessions: 0 };

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate of clubs last month",
      page: "clubs",
      metric: "bounce_rate",
      range: "lastMonth",
      totalClubSessions: data.totalClubSessions,
      bouncedSessions: data.bouncedSessions,
      bounceRate: data.totalClubSessions
        ? +((data.bouncedSessions / data.totalClubSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateClubLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const BounceRateClubAllTime = async (req, res) => {
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
          lastLog: { $regex: "/club", $options: "i" }
        }
      },

      {
        $group: {
          _id: null,
          bouncedSessions: { $sum: 1 }
        }
      }
    ]);

    const totalClubSessions = await Session.countDocuments({
      endedAt: { $ne: null },
      callStack: { $elemMatch: { $regex: "/club", $options: "i" } }
    });

    const bouncedSessions = result[0]?.bouncedSessions || 0;

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Bounce rate of clubs all time",
      page: "clubs",
      metric: "bounce_rate",
      range: "allTime",
      totalClubSessions,
      bouncedSessions,
      bounceRate: totalClubSessions
        ? +((bouncedSessions / totalClubSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("BounceRateClubAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const SingleHitClubSessionsToday = async (req, res) => {
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
          clubHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      { $match: { clubHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit club sessions today",
      page: "clubs",
      metric: "single_hit_sessions",
      range: "today",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitClubSessionsToday error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const SingleHitClubSessionsLastWeek = async (req, res) => {
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
          clubHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      { $match: { clubHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit club sessions last week",
      page: "clubs",
      metric: "single_hit_sessions",
      range: "lastWeek",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitClubSessionsLastWeek error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const SingleHitClubSessionsLastMonth = async (req, res) => {
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
          clubHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      { $match: { clubHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit club sessions last month",
      page: "clubs",
      metric: "single_hit_sessions",
      range: "lastMonth",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitClubSessionsLastMonth error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const SingleHitClubSessionsAllTime = async (req, res) => {
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
          clubHits: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },

      { $match: { clubHits: 1 } },

      { $count: "singleHitSessions" }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Single hit club sessions all time",
      page: "clubs",
      metric: "single_hit_sessions",
      range: "allTime",
      singleHitSessions: result[0]?.singleHitSessions || 0
    });
  } catch (err) {
    console.error("SingleHitClubSessionsAllTime error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const PeakClubUsageHourly = async (req, res) => {
  try {
    const result = await Session.aggregate([
      // Only completed sessions (consistency)
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

      // ✅ Keep ONLY club-related APIs/pages
      {
        $match: {
          callStack: {
            $regex: "/club",
            $options: "i"
          }
        }
      },

      // ✅ Extract timestamp
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

      // ✅ Extract hour (0–23)
      {
        $project: {
          hour: { $hour: "$ts" }
        }
      },

      // ✅ Count per hour
      {
        $group: {
          _id: "$hour",
          count: { $sum: 1 }
        }
      }
    ]);

    // Normalize to 0–23 for graph consistency
    const hourlyUsage = Array.from({ length: 24 }, (_, hour) => {
      const found = result.find(r => r._id === hour);
      return {
        hour,
        count: found ? found.count : 0
      };
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Peak club usage hourly",
      page: "clubs",
      metric: "peak_usage_hourly",
      range: "allTime",
      hourlyUsage
    });
  } catch (err) {
    console.error("PeakClubUsageHourly error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const AvgRequestsPerClubVisitToday = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getStartOfToday() }
        }
      },
      normalizeCallStack,
      { $unwind: "$callStack" },
      {
        $group: {
          _id: "$_id",
          clubRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { clubRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$clubRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per club visit today",
      page: "clubs",
      metric: "avg_requests_per_visit",
      range: "today",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerClubVisitToday error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const AvgRequestsPerClubVisitLastWeek = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(7) }
        }
      },
      normalizeCallStack,
      { $unwind: "$callStack" },
      {
        $group: {
          _id: "$_id",
          clubRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { clubRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$clubRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per club visit last week",
      page: "clubs",
      metric: "avg_requests_per_visit",
      range: "lastWeek",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerClubVisitLastWeek error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const AvgRequestsPerClubVisitLastMonth = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          endedAt: { $ne: null },
          startedAt: { $gte: getDaysAgo(30) }
        }
      },
      normalizeCallStack,
      { $unwind: "$callStack" },
      {
        $group: {
          _id: "$_id",
          clubRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { clubRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$clubRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per club visit last month",
      page: "clubs",
      metric: "avg_requests_per_visit",
      range: "lastMonth",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerClubVisitLastMonth error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const AvgRequestsPerClubVisitAllTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      { $unwind: "$callStack" },
      {
        $group: {
          _id: "$_id",
          clubRequests: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: "$callStack",
                    regex: "/club",
                    options: "i"
                  }
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $match: { clubRequests: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgRequests: { $avg: "$clubRequests" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Average requests per club visit all time",
      page: "clubs",
      metric: "avg_requests_per_visit",
      range: "allTime",
      avgRequestsPerVisit: result[0]
        ? +result[0].avgRequests.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("AvgRequestsPerClubVisitAllTime error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Internal Server Error" });
  }
};

const ClubEngagementRate = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,

      {
        $project: {
          callStack: 1,
          clubIndex: {
            $indexOfArray: [
              {
                $map: {
                  input: "$callStack",
                  as: "log",
                  in: {
                    $cond: [
                      { $regexMatch: { input: "$$log", regex: "/clubs", options: "i" } },
                      "club",
                      null
                    ]
                  }
                }
              },
              "club"
            ]
          },
          engagementIndex: {
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
                          regex: "/clubs/|/clubs/join|/clubs/follow",
                          options: "i"
                        }
                      },
                      "engaged",
                      null
                    ]
                  }
                }
              },
              "engaged"
            ]
          }
        }
      },

      { $match: { clubIndex: { $gte: 0 } } },

      {
        $project: {
          engaged: {
            $cond: [
              {
                $and: [
                  { $gte: ["$engagementIndex", 0] },
                  { $gt: ["$engagementIndex", "$clubIndex"] }
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
          clubViews: { $sum: 1 },
          engagedSessions: { $sum: "$engaged" }
        }
      }
    ]);

    const data = result[0] || { clubViews: 0, engagedSessions: 0 };

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Club engagement rate fetched successfully",
      page: "clubs",
      metric: "club_engagement_rate",
      range: "allTime",
      clubViews: data.clubViews,
      engagedSessions: data.engagedSessions,
      engagementRate: data.clubViews
        ? +((data.engagedSessions / data.clubViews) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("ClubEngagementRate error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

const ClubStickinessRate = async (req, res) => {
  try {
    const result = await Session.aggregate([
      normalizeCallStack,
      { $unwind: "$callStack" },

      {
        $match: {
          callStack: { $regex: "/club|/clubs", $options: "i" }
        }
      },

      {
        $group: {
          _id: { userId: "$userId", sessionId: "$_id" }
        }
      },

      {
        $group: {
          _id: "$_id.userId",
          sessionCount: { $sum: 1 }
        }
      },

      {
        $group: {
          _id: null,
          totalClubUsers: { $sum: 1 },
          returningUsers: {
            $sum: { $cond: [{ $gt: ["$sessionCount", 1] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalClubUsers: 0, returningUsers: 0 };

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Club stickiness rate fetched successfully",
      page: "clubs",
      metric: "club_stickiness_rate",
      range: "allTime",
      totalClubUsers: data.totalClubUsers,
      returningUsers: data.returningUsers,
      stickinessRate: data.totalClubUsers
        ? +((data.returningUsers / data.totalClubUsers) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("ClubStickinessRate error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

const ClubDeepNavigationRate = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      { $unwind: "$callStack" },

      {
        $group: {
          _id: "$_id",
          clubHits: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$callStack", regex: "/club|/clubs", options: "i" } },
                1,
                0
              ]
            }
          }
        }
      },

      { $match: { clubHits: { $gt: 0 } } },

      {
        $group: {
          _id: null,
          totalClubSessions: { $sum: 1 },
          deepSessions: {
            $sum: { $cond: [{ $gte: ["$clubHits", 3] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { totalClubSessions: 0, deepSessions: 0 };

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Club deep navigation rate fetched successfully",
      page: "clubs",
      metric: "deep_navigation_rate",
      range: "allTime",
      totalClubSessions: data.totalClubSessions,
      deepSessions: data.deepSessions,
      deepNavigationRate: data.totalClubSessions
        ? +((data.deepSessions / data.totalClubSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("ClubDeepNavigationRate error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

const ClubDiscoveryFromEventsRate = async (req, res) => {
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
                      { $regexMatch: { input: "$$log", regex: "/event|/events", options: "i" } },
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
                      { $regexMatch: { input: "$$log", regex: "/club|/clubs", options: "i" } },
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
          discovered: {
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
          discoveredClubSessions: { $sum: "$discovered" }
        }
      }
    ]);

    const data = result[0] || {
      totalEventSessions: 0,
      discoveredClubSessions: 0
    };

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Club discovery from events rate fetched successfully",
      page: "clubs",
      metric: "club_discovery_from_events_rate",
      range: "allTime",
      totalEventSessions: data.totalEventSessions,
      discoveredClubSessions: data.discoveredClubSessions,
      discoveryRate: data.totalEventSessions
        ? +((data.discoveredClubSessions / data.totalEventSessions) * 100).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("ClubDiscoveryFromEventsRate error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

const ReturningClubUsers = async (req, res) => {
  try {
    const result = await Session.aggregate([
      normalizeCallStack,
      { $unwind: "$callStack" },

      {
        $match: {
          callStack: { $regex: "/club|/clubs", $options: "i" }
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

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Returning club users fetched successfully",
      page: "clubs",
      metric: "returning_club_users",
      range: "allTime",
      returningClubUsers: result[0]?.returningUsers || 0
    });
  } catch (err) {
    console.error("ReturningClubUsers error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

const MedianClubTime = async (req, res) => {
  try {
    const result = await Session.aggregate([
      { $match: { endedAt: { $ne: null } } },
      normalizeCallStack,
      { $unwind: "$callStack" },

      {
        $match: {
          callStack: { $regex: "/club|/clubs", $options: "i" }
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
          medianClubTime: {
            $let: {
              vars: { size: { $size: "$times" } },
              in: {
                $cond: [
                  { $eq: [{ $mod: ["$$size", 2] }, 1] },
                  { $arrayElemAt: ["$times", { $floor: { $divide: ["$$size", 2] } }] },
                  {
                    $avg: [
                      { $arrayElemAt: ["$times", { $subtract: [{ $divide: ["$$size", 2] }, 1] }] },
                      { $arrayElemAt: ["$times", { $divide: ["$$size", 2] }] }
                    ]
                  }
                ]
              }
            }
          }
        }
      }
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Median club time fetched successfully",
      page: "clubs",
      metric: "median_club_time",
      range: "allTime",
      medianClubTime: result[0]?.medianClubTime
        ? +result[0].medianClubTime.toFixed(2)
        : 0
    });
  } catch (err) {
    console.error("MedianClubTime error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = {
  AvgClubTimeToday,
  AvgClubTimeLastWeek,
  AvgClubTimeLastMonth,
  AvgClubTimeAllTime,
  TotalClubVisitsToday,
  TotalClubVisitsLastWeek,
  TotalClubVisitsLastMonth,
  TotalClubVisitsAllTime,
  TopNavigationFromClub,
  TotalClubTimeAllTime,
  ClubVisitTimeClusters,
  BounceRateClubToday,
  BounceRateClubLastWeek,
  BounceRateClubLastMonth,
  BounceRateClubAllTime,
  SingleHitClubSessionsToday,
  SingleHitClubSessionsLastWeek,
  SingleHitClubSessionsLastMonth,
  SingleHitClubSessionsAllTime,
  PeakClubUsageHourly,
  AvgRequestsPerClubVisitToday,
  AvgRequestsPerClubVisitLastWeek,
  AvgRequestsPerClubVisitLastMonth,
  AvgRequestsPerClubVisitAllTime,
  ClubEngagementRate,
  ClubStickinessRate,
  ClubDeepNavigationRate,
  ClubDiscoveryFromEventsRate,
  ReturningClubUsers,
  MedianClubTime
};