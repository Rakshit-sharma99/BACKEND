const { default: mongoose } = require("mongoose");
const Memory = require("../../models/memory");

const fetchCalendarData = async ({ year, monthNum, userId }) => {
  try {
    // Start of month → 2025-11-01T00:00:00
    const startDate = new Date(year, monthNum - 1, 1);
    // End of month → 2025-11-30T23:59:59
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);

    // -----------------------------
    // AGGREGATION PIPELINE
    // -----------------------------
    const result = await Memory.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate },
        },
      },

      // expand assets
      { $unwind: "$assets" },

      {
        $project: {
          dateString: {
            $dateToString: { format: "%Y-%m-%d", date: "$date" },
          },
          url: "$assets.url",
        },
      },

      {
        $group: {
          _id: "$dateString",
          count: { $sum: 1 },
          preview: { $push: "$url" },
        },
      },

      {
        $project: {
          _id: 0,
          date: "$_id",
          count: 1,
          preview: { $slice: ["$preview", 4] }, // only first 4 URLs
        },
      },

      { $sort: { date: 1 } },
    ]);

    // Convert array → object format
    const calendarData = {};
    result.forEach((day) => {
      calendarData[day.date] = {
        count: day.count,
        preview: day.preview,
      };
    });

    return calendarData;
  } catch (error) {
    console.log(error);
  }
};

const fetchTemplateCover = async ({ userId }) => {
  try {
    const folderResult = await Memory.aggregate([
      // 1️⃣ Match user + template + at least one image asset
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(userId),
          template: { $ne: null },
          "assets.type": "image",
        },
      },

      // 2️⃣ Keep only image assets (filter inside Mongo)
      {
        $project: {
          template: 1,
          imageAssets: {
            $filter: {
              input: "$assets",
              as: "a",
              cond: { $eq: ["$$a.type", "image"] },
            },
          },
        },
      },

      // 3️⃣ Unwind image assets
      { $unwind: "$imageAssets" },

      // 4️⃣ Now we have rows like:
      // { template: "Friends", imageUrl: "public/..."}
      {
        $project: {
          template: 1,
          imageUrl: "$imageAssets.url",
        },
      },

      // 5️⃣ Group by template → collect all URLs
      {
        $group: {
          _id: "$template",
          urls: { $push: "$imageUrl" },
        },
      },

      // 6️⃣ Pick a random preview image in MongoDB itself
      {
        $project: {
          _id: 0,
          title: "$_id",
          preview: {
            $let: {
              vars: {
                randomIndex: {
                  $floor: { $multiply: [{ $rand: {} }, { $size: "$urls" }] },
                },
              },
              in: { $arrayElemAt: ["$urls", "$$randomIndex"] },
            },
          },
        },
      },
    ]);

    return folderResult;
  } catch (error) {
    console.log(error);
  }
};

const getMonthlyMediaPaginated = async ({ userId, page = 1, limit = 1 }) => {
  try {
    const skip = (page - 1) * limit;

    const result = await Memory.aggregate([
      // 1️⃣ Filter memories of this user that contain assets
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(userId),
          assets: { $exists: true, $ne: [] },
        },
      },

      // 2️⃣ Expand assets
      { $unwind: "$assets" },

      // 3️⃣ Build month key & pick asset fields
      {
        $project: {
          memoryId: "$_id",
          date:"$date",
          type: "$assets.type",
          url: "$assets.url",
          tags: "$assets.tags",
          createdAt: "$assets.createdAt",
          monthKey: {
            $dateToString: { format: "%Y-%m", date: "$date" },
          },
        },
      },

      // 4️⃣ Group by month
      {
        $group: {
          _id: "$monthKey",
          assets: {
            $push: {
              type: "$type",
              url: "$url",
              tags: "$tags",
              createdAt: "$createdAt",
              date:"$date",
              memoryId: "$memoryId",
            },
          },
        },
      },

      // 5️⃣ Sort inside assets (newest first)
      {
        $project: {
          month: "$_id",
          assets: {
            $sortArray: {
              input: "$assets",
              sortBy: { date: -1 },
            },
          },
        },
      },

      // 6️⃣ Sort groups (months) newest → oldest
      { $sort: { month: -1 } },

      // 7️⃣ Pagination at the group level
      { $skip: skip },
      { $limit: limit },

      // Cleanup
      { $project: { _id: 0 } },
    ]);

    // Just return array-of-arrays (frontend format)
    const media = result.map((m) => m.assets);

    return media;
  } catch (err) {
    console.error("getMonthlyMediaPaginated error:", err);
  }
};

module.exports = {
  fetchCalendarData,
  fetchTemplateCover,
  getMonthlyMediaPaginated,
};
