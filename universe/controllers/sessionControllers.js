const Session = require("../models/session");
const Users = require("../models/user");
const { StatusCodes } = require("http-status-codes");

const normalizeCallStack = (session) => {
  if (!session || typeof session !== "object") {
    return session;
  }

  return {
    ...session,
    callStack: Array.isArray(session.callStack) ? session.callStack : [],
  };
};

const getAllSessions = async (req, res) => {
  try {
    const sessions = await Session.find({})
      .sort({ startedAt: -1 })
      .limit(10)
      .lean();

    const safeSessions = sessions.map(normalizeCallStack);

    return res.status(StatusCodes.OK).json({
      success: true,
      count: safeSessions.length,
      sessions: safeSessions,
    });
  } catch (error) {
    console.error("getAllSessions error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getTodaySessionCount = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const count = await Session.countDocuments({
      startedAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      count
    });
  } catch (error) {
    console.error("getTodaySessionCount error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const averageSessionTime = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startOfDay, $lte: endOfDay },
          endedAt: { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          durationMs: {
            $subtract: ["$endedAt", "$startedAt"],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgDurationMs: { $avg: "$durationMs" },
        },
      },
    ]);

    if (!result.length || !result[0].avgDurationMs) {
      return res.status(StatusCodes.OK).json({
        success: true,
        avgSessionTimeMinutes: 0,
      });
    }

    const avgMinutes = result[0].avgDurationMs / 1000 / 60;

    return res.status(StatusCodes.OK).json({
      success: true,
      avgSessionTimeMinutes: Number(avgMinutes.toFixed(2)),
    });
  } catch (error) {
    console.error("averageSessionTime error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getTodayUser = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const users = await Users.countDocuments({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      users
    });
  } catch (error) {
    console.error("getTodayUser error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getTotalUsers = async (req, res) => {
  try {
    const users = await Users.countDocuments({});

    return res.status(StatusCodes.OK).json({
      success: true,
      users
    });
  } catch (error) {
    console.error("getTotalUsers error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getTodaySessions = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: { $hour: "$startedAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const labels = [];
    const data = [];

    for (let h = 0; h < 24; h++) {
      labels.push(`${h}:00`);
      const found = result.find((r) => r._id === h);
      data.push(found ? found.count : 0);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      labels,
      data,
    });
  } catch (error) {
    console.error("Today Sessions Error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getWeekSessions = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startDate = new Date(startOfToday);
    startDate.setDate(startDate.getDate() - 6);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: {
            $gte: startDate,
            $lte: new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$startedAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const labels = [];
    const data = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(startOfToday);
      date.setDate(date.getDate() - i);

      const formatted = date.toISOString().split("T")[0];
      const weekday = date.toLocaleString("en-US", { weekday: "short" });

      labels.push(weekday);

      const found = result.find((r) => r._id === formatted);
      data.push(found ? found.count : 0);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      labels,
      data,
    });
  } catch (error) {
    console.error("Week Sessions Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getMonthSessions = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startDate = new Date(startOfToday);
    startDate.setDate(startDate.getDate() - 29);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: {
            $gte: startDate,
            $lte: new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$startedAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const labels = [];
    const data = [];

    for (let i = 29; i >= 0; i--) {
      const date = new Date(startOfToday);
      date.setDate(date.getDate() - i);

      const formatted = date.toISOString().split("T")[0];
      labels.push(date.getDate());

      const found = result.find((r) => r._id === formatted);
      data.push(found ? found.count : 0);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      labels,
      data,
    });
  } catch (error) {
    console.error("Month Sessions Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getHighestSessions = async (req, res) => {
  try {
    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$startedAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);

    if (!result.length) {
      return res.status(StatusCodes.OK).json({
        success: true,
        highest: {
          rawDate: null,
          formattedDate: null,
          count: 0,
        },
      });
    }

    const rawDate = result[0]._id;
    const dateObj = new Date(rawDate);

    const formattedDate = dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      highest: {
        rawDate,
        formattedDate,
        count: result[0].count,
      },
    });
  } catch (error) {
    console.error("Highest Sessions Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getTodaySignups = async (req, res) => {
  try {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();

    const data = await Users.aggregate([
      {
        $match: {
          createdAt: {
            $exists: true,
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const labels = Array.from({ length: 24 }, (_, i) =>
      i.toString().padStart(2, "0")
    );

    const counts = labels.map((hour) => {
      const found = data.find((x) => x._id === Number(hour));
      return found ? found.count : 0;
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      labels,
      counts,
    });
  } catch (error) {
    console.error("getTodaySignups error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getLastWeekSignups = async (req, res) => {
  try {
    const endDate = new Date();

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const data = await Users.aggregate([
      {
        $match: {
          createdAt: {
            $exists: true,
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const countMap = {};
    for (const item of data) {
      countMap[item._id] = item.count;
    }

    const labels = [];
    const counts = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);

      const formatted = d.toISOString().split("T")[0];
      labels.push(formatted);
      counts.push(countMap[formatted] || 0);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      labels,
      counts,
    });
  } catch (error) {
    console.error("getLastWeekSignups error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const getLastMonthSignups = async (req, res) => {
  try {
    const endDate = new Date();

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 29);

    const data = await Users.aggregate([
      {
        $match: {
          createdAt: {
            $exists: true,
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const labels = [];
    const counts = [];

    for (let i = 0; i < 30; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);

      const formatted = d.toISOString().split("T")[0];
      labels.push(formatted);

      const found = data.find((item) => item._id === formatted);
      counts.push(found ? found.count : 0);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      labels,
      counts,
    });
  } catch (error) {
    console.error("getLastMonthSignups error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const todaySessionDonut = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startOfDay, $lte: endOfDay },
          endedAt: { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          durationMinutes: {
            $divide: [{ $subtract: ["$endedAt", "$startedAt"] }, 1000 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          lte_1_min: {
            $sum: { $cond: [{ $lte: ["$durationMinutes", 1] }, 1, 0] },
          },
          between_1_and_2_5_min: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$durationMinutes", 1] },
                    { $lt: ["$durationMinutes", 2.5] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          between_2_5_and_5_min: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$durationMinutes", 2.5] },
                    { $lte: ["$durationMinutes", 5] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          gt_5_min: {
            $sum: { $cond: [{ $gt: ["$durationMinutes", 5] }, 1, 0] },
          },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(
      result.length
        ? {
            success: true,
            lte_1_min: result[0].lte_1_min,
            between_1_and_2_5_min: result[0].between_1_and_2_5_min,
            between_2_5_and_5_min: result[0].between_2_5_and_5_min,
            gt_5_min: result[0].gt_5_min,
          }
        : {
            success: true,
            lte_1_min: 0,
            between_1_and_2_5_min: 0,
            between_2_5_and_5_min: 0,
            gt_5_min: 0,
          }
    );
  } catch (error) {
    console.error("todaySessionDonut error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const lastWeekSessionDonut = async (req, res) => {
  try {
    const endDate = new Date();

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startDate, $lte: endDate },
          endedAt: { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          durationMinutes: {
            $divide: [{ $subtract: ["$endedAt", "$startedAt"] }, 1000 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          lte_1_min: {
            $sum: { $cond: [{ $lte: ["$durationMinutes", 1] }, 1, 0] },
          },
          between_1_and_2_5_min: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$durationMinutes", 1] },
                    { $lt: ["$durationMinutes", 2.5] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          between_2_5_and_5_min: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$durationMinutes", 2.5] },
                    { $lte: ["$durationMinutes", 5] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          gt_5_min: {
            $sum: { $cond: [{ $gt: ["$durationMinutes", 5] }, 1, 0] },
          },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(
      result.length
        ? result[0]
        : {
            lte_1_min: 0,
            between_1_and_2_5_min: 0,
            between_2_5_and_5_min: 0,
            gt_5_min: 0,
          }
    );
  } catch (error) {
    console.error("lastWeekSessionDonut error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const lastMonthSessionDonut = async (req, res) => {
  try {
    const endDate = new Date();

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 29);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startDate, $lte: endDate },
          endedAt: { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          durationMinutes: {
            $divide: [{ $subtract: ["$endedAt", "$startedAt"] }, 1000 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          lte_1_min: {
            $sum: { $cond: [{ $lte: ["$durationMinutes", 1] }, 1, 0] },
          },
          between_1_and_2_5_min: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$durationMinutes", 1] },
                    { $lt: ["$durationMinutes", 2.5] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          between_2_5_and_5_min: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$durationMinutes", 2.5] },
                    { $lte: ["$durationMinutes", 5] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          gt_5_min: {
            $sum: { $cond: [{ $gt: ["$durationMinutes", 5] }, 1, 0] },
          },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(
      result.length
        ? result[0]
        : {
            lte_1_min: 0,
            between_1_and_2_5_min: 0,
            between_2_5_and_5_min: 0,
            gt_5_min: 0,
          }
    );
  } catch (error) {
    console.error("lastMonthSessionDonut error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const todaySessionsByTimeOfDay = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $addFields: {
          hour: { $hour: "$startedAt" },
        },
      },
      {
        $group: {
          _id: null,
          morning: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 6] }, { $lt: ["$hour", 12] }] },
                1,
                0,
              ],
            },
          },
          afternoon: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 12] }, { $lt: ["$hour", 18] }] },
                1,
                0,
              ],
            },
          },
          evening: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 18] }, { $lt: ["$hour", 24] }] },
                1,
                0,
              ],
            },
          },
          night: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 0] }, { $lt: ["$hour", 6] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(
      result.length
        ? result[0]
        : { morning: 0, afternoon: 0, evening: 0, night: 0 }
    );
  } catch (error) {
    console.error("todaySessionsByTimeOfDay error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const lastWeekSessionsByTimeOfDay = async (req, res) => {
  try {
    const endDate = new Date();

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $addFields: {
          hour: { $hour: "$startedAt" },
        },
      },
      {
        $group: {
          _id: null,
          morning: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 6] }, { $lt: ["$hour", 12] }] },
                1,
                0,
              ],
            },
          },
          afternoon: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 12] }, { $lt: ["$hour", 18] }] },
                1,
                0,
              ],
            },
          },
          evening: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 18] }, { $lt: ["$hour", 24] }] },
                1,
                0,
              ],
            },
          },
          night: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 0] }, { $lt: ["$hour", 6] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(
      result.length
        ? result[0]
        : { morning: 0, afternoon: 0, evening: 0, night: 0 }
    );
  } catch (error) {
    console.error("lastWeekSessionsByTimeOfDay error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

const lastMonthSessionsByTimeOfDay = async (req, res) => {
  try {
    const endDate = new Date();

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 29);

    const result = await Session.aggregate([
      {
        $match: {
          startedAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $addFields: {
          hour: { $hour: "$startedAt" },
        },
      },
      {
        $group: {
          _id: null,
          morning: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 6] }, { $lt: ["$hour", 12] }] },
                1,
                0,
              ],
            },
          },
          afternoon: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 12] }, { $lt: ["$hour", 18] }] },
                1,
                0,
              ],
            },
          },
          evening: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 18] }, { $lt: ["$hour", 24] }] },
                1,
                0,
              ],
            },
          },
          night: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$hour", 0] }, { $lt: ["$hour", 6] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(
      result.length
        ? result[0]
        : { morning: 0, afternoon: 0, evening: 0, night: 0 }
    );
  } catch (error) {
    console.error("lastMonthSessionsByTimeOfDay error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "something went wrong",
    });
  }
};

module.exports = {
  getAllSessions,
  getTodaySessionCount,
  averageSessionTime,
  getTodayUser,
  getTotalUsers,
  getTodaySessions,
  getWeekSessions,
  getMonthSessions,
  getHighestSessions,
  getTodaySignups,
  getLastWeekSignups,
  getLastMonthSignups,
  todaySessionDonut,
  lastWeekSessionDonut,
  lastMonthSessionDonut,
  todaySessionsByTimeOfDay,
  lastWeekSessionsByTimeOfDay,
  lastMonthSessionsByTimeOfDay
};
