const { StatusCodes } = require("http-status-codes");
const Award = require("../models/award");
const Club = require("../models/club");
const User = require("../models/user");
const Ticket = require("../models/ticket");
const AwardInstance = require("../models/awardInstance");
const Memory = require("../models/memory");
const mongoose = require("mongoose");
const { generateCertificatePreview1 } = require("./certificateTemplates");
const { userData } = require("../demoData");
const { image } = require("pdfkit");
const { scheduleNotification2, sendMail } = require("./utils");

/**
 * @desc    Create a new Award (Certificate or Badge)
 * @route   POST /api/award/createAward
 * @access  Admin / Authorized
 */
const createAward = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { type, title, url, guideUrl, fields, price, oldPrice } = req.body;

    // Basic validation
    if (!type || !title || !url || !price) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: type, title, url, or price",
      });
    }

    // Validate award type
    if (!["certificate", "badge"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Must be either 'certificate' or 'badge'.",
      });
    }

    // Create the award
    const newAward = new Award({
      type,
      title,
      url,
      guideUrl,
      fields: fields || [],
      price,
      oldPrice,
    });

    const savedAward = await newAward.save();

    return res.status(201).json({
      success: true,
      message: "Award created successfully",
      data: savedAward,
    });
  } catch (error) {
    console.error("Error creating award:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating award",
      error: error.message,
    });
  }
};

/**
 * @desc    Update an existing Award
 * @route   PATCH /api/award/editAward/:id
 * @access  Admin / Authorized
 */
const updateAward = async (req, res) => {
  try {
    const { id } = req.query;

    // Ensure ID is provided
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Award ID is required",
      });
    }

    // Find the award
    const existingAward = await Award.findById(id);
    if (!existingAward) {
      return res.status(404).json({
        success: false,
        message: "Award not found",
      });
    }

    // Fields that can be updated
    const allowedUpdates = [
      "type",
      "title",
      "url",
      "guideUrl",
      "fields",
      "price",
      "oldPrice",
      "available",
    ];

    // Build update object from request body
    const updates = {};
    for (let key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // Apply updates
    Object.assign(existingAward, updates);
    const updatedAward = await existingAward.save();

    return res.status(200).json({
      success: true,
      message: "Award updated successfully",
      data: updatedAward,
    });
  } catch (error) {
    console.error("Error updating award:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating award",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all certificates
 * @route   GET /api/award/getCertificates
 * @access  Public / Admin
 */
const getAllAwards = async (req, res) => {
  try {
    const { clubId, type } = req.query;

    // Build dynamic query
    const query = {};
    if (type) query.type = type;

    // Fetch awards based on query
    let certificates = await Award.find(query).lean();

    if (!certificates || certificates.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No awards found",
      });
    }

    // If clubId is provided, attach available count per award
    if (clubId && mongoose.Types.ObjectId.isValid(clubId)) {
      const club = await Club.findById(clubId, { awards: 1 }).lean();
      if (!club) {
        return res.status(404).json({
          success: false,
          message: "Club not found",
        });
      }

      const clubAwards = club.awards || [];

      certificates = certificates.map((c) => {
        const matched = clubAwards.find(
          (a) => a.awardId?.toString() === c._id.toString()
        );
        if (matched) {
          return { ...c, available: matched.count || 0 };
        } else {
          return { ...c, available: 0 };
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: certificates,
    });
  } catch (error) {
    console.error("Error fetching awards:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching awards",
      error: error.message,
    });
  }
};

/**
 * @desc    Gnerate certificate preview
 * @route   post /api/award/generateCertificatePreview?awardId
 * @access  Public / Admin
 */
const generateCertificatePreview = async (req, res) => {
  try {
    const { awardId } = req.query;
    const { data } = req.body;

    if (!awardId || !data) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        msg: "awardId and data is required",
      });
    }

    // Step 1: Fetch the award template
    const award = await Award.findById(awardId).lean();
    if (!award) {
      return res.status(StatusCodes.NOT_FOUND).json({
        msg: "Award not found",
      });
    }

    // Step 2: Extract required fields from template
    const requiredFields = award.fields.filter((f) => f.required);

    // Step 3: Validate each required field
    const missingFields = [];

    for (let field of requiredFields) {
      if (
        data[field.id] === undefined ||
        data[field.id] === null ||
        data[field.id] === ""
      ) {
        missingFields.push({
          id: field.id,
          label: field.label,
        });
      }
    }

    // Step 4: If missing → return 400
    if (missingFields.length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        msg: "Required fields missing",
        missingFields,
      });
    }

    // Step 5: If everything valid → continue to preview generation
    let previewURL = "";
    if (award.title === "Imperial Crest") {
      const previewData = {
        name: "Marcelina Anderson",
        ...data,
      };
      previewURL = await generateCertificatePreview1(previewData);
    }

    return res.status(StatusCodes.OK).json({
      msg: "Certificate generated successfully!",
      previewURL: previewURL.url,
    });
  } catch (error) {
    console.log("generateCertificatePreview Error:", error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong",
    });
  }
};

/**
 * @desc    Dispatch certifcates or badges
 * @route   post /api/award/dispatchCertificates?awardId&clubId
 * @access  Public(permission) / Admin
 */
const dispatchCertificates = async (req, res) => {
  try {
    const { clubId, awardId } = req.query;
    const { event, profiles = [], formData } = req.body;

    if (!clubId || !awardId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "clubId and awardId are required" });
    }

    // Fetch club info
    const clubData = await Club.findById(clubId, {
      name: 1,
      permissions: 1,
      awards: 1,
    });

    if (!clubData) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: "Club not found" });
    }

    // Authorization
    const isAuthorized = clubData?.permissions?.whoCanDispatchAwards?.includes(
      req.user.id
    );

    if (!isAuthorized) {
      return res.status(StatusCodes.FORBIDDEN).json({
        msg: "You are not authorized to dispatch certificates in this club.",
      });
    }

    // Locate the award entry
    const pickedAward = clubData.awards.find(
      (a) => a.awardId.toString() === awardId
    );

    const availableCount = pickedAward?.count ?? 0;

    // Count recipients
    let receiversCount = profiles.length;

    let eventProfiles = [];

    if (event?.eventId && event.ticketTypes) {
      const ticketTypes = event.ticketTypes.map((t) =>
        typeof t === "string" ? t : t.type
      );

      const tickets = await Ticket.find({
        eventId: new mongoose.Types.ObjectId(event.eventId),
        type: { $in: ticketTypes },
      }).lean();

      receiversCount += tickets.length;
      eventProfiles = tickets.map((t) => ({ _id: t.boughtBy }));
    }

    if (receiversCount > availableCount) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "Insufficient certificates available." });
    }

    //  Update the award count
    await Club.updateOne(
      { _id: clubId, "awards.awardId": awardId },
      {
        $inc: { "awards.$.count": -receiversCount },
      }
    );

    //  Dispatch
    dispatchCertifcateToProfiles({
      awardId,
      formData,
      profiles: [...eventProfiles, ...profiles],
      dispatcherMetaData: {
        name: clubData.name,
        userId: req.user.id,
        orgId: clubId,
      },
    });

    return res.status(StatusCodes.OK).json({
      msg: "Certificates dispatched successfully.",
    });
  } catch (error) {
    console.error("dispatchCertificates Error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong" });
  }
};

// helper function to dispatch certifcates to profiles
async function dispatchCertifcateToProfiles({
  awardId,
  formData,
  profiles,
  dispatcherMetaData,
}) {
  try {
    if (!awardId || !formData) {
      console.log("Award id or form data missing");
      return;
    }
    const award = await Award.findById(awardId).lean();
    if (!award) {
      console.log("Award not found.");
      return;
    }
    const requiredFields = award.fields.filter((f) => f.required);

    const missingFields = [];

    for (let field of requiredFields) {
      if (
        formData[field.id] === undefined ||
        formData[field.id] === null ||
        formData[field.id] === ""
      ) {
        missingFields.push({
          id: field.id,
          label: field.label,
        });
      }
    }

    if (missingFields.length > 0) {
      console.log("Missing fields inn form data.");
      return;
    }

    for (const profile of profiles) {
      const userData = await User.findById(profile._id, {
        fullName: 1,
        name: 1,
        email: 1,
        unreadNotice: 1,
        memoryRequests: 1,
        pushToken: 1,
        image: 1,
      });
      let previewURL = "";
      if (award.title === "Imperial Crest") {
        const previewData = {
          name: userData.fullName || userData.name,
          ...formData,
        };
        previewURL = await generateCertificatePreview1(previewData);
      }
      const awardInstance = await AwardInstance.create({
        awardId,
        dispatchedTo: userData._id,
        dispatcherType: "club",
        previewURL: previewURL.url,
        formData,
        dispatcherMetaData,
      });
      const memory = await Memory.create({
        createdBy: userData._id,
        type: "a_event",
        title: formData?.title,
        caption: formData?.description,
        certificate: previewURL.url,
        uploadEnabled: true,
        creatorMetaData: { name: userData.name, image: userData.image },
        awardId: awardInstance._id,
      });
      secondaryActionsForCertifcates({ memory, userData });
    }
  } catch (error) {
    console.log(error);
  }
}

async function secondaryActionsForCertifcates({ memory, userData }) {
  try {
    // In-app notification
    const notice = {
      value: `A certificate was added to your memory lane.`,
      img1: memory?.creatorMetaData?.image,
      img2: memory.certificate,
      action: "memoryExpand",
      key: "certificate",
      params: { memoryId: memory._id },
      uid: `memory_${memory._id}_certificate`,
      createdAt: new Date(),
    };

    // Ensure unreadNotice array exists
    if (!Array.isArray(userData.unreadNotice)) {
      userData.unreadNotice = [];
    }
    userData.unreadNotice.push(notice);
    await userData.save();

    // Fire-and-forget background actions
    if (userData.pushToken) {
      scheduleNotification2({
        pushToken: [userData.pushToken],
        title: `A certificate was added to your memory lane.`,
        body: memory?.caption || "Tap to view.",
        image: memory.certificate,
        url: `https://macbease.com/app/memory/${memory._id}`,
      });
    }

    if (userData.email) {
      sendMail(
        userData.name,
        [
          `A certificate was added to your memory lane.`,
          memory?.caption || "Tap to view.",
        ],
        `For any queries please mail on support@macbease.com.`,
        "Macbease Certificate",
        [userData.email],
        {
          instructions: "Click below to view your certificate:",
          text: "View Certificate",
          url: `https://macbease.com/app/memory/${memory._id}`,
          color: "#1ea1ed",
        }
      )
        .then(({ ses, params }) => {
          ses.sendEmail(params, (err) => {
            if (err) console.log("SES send error:", err);
          });
        })
        .catch((err) => console.log("Mail send failed:", err));
    }
  } catch (error) {
    console.log("Error in handling secondary actions", error);
  }
}

module.exports = {
  createAward,
  updateAward,
  getAllAwards,
  generateCertificatePreview,
  dispatchCertificates,
};
