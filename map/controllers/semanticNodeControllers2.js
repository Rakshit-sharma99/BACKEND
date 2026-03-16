/**
 * Semantic Node Controllers 2 — Profile Facet Pipeline
 * ─────────────────────────────────────────────────────
 * Pipeline:
 * 1. Fetch all users (or a single user) with bio, interests, club/community memberships
 * 2. Enrich each user with club names/tags and community titles/tags
 * 3. Use LLM to extract 2-5 distinct interest facets
 * 4. Generate canonical text per facet
 * 5. Embed each facet → each becomes its own SemanticNode (entityType: "profile_facet")
 */

const { StatusCodes } = require("http-status-codes");
const OpenAI = require("openai");
const SemanticNode = require("../models/semanticNode");
const Territory = require("../models/territory");
const Asset = require("../models/asset");
const { fetchAllClubs, fetchAllCommunities } = require("./utilControllers");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ───────────────────────────────────────
// Constants
// ───────────────────────────────────────
const EMBED_MODEL = "text-embedding-3-large";
const LLM_MODEL = "gpt-4.1-mini";
const BATCH_SIZE = 5; // users processed per batch (to avoid rate limits)

// ───────────────────────────────────────
// Internal: Fetch all users from universe service
// ───────────────────────────────────────
const jwt = require("jsonwebtoken");
const axios = require("axios");

function generateServiceToken() {
  const token = jwt.sign(
    { service: "map", role: "internal" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
  return { headers: { authorization: `Bearer ${token}` } };
}

async function fetchAllUsers() {
  try {
    const config = generateServiceToken();
    const res = await axios.get(
      `http://universe:5050/universe/api/v1/user/getAllUsers`,
      config,
    );
    return res.data || [];
  } catch (error) {
    console.error("[ProfileFacet] Failed to fetch users:", error.message);
    return [];
  }
}

/**
 * Fetches ticket → event data for a user.
 * Returns an array of event description strings.
 */
async function fetchUserTicketEvents(userId) {
  try {
    const config = generateServiceToken();
    const res = await axios.get(
      `http://event:5060/event/api/v1/getTicketsBought?userId=${userId}`,
      config,
    );
    const allEvents = res.data?.arr || [];

    // Deduplicate by event ID
    const uniqueEventsMap = new Map();
    for (const e of allEvents) {
      if (e && e._id) {
        if (!uniqueEventsMap.has(e._id)) {
          uniqueEventsMap.set(e._id, e);
        }
      }
    }

    const events = Array.from(uniqueEventsMap.values());

    return events
      .map((e) => {
        if (!e) return null;
        const parts = [e.description || e.name || "Unnamed Event"];
        if (Array.isArray(e.tags) && e.tags.length)
          parts.push(`[${e.tags.join(", ")}]`);
        return parts.join(" ");
      })
      .filter(Boolean);
  } catch (error) {
    console.error(
      "[ProfileFacet] Failed to fetch ticket events:",
      error.message,
    );
    return [];
  }
}

/**
 * Fetches full asset definitions for a user's vicinityAssets.
 * Returns structured payload summaries.
 */
async function fetchUserAssetPayloads(vicinityAssets) {
  if (!Array.isArray(vicinityAssets) || !vicinityAssets.length) return [];

  try {
    const assetIds = vicinityAssets.map((a) => a.assetId).filter(Boolean);
    if (!assetIds.length) return [];

    // Fetch assets directly via DB call since we're in the same service
    const fullAssets = await Asset.find({ _id: { $in: assetIds } }).lean();
    const assetMap = new Map(fullAssets.map((a) => [String(a._id), a]));

    const summaries = [];

    for (const vcAsset of vicinityAssets) {
      const full = assetMap.get(String(vcAsset.assetId));
      if (!full) continue;

      const payload = vcAsset.payload || {};
      const payloadType = full.payloadConfig?.allowedPayloadTypes?.[0];

      if (payloadType === "audio" && payload.title) {
        summaries.push(
          `Listens to: "${payload.title}"${payload.artist ? ` by ${payload.artist}` : ""}`,
        );
      } else if (payloadType === "movie" && payload.title) {
        summaries.push(
          `Watches: "${payload.title}"${payload.genres ? ` (${payload.genres})` : ""}`,
        );
      } else if (payloadType === "book" && payload.title) {
        summaries.push(
          `Reads: "${payload.title}"${payload.author ? ` by ${payload.author}` : ""}`,
        );
      } else if (payloadType === "text" && payload.text) {
        summaries.push(`Saved note: "${String(payload.text).slice(0, 80)}"`);
      } else if (full.tag || full.name) {
        summaries.push(`Saved asset: ${full.name} [${full.tag || "general"}]`);
      }
    }

    return summaries;
  } catch (error) {
    console.error(
      "[ProfileFacet] Failed to fetch asset payloads:",
      error.message,
    );
    return [];
  }
}

// ───────────────────────────────────────
// Step 1: Build rich profile context
// ───────────────────────────────────────

/**
 * Collects user's bio, interests, club memberships (with names/tags),
 * community memberships (with titles/tags), events attended,
 * and saved asset payloads (music, movies, books)
 * into a single context string for the LLM.
 */
function buildProfileContext(
  user,
  clubMap,
  communityMap,
  eventDescriptions,
  assetPayloadSummaries,
) {
  const parts = [];

  // Basic info
  parts.push(`Name: ${user.name || "Unknown"}`);
  if (user.course) parts.push(`Course: ${user.course}`);
  if (user.profession) parts.push(`Profession: ${user.profession}`);
  if (user.field) parts.push(`Field of Study: ${user.field}`);

  // Interests
  if (Array.isArray(user.interests) && user.interests.length) {
    parts.push(`Interests: ${user.interests.join(", ")}`);
  }

  // Clubs with enrichment
  if (Array.isArray(user.clubs) && user.clubs.length) {
    const clubDetails = user.clubs
      .map((c) => {
        const club = clubMap.get(String(c.clubId || c));
        if (!club) return null;
        const tags =
          Array.isArray(club.tags) && club.tags.length
            ? ` [${club.tags.join(", ")}]`
            : "";
        return `${club.name}${tags}`;
      })
      .filter(Boolean);

    if (clubDetails.length) {
      parts.push(`Club Memberships: ${clubDetails.join("; ")}`);
    }
  }

  // Communities with enrichment
  if (Array.isArray(user.communitiesPartOf) && user.communitiesPartOf.length) {
    const communityDetails = user.communitiesPartOf
      .map((c) => {
        const community = communityMap.get(String(c.communityId || c));
        if (!community) return null;
        const tags =
          Array.isArray(community.tag) && community.tag.length
            ? ` [${community.tag.join(", ")}]`
            : "";
        return `${community.title}${tags}`;
      })
      .filter(Boolean);

    if (communityDetails.length) {
      parts.push(`Communities: ${communityDetails.join("; ")}`);
    }
  }

  // Events attended (bought tickets)
  if (Array.isArray(eventDescriptions) && eventDescriptions.length) {
    parts.push(`Events Attended: ${eventDescriptions.join("; ")}`);
  }

  // Saved assets & payloads (music, movies, books, etc.)
  if (Array.isArray(assetPayloadSummaries) && assetPayloadSummaries.length) {
    parts.push(
      `Personal Taste & Saved Content:\n${assetPayloadSummaries.join("\n")}`,
    );
  }

  return parts.join("\n");
}

// ───────────────────────────────────────
// Step 2: LLM facet extraction
// ───────────────────────────────────────

function extractJSON(text) {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Uses the LLM to extract 2–5 distinct interest facets from a user profile.
 * Returns: [{ facetId, label, canonicalText }]
 */
async function extractFacets(profileContext) {
  console.log("profileContext", profileContext);
  const response = await client.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `
You are a semantic profiling agent. Given a user's profile — their bio, interests,
club memberships, community posts, and field of study — extract between 2 and 5
distinct interest facets.

Each facet represents a separate domain of interest that is meaningfully different
from the others. Do NOT create overlapping facets.

Rules:
- Each facet must have a short, lowercase, snake_case id (e.g. "web_development", "photography")
- Each facet must have a human-readable label (e.g. "Web Development", "Photography")
- Each facet must have a rich canonical text paragraph (50-120 words) that describes
  the user's connection to that domain, written in third person.
  This text will be embedded for semantic similarity, so make it descriptive and specific.
- If the user's profile lacks enough information for 2 facets, return just 1.
- Never fabricate interests that are not implied by the profile data.

Respond strictly in JSON:
{
  "facets": [
    {
      "facetId": "",
      "label": "",
      "canonicalText": ""
    }
  ]
}
        `.trim(),
      },
      {
        role: "user",
        content: profileContext,
      },
    ],
  });

  const parsed = extractJSON(response.choices[0].message.content);
  return parsed.facets || [];
}

// ───────────────────────────────────────
// Step 3: Embed a single text
// ───────────────────────────────────────
async function embedText(text) {
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

// ───────────────────────────────────────
// Step 4: Persist facet nodes
// ───────────────────────────────────────
async function createFacetNodes(userId, userName, userImage, facets) {
  const created = [];

  for (const facet of facets) {
    // Skip if this exact facet already exists for this user
    const exists = await SemanticNode.findOne({
      entityType: "profile_facet",
      parentEntityId: userId,
      facetId: facet.facetId,
    }).lean();

    if (exists) continue;

    let embedding = null;
    try {
      embedding = await embedText(facet.canonicalText);
    } catch (err) {
      console.error(
        `[ProfileFacet] Embedding failed for ${userName}/${facet.facetId}:`,
        err.message,
      );
      continue;
    }

    const node = await SemanticNode.create({
      entityId: userId,
      parentEntityId: userId,
      entityType: "profile_facet",
      facetId: facet.facetId,
      text: facet.canonicalText,
      embedding,
      embeddingModel: EMBED_MODEL,
      embeddedAt: new Date(),
      meta: {
        name: userName,
        image: userImage,
        facetLabel: facet.label,
      },
    });

    created.push({
      nodeId: node._id,
      facetId: facet.facetId,
      label: facet.label,
    });
  }

  return created;
}

// ═══════════════════════════════════════
// Controller: Create Profile Facet Nodes
// ═══════════════════════════════════════
const createProfileFacetNodes = async (req, res) => {
  try {
    // ---- Authorization ----
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    const { userId } = req.query; // optional: process a single user

    // ---- Fetch users ----
    let users = await fetchAllUsers();

    if (userId) {
      users = users.filter((u) => String(u._id) === String(userId));
    }

    if (!users.length) {
      return res.status(StatusCodes.OK).json({
        message: "No users found.",
        created: 0,
      });
    }

    // ---- Pre-fetch all clubs & communities for enrichment ----
    const [allClubs, allCommunities] = await Promise.all([
      fetchAllClubs({
        fields: ["_id", "name", "tags"],
      }),
      fetchAllCommunities({
        fields: ["_id", "title", "tag"],
      }),
    ]);

    const clubMap = new Map((allClubs || []).map((c) => [String(c._id), c]));
    const communityMap = new Map(
      (allCommunities || []).map((c) => [String(c._id), c]),
    );

    // ---- Process users in batches ----
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const results = [];

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      for (const user of batch) {
        try {
          // Check if this user already has facet nodes
          const existingCount = await SemanticNode.countDocuments({
            entityType: "profile_facet",
            parentEntityId: user._id,
          });

          if (existingCount >= 2) {
            totalSkipped++;
            continue;
          }

          // Step 1a: Fetch events & asset payloads for this user
          const [eventDescriptions, assetPayloadSummaries] = await Promise.all([
            fetchUserTicketEvents(user._id),
            fetchUserAssetPayloads(user.vicinityAsset),
          ]);

          // Step 1b: Build profile context
          const profileContext = buildProfileContext(
            user,
            clubMap,
            communityMap,
            eventDescriptions,
            assetPayloadSummaries,
          );

          // Skip users with very thin profiles
          if (profileContext.split("\n").length < 2) {
            totalSkipped++;
            continue;
          }

          // Step 2: Extract facets via LLM
          const facets = await extractFacets(profileContext);

          if (!facets.length) {
            totalSkipped++;
            continue;
          }

          // Steps 3 & 4: Embed + persist
          const created = await createFacetNodes(
            user._id,
            user.name,
            user.image,
            facets,
          );

          totalCreated += created.length;
          results.push({
            userId: user._id,
            name: user.name,
            facetsCreated: created.length,
            facets: created.map((c) => c.label),
          });
        } catch (err) {
          console.error(
            `[ProfileFacet] Failed for user ${user.name}:`,
            err.message,
          );
          totalFailed++;
        }
      }
    }

    return res.status(StatusCodes.CREATED).json({
      message: "Profile facet node creation completed.",
      totalUsers: users.length,
      totalCreated,
      totalSkipped,
      totalFailed,
      results,
    });
  } catch (error) {
    console.error("[ProfileFacet] Controller error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while creating profile facet nodes.",
    });
  }
};

// ═══════════════════════════════════════
// Controller: Refresh Profile Facet Nodes
// ═══════════════════════════════════════
/**
 * Re-generates facets for a single user (e.g. after profile update).
 * Deletes existing facet nodes and creates fresh ones.
 */
const refreshProfileFacetNodes = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    const { userId } = req.query;

    if (!userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "userId is required.",
      });
    }

    // Delete existing facets for this user
    const deleteResult = await SemanticNode.deleteMany({
      entityType: "profile_facet",
      parentEntityId: userId,
    });

    // Fetch the user
    const users = await fetchAllUsers();
    const user = users.find((u) => String(u._id) === String(userId));

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "User not found.",
      });
    }

    // Enrich
    const [allClubs, allCommunities] = await Promise.all([
      fetchAllClubs({ fields: ["_id", "name", "tags"] }),
      fetchAllCommunities({ fields: ["_id", "title", "tag"] }),
    ]);

    const clubMap = new Map((allClubs || []).map((c) => [String(c._id), c]));
    const communityMap = new Map(
      (allCommunities || []).map((c) => [String(c._id), c]),
    );

    const [eventDescriptions, assetPayloadSummaries] = await Promise.all([
      fetchUserTicketEvents(user._id),
      fetchUserAssetPayloads(user.vicinityAsset),
    ]);

    const profileContext = buildProfileContext(
      user,
      clubMap,
      communityMap,
      eventDescriptions,
      assetPayloadSummaries,
    );
    const facets = await extractFacets(profileContext);
    const created = await createFacetNodes(
      user._id,
      user.name,
      user.image,
      facets,
    );

    return res.status(StatusCodes.CREATED).json({
      message: "Profile facets refreshed.",
      deleted: deleteResult.deletedCount,
      created: created.length,
      facets: created.map((c) => ({
        facetId: c.facetId,
        label: c.label,
      })),
    });
  } catch (error) {
    console.error("[ProfileFacet] Refresh error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while refreshing profile facet nodes.",
    });
  }
};

// ═══════════════════════════════════════
// Controller: Vector Search Profile Facet Nodes
// ═══════════════════════════════════════
/**
 * Vector search through profile facet nodes.
 * Clubs the resulting facets together by parentEntityId.
 */
const vectorSearchProfileFacets = async (req, res) => {
  try {
    const { query, limit = 20, useFallback = false } = req.body;

    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "query is required for vector search.",
      });
    }

    // Bypass Atlas Vector Search entirely if requested for debugging
    if (useFallback) {
      throw new Error("vectorSearch bypass requested via useFallback");
    }

    let queryEmbedding;
    try {
      queryEmbedding = await embedText(query);
    } catch (err) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Failed to generate embedding for the query.",
        error: err.message,
      });
    }

    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: limit * 10,
          limit: Number(limit) * 3, // over-fetch to group
          filter: { entityType: "profile_facet" },
        },
      },
      {
        $group: {
          _id: "$parentEntityId",
          facets: {
            $push: {
              nodeId: "$_id",
              facetId: "$facetId",
              text: "$text",
              meta: "$meta",
              score: { $meta: "vectorSearchScore" },
            },
          },
          highestScore: { $max: { $meta: "vectorSearchScore" } },
        },
      },
      { $sort: { highestScore: -1 } },
      { $limit: Number(limit) },
    ];

    const results = await SemanticNode.aggregate(pipeline);

    return res.status(StatusCodes.OK).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error("[ProfileFacet] Vector Search error:", error);

    // Fallback manual cosine sim
    if (error.message.includes("vectorSearch") || req.body.useFallback) {
      try {
        const queryEmbedding = await embedText(req.body.query);
        const nodes = await SemanticNode.find({ entityType: "profile_facet" }).lean();

        const cosineSimilarity = (a, b) => {
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
          return dot / (Math.sqrt(normA) * Math.sqrt(normB));
        };

        const scored = nodes.map(node => ({
          ...node,
          score: node.embedding ? cosineSimilarity(node.embedding, queryEmbedding) : 0
        })).sort((a, b) => b.score - a.score).slice(0, Number(req.body.limit || 20) * 3);

        const grouped = scored.reduce((acc, node) => {
          const parent = String(node.parentEntityId);
          if (!acc[parent]) acc[parent] = { _id: parent, facets: [], highestScore: 0 };
          
          acc[parent].facets.push({
            nodeId: node._id,
            facetId: node.facetId,
            text: node.text,
            meta: node.meta,
            score: node.score,
          });
          
          if (node.score > acc[parent].highestScore) acc[parent].highestScore = node.score;
          return acc;
        }, {});

        const finalResults = Object.values(grouped)
          .sort((a, b) => b.highestScore - a.highestScore)
          .slice(0, Number(req.body.limit || 20));

        return res.status(StatusCodes.OK).json({
          success: true,
          count: finalResults.length,
          data: finalResults,
          fallback: true
        });

      } catch (fallbackError) {
        console.error("[ProfileFacet] Fallback Search error:", fallbackError);
      }
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred during vector search.",
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════
// Controller: Meta Search Profile Facet Nodes
// ═══════════════════════════════════════
/**
 * Text/Regex search through profile facet nodes meta fields.
 * Clubs the resulting facets together by parentEntityId.
 */
const metaSearchProfileFacets = async (req, res) => {
  try {
    const { metaQuery, limit = 20 } = req.body;

    if (!metaQuery) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "metaQuery is required for meta search.",
      });
    }

    const regexMatch = new RegExp(metaQuery, "i");

    const pipeline = [
      {
        $match: {
          entityType: "profile_facet",
          $or: [
            { "meta.name": { $regex: regexMatch } },
            { "meta.facetLabel": { $regex: regexMatch } },
            { text: { $regex: regexMatch } },
          ],
        },
      },
      {
        $group: {
          _id: "$parentEntityId",
          facets: {
            $push: {
              nodeId: "$_id",
              facetId: "$facetId",
              text: "$text",
              meta: "$meta",
            },
          },
        },
      },
      { $limit: Number(limit) },
    ];

    const results = await SemanticNode.aggregate(pipeline);

    // Collect all node IDs across all grouped facets
    const allNodeIds = [];
    results.forEach((group) => {
      group.facets.forEach((facet) => {
        allNodeIds.push(String(facet.nodeId));
      });
    });

    // Find all territories that contain any of these facets
    const territories = await Territory.find({
      memberNodeIds: { $in: allNodeIds },
    })
      .select("memberNodeIds uid universeMetaData")
      .lean();

    // Build a map of nodeId -> territory data for fast lookup
    const nodeToTerritoryMap = {};
    territories.forEach((territory) => {
      territory.memberNodeIds.forEach((memberId) => {
        if (allNodeIds.includes(memberId)) {
          nodeToTerritoryMap[memberId] = {
            territoryId: territory._id,
            uid: territory.uid,
            universeMetaData: territory.universeMetaData,
          };
        }
      });
    });

    // Attach territory data to the results
    const enrichedResults = results.map((group) => {
      return {
        ...group,
        facets: group.facets.map((facet) => {
          const tData = nodeToTerritoryMap[String(facet.nodeId)] || {};
          return {
            ...facet,
            territoryId: tData.territoryId || null,
            uid: tData.uid || null,
            universeMetaData: tData.universeMetaData || null,
          };
        }),
      };
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      count: enrichedResults.length,
      data: enrichedResults,
    });
  } catch (error) {
    console.error("[ProfileFacet] Meta Search error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred during meta search.",
      error: error.message,
    });
  }
};

// ───────────────────────────────────────
// Exports
// ───────────────────────────────────────
module.exports = {
  createProfileFacetNodes,
  refreshProfileFacetNodes,
  vectorSearchProfileFacets,
  metaSearchProfileFacets,
};
