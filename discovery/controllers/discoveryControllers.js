const ContactSync = require("../models/ContactSync");
const Suggestion = require("../models/Suggestion");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");

/**
 * Bidirectional matching algorithm.
 *
 * Forward: "Which Macbease users do I have in my phone?"
 *   → Find ContactSync docs where userPhoneHash ∈ myContactHashes
 *
 * Reverse: "Which Macbease users have ME in their phone?"
 *   → Find ContactSync docs where myPhoneHash ∈ their contactHashes
 *
 * Mutual: appears in both forward AND reverse.
 */
async function findMatches(userId, myPhoneHash, myContactHashes) {
  // If we don't have the user's phone hash, we can only do Forward matching.
  const reverseMatchPromise = myPhoneHash
    ? ContactSync.find({
        contactHashes: myPhoneHash,
        userId: { $ne: userId },
      })
        .select("userId userPhoneHash")
        .lean()
    : Promise.resolve([]);

  const [forwardMatches, reverseMatches] = await Promise.all([
    // Forward: users whose phone hash is in MY contact book
    ContactSync.find({
      userPhoneHash: { $in: myContactHashes },
      userId: { $ne: userId },
    })
      .select("userId userPhoneHash")
      .lean(),

    reverseMatchPromise,
  ]);

  // Merge + detect mutual
  const matchMap = new Map();

  for (const m of forwardMatches) {
    matchMap.set(m.userId.toString(), {
      userId: m.userId,
      direction: "forward",
    });
  }

  for (const m of reverseMatches) {
    const key = m.userId.toString();
    if (matchMap.has(key)) {
      matchMap.get(key).direction = "mutual";
    } else {
      matchMap.set(key, { userId: m.userId, direction: "reverse" });
    }
  }

  return matchMap;
}

/**
 * POST /discovery/api/v1/sync
 *
 * Receives hashed phone data, stores it, runs matching, creates suggestions.
 */
const syncContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { myPhoneHash, contactHashes } = req.body;

    // ── Validate ──
    // myPhoneHash is now optional. If missing, we just skip reverse match.
    if (!Array.isArray(contactHashes) || contactHashes.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "contactHashes must be a non-empty array" });
    }
    if (contactHashes.length > 5000) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Contact list too large. Max 5000 hashes." });
    }

    // ── Upsert sync data ──
    const updatePayload = {
      userId,
      contactHashes,
      consentGranted: true,
      syncedAt: new Date(),
      $inc: { syncCount: 1 },
    };
    
    if (myPhoneHash) {
      updatePayload.userPhoneHash = myPhoneHash;
    }

    await ContactSync.findOneAndUpdate(
      { userId },
      updatePayload,
      { upsert: true, new: true }
    );

    // ── Run matching ──
    const matchMap = await findMatches(userId, myPhoneHash, contactHashes);
    const matchedUserIds = [...matchMap.keys()];

    if (matchedUserIds.length > 0) {
      // Upsert suggestions for the requesting user
      const bulkOps = matchedUserIds.map((matchedId) => ({
        updateOne: {
          filter: {
            userId: new mongoose.Types.ObjectId(userId),
            suggestedId: new mongoose.Types.ObjectId(matchedId),
          },
          update: {
            userId: new mongoose.Types.ObjectId(userId),
            suggestedId: new mongoose.Types.ObjectId(matchedId),
            isMutual: matchMap.get(matchedId).direction === "mutual",
            direction: matchMap.get(matchedId).direction,
            status: "active",
          },
          upsert: true,
        },
      }));

      await Suggestion.bulkWrite(bulkOps);

      // Also create reverse suggestions so matched users see the requesting user
      const reverseBulkOps = matchedUserIds
        .filter((id) => {
          const dir = matchMap.get(id).direction;
          return dir === "mutual" || dir === "reverse";
        })
        .map((matchedId) => ({
          updateOne: {
            filter: {
              userId: new mongoose.Types.ObjectId(matchedId),
              suggestedId: new mongoose.Types.ObjectId(userId),
            },
            update: {
              userId: new mongoose.Types.ObjectId(matchedId),
              suggestedId: new mongoose.Types.ObjectId(userId),
              isMutual: matchMap.get(matchedId).direction === "mutual",
              direction:
                matchMap.get(matchedId).direction === "mutual"
                  ? "mutual"
                  : "forward",
              status: "active",
            },
            upsert: true,
          },
        }));

      if (reverseBulkOps.length) {
        await Suggestion.bulkWrite(reverseBulkOps);
      }
    }

    res.json({
      success: true,
      matchCount: matchedUserIds.length,
      message: matchedUserIds.length
        ? `${matchedUserIds.length} of your contacts are on Macbease!`
        : "No matches yet — as more friends join, they'll appear here.",
    });
  } catch (error) {
    console.error("syncContacts error:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Sync failed. Please try again." });
  }
};

/**
 * DELETE /discovery/api/v1/sync
 *
 * Revoke consent: deletes all contact data and suggestions for the user.
 */
const revokeConsent = async (req, res) => {
  try {
    const userId = req.user.id;

    await Promise.all([
      ContactSync.deleteOne({ userId }),
      Suggestion.deleteMany({
        $or: [{ userId }, { suggestedId: userId }],
      }),
    ]);

    res.json({ success: true, message: "Contact data deleted." });
  } catch (error) {
    console.error("revokeConsent error:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to revoke consent." });
  }
};

/**
 * GET /discovery/api/v1/suggestions
 *
 * Paginated suggestions, mutual matches ranked first.
 * NOTE: This service has its own DB, so we cannot populate User refs.
 * The client fetches user profiles separately from the universe service.
 */
const getSuggestions = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const [suggestions, total] = await Promise.all([
      Suggestion.find({ userId, status: "active" })
        .sort({ isMutual: -1, createdAt: -1 }) // Mutual first
        .skip(skip)
        .limit(limit)
        .lean(),
      Suggestion.countDocuments({ userId, status: "active" }),
    ]);

    // Return suggestedId as a plain string for the client to hydrate
    const shaped = suggestions.map((s) => ({
      _id: s._id,
      suggestedUserId: s.suggestedId.toString(),
      isMutual: s.isMutual,
      direction: s.direction,
    }));

    res.json({
      suggestions: shaped,
      pagination: {
        page,
        hasMore: skip + limit < total,
        total,
      },
    });
  } catch (error) {
    console.error("getSuggestions error:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to fetch suggestions." });
  }
};

/**
 * POST /discovery/api/v1/suggestions/:suggestionId/action
 *
 * Handle connect / dismiss / create_memory_lane actions.
 */
const actOnSuggestion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { suggestionId } = req.params;
    const { action } = req.body;

    if (!["connect", "dismiss", "create_memory_lane"].includes(action)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Invalid action. Must be connect, dismiss, or create_memory_lane." });
    }

    const statusMap = {
      connect: "connected",
      dismiss: "dismissed",
      create_memory_lane: "connected",
    };

    const updated = await Suggestion.findOneAndUpdate(
      { _id: suggestionId, userId },
      { status: statusMap[action], actedAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Suggestion not found." });
    }

    // TODO: For 'connect', emit Kafka event to create chat room or follow
    // TODO: For 'create_memory_lane', emit Kafka event to memory service

    res.json({ success: true });
  } catch (error) {
    console.error("actOnSuggestion error:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Action failed." });
  }
};

module.exports = {
  syncContacts,
  revokeConsent,
  getSuggestions,
  actOnSuggestion,
};
