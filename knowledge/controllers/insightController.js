const mongoose = require("mongoose");
const Insight = require("../models/insight");

/**
 * GET /knowledge/api/v1/insight/query
 * Query: { query, uid }
 * Search insights by matching question text.
 *
 * Uses $lookup instead of .populate() so we don't need the Question model
 * registered in this service.
 */
const queryInsight = async (req, res) => {
  try {
    const { query, uid } = req.query;
    if (!query) return res.status(400).json({ error: "query is required" });

    const queryWords = query.split(/[\s,]+/).filter(Boolean);

    const pipeline = [
      // 1. Filter insights by uid
      ...(uid
        ? [{ $match: { uid: new mongoose.Types.ObjectId(uid) } }]
        : []),

      // 2. Join with the "questions" collection
      {
        $lookup: {
          from: "questions",
          localField: "questionId",
          foreignField: "_id",
          as: "question",
        },
      },

      // 3. Unwind the joined array (1-to-1 relationship)
      { $unwind: "$question" },

      // 4. Filter by question text or tags matching the query
      {
        $match: {
          $or: [
            { "question.text": { $regex: query, $options: "i" } },
            { "question.tags": { $in: queryWords } },
          ],
        },
      },

      // 5. Sort by confidence and response count
      { $sort: { confidence: -1, totalResponses: -1 } },

      // 6. Limit results
      { $limit: 5 },

      // 7. Project only the fields we need
      {
        $project: {
          "question.text": 1,
          "question.domain": 1,
          topAnswer: 1,
          confidence: 1,
          consensus: 1,
          summary: 1,
          totalResponses: 1,
          distribution: { $slice: ["$distribution", 5] },
        },
      },
    ];

    const results = await Insight.aggregate(pipeline);

    if (results.length === 0) {
      return res.status(200).json({
        found: false,
        message: "No campus knowledge found for this query.",
      });
    }

    return res.status(200).json({
      found: true,
      insights: results.map((i) => ({
        question: i.question?.text,
        domain: i.question?.domain,
        topAnswer: i.topAnswer,
        confidence: i.confidence,
        consensus: i.consensus,
        summary: i.summary,
        totalResponses: i.totalResponses,
        distribution: i.distribution,
      })),
    });
  } catch (err) {
    console.error("queryInsight error:", err);
    return res.status(500).json({ error: "Could not query insights." });
  }
};

/**
 * GET /knowledge/api/v1/insight/:questionId
 * Get the insight for a specific question.
 *
 * Uses $lookup instead of .populate().
 */
const getInsight = async (req, res) => {
  try {
    const { questionId } = req.params;
    const uid = req.query.uid;

    const matchFilter = {
      questionId: new mongoose.Types.ObjectId(questionId),
    };
    if (uid) matchFilter.uid = new mongoose.Types.ObjectId(uid);

    const pipeline = [
      { $match: matchFilter },

      {
        $lookup: {
          from: "questions",
          localField: "questionId",
          foreignField: "_id",
          as: "question",
        },
      },

      { $unwind: { path: "$question", preserveNullAndEmptyArrays: true } },

      { $limit: 1 },
    ];

    const results = await Insight.aggregate(pipeline);

    if (results.length === 0) {
      return res.status(200).json({
        found: false,
        message: "No insights available for this question yet.",
      });
    }

    const insight = results[0];

    return res.status(200).json({
      found: true,
      insight: {
        question: insight.question?.text,
        topAnswer: insight.topAnswer,
        confidence: insight.confidence,
        consensus: insight.consensus,
        summary: insight.summary,
        totalResponses: insight.totalResponses,
        distribution: insight.distribution,
        snapshotHistory: insight.snapshotHistory?.slice(-10),
      },
    });
  } catch (err) {
    console.error("getInsight error:", err);
    return res.status(500).json({ error: "Could not fetch insight." });
  }
};

module.exports = {
  queryInsight,
  getInsight,
};
