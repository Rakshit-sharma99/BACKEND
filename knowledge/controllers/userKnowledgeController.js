const UserKnowledge = require("../models/userKnowledge");

/**
 * GET /knowledge/api/v1/user/:userId/profile
 * Get a user's knowledge profile (traits, streaks, segments).
 */
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const profile = await UserKnowledge.findOne({ userId }).lean();

    if (!profile) {
      return res.status(200).json({
        found: false,
        profile: {
          totalAnswers: 0,
          streak: 0,
          traits: [],
          segments: [],
          answeredQuestionIds: [],
        },
      });
    }

    return res.status(200).json({
      found: true,
      profile: {
        totalAnswers: profile.totalAnswers,
        trustScore: profile.trustScore,
        streak: profile.streak,
        bestStreak: profile.bestStreak,
        lastAnsweredAt: profile.lastAnsweredAt,
        traits: profile.traits,
        segments: profile.segments,
        answeredQuestionIds: profile.answeredQuestionIds,
      },
    });
  } catch (err) {
    console.error("getUserProfile error:", err);
    return res.status(500).json({ error: "Could not fetch user profile." });
  }
};

/**
 * GET /knowledge/api/v1/user/:userId/answered-ids
 * Get just the IDs of questions a user has already answered.
 * Used by the question engine to avoid repeats.
 */
const getAnsweredIds = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const profile = await UserKnowledge.findOne({ userId })
      .select("answeredQuestionIds")
      .lean();

    return res.status(200).json({
      answeredIds: profile?.answeredQuestionIds || [],
    });
  } catch (err) {
    console.error("getAnsweredIds error:", err);
    return res.status(500).json({ error: "Could not fetch answered IDs." });
  }
};

module.exports = {
  getUserProfile,
  getAnsweredIds,
};
