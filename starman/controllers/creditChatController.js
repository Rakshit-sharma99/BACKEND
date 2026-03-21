/**
 * Credit-related controllers for Starman.
 * Handles question fetching and answer submission through the chat interface.
 */

const axios = require("axios");
const jwt = require("jsonwebtoken");

function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "starman" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function internalHeaders() {
  return { Authorization: `Bearer ${getInternalToken()}` };
}

const CREDIT_URL = process.env.CREDIT_URL || "http://credit:7090/credit/api/v1";
const QUESTION_URL =
  process.env.QUESTION_URL || "http://question:7070/question/api/v1";
const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";

/**
 * GET /starman/api/v1/credits
 * Get credit balance + next question for the current user.
 */
const getCreditsAndQuestion = async (req, res) => {
  try {
    const user = req.user;

    // Fetch credit balance
    const creditRes = await axios.get(`${CREDIT_URL}/balance`, {
      params: { userId: user.id, uid: user.uid },
      headers: internalHeaders(),
    });
    const credits = creditRes.data;

    // Fetch user's answered question IDs
    let answeredIds = [];
    try {
      const answeredRes = await axios.get(
        `${KNOWLEDGE_URL}/user/${user.id}/answered-ids`,
        { headers: internalHeaders() },
      );
      answeredIds = answeredRes.data?.answeredIds || [];
    } catch (err) {
      console.error("Failed to fetch answered IDs:", err.message);
    }

    // Fetch next question
    let question = null;
    try {
      const questionRes = await axios.get(`${QUESTION_URL}/next`, {
        params: {
          userId: user.id,
          uid: user.uid,
          answeredIds: answeredIds.join(","),
        },
        headers: internalHeaders(),
      });
      question = questionRes.data?.question;
    } catch (err) {
      console.error("Failed to fetch next question:", err.message);
    }

    return res.status(200).json({
      credits: {
        balance: credits.balance,
        hasCredits: credits.hasCredits,
        answersToday: credits.answersToday,
      },
      question,
    });
  } catch (err) {
    console.error("getCreditsAndQuestion error:", err.message);
    return res.status(500).json({ error: "Could not fetch credits." });
  }
};

/**
 * POST /starman/api/v1/answer
 * Body: { questionId, value, optionIndex, responseTimeMs }
 * Submit an answer to earn credits.
 */
const submitAnswer = async (req, res) => {
  try {
    const user = req.user;
    const {
      questionId,
      value,
      optionIndex,
      responseTimeMs,
      questionDomain,
      questionCategory,
    } = req.body;

    if (!questionId || !value) {
      return res
        .status(400)
        .json({ error: "questionId and value are required" });
    }

    // 1. Submit answer to Knowledge Service
    const answerRes = await axios.post(
      `${KNOWLEDGE_URL}/answer`,
      {
        questionId,
        userId: user.id,
        uid: user.uid,
        value,
        optionIndex,
        responseTimeMs,
        questionDomain: questionDomain || "user",
        questionCategory: questionCategory || null,
        userMeta: {
          profession: user.profession,
          passoutYear: user.passoutYear,
        },
      },
      { headers: internalHeaders() },
    );

    if (!answerRes.data?.success && answerRes.data?.error) {
      return res.status(409).json(answerRes.data);
    }

    // 2. Refill credits via Credit Service
    const refillRes = await axios.post(
      `${CREDIT_URL}/refill`,
      {
        userId: user.id,
        uid: user.uid,
        questionId,
        questionDomain: questionDomain || "user",
      },
      { headers: internalHeaders() },
    );

    const refillData = refillRes.data;

    // 3. Fetch next question
    let nextQuestion = null;
    try {
      const answeredRes = await axios.get(
        `${KNOWLEDGE_URL}/user/${user.id}/answered-ids`,
        { headers: internalHeaders() },
      );
      const answeredIds = answeredRes.data?.answeredIds || [];

      const questionRes = await axios.get(`${QUESTION_URL}/next`, {
        params: {
          userId: user.id,
          uid: user.uid,
          answeredIds: answeredIds.join(","),
        },
        headers: internalHeaders(),
      });
      nextQuestion = questionRes.data?.question;
    } catch (err) {
      console.error("Failed to fetch next question:", err.message);
    }

    return res.status(200).json({
      success: true,
      creditsEarned: refillData.creditsEarned,
      newBalance: refillData.balance,
      message: refillData.message,
      flagged: answerRes.data?.flagged || false,
      nextQuestion,
    });
  } catch (err) {
    console.error("submitAnswer error:", err.message);
    return res.status(500).json({ error: "Could not submit answer." });
  }
};

module.exports = {
  getCreditsAndQuestion,
  submitAnswer,
};
