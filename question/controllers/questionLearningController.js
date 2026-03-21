const Question = require("../models/question");
const { generateSlug } = require("./questionController");

/**
 * Question Learning Controller
 *
 * Consumes chat logs from Kafka and extracts reusable questions.
 * Can also be triggered via HTTP for manual extraction.
 */

/**
 * POST /question/api/v1/learn
 * Body: { messages: [{role, text}], userId, uid }
 * Extract questions from a chat conversation.
 */
const learnFromChat = async (req, res) => {
  try {
    const { messages, userId, uid, universeMetaData } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Extract user messages that look like questions
    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => m.text || m.parts?.[0]?.text || "")
      .filter((text) => text.length > 10);

    const extractedQuestions = [];

    for (const msg of userMessages) {
      // Simple heuristic: messages ending with "?" or containing question words
      const isQuestion =
        msg.includes("?") ||
        /^(where|what|who|how|when|which|why|best|top|favorite|worst)/i.test(
          msg.trim()
        );

      if (!isQuestion) continue;

      // Classify domain
      const campusKeywords = [
        "campus",
        "hostel",
        "canteen",
        "library",
        "gate",
        "college",
        "university",
        "mess",
        "ground",
        "lab",
        "fest",
        "club",
        "society",
        "prof",
        "class",
        "lecture",
        "exam",
        "placement",
      ];
      const isCampus = campusKeywords.some((kw) =>
        msg.toLowerCase().includes(kw)
      );
      const domain = isCampus ? "universe" : "user";

      // Generate slug and check for duplicates
      const slug = generateSlug(msg);
      const existing = await Question.findOne({
        slug: { $regex: new RegExp(`^${slug.slice(0, 30)}`) },
      });

      if (existing) continue; // Skip similar existing questions

      extractedQuestions.push({
        text: msg.trim().replace(/\?+$/, "?"),
        slug,
        domain,
        category: isCampus ? "campus_life" : "personal",
        format: "short",
        options: [],
        source: "extracted",
        sourceRef: userId,
        status: "review", // Needs human or auto-approval
        uid: uid || null,
        universeMetaData: universeMetaData || {},
      });
    }

    // Bulk insert
    if (extractedQuestions.length > 0) {
      await Question.insertMany(extractedQuestions, { ordered: false }).catch(
        (err) => {
          // Ignore duplicate key errors
          if (err.code !== 11000) throw err;
        }
      );
    }

    if (res) {
      return res.status(200).json({
        extracted: extractedQuestions.length,
        questions: extractedQuestions.map((q) => ({
          text: q.text,
          domain: q.domain,
        })),
      });
    }

    return { extracted: extractedQuestions.length };
  } catch (err) {
    console.error("learnFromChat error:", err);
    if (res) {
      return res.status(500).json({ error: "Could not learn from chat." });
    }
  }
};

/**
 * POST /question/api/v1/approve
 * Body: { questionId }
 * Approve a question in "review" status.
 */
const approveQuestion = async (req, res) => {
  try {
    const { questionId } = req.body;
    if (!questionId)
      return res.status(400).json({ error: "questionId is required" });

    const question = await Question.findByIdAndUpdate(
      questionId,
      { status: "active" },
      { new: true }
    );

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.status(200).json({ success: true, question });
  } catch (err) {
    console.error("approveQuestion error:", err);
    return res
      .status(500)
      .json({ error: "Could not approve question." });
  }
};

/**
 * POST /question/api/v1/retire
 * Body: { questionId }
 * Retire a question (soft delete).
 */
const retireQuestion = async (req, res) => {
  try {
    const { questionId } = req.body;
    if (!questionId)
      return res.status(400).json({ error: "questionId is required" });

    const question = await Question.findByIdAndUpdate(
      questionId,
      { status: "retired" },
      { new: true }
    );

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.status(200).json({ success: true, question });
  } catch (err) {
    console.error("retireQuestion error:", err);
    return res.status(500).json({ error: "Could not retire question." });
  }
};

module.exports = {
  learnFromChat,
  approveQuestion,
  retireQuestion,
};
