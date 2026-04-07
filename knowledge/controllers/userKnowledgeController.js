const UserKnowledge = require("../models/userKnowledge");

/**
 * GET /knowledge/api/v1/user/:userId/profile
 * Get a user's knowledge profile (traits, streaks, segments, identity).
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
          preferredName: null,
          pronouns: null,
          timezone: null,
          role: null,
          starmanPersona: null,
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
        preferredName: profile.preferredName || null,
        pronouns: profile.pronouns || null,
        timezone: profile.timezone || null,
        role: profile.role || null,
        starmanPersona: profile.starmanPersona || null,
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

/**
 * GET /knowledge/api/v1/user/:userId/identity-context
 * Get the full identity context needed for Starman prompt construction.
 * Returns: traits, segments, preferredName, pronouns, timezone, role, starmanPersona
 */
const getIdentityContext = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const profile = await UserKnowledge.findOne({ userId })
      .select(
        "preferredName pronouns timezone role starmanPersona traits segments totalAnswers"
      )
      .lean();

    if (!profile) {
      return res.status(200).json({
        found: false,
        identity: null,
      });
    }

    return res.status(200).json({
      found: true,
      identity: {
        preferredName: profile.preferredName || null,
        pronouns: profile.pronouns || null,
        timezone: profile.timezone || null,
        role: profile.role || null,
        starmanPersona: profile.starmanPersona || null,
        traits: profile.traits || [],
        segments: profile.segments || [],
        totalAnswers: profile.totalAnswers || 0,
      },
    });
  } catch (err) {
    console.error("getIdentityContext error:", err);
    return res
      .status(500)
      .json({ error: "Could not fetch identity context." });
  }
};

/**
 * PATCH /knowledge/api/v1/user/:userId/starman-persona
 * Update the user's Starman persona.
 * Body: { name?, creature?, vibe?, emoji?, formalityLevel?, humorLevel?, verbosityLevel? }
 */
const updateStarmanPersona = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const allowedFields = [
      "name",
      "creature",
      "vibe",
      "emoji",
      "formalityLevel",
      "humorLevel",
      "verbosityLevel",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (
          ["formalityLevel", "humorLevel", "verbosityLevel"].includes(field)
        ) {
          const num = parseInt(req.body[field], 10);
          if (!isNaN(num) && num >= 1 && num <= 5) {
            updates[`starmanPersona.${field}`] = num;
          }
        } else {
          updates[`starmanPersona.${field}`] = String(req.body[field]).trim();
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const result = await UserKnowledge.findOneAndUpdate(
      { userId },
      { $set: updates },
      { new: true, upsert: false }
    );

    if (!result) {
      return res
        .status(404)
        .json({ error: "User knowledge profile not found." });
    }

    return res.status(200).json({
      success: true,
      starmanPersona: result.starmanPersona,
    });
  } catch (err) {
    console.error("updateStarmanPersona error:", err);
    return res
      .status(500)
      .json({ error: "Could not update Starman persona." });
  }
};

module.exports = {
  getUserProfile,
  getAnsweredIds,
  getIdentityContext,
  updateStarmanPersona,
};
