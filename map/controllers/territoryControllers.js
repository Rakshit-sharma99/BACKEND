/**
 * Territory Clustering Controller
 * --------------------------------
 * Pipeline:
 * 1. Fetch semantic nodes with embeddings
 * 2. Cluster embeddings (K-Means)
 * 3. Compute centroid embeddings
 * 4. Find representative texts per cluster
 * 5. Use LLM to name territories
 */

const OpenAI = require("openai");
const { kmeans } = require("ml-kmeans");
const _ = require("lodash");
const { StatusCodes } = require("http-status-codes");

// ─────────────────────────────
// Models
// ─────────────────────────────
const SemanticNode = require("../models/semanticNode");
const Territory = require("../models/territory");
const { fetchClubById, fetchCommunityById } = require("./utilControllers");

// ─────────────────────────────
// OpenAI Client
// ─────────────────────────────
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─────────────────────────────
// Constants & Heuristics
// ─────────────────────────────
const MIN_NODES_FOR_CLUSTERING = 5;
const MAX_REPRESENTATIVE_TEXTS = 20;

/**
 * Heuristic for choosing K
 */
function chooseK(n) {
  return Math.max(3, Math.floor(Math.sqrt(n / 2)));
}

// ─────────────────────────────
// Math Utilities
// ─────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────
// Representative Text Extraction
// ─────────────────────────────
async function getRepresentativeTextsForClusters(
  territoryCandidates,
  allNodes,
  topK = MAX_REPRESENTATIVE_TEXTS
) {
  // Index semantic nodes for fast lookup
  const nodeById = new Map();
  allNodes.forEach((node) => nodeById.set(node._id.toString(), node));

  const enrichedTerritories = [];

  for (const territory of territoryCandidates) {
    const { centroidEmbedding, memberNodeIds } = territory;

    // Score nodes by similarity to centroid
    const scoredNodes = memberNodeIds
      .map((nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) return null;

        return {
          node,
          score: cosineSimilarity(node.embedding, centroidEmbedding),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Collect referenced domain IDs
    const clubIds = scoredNodes
      .filter((s) => s.node.entityType === "club")
      .map((s) => s.node.entityId);

    const communityIds = scoredNodes
      .filter((s) => s.node.entityType === "community")
      .map((s) => s.node.entityId);

    // Fetch domain documents
    const [clubs, communities] = await Promise.all([
        fetchClubById({ids:clubIds,fields:["name","motto","tags"]}),
        fetchCommunityById({ids:communityIds,fields:["title","label","tag"]})
    ]);

    const clubById = new Map(clubs.map((c) => [c._id.toString(), c]));
    const communityById = new Map(
      communities.map((c) => [c._id.toString(), c])
    );

    // Build representative text payload
    const representativeTexts = scoredNodes
      .map(({ node, score }) => {
        if (node.entityType === "club") {
          const club = clubById.get(node.entityId.toString());
          if (!club) return null;

          return {
            type: "club",
            score,
            text: `${club.name}. ${club.motto || ""}. ${
              club.tags?.join(", ") || ""
            }`.trim(),
          };
        }

        if (node.entityType === "community") {
          const community = communityById.get(node.entityId.toString());
          if (!community) return null;

          return {
            type: "community",
            score,
            text: `${community.title}. ${community.label || ""}. ${
              community.tag?.join(", ") || ""
            }`.trim(),
          };
        }

        // Fallback
        return {
          type: node.entityType,
          score,
          text: node.text,
        };
      })
      .filter(Boolean);

    enrichedTerritories.push({
      ...territory,
      representativeTexts,
    });
  }

  return enrichedTerritories;
}

// ─────────────────────────────
// LLM: Territory Naming (Utility)
// ─────────────────────────────
function extractJSON(text) {
  // Remove markdown code fences if present
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleaned);
}

// ─────────────────────────────
// LLM: Territory Naming (Main)
// ─────────────────────────────
async function nameTerritoryWithLLM(
  representativeTexts,
  existingNames = [],
  forbiddenWords = []
) {
  const examples = representativeTexts
    .slice(0, MAX_REPRESENTATIVE_TEXTS)
    .map((t, i) => `${i + 1}. ${t.text}`)
    .join("\n");

  const usedNamesBlock =
    existingNames.length > 0
      ? `Already used territory names:\n- ${existingNames.join("\n- ")}`
      : "No territory names have been assigned yet.";

  const forbiddenWordsBlock =
    forbiddenWords.length > 0
      ? `Avoid using these words or close variants:\n- ${forbiddenWords.join(
          "\n- "
        )}`
      : "";

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.35, // slightly higher for creativity, still stable
    messages: [
      {
        role: "system",
        content: `
You are an expert at naming conceptual domains and interest areas.
Strict rules:
- Names must be 1 to 3 words
- Do NOT reuse any previously used territory name
- Do NOT reuse key words or close variants from previous names
- Avoid generic prefixes like "Campus", "College", "Student" unless unavoidable
- Prefer reframing the idea instead of rewording it
  (e.g. social, activity-based, identity-based, cultural, practical)
- Avoid emojis, punctuation, filler words, or jargon
- The name must feel natural to a college student
- The name must be clearly distinct from all previous names
${usedNamesBlock}
${forbiddenWordsBlock}
Before answering:
- Think of 3 possible names
- Reject any that reuse forbidden words
- Pick the most distinct one
        `.trim(),
      },
      {
        role: "user",
        content: `
Here are representative items from a semantic cluster:
${examples}
Respond strictly in JSON:
{
  "name": "",
  "aliases": [],
  "description": "",
  "tags": []
}
        `.trim(),
      },
    ],
  });

  return extractJSON(response.choices[0].message.content);
}

// ─────────────────────────────
// Normalize importance score
// ─────────────────────────────
function normalizeImportances(territories) {
  const values = territories.map((t) => t.rawImportance);

  const min = Math.min(...values);
  const max = Math.max(...values);

  return territories.map((t) => ({
    ...t,
    importanceScore: max === min ? 0.5 : (t.rawImportance - min) / (max - min),
  }));
}

// ─────────────────────────────
// Calculating importance of clusters
// ─────────────────────────────
async function computeTerritoryImportanceFromNodes(nodeIds) {
  const nodes = await SemanticNode.find(
    { _id: { $in: nodeIds } },
    { embedding: 0 }
  ).lean();

  const nodeCount = nodes.length;

  const totalImportance = nodes.reduce(
    (sum, n) => sum + (n.position?.importance || 0),
    0
  );

  const avgImportance = nodeCount > 0 ? totalImportance / nodeCount : 0;

  const nodeCountFactor = Math.log(1 + nodeCount);

  // Weights (tunable, sane defaults)
  const importance =
    0.6 * totalImportance + 0.3 * avgImportance + 0.1 * nodeCountFactor;

  return Number(importance.toFixed(4));
}

// ─────────────────────────────
// Helper function to avoid repetitive words in LLM naming
// ─────────────────────────────
function extractForbiddenWords(names) {
  const STOPWORDS = new Set([
    "and",
    "of",
    "the",
    "for",
    "to",
    "in",
    "on",
    "with",
    "life",
  ]);

  return Array.from(
    new Set(
      names.flatMap((name) =>
        name
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      )
    )
  );
}

// ─────────────────────────────
// Converting importance score into spatial co-ordinates
// ─────────────────────────────
// 1 - Defining tunable parameters
const WORLD_RADIUS = 5000; // canvas size
const BASE_TERRITORY_RADIUS = 220; // base size
// 2 - Convert importance score into territory radius
function territoryRadius(importance) {
  return BASE_TERRITORY_RADIUS * Math.sqrt(importance + 0.05);
}
// 3 - Initial spiral placement of territories
function initialPlacement(index) {
  const angle = index * 2.399963; // golden angle
  const radius = 120 * Math.sqrt(index);

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}
// 4 - Build physics object (x,y,r)
function generateBodies(territories) {
  return territories.map((t, i) => {
    const { x, y } = initialPlacement(i);

    return {
      id: t.clusterId,
      x,
      y,
      r: territoryRadius(t.importanceScore),
    };
  });
}
// 5 - Collision resolution loop
function resolveCollisions(bodies, iterations = 80) {
  const padding = 40;

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
// 6 - Normalize into world bounds
function normalizeWorld(bodies) {
  const xs = bodies.map((b) => b.x);
  const ys = bodies.map((b) => b.y);

  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  bodies.forEach((b) => {
    b.x -= cx;
    b.y -= cy;
  });

  return bodies;
}
// 7 - Generate polygone boundaries for rendering
// Helper function to smmothen the polygon boundaries
function chaikinSmooth(points, iterations = 2) {
  let pts = points;

  for (let k = 0; k < iterations; k++) {
    const newPts = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];

      // Q and R points
      const Q = [0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2];
      const R = [0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2];

      newPts.push(Q, R);
    }

    // close shape
    newPts.push(newPts[0]);
    pts = newPts;
  }

  return pts;
}

function generatePolygon(cx, cy, radius, points = 24) {
  let coords = [];

  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const noise = 0.85 + Math.random() * 0.3;

    coords.push([
      cx + Math.cos(angle) * radius * noise,
      cy + Math.sin(angle) * radius * noise,
    ]);
  }

  // close polygon
  coords.push(coords[0]);

  // smoothen the co-ordinates
  coords = chaikinSmooth(coords, 2);

  return {
    type: "Polygon",
    coordinates: [coords],
  };
}
// 8 - Generate BBox
function computeBBox(cx, cy, r) {
  return {
    xMin: cx - r,
    yMin: cy - r,
    xMax: cx + r,
    yMax: cy + r,
  };
}

// ─────────────────────────────
// Controller: Cluster Semantic Nodes
// ─────────────────────────────
const clusterSemanticNodes = async (req, res) => {
  try {
    // ---- Authorization ----
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    console.log("Fetching semantic nodes with embeddings...");

    // ---- Fetch Nodes ----
    const nodes = await SemanticNode.find({
      embedding: { $exists: true, $ne: [] },
      entityType: { $ne: "territory" },
    }).lean();

    if (nodes.length < MIN_NODES_FOR_CLUSTERING) {
      throw new Error("Not enough nodes to cluster");
    }

    // ---- Prepare Embeddings ----
    const embeddings = nodes.map((n) => n.embedding);
    const nodeIds = nodes.map((n) => n._id.toString());
    const K = chooseK(nodes.length);

    console.log(`Clustering ${nodes.length} nodes into ${K} territories`);

    // ---- K-Means Clustering ----
    const { clusters: assignments } = kmeans(embeddings, K, {
      maxIterations: 100,
      tolerance: 1e-6,
    });

    // ---- Build Cluster Buckets ----
    const clusterMap = {};

    assignments.forEach((clusterId, index) => {
      if (!clusterMap[clusterId]) {
        clusterMap[clusterId] = {
          clusterId,
          memberNodeIds: [],
          embeddings: [],
        };
      }

      clusterMap[clusterId].memberNodeIds.push(nodeIds[index]);
      clusterMap[clusterId].embeddings.push(embeddings[index]);
    });

    // ---- Compute Territory Centroids ----
    const territoryCandidates = Object.values(clusterMap).map((cluster) => ({
      clusterId: cluster.clusterId,
      memberNodeIds: cluster.memberNodeIds,
      centroidEmbedding: _.zip(...cluster.embeddings).map(_.mean),
      size: cluster.memberNodeIds.length,
    }));

    console.log(
      "Clusters formed:",
      territoryCandidates.map((t) => ({
        clusterId: t.clusterId,
        size: t.size,
      }))
    );

    // ---- Representative Texts ----
    const enrichedTerritories = await getRepresentativeTextsForClusters(
      territoryCandidates,
      nodes
    );

    // ---- LLM Naming ----
    const labeledTerritories = [];
    const usedNames = [];

    for (const territory of enrichedTerritories) {
      const forbiddenWords = extractForbiddenWords(usedNames);

      const label = await nameTerritoryWithLLM(
        territory.representativeTexts,
        usedNames,
        forbiddenWords
      );

      usedNames.push(label.name);

      labeledTerritories.push({
        ...territory,
        name: label.name,
        aliases: label.aliases,
        description: label.description,
        tags: label.tags,
      });
    }

    // ---- Cluster importance score ----
    const rawRatedTerritories = await Promise.all(
      labeledTerritories.map(async (territory) => {
        const rawScore = await computeTerritoryImportanceFromNodes(
          territory.memberNodeIds
        );

        return {
          ...territory,
          rawImportance: rawScore,
        };
      })
    );
    const ratedTerritories = normalizeImportances(rawRatedTerritories);

    // ---- Spatial Compilation ----

    // 1. Build physics bodies
    let bodies = generateBodies(ratedTerritories);

    // 2. Resolve overlaps
    bodies = resolveCollisions(bodies, 80);

    // 3. Normalize world to center
    bodies = normalizeWorld(bodies);

    // 4. Attach spatial data back to territories
    const spatializedTerritories = ratedTerritories.map((territory) => {
      const body = bodies.find((b) => b.id === territory.clusterId);

      const geometry = generatePolygon(body.x, body.y, body.r);

      return {
        ...territory,
        spatial: {
          center: {
            cx: body.x,
            cy: body.y,
          },
          radius: body.r,
          bbox: computeBBox(body.x, body.y, body.r),
          geometry,
          zMin: 0,
          zMax: 0.8,
        },
      };
    });

    // 5. Persist the newly created territories
    await Territory.deleteMany({});

    const territoryDocs = spatializedTerritories.map((t) => ({
      name: t.name,
      aliases: t.aliases,
      description: t.description,
      tags: t.tags,

      clusterId: t.clusterId,
      memberNodeIds: t.memberNodeIds,

      centroidEmbedding: t.centroidEmbedding,
      size: t.size,

      importanceScore: t.importanceScore,
      rawImportance: t.rawImportance,

      spatial: t.spatial,
    }));

    await Territory.insertMany(territoryDocs);

    const savedTerritories = await Territory.find({}).lean();

    return res.status(StatusCodes.OK).json({
      territories: savedTerritories,
    });
  } catch (error) {
    console.error("Error creating territories:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while creating territories.",
    });
  }
};

const getAllTerritories = async (req, res) => {
  try {
    const territories = await Territory.find(
      {},
      {
        centroidEmbedding: 0,
        memberNodeIds: 0,
        __v: 0,
      }
    ).lean();

    return res.status(200).json({
      success: true,
      count: territories.length,
      territories,
    });
  } catch (error) {
    console.error("Error fetching territories:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch territories",
      error: error.message,
    });
  }
};

/**
 * Get all semantic nodes belonging to a territory
 */
const getDetailsOfTerritory = async (req, res) => {
  try {
    const { territoryId } = req.query;

    if (!territoryId) {
      return res.status(400).json({
        success: false,
        message: "territoryId is required",
      });
    }

    //  Fetch territory
    const territory = await Territory.findById(territoryId).lean();

    if (!territory) {
      return res.status(404).json({
        success: false,
        message: "Territory not found",
      });
    }

    const nodeIds = territory.memberNodeIds || [];

    if (nodeIds.length === 0) {
      return res.status(200).json({
        success: true,
        nodes: [],
      });
    }

    // Fetch nodes
    const nodes = await SemanticNode.find(
      { _id: { $in: nodeIds } },
      {
        embedding: 0,
        __v: 0,
      }
    ).lean();

    return res.status(200).json({
      success: true,
      territoryId,
      count: nodes.length,
      detail: { nodes, ...territory },
    });
  } catch (error) {
    console.error("Error fetching nodes for territory:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch nodes for territory",
      error: error.message,
    });
  }
};

// ─────────────────────────────
// Exports
// ─────────────────────────────
module.exports = {
  clusterSemanticNodes,
  getAllTerritories,
  getDetailsOfTerritory,
};