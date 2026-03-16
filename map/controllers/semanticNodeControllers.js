 const { StatusCodes } = require("http-status-codes");
const OpenAI = require("openai");
const SemanticNode = require("../models/semanticNode");
const Territory = require("../models/territory");
const { fetchAllClubs, fetchAllCommunities, fetchClubById, fetchCommunityById } = require("./utilControllers");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const buildClubSemanticText = (club) => {
  const tags =
    Array.isArray(club.tags) && club.tags.length
      ? club.tags.join(", ")
      : "Not specified";

  const memberCount = Array.isArray(club.members)
    ? club.members.length
    : "a growing number of";

  const upcomingEvents =
    Array.isArray(club.upcomingEvent) && club.upcomingEvent.length
      ? club.upcomingEvent
          .map((e) => e.description)
          .filter(Boolean)
          .join("; ")
      : "No upcoming events announced";

  const ratingText =
    typeof club.rating === "number"
      ? `Rated ${club.rating}.`
      : "Rating not available.";

  return `
Type: Club
Name: ${club.name}
Motto:
${club.motto}
Description:
${
  club.chiefMsg ||
  "A student-run club focused on collaborative learning and growth."
}
Focus areas:
${tags}
Community size:
Approximately ${memberCount} members.
Activity & engagement:
${ratingText}
Upcoming highlights:
${upcomingEvents}.
`.trim();
};

const buildCommunitySemanticText = (community) => {
  const tags =
    Array.isArray(community.tag) && community.tag.length
      ? community.tag.join(", ")
      : "Not specified";

  const memberCount = Array.isArray(community.members)
    ? community.members.length
    : "a growing number of";

  const activityLevel =
    typeof community.activeMembers === "number" && community.activeMembers > 0
      ? `${community.activeMembers} active members`
      : "Activity level varies";

  const ratingText =
    typeof community.rating === "number"
      ? `Rated ${community.rating}.`
      : "Rating not available.";

  const accessType = community.entryRules?.isInviteOnly
    ? "Invite-only community"
    : "Open community";

  const visibility =
    community.entryRules?.visibility === false
      ? "Hidden from public discovery"
      : "Visible for discovery";

  return `
Type: Community
Title: ${community.title}
Label:
${community.label || "A student-led interest-based community."}
Description:
A discussion-driven community where members connect, share ideas, and collaborate
around shared interests and topics.
Focus areas:
${tags}
Community size:
Approximately ${memberCount} members.
Activity & engagement:
${activityLevel}.
${ratingText}
Access & visibility:
${accessType}.
${visibility}.
`.trim();
};

const createNodesForClubs = async (req, res) => {
  try {
    // ---- Auth check ----
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "You are not authorized to perform this action." });
    }

    // ---- Fetch all clubs ----
    const clubs = await fetchAllClubs({fields:["_id","name","tags","secondaryImg","members","upcomingEvent","rating","motto","chiefMsg"]})

    if (!clubs.length) {
      return res
        .status(StatusCodes.OK)
        .json({ message: "No clubs found.", created: 0 });
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const club of clubs) {
      // ---- Check if semantic node already exists ----
      const exists = await SemanticNode.findOne({
        entityType: "club",
        entityId: club._id,
      }).lean();

      if (exists) {
        skippedCount++;
        continue;
      }

      const semanticText = buildClubSemanticText(club);

      await SemanticNode.create({
        entityType: "club",
        entityId: club._id,
        text: semanticText,
        meta: {
          name: club.name,
          tags: club.tags || [],
          secondaryImg: club.secondaryImg,
        },
      });

      createdCount++;
    }

    return res.status(StatusCodes.CREATED).json({
      message: "Semantic nodes creation completed.",
      created: createdCount,
      skipped: skippedCount,
      totalClubs: clubs.length,
    });
  } catch (error) {
    console.error("Error creating semantic nodes for clubs:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while creating nodes for clubs.",
    });
  }
};

const createNodesForCommunities = async (req, res) => {
  try {
    // ---- Auth check ----
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "You are not authorized to perform this action." });
    }

    // ---- Fetch all communities ----
    const communities = await fetchAllCommunities({fields:["_id","title","tag","secondaryCover","entryRules","members","activeMembers","rating","label"]})

    if (!communities.length) {
      return res
        .status(StatusCodes.OK)
        .json({ message: "No communities found.", created: 0 });
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const community of communities) {
      // ---- Skip hidden communities (important for multiverse) ----
      if (community.entryRules?.visibility === false) {
        skippedCount++;
        continue;
      }

      // ---- Check if semantic node already exists ----
      const exists = await SemanticNode.findOne({
        entityType: "community",
        entityId: community._id,
      }).lean();

      if (exists) {
        skippedCount++;
        continue;
      }

      const semanticText = buildCommunitySemanticText(community);

      await SemanticNode.create({
        entityType: "community",
        entityId: community._id,
        text: semanticText,
        meta: {
          title: community.title,
          tags: community.tag || [],
          secondaryCover: community.secondaryCover,
        },
      });

      createdCount++;
    }

    return res.status(StatusCodes.CREATED).json({
      message: "Semantic nodes creation completed for communities.",
      created: createdCount,
      skipped: skippedCount,
      totalCommunities: communities.length,
    });
  } catch (error) {
    console.error("Error creating semantic nodes for communities:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while creating nodes for communities.",
    });
  }
};

async function embedNode(text) {
  try {
    const res = await client.embeddings.create({
      model: "text-embedding-3-large",
      input: text.slice(0, 8000), // safety cap
    });
    return res.data[0].embedding;
  } catch (error) {
    console.log("Error while embedding a node", error.message);
  }
}

const embedAllNodes = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "Not authorized",
      });
    }

    const BATCH_SIZE = 10;
    let embedded = 0;
    let failed = 0;

    while (true) {
      const nodes = await SemanticNode.find({
        $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
      }).limit(BATCH_SIZE);

      if (!nodes.length) break;

      for (const node of nodes) {
        try {
          const embedding = await embedNode(node.text);

          node.embedding = embedding;
          node.embeddingModel = "text-embedding-3-large";
          node.embeddedAt = new Date();

          await node.save();
          embedded++;
        } catch (err) {
          console.error("Embedding failed for node:", node._id, err.message);

          // Mark failure so it doesn't loop forever
          node.embeddingError = err.message;
          await node.save();

          failed++;
        }
      }
    }

    return res.status(StatusCodes.CREATED).json({
      message: "Embedding completed",
      embedded,
      failed,
    });
  } catch (error) {
    console.error("Error embedding nodes:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while embedding nodes.",
    });
  }
};

function clamp(x, min = 0, max = 1) {
  return Math.max(min, Math.min(x, max));
}

function normalize(value, cap) {
  return clamp(value / cap);
}

function recencyScore(date) {
  const days = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-days / 21);
}

function logNormalize(value, cap) {
  return clamp(Math.log(1 + value) / Math.log(1 + cap));
}

function getLastActivityDate(club) {
  const lastContent =
    Array.isArray(club.content) && club.content.length
      ? club.content[club.content.length - 1]
      : null;

  const lastEvent =
    Array.isArray(club.upcomingEvent) && club.upcomingEvent.length
      ? club.upcomingEvent[club.upcomingEvent.length - 1]
      : null;

  const contentDate = lastContent?.timeStamp
    ? new Date(lastContent.timeStamp)
    : null;

  const eventDate = lastEvent?.eventDate ? new Date(lastEvent.eventDate) : null;

  return new Date(
    Math.max(
      contentDate?.getTime() || 0,
      eventDate?.getTime() || 0,
      new Date(club.createdOn).getTime()
    )
  );
}

function clubVelocityBoost(club) {
  const recentPosts = club.content?.slice(-3) || [];
  if (!recentPosts.length) return 0;

  const daysAgo = (Date.now() - new Date(recentPosts[0].timeStamp)) / 86400000;
  return clamp(1 - daysAgo / 7); // strong boost if within 7 days
}

const club_z_scale = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "Not authorized",
      });
    }
    const nodes = await SemanticNode.find({ entityType: "club" });
    for (const node of nodes) {
      const club = await fetchClubById({id:node.entityId,fields:{
        members: 1,
        upcomingEvent: 1,
        content: 1,
        pinnedBy: 1,
        createdOn: 1,
        rating: 1,
      }});

      if (!club) continue;

      const membersCount = club.members?.length || 0;
      const eventCount = club.upcomingEvent?.length || 0;
      const contentCount = club.content?.length || 0;
      const pinCount = club.pinnedBy?.length || 0;
      const ratingValue = club.rating || 0;

      const activityScore =
        0.6 * normalize(eventCount, 5) + 0.4 * normalize(contentCount, 20);

      const memberScore = normalize(membersCount, 300);
      const pinScore = normalize(pinCount, 20);

      const ratingScore = logNormalize(ratingValue, 5000);

      const lastActivity = getLastActivityDate(club);
      const recency = recencyScore(lastActivity);

      const importance =
        0.22 * activityScore +
        0.18 * memberScore +
        0.22 * recency +
        0.18 * ratingScore +
        0.1 * pinScore +
        0.1 * clubVelocityBoost(club);

      const previousImportance = node.position?.importance ?? importance;
      const smoothedImportance = 0.7 * previousImportance + 0.3 * importance;
      const finalImportance = clamp(smoothedImportance);

      const zMin = 0.15 + (1 - finalImportance) * 0.5;
      const zMax = zMin + 0.3;

      await SemanticNode.updateOne(
        { _id: node._id },
        {
          $set: {
            "position.zMin": zMin,
            "position.zMax": zMax,
            "position.importance": finalImportance,
          },
        }
      );
    }

    return res.status(StatusCodes.OK).json({
      message: "Club z-scale computed successfully",
      processed: nodes.length,
    });
  } catch (error) {
    console.error("Error computing club z_sacle :", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while computing club z_sacle.",
    });
  }
};

function getCommunityLastActivity(community) {
  if (community.content?.length) {
    return new Date(
      community.content[community.content.length - 1].timeStamp ||
        community.createdOn
    );
  }
  return new Date(community.createdOn);
}

function communityVelocityBoost(community) {
  const recentPosts = community.content?.slice(-5) || [];
  if (!recentPosts.length) return 0;

  const daysAgo = (Date.now() - new Date(recentPosts[0].timeStamp)) / 86400000;

  return clamp(1 - daysAgo / 5); // faster decay than clubs
}

const community_z_scale = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "Not authorized",
      });
    }

    const nodes = await SemanticNode.find({ entityType: "community" });

    for (const node of nodes) {
      const community = await fetchCommunityById({id:node.entityId,fields:["content","members","onlineMembers","pinnedBy","rating","banList","activeMembers","createdOn"]});
      if (!community) continue;

      const activityScore =
        0.6 * normalize(community.content?.length || 0, 50) +
        0.4 * normalize(community.activeMembers || 0, 30);

      const memberScore = normalize(community.members?.length || 0, 500);
      const onlineScore = normalize(community.onlineMembers?.length || 0, 50);
      const pinScore = normalize(community.pinnedBy?.length || 0, 30);
      const ratingScore = logNormalize(community.rating || 0, 5000);

      const recency = recencyScore(getCommunityLastActivity(community));
      const velocity = communityVelocityBoost(community);
      const banPenalty = clamp((community.banList?.length || 0) / 20);

      const rawImportance =
        0.22 * activityScore +
        0.18 * memberScore +
        0.15 * onlineScore +
        0.18 * recency +
        0.15 * ratingScore +
        0.07 * pinScore +
        0.1 * velocity -
        0.1 * banPenalty;

      const previous = node.position?.importance ?? rawImportance;
      const importance = clamp(0.7 * previous + 0.3 * rawImportance);

      const zMin = 0.1 + (1 - importance) * 0.45;
      const zMax = zMin + 0.35;

      await SemanticNode.updateOne(
        { _id: node._id },
        {
          $set: {
            "position.zMin": zMin,
            "position.zMax": zMax,
            "position.importance": importance,
          },
        }
      );
    }

    return res.status(StatusCodes.OK).json({
      message: "Community z-scale computed successfully",
      processed: nodes.length,
    });
  } catch (error) {
    console.error("Error computing community z-scale:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while computing community z-scale.",
    });
  }
};

const getSampleSemanticNodes = async (req, res) => {
  try {
    const LIMIT = 20;

    const nodes = await SemanticNode.aggregate([
      { $sample: { size: LIMIT } },
      {
        $project: {
          embedding: 0,
          text: 0,
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      count: nodes.length,
      data: nodes,
    });
  } catch (error) {
    console.error("Error fetching semantic node sample:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch semantic nodes",
    });
  }
};

const getSemanticNodesForViewport = async (req, res) => {
  try {
    const { viewport, zoom, types } = req.body;

    // ---------------- Validation ----------------
    if (!viewport || typeof zoom !== "number") {
      return res.status(400).json({
        success: false,
        message: "viewport and zoom are required",
      });
    }

    const { xMin, xMax, yMin, yMax } = viewport;

    if ([xMin, xMax, yMin, yMax].some((v) => typeof v !== "number")) {
      return res.status(400).json({
        success: false,
        message: "Invalid viewport bounds",
      });
    }

    // ---------------- Query ----------------
    const query = {
      "position.x": { $gte: xMin, $lte: xMax },
      "position.y": { $gte: yMin, $lte: yMax },
      // "position.zMin": { $lte: zoom },
      // "position.zMax": { $gte: zoom },
    };

    if (Array.isArray(types) && types.length > 0) {
      query.entityType = { $in: types };
    }

    // ---------------- Options ----------------
    const limit = zoom < 1.3 ? 120 : zoom < 2 ? 300 : 800;

    const nodes = await SemanticNode.find(query)
      .select({
        entityId: 1,
        entityType: 1,
        position: 1,
        meta: 1,
      })
      .sort(zoom < 1.3 ? { "position.importance": -1 } : undefined)
      .lean();

    return res.status(200).json({
      success: true,
      count: nodes.length,
      nodes,
    });
  } catch (error) {
    console.error("Error loading semantic viewport:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load semantic nodes",
    });
  }
};

const getSemanticNodeBounds = async (req, res) => {
  try {
    const result = await SemanticNode.aggregate([
      {
        $group: {
          _id: null,
          minX: { $min: "$position.x" },
          maxX: { $max: "$position.x" },
          minY: { $min: "$position.y" },
          maxY: { $max: "$position.y" },
          minZ: { $min: "$position.zMin" },
          maxZ: { $max: "$position.zMax" },
          count: { $sum: 1 },
        },
      },
    ]);

    if (!result.length) {
      return res.status(200).json({
        success: true,
        bounds: null,
        message: "No semantic nodes found",
      });
    }

    const { minX, maxX, minY, maxY, minZ, maxZ, count } = result[0];

    return res.status(200).json({
      success: true,
      bounds: {
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ,
      },
      count,
    });
  } catch (error) {
    console.error("Error calculating semantic node bounds:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to calculate semantic node bounds",
      error: error.message,
    });
  }
};

// Helper 1 - normalize all the importance values of nodes inside a cluster
function normalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);

  return values.map((v) => (max === min ? 0.5 : (v - min) / (max - min)));
}

// Helper 2 -  importance → radius
function importanceToRadius(normImportance, territoryRadius) {
  const inner = territoryRadius * 0.15;
  const outer = territoryRadius * 0.9;

  return inner + (1 - normImportance) * (outer - inner);
}

// Helper 3 - function to assign local spatial co-ordinates to nodes inside a cluster
function buildNodeBodies(nodes, territory) {
  const importances = nodes.map((n) => n.position?.importance || 0);
  const normalized = normalize(importances);

  return nodes.map((node, i) => {
    const baseRadius = importanceToRadius(
      normalized[i],
      territory.spatial.radius
    );

    const angle = i * 2.399963; // golden angle
    const jitter = 0.85 + Math.random() * 0.3;

    return {
      node,
      x: Math.cos(angle) * baseRadius * jitter,
      y: Math.sin(angle) * baseRadius * jitter,
      r: 8 + normalized[i] * 14,
      importance: normalized[i],
    };
  });
}

// Helper 4 - function to resolve collisions between assigned local co-ordinates
function resolveNodeCollisions(bodies, iterations = 60) {
  const padding = 6;

  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const A = bodies[i];
        const B = bodies[j];

        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

        const minDist = A.r + B.r + padding;

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;

          A.x -= nx * overlap;
          A.y -= ny * overlap;
          B.x += nx * overlap;
          B.y += ny * overlap;
        }
      }
    }
  }

  return bodies;
}

// Helper 5 - function to convert local co-ordinates into worl co-ordinates
function toWorldSpace(body, territory) {
  return {
    node: body.node,
    x: territory.spatial.center.cx + body.x,
    y: territory.spatial.center.cy + body.y,
  };
}

// Helper 6 - persisting the nodes co-ordinates
async function saveNodePositions(worldBodies) {
  const bulk = worldBodies.map(({ node, x, y }) => ({
    updateOne: {
      filter: { _id: node._id },
      update: {
        $set: {
          "position.x": x,
          "position.y": y,
        },
      },
    },
  }));

  if (bulk.length) {
    await SemanticNode.bulkWrite(bulk);
  }
}

const assignLocalSpatialCoordinates = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "Not authorized",
      });
    }
    const { query, clusterId } = req.query;
    let clusters = [];
    if (query === "all") {
      clusters = await Territory.find({}, { centroidEmbedding: 0 });
    } else if (clusterId) {
      const cluster = await Territory.findById(clusterId, {
        centroidEmbedding: 0,
      });
      clusters.push(cluster);
    }
    for (const territory of clusters) {
      const nodes = await SemanticNode.find({
        _id: { $in: territory.memberNodeIds },
      });

      if (!nodes.length) continue;

      let bodies = buildNodeBodies(nodes, territory);
      bodies = resolveNodeCollisions(bodies);

      const worldBodies = bodies.map((b) => toWorldSpace(b, territory));

      await saveNodePositions(worldBodies);
    }
    return res
      .status(StatusCodes.OK)
      .json({ msg: "Co-ordinates assigned successfully." });
  } catch (error) {
    console.error("Error assigning spatial coordinates:", error);
    return res.status(500).json({
      success: false,
      message: "Error assigning spatial coordinates:",
      error: error.message,
    });
  }
};

const getNodesForTerritory = async (req, res) => {
  try {
    const { territoryId } = req.query;

    if (!territoryId) {
      return res.status(400).json({
        success: false,
        message: "territoryId is required",
      });
    }

    const territory = await Territory.findById(territoryId)
      .select("memberNodeIds name")
      .lean();

    if (!territory) {
      return res.status(404).json({
        success: false,
        message: "Territory not found",
      });
    }

    const nodes = await SemanticNode.find(
      { _id: { $in: territory.memberNodeIds } },
      {
        embedding: 0,
      }
    ).lean();

    return res.status(200).json({
      success: true,
      territory: {
        id: territory._id,
        name: territory.name,
      },
      count: nodes.length,
      nodes,
    });
  } catch (error) {
    console.error("Error fetching territory nodes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch territory nodes",
      error: error.message,
    });
  }
};

const deleteNodesByEntityType = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    const { entityType } = req.query;

    if (!entityType) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "entityType is required.",
      });
    }

    // Deletion
    const deleteResult = await SemanticNode.deleteMany({ entityType });

    // Aggregation for remaining nodes
    const remainingBreakdown = await SemanticNode.aggregate([
      {
        $group: {
          _id: "$entityType",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          entityType: "$_id",
          count: 1,
          _id: 0,
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const totalRemaining = remainingBreakdown.reduce(
      (acc, curr) => acc + curr.count,
      0,
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Deleted ${deleteResult.deletedCount} nodes of type '${entityType}'.`,
      deletedCount: deleteResult.deletedCount,
      totalRemaining,
      remainingBreakdown,
    });
  } catch (error) {
    console.error("Error in deleteNodesByEntityType:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while deleting semantic nodes.",
      error: error.message,
    });
  }
};
const getSemanticNodeCounts = async (req, res) => {
  try {
    const counts = await SemanticNode.aggregate([
      {
        $group: {
          _id: "$entityType",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          entityType: "$_id",
          count: 1,
          _id: 0,
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const totalNodes = counts.reduce((acc, curr) => acc + curr.count, 0);

    return res.status(StatusCodes.OK).json({
      success: true,
      totalNodes,
      counts,
    });
  } catch (error) {
    console.error("Error in getSemanticNodeCounts:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching semantic node counts.",
      error: error.message,
    });
  }
};

/**
 * Temporary controller to backfill uid for all semantic nodes
 */
const backfillSemanticNodeUid = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    const { uid } = req.body;

    if (!uid) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "uid is required in the request body",
      });
    }

    const result = await SemanticNode.updateMany(
      {},
      {
        $set: {
          uid: uid,
        },
      }
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} semantic nodes.`,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error backfilling semantic node data:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while backfilling semantic nodes.",
      error: error.message,
    });
  }
};

module.exports = {
  getSemanticNodeCounts,
  deleteNodesByEntityType,
  createNodesForClubs,
  createNodesForCommunities,
  embedAllNodes,
  club_z_scale,
  community_z_scale,
  getSampleSemanticNodes,
  getSemanticNodesForViewport,
  getSemanticNodeBounds,
  assignLocalSpatialCoordinates,
  getNodesForTerritory,
  backfillSemanticNodeUid,
};