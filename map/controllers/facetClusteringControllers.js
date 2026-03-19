/**
 * Facet Clustering Controller
 * ────────────────────────────
 * Pipeline:
 * 1. Fetch all profile_facet semantic nodes with embeddings
 * 2. K-Means cluster embeddings (max 300 nodes per cluster)
 * 3. Compute centroid embedding per cluster
 * 4. Extract representative texts (closest to centroid)
 * 5. LLM-name each territory (name, aliases, description, tags)
 * 6. Compute importance scores
 * 7. Spatial layout: spiral → collision resolution → polygon
 * 8. Persist Territory documents (source: "facet")
 */

const OpenAI = require("openai");
const _ = require("lodash");
const { StatusCodes } = require("http-status-codes");

const SemanticNode = require("../models/semanticNode");
const Territory = require("../models/territory");

// ─────────────────────────────
// OpenAI Client
// ─────────────────────────────
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────
// Constants
// ─────────────────────────────
const MIN_NODES_FOR_CLUSTERING = 5;
const MAX_NODES_PER_CLUSTER = 300;
const TARGET_NODES_PER_CLUSTER = 200;
const MAX_REPRESENTATIVE_TEXTS = 20;
const LLM_MODEL = "gpt-4.1-mini";

// Spatial constants
const BASE_TERRITORY_RADIUS = 220;

// ─────────────────────────────
// Lazy-load ml-kmeans (ESM)
// ─────────────────────────────
let kmeans;
async function loadKMeans() {
  if (!kmeans) {
    const module = await import("ml-kmeans");
    kmeans = module.kmeans;
  }
}

// ═══════════════════════════════════════
// Math Utilities
// ═══════════════════════════════════════

function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function computeCentroid(embeddings) {
  return _.zip(...embeddings).map(_.mean);
}

// ═══════════════════════════════════════
// Step 2: K-Means with max-cluster-size
// ═══════════════════════════════════════

function chooseK(n) {
  return Math.max(3, Math.ceil(n / TARGET_NODES_PER_CLUSTER));
}

/**
 * Runs K-Means and recursively re-splits any cluster exceeding MAX_NODES_PER_CLUSTER.
 * Returns: Array of { memberIndices: number[], embeddings: number[][] }
 */
function runClusteringWithCap(allEmbeddings) {
  const K = chooseK(allEmbeddings.length);
  console.log(
    `[FacetCluster] Clustering ${allEmbeddings.length} nodes into K=${K}`,
  );

  const { clusters: assignments } = kmeans(allEmbeddings, K, {
    maxIterations: 100,
    tolerance: 1e-6,
  });

  // Group indices by cluster
  const buckets = {};
  assignments.forEach((clusterId, idx) => {
    if (!buckets[clusterId]) buckets[clusterId] = [];
    buckets[clusterId].push(idx);
  });

  const finalClusters = [];

  for (const indices of Object.values(buckets)) {
    if (indices.length <= MAX_NODES_PER_CLUSTER) {
      finalClusters.push({
        memberIndices: indices,
        embeddings: indices.map((i) => allEmbeddings[i]),
      });
    } else {
      // Re-split oversized cluster
      console.log(
        `[FacetCluster] Cluster of size ${indices.length} exceeds cap, re-splitting...`,
      );
      const subEmbeddings = indices.map((i) => allEmbeddings[i]);
      const subClusters = runClusteringWithCap(subEmbeddings);

      // Map sub-indices back to global indices
      for (const sub of subClusters) {
        finalClusters.push({
          memberIndices: sub.memberIndices.map((si) => indices[si]),
          embeddings: sub.embeddings,
        });
      }
    }
  }

  return finalClusters;
}

// ═══════════════════════════════════════
// Step 4: Representative Text Extraction
// ═══════════════════════════════════════

function getRepresentativeTexts(nodes, centroid, topK = MAX_REPRESENTATIVE_TEXTS) {
  return nodes
    .map((node) => ({
      node,
      score: cosineSimilarity(node.embedding, centroid),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ node, score }) => ({
      type: "profile_facet",
      score,
      text: `${node.meta?.facetLabel || "Unknown"}: ${node.text}`,
    }));
}

// ═══════════════════════════════════════
// Step 5: LLM Territory Naming
// ═══════════════════════════════════════

function extractJSON(text) {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(cleaned);
}

function extractForbiddenWords(names) {
  const STOPWORDS = new Set([
    "and", "of", "the", "for", "to", "in", "on", "with", "life",
  ]);

  return Array.from(
    new Set(
      names.flatMap((name) =>
        name
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
      ),
    ),
  );
}

async function nameTerritoryWithLLM(
  representativeTexts,
  existingNames = [],
  forbiddenWords = [],
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
      ? `Avoid using these words or close variants:\n- ${forbiddenWords.join("\n- ")}`
      : "";

  const response = await client.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content: `
You are an expert at naming conceptual domains and interest areas.
These clusters are formed from user profile interest facets — each text describes
a person's connection to a particular domain.

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
Here are representative user interest facets from a semantic cluster:
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

// ═══════════════════════════════════════
// Step 6: Importance
// ═══════════════════════════════════════

function computeImportances(territories) {
  // Raw importance: log-scaled cluster size
  const withRaw = territories.map((t) => ({
    ...t,
    rawImportance: Math.log(1 + t.size),
  }));

  // Normalize to 0–1
  const values = withRaw.map((t) => t.rawImportance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return withRaw.map((t) => ({
    ...t,
    importanceScore:
      max === min ? 0.5 : (t.rawImportance - min) / (max - min),
  }));
}

// ═══════════════════════════════════════
// Step 7: Spatial Layout
// ═══════════════════════════════════════

function territoryRadius(importance) {
  return BASE_TERRITORY_RADIUS * Math.sqrt(importance + 0.05);
}

function initialPlacement(index) {
  const angle = index * 2.399963; // golden angle
  const radius = 120 * Math.sqrt(index);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

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

function chaikinSmooth(points, iterations = 2) {
  let pts = points;

  for (let k = 0; k < iterations; k++) {
    const newPts = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];

      const Q = [0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2];
      const R = [0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2];

      newPts.push(Q, R);
    }

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

  coords.push(coords[0]); // close polygon
  coords = chaikinSmooth(coords, 2);

  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

function computeBBox(cx, cy, r) {
  return {
    xMin: cx - r,
    yMin: cy - r,
    xMax: cx + r,
    yMax: cy + r,
  };
}

// ═══════════════════════════════════════
// Main Controller: clusterFacetsIntoTerritories
// ═══════════════════════════════════════

const clusterFacetsIntoTerritories = async (req, res) => {
  try {
    // ---- Authorization ----
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    console.log("[FacetCluster] Fetching profile_facet nodes with embeddings...");

    // ── Step 1: Fetch nodes ──
    const nodes = await SemanticNode.find({
      entityType: "profile_facet",
      embedding: { $exists: true, $ne: [] },
    }).lean();

    if (nodes.length < MIN_NODES_FOR_CLUSTERING) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: `Not enough facet nodes to cluster. Found ${nodes.length}, need at least ${MIN_NODES_FOR_CLUSTERING}.`,
      });
    }

    console.log(`[FacetCluster] Found ${nodes.length} facet nodes.`);

    // ── Step 2: Cluster ──
    await loadKMeans();
    const allEmbeddings = nodes.map((n) => n.embedding);
    const clusters = runClusteringWithCap(allEmbeddings);

    console.log(
      `[FacetCluster] Formed ${clusters.length} clusters:`,
      clusters.map((c) => c.memberIndices.length),
    );

    // ── Step 3: Build territory candidates ──
    const territoryCandidates = clusters.map((cluster, idx) => {
      const memberNodes = cluster.memberIndices.map((i) => nodes[i]);
      const centroid = computeCentroid(cluster.embeddings);

      return {
        clusterId: idx,
        memberNodeIds: memberNodes.map((n) => n._id.toString()),
        memberNodes,
        centroidEmbedding: centroid,
        size: memberNodes.length,
      };
    });

    // ── Step 4: Representative texts ──
    const enrichedTerritories = territoryCandidates.map((territory) => {
      const representativeTexts = getRepresentativeTexts(
        territory.memberNodes,
        territory.centroidEmbedding,
      );

      return {
        ...territory,
        representativeTexts,
      };
    });

    // ── Step 5: LLM naming ──
    console.log("[FacetCluster] Naming territories via LLM...");
    const labeledTerritories = [];
    const usedNames = [];

    for (const territory of enrichedTerritories) {
      const forbiddenWords = extractForbiddenWords(usedNames);

      try {
        const label = await nameTerritoryWithLLM(
          territory.representativeTexts,
          usedNames,
          forbiddenWords,
        );

        usedNames.push(label.name);

        labeledTerritories.push({
          ...territory,
          name: label.name,
          aliases: label.aliases,
          description: label.description,
          tags: label.tags,
        });
      } catch (err) {
        console.error(
          `[FacetCluster] LLM naming failed for cluster ${territory.clusterId}:`,
          err.message,
        );
        // Fallback name
        const fallbackName = `Interest Zone ${territory.clusterId + 1}`;
        usedNames.push(fallbackName);

        labeledTerritories.push({
          ...territory,
          name: fallbackName,
          aliases: [],
          description: "Auto-generated territory from user interest facets.",
          tags: [],
        });
      }
    }

    // ── Step 6: Importance ──
    const ratedTerritories = computeImportances(labeledTerritories);

    // ── Step 7: Spatial layout ──
    let bodies = generateBodies(ratedTerritories);
    bodies = resolveCollisions(bodies, 80);
    bodies = normalizeWorld(bodies);

    const spatializedTerritories = ratedTerritories.map((territory) => {
      const body = bodies.find((b) => b.id === territory.clusterId);
      const geometry = generatePolygon(body.x, body.y, body.r);

      return {
        ...territory,
        spatial: {
          center: { cx: body.x, cy: body.y },
          radius: body.r,
          bbox: computeBBox(body.x, body.y, body.r),
          geometry,
          zMin: 0,
          zMax: 0.8,
        },
      };
    });

    // ── Step 8: Persist ──
    console.log("[FacetCluster] Persisting territories...");

    // Clear previous facet territories only
    await Territory.deleteMany({ source: "facet" });

    const territoryDocs = spatializedTerritories.map((t) => ({
      clusterId: t.clusterId,
      memberNodeIds: t.memberNodeIds,
      centroidEmbedding: t.centroidEmbedding,
      size: t.size,
      representativeTexts: t.representativeTexts,
      name: t.name,
      aliases: t.aliases,
      description: t.description,
      tags: t.tags,
      rawImportance: t.rawImportance,
      importanceScore: t.importanceScore,
      spatial: t.spatial,
      source: "facet",
    }));

    await Territory.insertMany(territoryDocs);

    const savedTerritories = await Territory.find({ source: "facet" })
      .select("-centroidEmbedding")
      .lean();

    console.log(
      `[FacetCluster] Done. Created ${savedTerritories.length} facet territories.`,
    );

    return res.status(StatusCodes.CREATED).json({
      message: "Facet territory clustering completed.",
      totalFacetNodes: nodes.length,
      territoriesCreated: savedTerritories.length,
      territories: savedTerritories.map((t) => ({
        _id: t._id,
        name: t.name,
        aliases: t.aliases,
        description: t.description,
        tags: t.tags,
        size: t.size,
        importanceScore: t.importanceScore,
      })),
    });
  } catch (error) {
    console.error("[FacetCluster] Controller error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while clustering facets into territories.",
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════
// Controller: Assign Facet Spatial Coordinates
// ═══════════════════════════════════════
/**
 * After clusterFacetsIntoTerritories has run, this controller:
 * 1. For each facet territory, fetches member nodes (with embeddings + centroid)
 * 2. Scores each node by cosine similarity to the territory centroid
 * 3. Places nodes using golden-angle spiral: higher similarity → closer to center
 * 4. Resolves collisions so nodes don't overlap
 * 5. Converts to world-space and bulk-writes position to the DB
 */
const assignFacetSpatialCoordinates = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    console.log("[FacetSpatial] Fetching facet territories...");

    // Fetch all facet territories (need centroid for similarity scoring)
    const territories = await Territory.find({ source: "facet" })
      .select("+centroidEmbedding") // centroidEmbedding is select:false by default
      .lean();

    if (!territories.length) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "No facet territories found. Run clusterFacetsIntoTerritories first.",
      });
    }

    let totalProcessed = 0;

    for (const territory of territories) {
      const { memberNodeIds, spatial, centroidEmbedding } = territory;

      if (!memberNodeIds?.length || !spatial) continue;

      // Fetch member nodes with embeddings
      const nodes = await SemanticNode.find({
        _id: { $in: memberNodeIds },
      }).lean();

      if (!nodes.length) continue;

      // ── Score each node by cosine similarity to centroid ──
      const scored = nodes.map((node) => {
        const sim =
          node.embedding && centroidEmbedding
            ? cosineSimilarity(node.embedding, centroidEmbedding)
            : 0;
        return { node, similarity: sim };
      });

      // Sort by similarity descending (most similar first → placed closer to center)
      scored.sort((a, b) => b.similarity - a.similarity);

      // ── Normalize similarity scores to [0, 1] ──
      const sims = scored.map((s) => s.similarity);
      const simMin = Math.min(...sims);
      const simMax = Math.max(...sims);
      const simRange = simMax - simMin || 1;

      const maxR = spatial.radius * 0.85;
      const NODE_VISUAL_RADIUS = 10;

      // Create 3-5 random "continents" (sub-centers) to create uneven density
      const numAnchors = 3 + Math.floor(Math.random() * 3);
      const anchors = Array.from({ length: numAnchors }, () => Math.random() * Math.PI * 2);

      const bodies = scored.map(({ node, similarity }) => {
        const normSim = (similarity - simMin) / simRange; // 1 = most similar

        // Similarity biases toward center
        const bandLow = (1 - normSim) * maxR * 0.3;
        const bandHigh = maxR * (0.4 + (1 - normSim) * 0.6);
        const r = bandLow + Math.random() * (bandHigh - bandLow);

        // Pick a random anchor to cluster around
        const baseAngle = anchors[Math.floor(Math.random() * anchors.length)];
        
        // Add Gaussian-like noise to cluster around the anchor (leaves empty spaces between)
        // Sum of 3 uniform distributions approximates Gaussian
        const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 1.5; 
        const angle = baseAngle + noise;

        return {
          nodeId: node._id,
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          r: NODE_VISUAL_RADIUS,
        };
      });

      // ── Collision resolution ──
      const padding = 4;
      for (let iter = 0; iter < 60; iter++) {
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

      // ── Convert to world space + bulk write ──
      const cx = spatial.center.cx;
      const cy = spatial.center.cy;

      const bulkOps = bodies.map((body) => ({
        updateOne: {
          filter: { _id: body.nodeId },
          update: {
            $set: {
              "position.x": cx + body.x,
              "position.y": cy + body.y,
              "position.zMin": spatial.zMin || 0,
              "position.zMax": spatial.zMax || 0.8,
            },
          },
        },
      }));

      if (bulkOps.length) {
        await SemanticNode.bulkWrite(bulkOps);
      }

      totalProcessed += bodies.length;

      console.log(
        `[FacetSpatial] Territory "${territory.name}": placed ${bodies.length} nodes`,
      );
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Facet spatial coordinates assigned successfully.",
      territoriesProcessed: territories.length,
      nodesProcessed: totalProcessed,
    });
  } catch (error) {
    console.error("[FacetSpatial] Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while assigning facet spatial coordinates.",
      error: error.message,
    });
  }
};

// ─────────────────────────────
// Exports
// ─────────────────────────────
module.exports = {
  clusterFacetsIntoTerritories,
  assignFacetSpatialCoordinates,
};
