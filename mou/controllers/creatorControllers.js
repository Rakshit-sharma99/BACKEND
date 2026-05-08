const MOU = require("../models/mou");
const { StatusCodes } = require("http-status-codes");
const docusign = require("../config/docusign");
const { getPresignedUrl } = require("../config/s3");
const mongoose = require("mongoose");

// GET /mou/api/v1/event/:eventId
const getMOUByEventId = async (req, res) => {
  try {
    const { eventId } = req.params;
    const mou = await MOU.findOne({ eventId });

    if (!mou) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "MOU not found" });
    }

    // Only allow creator to view their MOU
    // Assuming req.user.id is the creator's user ID. Need to handle internal/admin access if needed.
    if (mou.creatorId.toString() !== req.user.id.toString()) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, error: "Not authorized to view this MOU" });
    }

    // Hide draft/ready MOUs from creator
    if (mou.status === "draft" || mou.status === "ready") {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "MOU not sent yet" });
    }

    // Optional: Log 'viewed' status
    if (mou.status === "sent") {
      mou.status = "viewed";
      mou.history.push({
        action: "viewed",
        actor: req.user.id,
        actorRole: "creator",
        timestamp: new Date(),
      });
      await mou.save();
    }

    res.status(StatusCodes.OK).json({ success: true, mou });
  } catch (error) {
    console.error("Error fetching MOU by eventId", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

// POST /mou/api/v1/:mouId/signing-url
const generateSigningUrl = async (req, res) => {
  try {
    const { mouId } = req.params;
    const { returnUrl } = req.body;

    const mou = await MOU.findById(mouId);
    if (!mou) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "MOU not found" });
    }

    if (mou.creatorId.toString() !== req.user.id.toString()) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, error: "Not authorized to sign this MOU" });
    }

    if (!mou.docusign || !mou.docusign.envelopeId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, error: "Envelope not created yet" });
    }

    if (mou.status === "signed") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, error: "MOU is already signed" });
    }

    const signingUrl = await docusign.getSigningUrl(mou.docusign.envelopeId, {
      signerEmail: mou.creatorEmail || "dummy@example.com",
      signerName: mou.creatorName || "Event Creator",
      clientUserId: mou.creatorId.toString(),
      returnUrl: returnUrl || "macbease://mou-callback",
    });

    res
      .status(StatusCodes.OK)
      .json({ success: true, signingUrl, expiresIn: 300 });
  } catch (error) {
    console.error("Error generating signing URL", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

// GET /mou/api/v1/:mouId/document
const downloadMOUDocument = async (req, res) => {
  try {
    const { mouId } = req.params;
    const mou = await MOU.findById(mouId);

    if (!mou) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, error: "MOU not found" });
    }

    if (mou.creatorId.toString() !== req.user.id.toString()) {
      // Note: Might want admin to download too
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, error: "Not authorized to download this MOU" });
    }

    if (mou.status !== "signed") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, error: "MOU is not signed yet" });
    }

    if (mou.docusign.documentS3Key) {
      // Generate presigned URL and redirect
      const url = getPresignedUrl(mou.docusign.documentS3Key);
      return res.redirect(url);
    } else {
      // Fallback to fetch from DocuSign if not in S3
      const pdfBuffer = await docusign.getSignedDocument(
        mou.docusign.envelopeId,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=MOU_${mou.eventName.replace(/\s+/g, "_")}.pdf`,
      );
      return res.send(pdfBuffer);
    }
  } catch (error) {
    console.error("Error downloading MOU document", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

// GET /mou/api/v1/club/:clubId/mous
const getClubMOUs = async (req, res) => {
  try {
    console.log("get");
    const { clubId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    console.log(req.user);

    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, error: "Invalid club ID" });
    }

    // Role check: Only macbease admin or club main admin
    if (req.user.role !== "admin") {
      const clubsCount = await mongoose.connection.db.collection("clubs").countDocuments();
      console.log(`[getClubMOUs] Total clubs in DB: ${clubsCount}`);

      const club = await mongoose.connection.db
        .collection("clubs")
        .findOne(
          { _id: new mongoose.Types.ObjectId(clubId) },
          { projection: { mainAdmin: 1 } },
        );

      if (!club) {
        console.log(`no club found for id ${clubId}, bypassing for now...`);
        // Temporarily bypassed:
        // return res
        //   .status(StatusCodes.NOT_FOUND)
        //   .json({ success: false, error: "Club not found" });
      }

      if (club.mainAdmin?.toString() !== req.user.id.toString()) {
        return res.status(StatusCodes.FORBIDDEN).json({
          success: false,
          error: "Only club main admin or macbease admin can access these MOUs",
        });
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const mous = await MOU.find({ clubId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await MOU.countDocuments({ clubId });

    res.status(StatusCodes.OK).json({
      success: true,
      mous,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching club MOUs", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: error.message });
  }
};

module.exports = {
  getMOUByEventId,
  generateSigningUrl,
  downloadMOUDocument,
  getClubMOUs,
};
