/**
 * Scheduler — cron-based reminder delivery and maintenance.
 *
 * Runs on a configurable interval (default: every 5 minutes).
 *
 * Jobs:
 * 1. Deliver due reminders (status=scheduled, scheduledFor <= now)
 * 2. Expire stale reminders (expiresAt <= now)
 * 3. Run cron-based rules (onboarding, re-engagement)
 * 4. Reset daily counters at midnight
 * 5. Execute active campaigns
 */

const cron = require("node-cron");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const Reminder = require("../models/reminder");
const UserEngagement = require("../models/userEngagement");
const Campaign = require("../models/campaign");
const { runCronRules } = require("./rules");
const { generateCampaignContent } = require("./contentGenerator");

const UNIVERSE_URL =
  process.env.UNIVERSE_URL || "http://universe:5050/universe/api/v1";

function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "sere" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function internalHeaders() {
  return { Authorization: `Bearer ${getInternalToken()}` };
}

// ── Delivery ──

/**
 * Deliver a single reminder via push notification.
 * Calls universe service's internal push endpoint.
 */
async function deliverPush(reminder) {
  try {
    await axios.post(
      `${UNIVERSE_URL}/push/send`,
      {
        userId: reminder.userId.toString(),
        title: reminder.title,
        body: reminder.body,
        data: {
          type: "sere_reminder",
          reminderId: reminder._id.toString(),
          action: reminder.action || {},
        },
      },
      { headers: internalHeaders() },
    );

    reminder.status = "delivered";
    reminder.deliveredAt = new Date();
    await reminder.save();

    console.log(`📤 SERE: delivered push reminder ${reminder._id}`);
  } catch (error) {
    console.error(
      `❌ SERE: push delivery failed for ${reminder._id}:`,
      error.message,
    );
    // Don't change status — will retry next cycle
  }
}

/**
 * Deliver a single in-app reminder (just update status).
 * Client polls GET /reminders to pick these up.
 */
async function deliverInApp(reminder) {
  reminder.status = "delivered";
  reminder.deliveredAt = new Date();
  await reminder.save();
  console.log(`📬 SERE: delivered in-app reminder ${reminder._id}`);
}

// ── Scheduled Jobs ──

/**
 * Job 1: Deliver due reminders.
 */
async function deliverDueReminders() {
  const now = new Date();

  const dueReminders = await Reminder.find({
    status: "scheduled",
    scheduledFor: { $lte: now },
  }).limit(100);

  if (dueReminders.length === 0) return;

  console.log(`🚀 SERE: delivering ${dueReminders.length} due reminders...`);

  for (const reminder of dueReminders) {
    switch (reminder.channel) {
      case "push":
        await deliverPush(reminder);
        break;
      case "in_app":
      case "chat_nudge":
        await deliverInApp(reminder);
        break;
      default:
        await deliverInApp(reminder);
    }
  }
}

/**
 * Job 2: Expire stale reminders.
 */
async function expireStaleReminders() {
  const now = new Date();

  const result = await Reminder.updateMany(
    {
      expiresAt: { $lte: now },
      status: { $in: ["pending", "scheduled", "delivered"] },
    },
    { $set: { status: "expired" } },
  );

  if (result.modifiedCount > 0) {
    console.log(`🗑️ SERE: expired ${result.modifiedCount} stale reminders`);
  }
}

/**
 * Job 3: Execute active campaigns.
 * Finds users matching campaign targeting and creates reminders.
 */
async function executeCampaigns() {
  const now = new Date();

  const activeCampaigns = await Campaign.find({
    status: "active",
    startDate: { $lte: now },
    $or: [{ endDate: null }, { endDate: { $gte: now } }],
  });

  for (const campaign of activeCampaigns) {
    // Check frequency — should we run this campaign now?
    if (campaign.lastExecutedAt) {
      const elapsed = now - campaign.lastExecutedAt;
      if (campaign.frequency === "daily" && elapsed < 23 * 60 * 60 * 1000) continue;
      if (campaign.frequency === "weekly" && elapsed < 6.5 * 24 * 60 * 60 * 1000) continue;
      if (campaign.frequency === "once") continue; // Already ran
    }

    // Build targeting query
    const query = { optedOut: { $ne: true } };
    const targeting = campaign.targeting || {};

    if (targeting.lifecycleStages?.length > 0) {
      query.lifecycleStage = { $in: targeting.lifecycleStages };
    }
    if (targeting.universeIds?.length > 0) {
      query.uid = { $in: targeting.universeIds };
    }

    const targetUsers = await UserEngagement.find(query).limit(200);

    let sent = 0;
    for (const engagement of targetUsers) {
      // Check if already received this campaign
      const alreadySent = await Reminder.findOne({
        userId: engagement.userId,
        "trigger.ref": campaign._id.toString(),
        status: { $in: ["scheduled", "delivered", "clicked"] },
      });
      if (alreadySent) continue;

      const content = generateCampaignContent(campaign, {
        name: engagement.universeMetaData?.name || "Astronaut",
        callSign: engagement.universeMetaData?.callSign || "",
      });

      await Reminder.create({
        userId: engagement.userId,
        uid: engagement.uid,
        type: "campaign",
        ...content,
        channel: "push",
        status: "scheduled",
        scheduledFor: now,
        expiresAt: campaign.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        trigger: {
          source: "admin",
          ref: campaign._id.toString(),
          rule: "campaign_match",
        },
        action: campaign.action || {},
        universeMetaData: engagement.universeMetaData,
      });

      sent++;
    }

    // Update campaign metrics
    campaign.totalSent += sent;
    campaign.lastExecutedAt = now;
    if (campaign.frequency === "once") {
      campaign.status = "completed";
    }
    await campaign.save();

    if (sent > 0) {
      console.log(`📢 SERE: campaign "${campaign.name}" → ${sent} reminders created`);
    }
  }
}

/**
 * Job 4: Reset daily counters (runs at midnight).
 */
async function resetDailyCounters() {
  const result = await UserEngagement.updateMany(
    { remindersSentToday: { $gt: 0 } },
    { $set: { remindersSentToday: 0 } },
  );
  console.log(`🔄 SERE: reset daily counters for ${result.modifiedCount} users`);
}

// ── Cron Setup ──

function startScheduler() {
  // Every 5 minutes: deliver, expire, campaigns
  cron.schedule("*/5 * * * *", async () => {
    console.log("⏰ SERE scheduler tick");
    try {
      await deliverDueReminders();
      await expireStaleReminders();
      await executeCampaigns();
    } catch (error) {
      console.error("❌ SERE scheduler error:", error);
    }
  });

  // Every 2 hours: run cron-based rules (onboarding, re-engagement)
  cron.schedule("0 */2 * * *", async () => {
    try {
      await runCronRules();
    } catch (error) {
      console.error("❌ SERE cron rules error:", error);
    }
  });

  // Midnight: reset daily counters
  cron.schedule("0 0 * * *", async () => {
    try {
      await resetDailyCounters();
    } catch (error) {
      console.error("❌ SERE daily reset error:", error);
    }
  });

  console.log("⏰ SERE scheduler started");
}

module.exports = { startScheduler };
