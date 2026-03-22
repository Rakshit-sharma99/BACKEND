/**
 * Campaign Controller — Admin-only CRUD for reminder campaigns.
 *
 * Endpoints:
 *   POST  /campaigns          – create a campaign
 *   GET   /campaigns          – list campaigns
 *   PATCH /campaigns/:id      – update/pause/resume a campaign
 *   GET   /campaigns/:id/metrics – get campaign performance
 */

const Campaign = require("../models/campaign");
const Reminder = require("../models/reminder");

/**
 * POST /sere/api/v1/campaigns
 * Body: { name, titleTemplate, bodyTemplate, tone, targeting, startDate, endDate, frequency, action }
 */
const createCampaign = async (req, res) => {
  try {
    const user = req.user;

    const {
      name,
      titleTemplate,
      bodyTemplate,
      tone,
      targeting,
      startDate,
      endDate,
      frequency,
      action,
      uid,
    } = req.body;

    if (!name || !titleTemplate || !bodyTemplate) {
      return res
        .status(400)
        .json({ error: "name, titleTemplate, and bodyTemplate are required." });
    }

    const campaign = await Campaign.create({
      name,
      createdBy: user.id,
      uid: uid || user.uid,
      status: "draft",
      titleTemplate,
      bodyTemplate,
      tone: tone || "witty",
      targeting: targeting || {},
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      frequency: frequency || "once",
      action: action || {},
    });

    return res.status(201).json({
      success: true,
      message: `Campaign "${name}" created! Set status to "active" to start delivery.`,
      campaign,
    });
  } catch (error) {
    console.error("createCampaign error:", error);
    return res.status(500).json({ error: "Could not create campaign." });
  }
};

/**
 * GET /sere/api/v1/campaigns
 * Query: ?status=active&uid=xxx
 */
const getCampaigns = async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.uid) query.uid = req.query.uid;

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({ campaigns, count: campaigns.length });
  } catch (error) {
    console.error("getCampaigns error:", error);
    return res.status(500).json({ error: "Could not fetch campaigns." });
  }
};

/**
 * PATCH /sere/api/v1/campaigns/:id
 * Body: any campaign fields to update
 */
const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Prevent updating protected fields
    delete updates._id;
    delete updates.createdBy;
    delete updates.totalSent;
    delete updates.totalClicked;
    delete updates.totalDismissed;

    const campaign = await Campaign.findByIdAndUpdate(id, { $set: updates }, {
      new: true,
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    return res.status(200).json({
      success: true,
      message: `Campaign "${campaign.name}" updated.`,
      campaign,
    });
  } catch (error) {
    console.error("updateCampaign error:", error);
    return res.status(500).json({ error: "Could not update campaign." });
  }
};

/**
 * GET /sere/api/v1/campaigns/:id/metrics
 */
const getCampaignMetrics = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findById(id).lean();
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    // Get reminder-level breakdown
    const reminderStats = await Reminder.aggregate([
      { $match: { "trigger.ref": id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusBreakdown = {};
    for (const stat of reminderStats) {
      statusBreakdown[stat._id] = stat.count;
    }

    // Compute conversion rate
    const total = campaign.totalSent || 1;
    const conversionRate = campaign.totalClicked / total;

    return res.status(200).json({
      campaign: {
        name: campaign.name,
        status: campaign.status,
        frequency: campaign.frequency,
      },
      metrics: {
        totalSent: campaign.totalSent,
        totalClicked: campaign.totalClicked,
        totalDismissed: campaign.totalDismissed,
        conversionRate: Math.round(conversionRate * 100) / 100,
        statusBreakdown,
      },
    });
  } catch (error) {
    console.error("getCampaignMetrics error:", error);
    return res.status(500).json({ error: "Could not fetch metrics." });
  }
};

module.exports = {
  createCampaign,
  getCampaigns,
  updateCampaign,
  getCampaignMetrics,
};
