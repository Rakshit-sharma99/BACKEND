/**
 * Debug Controller — SERE Simulation & Observability API.
 *
 * Provides SSE-streamed pipeline execution for a single user,
 * with configurable overrides for every stage. Dev-only.
 *
 * All endpoints are scoped to a single userId to prevent
 * accidental production impact.
 */

const UserEngagement = require("../models/userEngagement");
const ProactiveMessage = require("../models/proactiveMessage");
const {
  checkEligibility,
  hasPendingNudge,
  PROACTIVE_CONFIG,
} = require("../engine/memoryNudgeRule");
const {
  generateProactiveContent,
  PROACTIVE_TEMPLATES,
} = require("../engine/proactiveContentGenerator");
const {
  getLocalHour,
  isInEveningWindow,
} = require("../engine/memoryNudgeScheduler");
const {
  dispatchPendingProactiveMessages,
  dispatchSingleMessage,
  expireProactiveMessages,
} = require("../engine/proactiveDispatcher");

// ── Helpers ──

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sendEvent(res, stage, status, message, data = null) {
  const payload = {
    stage,
    status, // "pending" | "running" | "success" | "failed" | "skipped" | "info"
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// ══════════════════════════════════════════════════
// ── Full Pipeline Simulation (SSE) ──
// ══════════════════════════════════════════════════

/**
 * POST /sere/debug/simulate/full-pipeline
 *
 * SSE endpoint — streams stage-by-stage logs of the entire
 * proactive reminder pipeline for a single user.
 *
 * Body: {
 *   userId: string,
 *   overrides: {
 *     forceNoMemoryToday: boolean,
 *     forceStreakBroken: boolean,
 *     forceDormant: boolean,
 *     skipEligibility: boolean,
 *     cooldownBypass: boolean,
 *     timezoneOverride: string,
 *     mockTimeHour: number,
 *     injectPushFailure: boolean,
 *     injectStarmanFailure: boolean,
 *   }
 * }
 */
const simulateFullPipeline = async (req, res) => {
  const { userId, overrides = {} } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }

  // Setup SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const startTime = Date.now();

  try {
    // ────────────────────────────────
    // STAGE 1: SCHEDULER
    // ────────────────────────────────
    sendEvent(
      res,
      "scheduler",
      "running",
      "Scheduler triggered — single-user simulation mode",
    );
    await sleep(200);

    sendEvent(res, "scheduler", "info", `Target user: ${userId}`);
    sendEvent(
      res,
      "scheduler",
      "info",
      `Overrides: ${JSON.stringify(overrides)}`,
    );

    // Fetch user engagement
    let engagement = await UserEngagement.findOne({ userId });
    if (!engagement) {
      sendEvent(
        res,
        "scheduler",
        "info",
        "No UserEngagement found — creating temporary profile",
      );
      engagement = {
        userId,
        timezone: overrides.timezoneOverride || "Asia/Kolkata",
        memoryCreatedToday: false,
        memoryStreak: 0,
        lastMemoryDate: null,
        consecutiveNudgeIgnores: 0,
        proactiveOptOut: false,
        optedOut: false,
        lastProactiveNudgeAt: null,
        lastReminderAt: null,
        preferredTone: "witty",
        _simulated: true,
      };
    }

    // Apply overrides
    const originalEngagement = {
      ...(engagement.toObject ? engagement.toObject() : engagement),
    };

    if (overrides.forceNoMemoryToday) {
      engagement.memoryCreatedToday = false;
      sendEvent(
        res,
        "scheduler",
        "info",
        "Override: forceNoMemoryToday → memoryCreatedToday = false",
      );
    }
    if (overrides.forceStreakBroken) {
      engagement.memoryStreak = 0;
      engagement.lastMemoryDate = new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      );
      sendEvent(
        res,
        "scheduler",
        "info",
        "Override: forceStreakBroken → streak = 0, lastMemory = 5 days ago",
      );
    }
    if (overrides.forceDormant) {
      engagement.memoryStreak = 0;
      engagement.lastMemoryDate = null;
      engagement.lastProactiveNudgeAt = null;
      sendEvent(
        res,
        "scheduler",
        "info",
        "Override: forceDormant → zero activity signals!",
      );
    }
    if (overrides.forceNewUser) {
      engagement.signupDate = new Date();
      sendEvent(res, "scheduler", "info", "Override: forceNewUser → signupDate = now");
    } else if (overrides.cooldownBypass) {
      engagement.consecutiveNudgeIgnores = 0;
      engagement.lastProactiveNudgeAt = null;
      engagement.lastReminderAt = null;
      engagement.signupDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // fake 30 days ago
      sendEvent(
        res,
        "scheduler",
        "info",
        "Override: cooldownBypass → cleared all cooldowns + signupDate",
      );
    } else {
      // Ensure the user isn't accidentally caught by too_new if cooldownBypass is off
      // unless forceNewUser is explicitly ON
      engagement.signupDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Timezone check
    const tz =
      overrides.timezoneOverride || engagement.timezone || "Asia/Kolkata";
    const localHour =
      overrides.mockTimeHour != null
        ? overrides.mockTimeHour
        : getLocalHour(tz);
    const inWindow =
      localHour >= PROACTIVE_CONFIG.EVENING_WINDOW_START &&
      localHour < PROACTIVE_CONFIG.EVENING_WINDOW_END;

    sendEvent(
      res,
      "scheduler",
      "info",
      `Timezone: ${tz} | Local hour: ${localHour} | Evening window (${PROACTIVE_CONFIG.EVENING_WINDOW_START}-${PROACTIVE_CONFIG.EVENING_WINDOW_END}): ${inWindow ? "✅ YES" : "❌ NO"}`,
    );

    if (!inWindow && !overrides.skipEligibility) {
      sendEvent(
        res,
        "scheduler",
        "info",
        "User not in evening window — would normally skip. Proceeding anyway for debug.",
      );
    }

    sendEvent(
      res,
      "scheduler",
      "success",
      `Scheduler complete — user found, proceeding to rule engine`,
      {
        timezone: tz,
        localHour,
        inEveningWindow: inWindow,
        latencyMs: Date.now() - startTime,
      },
    );

    // ────────────────────────────────
    // STAGE 2: RULE ENGINE
    // ────────────────────────────────
    const ruleStart = Date.now();
    sendEvent(res, "rule_engine", "running", "Evaluating eligibility rules...");
    await sleep(150);

    // Run each rule explicitly for observability
    const rules = [];

    rules.push({
      name: "proactiveOptOut",
      value: engagement.proactiveOptOut,
      pass: !engagement.proactiveOptOut,
    });
    rules.push({
      name: "optedOut",
      value: engagement.optedOut,
      pass: !engagement.optedOut,
    });
    rules.push({
      name: "memoryCreatedToday",
      value: engagement.memoryCreatedToday,
      pass: !engagement.memoryCreatedToday,
    });

    const ignores = engagement.consecutiveNudgeIgnores || 0;
    rules.push({
      name: "consecutiveNudgeIgnores",
      value: ignores,
      threshold: PROACTIVE_CONFIG.CONSECUTIVE_IGNORE_THRESHOLD,
      pass: ignores < PROACTIVE_CONFIG.CONSECUTIVE_IGNORE_THRESHOLD,
    });

    for (const rule of rules) {
      sendEvent(
        res,
        "rule_engine",
        "info",
        `Rule [${rule.name}]: value=${JSON.stringify(rule.value)} → ${rule.pass ? "✅ PASS" : "❌ FAIL"}`,
      );
    }

    let eligibility;
    if (overrides.skipEligibility) {
      eligibility = { eligible: true, reason: "debug_skip_eligibility" };
      sendEvent(
        res,
        "rule_engine",
        "info",
        "Override: skipEligibility → forcing eligible=true",
      );
    } else {
      eligibility = checkEligibility(engagement);
    }

    // Check for existing pending nudge
    const hasPending = await hasPendingNudge(userId);
    sendEvent(
      res,
      "rule_engine",
      "info",
      `Pending nudge exists: ${hasPending ? "⚠️ YES" : "✅ NO"}`,
    );

    if (!eligibility.eligible && !overrides.skipEligibility) {
      sendEvent(
        res,
        "rule_engine",
        "failed",
        `User NOT eligible — reason: ${eligibility.reason}`,
        {
          eligibility,
          latencyMs: Date.now() - ruleStart,
        },
      );

      sendEvent(
        res,
        "message_creation",
        "skipped",
        "Skipped — user not eligible",
      );
      sendEvent(
        res,
        "dispatcher",
        "skipped",
        "Skipped — no message to dispatch",
      );
      sendEvent(
        res,
        "complete",
        "failed",
        `Pipeline stopped at rule engine: ${eligibility.reason}`,
        {
          totalLatencyMs: Date.now() - startTime,
        },
      );
      res.end();
      return;
    }

    sendEvent(
      res,
      "rule_engine",
      "success",
      `User IS eligible — reason: ${eligibility.reason}`,
      {
        eligibility,
        latencyMs: Date.now() - ruleStart,
      },
    );

    // ────────────────────────────────
    // STAGE 3: MESSAGE CREATION
    // ────────────────────────────────
    const msgStart = Date.now();
    sendEvent(
      res,
      "message_creation",
      "running",
      "Generating proactive message...",
    );
    await sleep(200);

    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayOfWeek = days[new Date().getDay()];

    const context = {
      memoryStreak: engagement.memoryStreak || 0,
      streakDays: engagement.memoryStreak || 0,
      dayOfWeek,
      lastMemoryDate: engagement.lastMemoryDate,
      recentMemoryThemes: [],
      previousStreakBroken:
        engagement.memoryStreak === 0 && !!engagement.lastMemoryDate,
    };

    sendEvent(
      res,
      "message_creation",
      "info",
      `Generation context: ${JSON.stringify(context)}`,
    );

    const { messageText, tone, title, templateKey } =
      await generateProactiveContent("memory_nudge", context, engagement);

    sendEvent(res, "message_creation", "info", `Template key: ${templateKey}`);
    sendEvent(res, "message_creation", "info", `Tone: ${tone}`);
    sendEvent(res, "message_creation", "info", `Title: ${title}`);

    // Calculate expiry
    const expiresAt = new Date(
      Date.now() + PROACTIVE_CONFIG.MESSAGE_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    // Create the ProactiveMessage (real DB write)
    const proactiveMsg = await ProactiveMessage.create({
      userId: engagement.userId,
      uid: engagement.uid || engagement.userId, // fallback for simulation
      messageText,
      messageType: "memory_nudge",
      tone,
      status: "generated",
      scheduledFor: new Date(),
      expiresAt,
      generationContext: {
        memoryStreak: context.memoryStreak,
        lastMemoryDate: context.lastMemoryDate,
        recentMemoryThemes: context.recentMemoryThemes,
        dayOfWeek,
        templateKey,
      },
      trigger: {
        source: "sere_scheduler",
        rule: "daily_memory_nudge_debug",
      },
      action: {
        navigateTo: "starmanChat",
        params: {},
      },
    });

    sendEvent(
      res,
      "message_creation",
      "success",
      `Message created and persisted`,
      {
        proactiveMessageId: proactiveMsg._id.toString(),
        messageText,
        tone,
        templateKey,
        expiresAt: expiresAt.toISOString(),
        latencyMs: Date.now() - msgStart,
      },
    );

    // ────────────────────────────────
    // STAGE 4: DISPATCHER
    // ────────────────────────────────
    const dispatchStart = Date.now();
    sendEvent(res, "dispatcher", "running", "Dispatching proactive message...");
    await sleep(200);

    if (overrides.injectStarmanFailure) {
      sendEvent(
        res,
        "dispatcher",
        "info",
        "🔧 Injected failure: Starman API call will fail",
      );
    }
    if (overrides.injectPushFailure) {
      sendEvent(
        res,
        "dispatcher",
        "info",
        "🔧 Injected failure: Push notification will fail",
      );
    }

    // In simulation mode, we don't actually call Starman/Universe endpoints
    // unless the user explicitly wants to via liveDispatch.
    if (overrides.liveDispatch) {
      sendEvent(res, "dispatcher", "info", `⚡ LIVE DISPATCH ENABLED: Sending actual API requests...`);
      try {
        await dispatchSingleMessage(proactiveMsg);
        sendEvent(
          res,
          "dispatcher",
          "success",
          "Dispatch complete — message actually delivered to Starman and Push",
          {
            sessionId: proactiveMsg.sessionId,
            pushDelivered: proactiveMsg.pushDelivered,
            latencyMs: Date.now() - dispatchStart,
          },
        );
      } catch (err) {
        sendEvent(
          res,
          "dispatcher",
          "failed",
          "Live dispatch failed: " + err.message,
          { latencyMs: Date.now() - dispatchStart },
        );
      }
    } else {
      sendEvent(res, "dispatcher", "info", `Push notification payload:`);
      sendEvent(
        res,
        "dispatcher",
        "info",
        JSON.stringify(
          {
            userId,
            title: "✨ Starman",
            body: messageText,
            data: {
              type: "starman_proactive",
              proactiveMessageId: proactiveMsg._id.toString(),
              messageType: "memory_nudge",
              navigateTo: "starmanChat",
            },
          },
          null,
          2,
        ),
      );

      if (overrides.injectStarmanFailure) {
        sendEvent(
          res,
          "dispatcher",
          "failed",
          "❌ Starman API call failed (injected failure)",
          {
            error: "SIMULATED_STARMAN_FAILURE",
            latencyMs: Date.now() - dispatchStart,
          },
        );
      } else if (overrides.injectPushFailure) {
        // Starman succeeds, push fails
        const mockSessionId = `proactive_debug_${Date.now()}`;
        proactiveMsg.sessionId = mockSessionId;
        proactiveMsg.status = "dispatched";
        proactiveMsg.dispatchedAt = new Date();
        proactiveMsg.pushDelivered = false;
        await proactiveMsg.save();

        sendEvent(
          res,
          "dispatcher",
          "info",
          `✅ Starman conversation created: ${mockSessionId}`,
        );
        sendEvent(
          res,
          "dispatcher",
          "info",
          `❌ Push notification failed (injected failure)`,
        );
        sendEvent(
          res,
          "dispatcher",
          "success",
          `Dispatch complete — push failed but message is in conversation`,
          {
            sessionId: mockSessionId,
            pushDelivered: false,
            latencyMs: Date.now() - dispatchStart,
          },
        );
      } else {
        // Simulate success
        const mockSessionId = `proactive_debug_${Date.now()}`;
        proactiveMsg.sessionId = mockSessionId;
        proactiveMsg.status = "dispatched";
        proactiveMsg.dispatchedAt = new Date();
        proactiveMsg.pushDelivered = true;
        await proactiveMsg.save();

        sendEvent(
          res,
          "dispatcher",
          "info",
          `✅ Starman conversation created: ${mockSessionId}`,
        );
        sendEvent(res, "dispatcher", "info", `✅ Push notification delivered`);
        sendEvent(
          res,
          "dispatcher",
          "success",
          "Dispatch complete — message delivered",
          {
            sessionId: mockSessionId,
            pushDelivered: true,
            latencyMs: Date.now() - dispatchStart,
          },
        );
      }
    }

    // ────────────────────────────────
    // PIPELINE COMPLETE
    // ────────────────────────────────
    sendEvent(
      res,
      "complete",
      "success",
      "✅ Full pipeline simulation complete",
      {
        totalLatencyMs: Date.now() - startTime,
        proactiveMessageId: proactiveMsg._id.toString(),
        messageText,
        tone,
        templateKey,
      },
    );
  } catch (error) {
    sendEvent(res, "error", "failed", `Pipeline error: ${error.message}`, {
      stack: error.stack,
      totalLatencyMs: Date.now() - startTime,
    });
  } finally {
    res.end();
  }
};

// ══════════════════════════════════════════════════
// ── Individual Stage Endpoints ──
// ══════════════════════════════════════════════════

/**
 * GET /sere/debug/user-engagement/:userId
 */
const getUserEngagement = async (req, res) => {
  try {
    const { userId } = req.params;
    const engagement = await UserEngagement.findOne({ userId }).lean();
    if (!engagement) {
      return res.status(404).json({ error: "UserEngagement not found." });
    }
    res.json(engagement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /sere/debug/proactive-messages/:userId
 */
const getProactiveMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await ProactiveMessage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /sere/debug/simulate/eligibility
 * Body: { userId, overrides }
 */
const simulateEligibility = async (req, res) => {
  try {
    const { userId, overrides = {} } = req.body;
    let engagement = await UserEngagement.findOne({ userId });

    if (!engagement) {
      return res.json({
        eligible: false,
        reason: "no_engagement_profile",
        engagement: null,
      });
    }

    // Apply overrides
    if (overrides.forceNoMemoryToday) engagement.memoryCreatedToday = false;
    if (overrides.cooldownBypass) {
      engagement.consecutiveNudgeIgnores = 0;
      engagement.lastProactiveNudgeAt = null;
      engagement.lastReminderAt = null;
    }
    if (overrides.skipEligibility) {
      return res.json({ eligible: true, reason: "debug_skip", engagement });
    }

    const result = checkEligibility(engagement);
    const hasPending = await hasPendingNudge(userId);

    res.json({ ...result, hasPendingNudge: hasPending, engagement });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /sere/debug/simulate/generate-message
 * Body: { userId, overrides }
 */
const simulateGenerateMessage = async (req, res) => {
  try {
    const { userId, overrides = {} } = req.body;
    let engagement = await UserEngagement.findOne({ userId });

    if (overrides.forceStreakBroken && engagement) {
      engagement.memoryStreak = 0;
      engagement.lastMemoryDate = new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      );
    }

    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const context = {
      memoryStreak: engagement?.memoryStreak || 0,
      streakDays: engagement?.memoryStreak || 0,
      dayOfWeek: days[new Date().getDay()],
      lastMemoryDate: engagement?.lastMemoryDate,
      recentMemoryThemes: [],
      previousStreakBroken:
        (engagement?.memoryStreak || 0) === 0 && !!engagement?.lastMemoryDate,
    };

    const result = await generateProactiveContent(
      "memory_nudge",
      context,
      engagement || {},
    );

    res.json({ ...result, context });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /sere/debug/replay/:proactiveMessageId
 * Re-runs the pipeline with the same context as a previous message.
 */
const replayMessage = async (req, res) => {
  try {
    const { proactiveMessageId } = req.params;
    const original = await ProactiveMessage.findById(proactiveMessageId).lean();
    if (!original) {
      return res.status(404).json({ error: "ProactiveMessage not found." });
    }

    // Regenerate with same context
    const context = {
      memoryStreak: original.generationContext?.memoryStreak || 0,
      streakDays: original.generationContext?.memoryStreak || 0,
      dayOfWeek: original.generationContext?.dayOfWeek || "Monday",
      lastMemoryDate: original.generationContext?.lastMemoryDate,
      recentMemoryThemes: original.generationContext?.recentMemoryThemes || [],
      previousStreakBroken: false,
    };

    const result = await generateProactiveContent("memory_nudge", context, {});

    res.json({
      original: {
        messageText: original.messageText,
        tone: original.tone,
        templateKey: original.generationContext?.templateKey,
        status: original.status,
        createdAt: original.createdAt,
      },
      regenerated: result,
      context,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /sere/debug/templates
 * Returns the full template bank for inspection.
 */
const getTemplates = (req, res) => {
  res.json(PROACTIVE_TEMPLATES);
};

/**
 * GET /sere/debug/config
 * Returns current PROACTIVE_CONFIG.
 */
const getConfig = (req, res) => {
  res.json(PROACTIVE_CONFIG);
};

/**
 * DELETE /sere/debug/proactive-messages/:userId
 * Clean up debug messages for a user.
 */
const cleanupDebugMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await ProactiveMessage.deleteMany({
      userId,
      "trigger.rule": "daily_memory_nudge_debug",
    });
    res.json({ deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  simulateFullPipeline,
  getUserEngagement,
  getProactiveMessages,
  simulateEligibility,
  simulateGenerateMessage,
  replayMessage,
  getTemplates,
  getConfig,
  cleanupDebugMessages,
};
