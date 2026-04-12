const Answer = require("../models/answer");
const Insight = require("../models/insight");
const UserKnowledge = require("../models/userKnowledge");

// ── Spam Detection ──

function detectSpam(value, responseTimeMs) {
  let spamScore = 0;

  // Too fast (< 1 second) → likely random clicking
  if (responseTimeMs && responseTimeMs < 1000) spamScore += 0.4;

  // Single character or gibberish
  if (value.length < 2) spamScore += 0.5;

  // Only numbers (for non-rating questions)
  if (/^\d+$/.test(value) && value.length < 3) spamScore += 0.2;

  return { isSpam: spamScore >= 0.5, spamScore: Math.min(spamScore, 1) };
}

// ── Controllers ──

/**
 * POST /knowledge/api/v1/answer
 * Body: { questionId, userId, uid, value, optionIndex, responseTimeMs,
 *         questionDomain, questionCategory, userMeta, universeMetaData }
 * Submit an answer and trigger aggregation.
 */
const submitAnswer = async (req, res) => {
  try {
    const {
      questionId,
      userId,
      uid,
      value,
      optionIndex,
      responseTimeMs,
      questionDomain,
      questionCategory,
      userMeta,
      universeMetaData,
    } = req.body;

    if (!questionId || !userId || !value) {
      return res
        .status(400)
        .json({ error: "questionId, userId, and value are required" });
    }

    // Spam detection
    const { isSpam, spamScore } = detectSpam(value, responseTimeMs);

    // Check if user already answered this question — update if so (recycled questions)
    const existing = await Answer.findOne({ questionId, userId });
    if (existing) {
      existing.value = value.trim();
      existing.optionIndex = optionIndex;
      existing.responseTimeMs = responseTimeMs;
      existing.flagged = isSpam;
      existing.spamScore = spamScore;
      await existing.save();

      return res.status(200).json({
        success: true,
        answerId: existing._id,
        flagged: isSpam,
        updated: true,
        message: "Answer updated!",
      });
    }

    // Create the answer
    const answer = await Answer.create({
      questionId,
      userId,
      uid,
      value: value.trim(),
      optionIndex,
      responseTimeMs,
      flagged: isSpam,
      spamScore,
      userMeta: userMeta || {},
      universeMetaData: universeMetaData || {},
    });

    // Update user knowledge profile
    await updateUserKnowledge(
      userId,
      uid,
      questionId,
      questionDomain,
      questionCategory,
      value
    );

    // Trigger insight aggregation (async, non-blocking)
    updateInsight(questionId, uid, universeMetaData).catch((err) =>
      console.error("Background insight update failed:", err)
    );

    return res.status(201).json({
      success: true,
      answerId: answer._id,
      flagged: isSpam,
      message: isSpam
        ? "Your answer was recorded but flagged for review."
        : "Answer submitted successfully!",
    });
  } catch (err) {
    // Handle duplicate key error (concurrent submission)
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ error: "You've already answered this question." });
    }
    console.error("submitAnswer error:", err);
    return res.status(500).json({ error: "Could not submit answer." });
  }
};

// ── User Knowledge Update ──

async function updateUserKnowledge(
  userId,
  uid,
  questionId,
  questionDomain,
  questionCategory,
  value
) {
  try {
    let profile = await UserKnowledge.findOne({ userId });

    if (!profile) {
      profile = await UserKnowledge.create({
        userId,
        uid,
        traits: [],
        totalAnswers: 0,
        answeredQuestionIds: [],
      });
    }

    // Add to answered list
    if (!profile.answeredQuestionIds.includes(questionId)) {
      profile.answeredQuestionIds.push(questionId);
    }

    // If it's a "user" domain question, store as a trait
    if (questionDomain === "user" && questionCategory) {
      const existingTraitIdx = profile.traits.findIndex(
        (t) => t.key === questionCategory
      );
      if (existingTraitIdx >= 0) {
        profile.traits[existingTraitIdx].value = value;
        profile.traits[existingTraitIdx].updatedAt = new Date();
        profile.traits[existingTraitIdx].source = questionId.toString();
      } else {
        profile.traits.push({
          key: questionCategory,
          value,
          source: questionId.toString(),
          updatedAt: new Date(),
          confidence: 1,
        });
      }

      // ── Populate first-class identity fields from specific categories ──
      const identityFieldMap = {
        preferred_name: "preferredName",
        pronouns: "pronouns",
        timezone: "timezone",
        role: "role",
      };

      if (identityFieldMap[questionCategory]) {
        profile[identityFieldMap[questionCategory]] = value.trim();
      }

      // ── Populate Starman Persona fields from specific categories ──
      const personaFieldMap = {
        starman_name: "name",
        starman_creature: "creature",
        starman_vibe: "vibe",
        starman_emoji: "emoji",
        starman_formality: "formalityLevel",
        starman_humor: "humorLevel",
        starman_verbosity: "verbosityLevel",
      };

      if (personaFieldMap[questionCategory]) {
        const field = personaFieldMap[questionCategory];
        // For numeric persona fields, parse the value
        if (["formalityLevel", "humorLevel", "verbosityLevel"].includes(field)) {
          const numVal = parseInt(value, 10);
          if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
            profile.starmanPersona[field] = numVal;
          }
        } else {
          profile.starmanPersona[field] = value.trim();
        }
        profile.markModified("starmanPersona");
      }
    }

    // Update streak
    const now = new Date();
    const lastAnswered = profile.lastAnsweredAt;
    if (lastAnswered) {
      const daysDiff = Math.floor(
        (now - lastAnswered) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff === 1) {
        profile.streak += 1;
        if (profile.streak > profile.bestStreak) {
          profile.bestStreak = profile.streak;
        }
      } else if (daysDiff > 1) {
        profile.streak = 1;
      }
    } else {
      profile.streak = 1;
    }

    profile.totalAnswers += 1;
    profile.lastAnsweredAt = now;

    // Update trust score (grows slowly with quality answers)
    profile.trustScore = Math.min(
      1,
      profile.trustScore + 0.01
    );

    await profile.save();
  } catch (err) {
    console.error("updateUserKnowledge error:", err);
  }
}

// ── Insight Aggregation ──

/**
 * Recalculate the aggregated insight for a question within a universe.
 */
async function updateInsight(questionId, uid, universeMetaData) {
  const answers = await Answer.find({
    questionId,
    uid,
    flagged: false,
  });

  if (answers.length === 0) return;

  // Build frequency distribution with recency weighting
  const freq = {};
  const now = Date.now();

  for (const ans of answers) {
    const normalizedValue = ans.value.toLowerCase().trim();

    // Recency weight: 1.0 for today, decays to 0.3 over 30 days
    const ageMs = now - new Date(ans.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.max(0.3, 1 - ageDays / 30 * 0.7);

    freq[normalizedValue] = (freq[normalizedValue] || 0) + recencyWeight;
  }

  // Sort by weighted frequency
  const sorted = Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .map(([value, weightedScore]) => {
      const rawCount = answers.filter(
        (a) => a.value.toLowerCase().trim() === value
      ).length;
      return {
        value,
        count: rawCount,
        percentage: Math.round((rawCount / answers.length) * 100),
        trend: "stable", // TODO: compare with previous snapshot
        lastSeen: answers
          .filter((a) => a.value.toLowerCase().trim() === value)
          .sort((a, b) => b.createdAt - a.createdAt)[0]?.createdAt,
      };
    });

  // Calculate confidence (Bayesian-ish)
  const topPercentage = sorted[0]?.percentage || 0;
  const sampleFactor = Math.min(answers.length / 20, 1);
  const confidence = (topPercentage / 100) * sampleFactor;

  // Determine consensus strength
  let consensus;
  if (confidence > 0.8 && answers.length >= 10) consensus = "strong";
  else if (confidence > 0.5) consensus = "moderate";
  else if (sorted.length <= 3) consensus = "weak";
  else consensus = "contested";

  // Generate a natural language summary
  const summary = generateSummary(sorted, answers.length, consensus);

  await Insight.findOneAndUpdate(
    { questionId, uid },
    {
      totalResponses: answers.length,
      distribution: sorted.slice(0, 10),
      topAnswer: sorted[0]?.value,
      confidence,
      consensus,
      summary,
      lastUpdatedAt: new Date(),
      universeMetaData: universeMetaData || {},
      $push: {
        snapshotHistory: {
          $each: [
            {
              date: new Date(),
              topAnswer: sorted[0]?.value,
              confidence,
            },
          ],
          $slice: -30, // Keep last 30 snapshots
        },
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Generate a human-readable summary from distribution data.
 */
function generateSummary(distribution, totalResponses, consensus) {
  if (distribution.length === 0) return "No answers yet.";

  const top = distribution[0];
  const runner = distribution[1];

  if (totalResponses < 3) {
    return `Early results: "${top.value}" is leading so far (${top.count} votes).`;
  }

  if (consensus === "strong") {
    return `The campus has spoken! "${top.value}" is the clear favorite with ${top.percentage}% of ${totalResponses} votes 🏆`;
  }

  if (consensus === "contested" && runner) {
    return `It's a tight race! "${top.value}" (${top.percentage}%) and "${runner.value}" (${runner.percentage}%) are neck and neck 🔥`;
  }

  if (runner) {
    return `Most people say "${top.value}" (${top.percentage}%), but "${runner.value}" is also popular 👀`;
  }

  return `"${top.value}" leads with ${top.percentage}% of ${totalResponses} votes.`;
}

module.exports = {
  submitAnswer,
  updateInsight,
};
