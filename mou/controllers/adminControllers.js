const MOU = require("../models/mou");
const { StatusCodes } = require("http-status-codes");
const docusign = require("../config/docusign");
const axios = require("axios");
const jwt = require("jsonwebtoken");

// GET /mou/api/v1/admin/pending
const getPendingMOUs = async (req, res) => {
  console.log("➡️  [ADMIN API] GET /admin/pending called");
  try {
    // Ideally filter by universityId if admin is scoped
    const mous = await MOU.find({ status: { $in: ["draft", "ready"] } }).sort({
      createdAt: -1,
    });
    console.log(`✅  [ADMIN API] Found ${mous.length} pending MOUs`);
    res.status(StatusCodes.OK).json({ success: true, mous });
  } catch (error) {
    console.error("Error fetching pending MOUs", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

// PATCH /mou/api/v1/admin/:mouId/parameters
const setMOUParameters = async (req, res) => {
  const { mouId } = req.params;
  console.log(
    `➡️  [ADMIN API] PATCH /admin/${mouId}/parameters called with body:`,
    req.body,
  );
  try {
    const {
      commissionRate,
      platformFee,
      paymentTerms,
      cancellationPolicy,
      liabilityClause,
      customClauses,
      custom,
    } = req.body;

    const mou = await MOU.findById(mouId);
    if (!mou) {
      console.warn(`⚠️  [ADMIN API] MOU not found: ${mouId}`);
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "MOU not found" });
    }

    if (mou.status === "signed" || mou.status === "voided") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({
          success: false,
          error: `Cannot modify MOU in ${mou.status} state`,
        });
    }

    mou.parameters = {
      ...mou.parameters,
      ...(commissionRate !== undefined && { commissionRate }),
      ...(platformFee !== undefined && { platformFee }),
      ...(paymentTerms !== undefined && { paymentTerms }),
      ...(cancellationPolicy !== undefined && { cancellationPolicy }),
      ...(liabilityClause !== undefined && { liabilityClause }),
      ...(customClauses !== undefined && { customClauses }),
      ...(custom !== undefined && { custom }),
    };

    mou.status = "ready";
    mou.history.push({
      action: "parameters_set",
      actor: req.user.id,
      actorRole: "admin",
      timestamp: new Date(),
    });

    await mou.save();

    console.log(
      `✅  [ADMIN API] Parameters set for MOU ${mouId}, status updated to 'ready'`,
    );
    res.status(StatusCodes.OK).json({ success: true, status: "ready", mou });
  } catch (error) {
    console.error("Error setting MOU parameters", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

// POST /mou/api/v1/admin/:mouId/send
const sendMOU = async (req, res) => {
  const { mouId } = req.params;
  console.log(`➡️  [ADMIN API] POST /admin/${mouId}/send called`);
  try {
    const mou = await MOU.findById(mouId);

    if (!mou) {
      console.warn(`⚠️  [ADMIN API] MOU not found: ${mouId}`);
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "MOU not found" });
    }

    const sendableStatuses = ["ready", "sent", "viewed"];
    if (!sendableStatuses.includes(mou.status)) {
      console.warn(
        `⚠️  [ADMIN API] Cannot send MOU ${mouId}, current status is ${mou.status}`,
      );
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({
          success: false,
          error: `MOU must be in ready/sent/viewed state to send (current: ${mou.status})`,
        });
    }

    // Fetch the creator's real name and email from the Universe service
    let realCreatorName = mou.creatorName;
    let realCreatorEmail = mou.creatorEmail;

    try {
      const internalToken = jwt.sign(
        { role: "internal", service: "mou" },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "5m" },
      );
      const userRes = await axios.post(
        "http://universe:5050/universe/api/v1/user/getUserFieldsById",
        { id: mou.creatorId.toString(), fields: ["name", "fullName", "email"] },
        { headers: { Authorization: `Bearer ${internalToken}` } },
      );

      if (userRes.data?.data) {
        const d = userRes.data.data;
        const fName = d.fullName || "";
        const uName = d.name || "";

        let combinedName = "";
        if (fName && uName && fName !== uName) {
          combinedName = `${fName} (${uName})`;
        } else {
          combinedName = fName || uName;
        }

        if (combinedName) realCreatorName = combinedName;
        if (d.email) realCreatorEmail = d.email;

        // Save back to MOU for future use
        mou.creatorName = realCreatorName;
        mou.creatorEmail = realCreatorEmail;
        await mou.save();
      }
    } catch (err) {
      console.error(
        "⚠️ [ADMIN API] Failed to fetch creator details from Universe service:",
        err.message,
      );
    }

    // Debug: log MOU data before building tabValues
    console.log("🔍 [ADMIN API] MOU data for tab values:");
    console.log("   eventName:", mou.eventName);
    console.log("   clubName:", mou.clubName);
    console.log("   creatorName:", realCreatorName);
    console.log("   creatorEmail:", realCreatorEmail);
    console.log("   parameters:", JSON.stringify(mou.parameters, null, 2));

    // Prepare tab values for DocuSign — all known fields pre-filled and locked
    const tabValues = {
      event_name: mou.eventName,
      club_name: mou.clubName,
      commission_rate: String(mou.parameters.commissionRate),
      platform_fee: String(mou.parameters.platformFee),
      payment_terms: mou.parameters.paymentTerms,
      cancellation_policy: mou.parameters.cancellationPolicy,
      event_creator: realCreatorName,
      signing_date: new Date().toLocaleDateString("en-IN"),
      macbease_signatory: "Macbease",
    };

    console.log(
      "🔍 [ADMIN API] Final tabValues:",
      JSON.stringify(tabValues, null, 2),
    );
    console.log(
      `⏳  [ADMIN API] Calling DocuSign to create envelope for MOU ${mouId}...`,
    );
    const envelopeId = await docusign.createEnvelope({
      signerEmail: realCreatorEmail || "dummy@example.com", // Fallback if still empty
      signerName: realCreatorName || "Event Creator",
      clientUserId: mou.creatorId.toString(),
      tabValues,
    });
    console.log(
      `✅  [ADMIN API] DocuSign envelope created successfully: ${envelopeId}`,
    );

    mou.docusign.envelopeId = envelopeId;
    mou.docusign.templateId = process.env.DOCUSIGN_TEMPLATE_ID;
    mou.status = "sent";
    mou.sentAt = new Date();
    // set expiry? mou.expiresAt = ...
    mou.history.push({
      action: "sent",
      actor: req.user.id,
      actorRole: "admin",
      timestamp: new Date(),
      metadata: { envelopeId },
    });

    await mou.save();

    console.log(`✅  [ADMIN API] MOU ${mouId} marked as sent!`);
    // TODO: Send push notification to creator

    res
      .status(StatusCodes.OK)
      .json({ success: true, status: "sent", envelopeId });
  } catch (error) {
    console.error("Error sending MOU", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

// POST /mou/api/v1/admin/:mouId/void
const voidMOU = async (req, res) => {
  try {
    const { mouId } = req.params;
    const { reason } = req.body;
    const mou = await MOU.findById(mouId);

    if (!mou) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "MOU not found" });
    }

    if (mou.docusign && mou.docusign.envelopeId) {
      await docusign.voidEnvelope(mou.docusign.envelopeId, reason);
    }

    mou.status = "voided";
    mou.history.push({
      action: "voided",
      actor: req.user.id,
      actorRole: "admin",
      timestamp: new Date(),
      metadata: { reason },
    });

    await mou.save();

    res.status(StatusCodes.OK).json({ success: true, status: "voided" });
  } catch (error) {
    console.error("Error voiding MOU", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

// POST /mou/api/v1/internal/draft
const createMOUDraft = async (req, res) => {
  console.log(
    "➡️  [INTERNAL API] POST /internal/draft called with body:",
    req.body,
  );
  try {
    const {
      eventId,
      clubId,
      creatorId,
      eventName,
      clubName,
      creatorName,
      creatorEmail,
      universityId,
    } = req.body;

    const existingMou = await MOU.findOne({ eventId });
    if (existingMou) {
      console.warn(
        `⚠️  [INTERNAL API] MOU already exists for event ${eventId}`,
      );
      return res
        .status(StatusCodes.OK)
        .json({ success: true, mou: existingMou });
    }

    const newMou = await MOU.create({
      eventId,
      clubId,
      creatorId,
      universityId,
      eventName,
      clubName,
      creatorName,
      creatorEmail,
      status: "draft",
      history: [
        {
          action: "created",
          actorRole: "system",
          timestamp: new Date(),
        },
      ],
    });

    console.log(
      `✅  [INTERNAL API] MOU Draft created successfully for event ${eventId} -> MOU ID: ${newMou._id}`,
    );
    res.status(StatusCodes.CREATED).json({ success: true, mou: newMou });
  } catch (error) {
    console.error("❌ [INTERNAL API] Error creating MOU draft:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

module.exports = {
  getPendingMOUs,
  setMOUParameters,
  sendMOU,
  voidMOU,
  createMOUDraft,
};
