const crypto = require("crypto");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");
const Content = require("../models/content");
const ShareGrant = require("../models/shareGrant");

const DEFAULT_TTL_DAYS = Number(process.env.SHARE_GRANT_TTL_DAYS || 90);
const MAX_TTL_DAYS = Number(process.env.SHARE_GRANT_MAX_TTL_DAYS || 90);

function hashGrantToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createGrantToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function resolveTtlDays(requestedTtlDays) {
  const parsed = Number(requestedTtlDays);
  const fallback = Number.isFinite(DEFAULT_TTL_DAYS) && DEFAULT_TTL_DAYS > 0
    ? DEFAULT_TTL_DAYS
    : 90;
  const max = Number.isFinite(MAX_TTL_DAYS) && MAX_TTL_DAYS > 0
    ? MAX_TTL_DAYS
    : fallback;
  const ttl = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(ttl, max);
}

function getExpiry(ttlDays) {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

function isValidContentId(contentId) {
  return contentId && mongoose.Types.ObjectId.isValid(contentId);
}

async function findShareableContent(contentId) {
  return Content.findOne({
    _id: contentId,
    underReview: { $ne: true },
    useful: { $ne: false },
  })
    .select("_id")
    .lean();
}

const createShareGrant = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "A user session is required to create a share link.",
      });
    }

    const {
      resourceType = "content",
      resourceId,
      ttlDays,
    } = req.body || {};

    if (resourceType !== "content") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Unsupported share resource type.",
      });
    }

    if (!isValidContentId(resourceId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Valid content id is required.",
      });
    }

    const content = await findShareableContent(resourceId);
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Content is not available for sharing.",
      });
    }

    const token = createGrantToken();
    const expiresAt = getExpiry(resolveTtlDays(ttlDays));

    await ShareGrant.create({
      tokenHash: hashGrantToken(token),
      resourceType,
      resourceId,
      createdBy: req.user.id,
      expiresAt,
      createdFromIp: req.ip,
      createdFromUserAgent: req.get("user-agent") || "",
    });

    return res.status(StatusCodes.CREATED).json({
      resourceType,
      resourceId,
      shareGrant: token,
      expiresAt,
    });
  } catch (error) {
    console.error("createShareGrant error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Could not create share link.",
    });
  }
};

function buildGuestContentPipeline(contentId) {
  return [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(contentId),
        underReview: { $ne: true },
        useful: { $ne: false },
      },
    },
    {
      $addFields: {
        commentsNum: { $size: { $ifNull: ["$comments", []] } },
        likeCount: { $size: { $ifNull: ["$likes", []] } },
        commentsPreview: {
          $slice: [
            {
              $map: {
                input: { $ifNull: ["$comments", []] },
                as: "comment",
                in: {
                  cid: "$$comment.cid",
                  text: "$$comment.text",
                  name: "$$comment.name",
                  img: "$$comment.img",
                  userId: "$$comment._id",
                  timeStamp: "$$comment.timeStamp",
                  likeCount: {
                    $size: { $ifNull: ["$$comment.likes", []] },
                  },
                  repliesCount: {
                    $size: { $ifNull: ["$$comment.replies", []] },
                  },
                },
              },
            },
            6,
          ],
        },
      },
    },
    {
      $project: {
        _id: 1,
        contentType: 1,
        url: 1,
        c_url: 1,
        altTexts: 1,
        title: 1,
        text: 1,
        tags: 1,
        sendBy: 1,
        belongsTo: 1,
        idOfSender: 1,
        params: {
          userName: "$params.userName",
          userPic: "$params.userPic",
          clubTitle: "$params.clubTitle",
          clubCover: "$params.clubCover",
          communityTitle: "$params.communityTitle",
          communityCover: "$params.communityCover",
          universeMetaData: "$params.universeMetaData",
        },
        metaData: 1,
        universeMetaData: 1,
        timeStamp: 1,
        commentsNum: 1,
        likeCount: 1,
        comments: "$commentsPreview",
      },
    },
  ];
}

const resolveShareGrant = async (req, res) => {
  try {
    const {
      sg,
      resourceType = "content",
      resourceId,
    } = req.query || {};

    if (resourceType !== "content") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Unsupported share resource type.",
      });
    }

    if (!sg || typeof sg !== "string" || !isValidContentId(resourceId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Valid share grant and content id are required.",
      });
    }

    const grant = await ShareGrant.findOne({
      tokenHash: hashGrantToken(sg),
      resourceType,
      resourceId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!grant) {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "This share link is invalid or expired.",
      });
    }

    const [content] = await Content.aggregate(buildGuestContentPipeline(resourceId));
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Shared content is no longer available.",
      });
    }

    await ShareGrant.updateOne(
      { _id: grant._id },
      { $set: { lastAccessedAt: new Date() }, $inc: { accessCount: 1 } },
    );

    return res.status(StatusCodes.OK).json({
      resourceType,
      resourceId,
      guest: true,
      content,
    });
  } catch (error) {
    console.error("resolveShareGrant error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Could not resolve shared content.",
    });
  }
};

module.exports = {
  createShareGrant,
  resolveShareGrant,
};
