const CreditLedger = require("../models/creditLedger");

// ── Helpers ──

/** Get today's date string in YYYY-MM-DD */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const DAILY_CREDITS = 10;

/**
 * Calculate how many credits a user earns for answering a question.
 * Every question answered gives at least 3 points.
 */
function calculateRefillAmount(answersToday, questionDomain) {
  // Give 4 for universe, 3 for user (at least 3 points per question). No diminishing returns below 3.
  const BASE_CREDIT = questionDomain === "universe" ? 4 : 3;
  return BASE_CREDIT;
}

/**
 * Find or create today's credit ledger for a user.
 */
async function getOrCreateLedger(userId, uid, universeMetaData) {
  const date = todayStr();

  let ledger = await CreditLedger.findOne({ userId, date });
  if (ledger) return ledger;

  // First interaction today — grant daily credits
  ledger = await CreditLedger.create({
    userId,
    uid,
    date,
    balance: DAILY_CREDITS,
    transactions: [
      {
        type: "daily_grant",
        amount: DAILY_CREDITS,
        reason: "Daily free credits",
      },
    ],
    answersToday: 0,
    universeMetaData: universeMetaData || {},
  });

  return ledger;
}

// ── Controllers ──

/**
 * GET /credit/api/v1/balance
 * Query: userId (or from req.user)
 * Returns today's credit balance.
 */
const getBalance = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const uid = req.query.uid || req.user?.uid;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const ledger = await getOrCreateLedger(userId, uid);

    return res.status(200).json({
      balance: ledger.balance,
      hasCredits: ledger.balance > 0,
      answersToday: ledger.answersToday,
      date: ledger.date,
    });
  } catch (err) {
    console.error("getBalance error:", err);
    return res.status(500).json({ error: "Could not fetch balance." });
  }
};

/**
 * POST /credit/api/v1/spend
 * Body: { userId, amount, ref, reason }
 * Deducts credits for a chat interaction.
 */
const spend = async (req, res) => {
  try {
    const { userId, uid, amount = 1, ref, reason } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const ledger = await getOrCreateLedger(userId, uid);

    if (ledger.balance <= 0) {
      return res.status(200).json({
        success: false,
        balance: 0,
        hasCredits: false,
        message: "No credits remaining.",
      });
    }

    const deduction = Math.min(amount, ledger.balance);
    ledger.balance -= deduction;
    ledger.transactions.push({
      type: "chat_spend",
      amount: -deduction,
      ref,
      reason: reason || "Chat interaction",
    });

    await ledger.save();

    return res.status(200).json({
      success: true,
      balance: ledger.balance,
      hasCredits: ledger.balance > 0,
      spent: deduction,
    });
  } catch (err) {
    console.error("spend error:", err);
    return res.status(500).json({ error: "Could not spend credits." });
  }
};

/**
 * POST /credit/api/v1/refill
 * Body: { userId, uid, questionId, questionDomain, universeMetaData }
 * Adds credits after a user answers a question.
 */
const refill = async (req, res) => {
  try {
    const { userId, uid, questionId, questionDomain, universeMetaData } =
      req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const ledger = await getOrCreateLedger(userId, uid, universeMetaData);

    // Anti-abuse: cooldown check (min 5s between answers)
    if (
      ledger.lastAnswerAt &&
      Date.now() - ledger.lastAnswerAt.getTime() < 5000
    ) {
      return res.status(429).json({
        success: false,
        message: "Slow down! Wait a few seconds between answers.",
      });
    }

    const creditsEarned = calculateRefillAmount(
      ledger.answersToday,
      questionDomain || "user"
    );

    ledger.balance += creditsEarned;
    ledger.answersToday += 1;
    ledger.lastAnswerAt = new Date();
    ledger.transactions.push({
      type: "answer_refill",
      amount: creditsEarned,
      ref: questionId,
      reason: `Answered a ${questionDomain || "user"} question`,
    });

    await ledger.save();

    return res.status(200).json({
      success: true,
      balance: ledger.balance,
      creditsEarned,
      answersToday: ledger.answersToday,
      message: `🌟 +${creditsEarned} credits earned!`,
    });
  } catch (err) {
    console.error("refill error:", err);
    return res.status(500).json({ error: "Could not refill credits." });
  }
};

/**
 * GET /credit/api/v1/history
 * Query: userId
 * Returns today's transaction history.
 */
const getHistory = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const date = todayStr();
    const ledger = await CreditLedger.findOne({ userId, date });

    if (!ledger) {
      return res.status(200).json({ transactions: [], balance: DAILY_CREDITS });
    }

    return res.status(200).json({
      balance: ledger.balance,
      transactions: ledger.transactions,
      answersToday: ledger.answersToday,
    });
  } catch (err) {
    console.error("getHistory error:", err);
    return res.status(500).json({ error: "Could not fetch history." });
  }
};

module.exports = {
  getBalance,
  spend,
  refill,
  getHistory,
};
