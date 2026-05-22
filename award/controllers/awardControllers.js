const { StatusCodes } = require("http-status-codes");
const Award = require("../models/award");
const AwardInstance = require("../models/awardInstance");
const mongoose = require("mongoose");
const { generateCertificatePreview1,
        generateCertificatePreview2,
        generateCertificatePreview3,
        generateCertificatePreview4,
        generateCertificatePreview5, } = require("./certificateTemplates");
const { scheduleNotification2, sendMail } = require("./utils");
const { fetchClubData, fetchUserData, updateClubAwardCount, pushNoticeToUser, fetchTicketFieldsByQuery } = require("./interServiceCalls");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");

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

    // If clubId is provided, attach available count per award via inter-service call
    if (clubId && mongoose.Types.ObjectId.isValid(clubId)) {
      const club = await fetchClubData(clubId, ["awards"]);
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
 * @desc    Generate certificate preview
 * @route   POST /api/award/generateCertificatePreview?awardId
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
    const previewData = {
      name: "Marcelina Anderson",
      ...data,
    };
    if (award.title === "Imperial Crest") {
      previewURL = await generateCertificatePreview1(previewData);
    } else if (award.title === "Luna Minimal") {
      previewURL = await generateCertificatePreview2(previewData);
    } else if (award.title === "Golden Grace") {
      previewURL = await generateCertificatePreview3(previewData);
    } else if (award.title === "Crown of Merit") {
      previewURL = await generateCertificatePreview4(previewData);
    } else if (award.title === "The Abstract Frame") {
      previewURL = await generateCertificatePreview5(previewData);
    }

    return res.status(StatusCodes.OK).json({
      msg: "Certificate generated successfully!",
      previewURL: previewURL?.jpegUrl || "",
    });
  } catch (error) {
    console.log("generateCertificatePreview Error:", error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong",
    });
  }
};

/**
 * @desc    Dispatch certificates or badges
 * @route   POST /api/award/dispatchCertificates?awardId&clubId
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

    // Fetch club info via inter-service call
    const clubData = await fetchClubData(clubId, ["name", "permissions", "awards"]);

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

    console.log("dispatchCertificates -> initial event object:", event);
    console.log("dispatchCertificates -> initial profiles count:", profiles.length);

    if (event?.eventId) {
      let searchBy = null;

      if (event.ticketTypes && event.ticketTypes.length > 0) {
        const ticketTypes = event.ticketTypes.map((t) =>
          typeof t === "string" ? t : t.type
        );
        searchBy = {
          eventId: new mongoose.Types.ObjectId(event.eventId),
          type: { $in: ticketTypes },
        };
      } else if (event.bookedBy && event.bookedBy.length > 0) {
        searchBy = {
          _id: { $in: event.bookedBy },
        };
      } else {
        // Fallback: If no specific ticketTypes or bookedBy IDs are provided,
        // fetch all tickets for this event.
        searchBy = {
          eventId: new mongoose.Types.ObjectId(event.eventId),
        };
      }

      if (searchBy) {
        console.log("dispatchCertificates -> searchBy query for tickets:", searchBy);
        
        const tickets = await fetchTicketFieldsByQuery({
          searchBy,
          fields: ["boughtBy"],
        });

        console.log("dispatchCertificates -> fetched tickets from ticket service:", tickets?.length ? tickets : "No tickets found");

        if (tickets) {
          receiversCount += tickets.length;
          eventProfiles = tickets.map((t) => ({ _id: t.boughtBy }));
        }
      }
    }
    
    console.log("dispatchCertificates -> final receiversCount:", receiversCount, " | availableCount:", availableCount);

    if (receiversCount > availableCount) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "Insufficient certificates available." });
    }

    // Update the award count via inter-service call
    await updateClubAwardCount(clubId, awardId, -receiversCount);

    // Dispatch
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

// helper function to dispatch certificates to profiles
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
      console.log("Missing fields in form data.");
      return;
    }

    for (const profile of profiles) {
      // Fetch user data via inter-service call
      const userData = await fetchUserData(profile._id, [
        "fullName",
        "name",
        "email",
        "unreadNotice",
        "memoryRequests",
        "pushToken",
        "image",
      ]);

      if (!userData) {
        console.log(`User not found for profile ${profile._id}`);
        continue;
      }

      let previewURL = "";
      const previewData = {
        name: userData.fullName || userData.name,
        ...formData,
      };
      if (award.title === "Imperial Crest") {
        previewURL = await generateCertificatePreview1(previewData);
      } else if (award.title === "Luna Minimal") {
        previewURL = await generateCertificatePreview2(previewData);
      } else if (award.title === "Golden Grace") {
        previewURL = await generateCertificatePreview3(previewData);
      } else if (award.title === "Crown of Merit") {
        previewURL = await generateCertificatePreview4(previewData);
      } else if (award.title === "The Abstract Frame") {
        previewURL = await generateCertificatePreview5(previewData);
      }
      const awardInstance = await AwardInstance.create({
        awardId,
        dispatchedTo: userData._id,
        dispatcherType: "club",
        previewURL: previewURL?.jpegUrl || "",
        formData,
        dispatcherMetaData,
      });
      const memoryData = {
        createdBy: userData._id,
        type: "a_event",
        title: formData?.title,
        caption: formData?.description,
        certificate: previewURL?.jpegUrl || "",
        uploadEnabled: true,
        creatorMetaData: { name: userData.name, image: userData.image },
        awardId: awardInstance._id,
      };
      await sendKafkaMessage("CREATE_MEMORY","memory",{memoryData});
      secondaryActionsForCertifcates({ memoryData, userData });
    }
  } catch (error) {
    console.log(error);
  }
}

async function secondaryActionsForCertifcates({ memoryData, userData }) {
  try {
    // In-app notification via inter-service call
    const notice = {
      value: `A certificate was added to your memory lane.`,
      img1: memoryData?.creatorMetaData?.image,
      img2: memoryData.certificate,
      action: "memoryExpand",
      key: "certificate",
      params: { memoryId: memoryData._id },
      uid: `memory_${memoryData._id}_certificate`,
      createdAt: new Date(),
    };

    await pushNoticeToUser(userData._id, notice);

    // Fire-and-forget background actions
    if (userData.pushToken) {
      scheduleNotification2({
        pushToken: [userData.pushToken],
        title: `A certificate was added to your memory lane.`,
        body: memoryData?.caption || "Tap to view.",
        image: memoryData.certificate,
        url: `https://macbease.com/app/memory/${memoryData._id}`,
      });
    }

    if (userData.email) {
      sendMail(
        userData.name,
        [
          `A certificate was added to your memory lane.`,
          memoryData?.caption || "Tap to view.",
        ],
        `For any queries please mail on support@macbease.com.`,
        "Macbease Certificate",
        [userData.email],
        {
          instructions: "Click below to view your certificate:",
          text: "View Certificate",
          url: `https://macbease.com/app/memory/${memoryData._id}`,
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

/**
 * @desc    Get award by ID (internal service endpoint)
 * @route   POST /api/award/getAwardById
 * @access  Internal services only
 */
const getAwardById = async (req, res) => {
  try {
    const { awardId, fields } = req.body;

    if (!awardId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        msg: "awardId is required",
      });
    }

    // Build projection from fields array
    let projection = {};
    if (Array.isArray(fields) && fields.length > 0) {
      fields.forEach((f) => { projection[f] = 1; });
    }

    const award = await Award.findById(awardId, projection).lean();
    if (!award) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        msg: "Award not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: award,
    });
  } catch (error) {
    console.error("getAwardById Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      msg: "Something went wrong",
    });
  }
};

module.exports = {
  createAward,
  updateAward,
  getAllAwards,
  generateCertificatePreview,
  dispatchCertificates,
  getAwardById,
};
