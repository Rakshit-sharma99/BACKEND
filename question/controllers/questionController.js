const Question = require("../models/question");

// ── Helpers ──

/**
 * Generate a slug for deduplication.
 * Normalizes text: lowercase, strip punctuation, collapse whitespace.
 */
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

// ── Controllers ──

/**
 * GET /question/api/v1/next
 * Query: { userId, uid }
 * Returns the next question for a user to answer.
 */
const getNextQuestion = async (req, res) => {
  try {
    const { userId, uid, answeredIds, preferredDomain } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    // Parse answered question IDs (comma-separated string from client)
    const excludeIds = answeredIds ? answeredIds.split(",").filter(Boolean) : [];

    // Query candidates: active questions, not already answered, in this universe or global
    const filter = {
      status: "active",
      ...(excludeIds.length > 0 && { _id: { $nin: excludeIds } }),
    };

    // If user requested a specific domain, lock to it
    if (preferredDomain === "universe" || preferredDomain === "user") {
      filter.domain = preferredDomain;
    }

    // Only filter by uid if provided; otherwise return all global questions
    if (uid) {
      filter.$or = [{ uid }, { uid: null }, { uid: { $exists: false } }];
    } else {
      filter.$or = [{ uid: null }, { uid: { $exists: false } }];
    }

    // Get a pool of candidates sorted by priority first, then engagement & freshness
    // Identity questions (priority 90-100) get served first to new users
    const candidates = await Question.find(filter)
      .sort({ priority: -1, avgEngagement: -1, timesAsked: 1, createdAt: -1 })
      .limit(20)
      .lean();

    if (candidates.length === 0) {
      // All questions answered — recycle older ones (exclude the most recent 10 to avoid immediate repeats)
      const recycleExclude = excludeIds.slice(-10);
      const recycleFilter = {
        status: "active",
        ...(recycleExclude.length > 0 && { _id: { $nin: recycleExclude } }),
      };
      if (preferredDomain === "universe" || preferredDomain === "user") {
        recycleFilter.domain = preferredDomain;
      }
      if (uid) {
        recycleFilter.$or = [{ uid }, { uid: null }, { uid: { $exists: false } }];
      } else {
        recycleFilter.$or = [{ uid: null }, { uid: { $exists: false } }];
      }

      const recycled = await Question.find(recycleFilter)
        .sort({ timesAsked: 1, createdAt: -1 })
        .limit(10)
        .lean();

      if (recycled.length === 0) {
        return res.status(200).json({
          question: null,
          message: "No more questions available right now!",
        });
      }

      // Pick randomly from recycled pool
      const pick = recycled[Math.floor(Math.random() * Math.min(recycled.length, 5))];
      let displayText = pick.text;
      if (pick.variations && pick.variations.length > 0) {
        const variation = pick.variations[Math.floor(Math.random() * pick.variations.length)];
        displayText = variation.text;
      }
      await Question.updateOne({ _id: pick._id }, { $inc: { timesAsked: 1 }, lastAskedAt: new Date() });

      return res.status(200).json({
        question: {
          id: pick._id,
          text: displayText,
          originalText: pick.text,
          domain: pick.domain,
          category: pick.category,
          format: pick.format,
          options: pick.options || [],
          tags: pick.tags || [],
        },
      });
    }

    let selected;

    // If the top candidate has high priority (identity question), serve it deterministically
    const topCandidate = candidates[0];
    if (topCandidate && topCandidate.priority && topCandidate.priority >= 90) {
      selected = topCandidate;
    } else if (preferredDomain) {
      // User chose a specific domain — just pick randomly from candidates
      selected = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
    } else {
      // Weighted selection: favor a mix of universe (60%) and user (40%) domains
      const universe = candidates.filter((q) => q.domain === "universe");
      const personal = candidates.filter((q) => q.domain === "user");

      const pool = [
        ...universe.slice(0, 3),
        ...personal.slice(0, 2),
      ];

      // If pool is empty (all from one domain), fall back to any candidate
      const finalPool = pool.length > 0 ? pool : candidates.slice(0, 5);
      selected = finalPool[Math.floor(Math.random() * finalPool.length)];
    }

    // Pick a random witty variation if available
    let displayText = selected.text;
    if (selected.variations && selected.variations.length > 0) {
      const variation =
        selected.variations[
          Math.floor(Math.random() * selected.variations.length)
        ];
      displayText = variation.text;
    }

    // Increment timesAsked
    await Question.updateOne(
      { _id: selected._id },
      { $inc: { timesAsked: 1 }, lastAskedAt: new Date() }
    );

    return res.status(200).json({
      question: {
        id: selected._id,
        text: displayText,
        originalText: selected.text,
        domain: selected.domain,
        category: selected.category,
        format: selected.format,
        options: selected.options || [],
        tags: selected.tags || [],
      },
    });
  } catch (err) {
    console.error("getNextQuestion error:", err);
    return res.status(500).json({ error: "Could not fetch next question." });
  }
};

/**
 * POST /question/api/v1/seed
 * Body: { questions: [{ text, domain, category, format, options, tags, variations }] }
 * Bulk seed questions (admin).
 */
const seedQuestions = async (req, res) => {
  try {
    const { questions, uid, universeMetaData } = req.body;
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: "questions array is required" });
    }

    const results = [];
    let created = 0;
    let skipped = 0;

    for (const q of questions) {
      const slug = generateSlug(q.text);

      // Check for duplicates
      const existing = await Question.findOne({ slug });
      if (existing) {
        skipped++;
        continue;
      }

      const question = await Question.create({
        text: q.text,
        slug,
        domain: q.domain,
        category: q.category || null,
        format: q.format || "mcq",
        options: q.options || [],
        tags: q.tags || [],
        source: "seed",
        sourceRef: "seed_batch_v1",
        status: "active",
        uid: uid || null,
        priority: q.priority || 0,
        variations: q.variations || [],
        targetSegment: q.targetSegment || {},
        universeMetaData: universeMetaData || {},
      });

      results.push(question._id);
      created++;
    }

    return res.status(201).json({
      success: true,
      created,
      skipped,
      questionIds: results,
    });
  } catch (err) {
    console.error("seedQuestions error:", err);
    return res.status(500).json({ error: "Could not seed questions." });
  }
};

/**
 * GET /question/api/v1/stats
 * Returns question metrics.
 */
const getStats = async (req, res) => {
  try {
    const uid = req.query.uid;
    const filter = uid
      ? { $or: [{ uid }, { uid: null }, { uid: { $exists: false } }] }
      : {};

    const total = await Question.countDocuments({ ...filter, status: "active" });
    const byDomain = await Question.aggregate([
      { $match: { ...filter, status: "active" } },
      { $group: { _id: "$domain", count: { $sum: 1 } } },
    ]);
    const bySource = await Question.aggregate([
      { $match: { ...filter, status: "active" } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
    ]);

    return res.status(200).json({
      total,
      byDomain: Object.fromEntries(byDomain.map((d) => [d._id, d.count])),
      bySource: Object.fromEntries(bySource.map((d) => [d._id, d.count])),
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({ error: "Could not fetch stats." });
  }
};

/**
 * GET /question/api/v1/list
 * Query: { domain, status, source, limit, page }
 * Browse questions.
 */
const listQuestions = async (req, res) => {
  try {
    const { domain, status, source, limit = 20, page = 1 } = req.query;
    const filter = {};
    if (domain) filter.domain = domain;
    if (status) filter.status = status;
    if (source) filter.source = source;

    const questions = await Question.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await Question.countDocuments(filter);

    return res.status(200).json({ questions, total, page: Number(page) });
  } catch (err) {
    console.error("listQuestions error:", err);
    return res.status(500).json({ error: "Could not list questions." });
  }
};

module.exports = {
  getNextQuestion,
  seedQuestions,
  getStats,
  listQuestions,
  generateSlug,
};
