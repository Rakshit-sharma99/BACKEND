/**
 * Alumni Clustering Controller
 * ─────────────────────────────
 * Pipeline:
 * 1. Fetch all alumni_facet semantic nodes
 * 2. Group nodes by company (meta.company)
 * 3. Create parent "Alumni" territory
 * 4. For each company group: K-Means cluster by role → sub-territory
 * 5. Spatial layout (parent territory + sub-territories inside it)
 * 6. Persist Territory documents (source: "alumni")
 * 7. Assign spatial coordinates to individual nodes
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
const MIN_NODES_FOR_COMPANY_CLUSTER = 3;
const MAX_NODES_PER_CLUSTER = 300;
const TARGET_NODES_PER_CLUSTER = 200;
const LLM_MODEL = "gpt-4.1-mini";

// Spatial constants
const PARENT_TERRITORY_RADIUS = 800;
const BASE_SUB_TERRITORY_RADIUS = 180;

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
// K-Means Clustering
// ═══════════════════════════════════════

function chooseK(n) {
  return Math.max(2, Math.ceil(n / TARGET_NODES_PER_CLUSTER));
}

function runClusteringWithCap(allEmbeddings) {
  if (allEmbeddings.length < 2) {
    return [
      {
        memberIndices: allEmbeddings.map((_, i) => i),
        embeddings: allEmbeddings,
      },
    ];
  }

  const K = Math.min(chooseK(allEmbeddings.length), allEmbeddings.length);
  const { clusters: assignments } = kmeans(allEmbeddings, K, {
    maxIterations: 100,
    tolerance: 1e-6,
  });

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
      const subEmbeddings = indices.map((i) => allEmbeddings[i]);
      const subClusters = runClusteringWithCap(subEmbeddings);

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
// Spatial Layout Utilities
// ═══════════════════════════════════════

function initialPlacement(index) {
  const angle = index * 2.399963; // golden angle
  const radius = 120 * Math.sqrt(index);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
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

  coords.push(coords[0]);
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

function computeImportances(territories) {
  const withRaw = territories.map((t) => ({
    ...t,
    rawImportance: Math.log(1 + t.size),
  }));

  const values = withRaw.map((t) => t.rawImportance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return withRaw.map((t) => ({
    ...t,
    importanceScore:
      max === min ? 0.5 : (t.rawImportance - min) / (max - min),
  }));
}

function subTerritoryRadius(importance) {
  return BASE_SUB_TERRITORY_RADIUS * Math.sqrt(importance + 0.05);
}

// ═══════════════════════════════════════
// Main Controller: clusterAlumniIntoTerritories
// ═══════════════════════════════════════

const clusterAlumniIntoTerritories = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    console.log("[AlumniCluster] Fetching alumni_facet nodes...");

    // ── Step 1: Fetch all alumni_facet nodes ──
    const nodes = await SemanticNode.find({
      entityType: "alumni_facet",
      embedding: { $exists: true, $ne: [] },
    }).lean();

    if (!nodes.length) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "No alumni facet nodes found. Run createAlumniNodes first.",
      });
    }

    console.log(`[AlumniCluster] Found ${nodes.length} alumni facet nodes.`);

    // ── Step 2: Group nodes by company ──
    const companyGroups = {};
    for (const node of nodes) {
      const company = node.meta?.company || "Unknown";
      if (!companyGroups[company]) companyGroups[company] = [];
      companyGroups[company].push(node);
    }

    const companyNames = Object.keys(companyGroups);
    console.log(
      `[AlumniCluster] Found ${companyNames.length} companies:`,
      companyNames,
    );

    // ── Step 3: Drop stale unique index on clusterId (if exists) & clear previous alumni territories ──
    try {
      await Territory.collection.dropIndex("clusterId_1");
      console.log("[AlumniCluster] Dropped stale unique index: clusterId_1");
    } catch (indexErr) {
      // Index may not exist if already dropped — that's fine
      if (indexErr.codeName !== "IndexNotFound") {
        console.log("[AlumniCluster] No stale clusterId_1 index to drop (already clean)");
      }
    }
    await Territory.deleteMany({ source: "alumni" });
    console.log("[AlumniCluster] Cleared previous alumni territories");

    // ── Step 4: Create parent "Alumni" territory ──
    const parentGeometry = generatePolygon(0, 0, PARENT_TERRITORY_RADIUS);
    const parentTerritory = await Territory.create({
      clusterId: 0,
      name: "Alumni",
      aliases: ["Alumni Network", "Graduates"],
      description:
        "Parent territory encompassing all alumni, organized by company.",
      tags: ["alumni", "graduates", "professional"],
      memberNodeIds: nodes.map((n) => n._id.toString()),
      centroidEmbedding: [],
      size: nodes.length,
      representativeTexts: [],
      rawImportance: 1,
      importanceScore: 1,
      spatial: {
        center: { cx: 0, cy: 0 },
        radius: PARENT_TERRITORY_RADIUS,
        bbox: computeBBox(0, 0, PARENT_TERRITORY_RADIUS),
        geometry: parentGeometry,
        zMin: 0,
        zMax: 0.4,
      },
      source: "alumni",
      uid: nodes[0]?.uid || "unknown",
      parentTerritoryId: null,
    });

    console.log(`[AlumniCluster] Created parent territory: ${parentTerritory._id}`);

    // ── Step 5: Create sub-territories per company ──
    await loadKMeans();

    // Build sub-territory candidates
    const subTerritoryCandidates = [];
    let clusterCounter = 1;

    for (const [company, companyNodes] of Object.entries(companyGroups)) {
      if (companyNodes.length < MIN_NODES_FOR_COMPANY_CLUSTER) {
        // Small company groups become a single sub-territory without K-Means
        subTerritoryCandidates.push({
          clusterId: clusterCounter++,
          company,
          memberNodeIds: companyNodes.map((n) => n._id.toString()),
          size: companyNodes.length,
          centroidEmbedding: computeCentroid(
            companyNodes.map((n) => n.embedding),
          ),
        });
      } else {
        // Larger groups: K-Means to cluster by role within the company
        const embeddings = companyNodes.map((n) => n.embedding);
        const clusters = runClusteringWithCap(embeddings);

        for (const cluster of clusters) {
          const memberNodes = cluster.memberIndices.map(
            (i) => companyNodes[i],
          );
          subTerritoryCandidates.push({
            clusterId: clusterCounter++,
            company,
            memberNodeIds: memberNodes.map((n) => n._id.toString()),
            size: memberNodes.length,
            centroidEmbedding: computeCentroid(cluster.embeddings),
          });
        }
      }
    }

    // ── Step 6: Compute importances ──
    const ratedSubTerritories = computeImportances(subTerritoryCandidates);

    // ── Step 7: Spatial layout for sub-territories inside parent ──
    const maxPlacementRadius = PARENT_TERRITORY_RADIUS * 0.75;

    let bodies = ratedSubTerritories.map((t, i) => {
      const { x, y } = initialPlacement(i);
      return {
        id: t.clusterId,
        x,
        y,
        r: subTerritoryRadius(t.importanceScore),
      };
    });

    bodies = resolveCollisions(bodies, 80);
    bodies = normalizeWorld(bodies);

    // Clamp within parent radius
    for (const body of bodies) {
      const dist = Math.sqrt(body.x * body.x + body.y * body.y);
      if (dist + body.r > maxPlacementRadius) {
        const scale = (maxPlacementRadius - body.r) / (dist || 1);
        body.x *= scale;
        body.y *= scale;
      }
    }

    // ── Step 8: Persist sub-territories ──
    const subTerritoryDocs = [];

    for (const territory of ratedSubTerritories) {
      const body = bodies.find((b) => b.id === territory.clusterId);
      const geometry = generatePolygon(body.x, body.y, body.r);

      subTerritoryDocs.push({
        clusterId: territory.clusterId,
        parentTerritoryId: parentTerritory._id,
        name: territory.company,
        aliases: [],
        description: `Alumni working at ${territory.company}.`,
        tags: ["alumni", territory.company.toLowerCase()],
        memberNodeIds: territory.memberNodeIds,
        centroidEmbedding: territory.centroidEmbedding,
        size: territory.size,
        representativeTexts: [],
        rawImportance: territory.rawImportance,
        importanceScore: territory.importanceScore,
        spatial: {
          center: { cx: body.x, cy: body.y },
          radius: body.r,
          bbox: computeBBox(body.x, body.y, body.r),
          geometry,
          zMin: 0.4,
          zMax: 0.8,
        },
        source: "alumni",
        uid: nodes[0]?.uid || "unknown",
      });
    }

    await Territory.insertMany(subTerritoryDocs);

    const savedTerritories = await Territory.find({ source: "alumni" })
      .select("-centroidEmbedding")
      .lean();

    console.log(
      `[AlumniCluster] Done. Created ${savedTerritories.length} alumni territories (1 parent + ${savedTerritories.length - 1} sub-territories).`,
    );

    return res.status(StatusCodes.CREATED).json({
      message: "Alumni territory clustering completed.",
      totalAlumniNodes: nodes.length,
      totalCompanies: companyNames.length,
      territoriesCreated: savedTerritories.length,
      parentTerritoryId: parentTerritory._id,
      territories: savedTerritories.map((t) => ({
        _id: t._id,
        name: t.name,
        parentTerritoryId: t.parentTerritoryId,
        size: t.size,
        importanceScore: t.importanceScore,
      })),
    });
  } catch (error) {
    console.error("[AlumniCluster] Controller error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while clustering alumni into territories.",
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════
// Controller: Assign Alumni Spatial Coordinates
// ═══════════════════════════════════════
/**
 * After clusterAlumniIntoTerritories has run, this controller
 * places individual alumni nodes within their company sub-territory.
 */
const assignAlumniSpatialCoordinates = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    console.log("[AlumniSpatial] Fetching alumni sub-territories...");

    // Fetch only sub-territories (those with a parentTerritoryId)
    const territories = await Territory.find({
      source: "alumni",
      parentTerritoryId: { $ne: null },
    })
      .select("+centroidEmbedding")
      .lean();

    if (!territories.length) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message:
          "No alumni sub-territories found. Run clusterAlumniIntoTerritories first.",
      });
    }

    let totalProcessed = 0;

    for (const territory of territories) {
      const { memberNodeIds, spatial, centroidEmbedding } = territory;

      if (!memberNodeIds?.length || !spatial) continue;

      const nodes = await SemanticNode.find({
        _id: { $in: memberNodeIds },
      }).lean();

      if (!nodes.length) continue;

      // Score each node by cosine similarity to territory centroid
      const scored = nodes.map((node) => {
        const sim =
          node.embedding && centroidEmbedding
            ? cosineSimilarity(node.embedding, centroidEmbedding)
            : 0;
        return { node, similarity: sim };
      });

      scored.sort((a, b) => b.similarity - a.similarity);

      // Normalize similarity scores
      const sims = scored.map((s) => s.similarity);
      const simMin = Math.min(...sims);
      const simMax = Math.max(...sims);
      const simRange = simMax - simMin || 1;

      const maxR = spatial.radius * 0.85;
      const NODE_VISUAL_RADIUS = 10;

      // Create sub-centers for organic distribution
      const numAnchors = 3 + Math.floor(Math.random() * 3);
      const anchors = Array.from(
        { length: numAnchors },
        () => Math.random() * Math.PI * 2,
      );

      const nodeBodies = scored.map(({ node, similarity }) => {
        const normSim = (similarity - simMin) / simRange;

        const bandLow = (1 - normSim) * maxR * 0.3;
        const bandHigh = maxR * (0.4 + (1 - normSim) * 0.6);
        const r = bandLow + Math.random() * (bandHigh - bandLow);

        const baseAngle = anchors[Math.floor(Math.random() * anchors.length)];
        const noise =
          (Math.random() + Math.random() + Math.random() - 1.5) * 1.5;
        const angle = baseAngle + noise;

        return {
          nodeId: node._id,
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          r: NODE_VISUAL_RADIUS,
        };
      });

      // Collision resolution
      const padding = 4;
      for (let iter = 0; iter < 60; iter++) {
        for (let i = 0; i < nodeBodies.length; i++) {
          for (let j = i + 1; j < nodeBodies.length; j++) {
            const A = nodeBodies[i];
            const B = nodeBodies[j];

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

      // Convert to world space + bulk write
      const cx = spatial.center.cx;
      const cy = spatial.center.cy;

      const bulkOps = nodeBodies.map((body) => ({
        updateOne: {
          filter: { _id: body.nodeId },
          update: {
            $set: {
              "position.x": cx + body.x,
              "position.y": cy + body.y,
              "position.zMin": spatial.zMin || 0.4,
              "position.zMax": spatial.zMax || 0.8,
            },
          },
        },
      }));

      if (bulkOps.length) {
        await SemanticNode.bulkWrite(bulkOps);
      }

      totalProcessed += nodeBodies.length;

      console.log(
        `[AlumniSpatial] Territory "${territory.name}": placed ${nodeBodies.length} nodes`,
      );
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Alumni spatial coordinates assigned successfully.",
      territoriesProcessed: territories.length,
      nodesProcessed: totalProcessed,
    });
  } catch (error) {
    console.error("[AlumniSpatial] Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message:
        "An error occurred while assigning alumni spatial coordinates.",
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════
// Controller: Reposition Alumni Territories
// ═══════════════════════════════════════
/**
 * Temporary controller that:
 * 1. Finds a clear region for the Alumni parent territory (no overlap with existing)
 * 2. Re-layouts company sub-territories inside the parent
 * 3. Sets z-ranges for zoom-based visibility
 * 4. Reassigns individual alumni node positions
 */
const repositionAlumniTerritories = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    console.log("[AlumniReposition] ── Starting repositioning pipeline ──");

    // ── Step 1: Fetch all territories ──
    const alumniParent = await Territory.findOne({
      source: "alumni",
      parentTerritoryId: null,
    }).lean();

    if (!alumniParent) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "No Alumni parent territory found. Run clusterAlumniIntoTerritories first.",
      });
    }

    const alumniSubTerritories = await Territory.find({
      source: "alumni",
      parentTerritoryId: { $ne: null },
    })
      .select("+centroidEmbedding")
      .lean();

    const otherTerritories = await Territory.find({
      source: { $ne: "alumni" },
    })
      .select("spatial name")
      .lean();

    console.log(`[AlumniReposition] Found ${otherTerritories.length} non-alumni territories to avoid`);
    console.log(`[AlumniReposition] Found ${alumniSubTerritories.length} alumni sub-territories to re-layout`);

    // ── Step 2: Compute sub-territory sizes FIRST (needed to size the parent) ──

    // Compute importances for sizing
    const subWithImportance = computeImportances(
      alumniSubTerritories.map((t) => ({ ...t, size: t.size || t.memberNodeIds?.length || 1 })),
    );

    // Use smaller base radius — scale by member count, not just importance
    const SUB_BASE_RADIUS = 50;
    const SUB_MAX_RADIUS = 120;

    function computeSubRadius(territory) {
      const memberCount = territory.memberNodeIds?.length || 1;
      // sqrt scaling: 1 member → 50, 4 → 100, 9+ → 120 (capped)
      return Math.min(SUB_MAX_RADIUS, SUB_BASE_RADIUS * Math.sqrt(memberCount));
    }

    // Build bodies relative to origin (local coords)
    let subBodies = subWithImportance.map((t, i) => {
      const r = computeSubRadius(t);
      const { x, y } = initialPlacement(i);
      return {
        id: t._id.toString(),
        x,
        y,
        r,
      };
    });

    // Run collision resolution BEFORE computing parent size
    subBodies = resolveCollisions(subBodies, 150);
    subBodies = normalizeWorld(subBodies);

    // Now compute parent radius dynamically — enclose all sub-territories with padding
    const INTERNAL_PADDING = 80;
    let maxExtent = 0;
    for (const body of subBodies) {
      const extent = Math.sqrt(body.x * body.x + body.y * body.y) + body.r;
      if (extent > maxExtent) maxExtent = extent;
    }
    const ALUMNI_RADIUS = Math.max(PARENT_TERRITORY_RADIUS, maxExtent + INTERNAL_PADDING);

    console.log(`[AlumniReposition] Computed dynamic parent radius: ${Math.round(ALUMNI_RADIUS)} (${subBodies.length} sub-territories, max extent: ${Math.round(maxExtent)})`);

    // ── Step 2b: Find clear position via spiral scan ──
    const PADDING = 120;

    // Build collision bodies from existing territories
    const obstacles = otherTerritories
      .filter((t) => t.spatial?.center && t.spatial?.radius)
      .map((t) => ({
        cx: t.spatial.center.cx,
        cy: t.spatial.center.cy,
        r: t.spatial.radius,
        name: t.name,
      }));

    console.log(`[AlumniReposition] Obstacle territories: ${obstacles.map((o) => `${o.name}(r=${Math.round(o.r)})`).join(", ")}`);

    function hasCollision(cx, cy, radius) {
      for (const obs of obstacles) {
        const dx = cx - obs.cx;
        const dy = cy - obs.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = radius + obs.r + PADDING;
        if (dist < minDist) return true;
      }
      return false;
    }

    // Spiral outward from world center to find first clear spot
    let bestPos = null;
    const SPIRAL_STEP = 150;
    const MAX_SPIRAL = 500;

    for (let i = 0; i < MAX_SPIRAL && !bestPos; i++) {
      const angle = i * 2.399963; // golden angle
      const radius = SPIRAL_STEP * Math.sqrt(i);
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;

      if (!hasCollision(cx, cy, ALUMNI_RADIUS)) {
        bestPos = { cx, cy };
      }
    }

    if (!bestPos) {
      // Fallback: place far away
      const maxX = Math.max(...obstacles.map((o) => o.cx + o.r), 0);
      bestPos = { cx: maxX + ALUMNI_RADIUS + PADDING + 200, cy: 0 };
      console.log(`[AlumniReposition] No clear spiral position found, using fallback at x=${Math.round(bestPos.cx)}`);
    }

    console.log(`[AlumniReposition] Alumni parent placed at (${Math.round(bestPos.cx)}, ${Math.round(bestPos.cy)})`);

    // ── Step 3: Update Alumni parent territory ──
    const parentGeometry = generatePolygon(bestPos.cx, bestPos.cy, ALUMNI_RADIUS);

    await Territory.updateOne(
      { _id: alumniParent._id },
      {
        $set: {
          "spatial.center.cx": bestPos.cx,
          "spatial.center.cy": bestPos.cy,
          "spatial.radius": ALUMNI_RADIUS,
          "spatial.bbox": computeBBox(bestPos.cx, bestPos.cy, ALUMNI_RADIUS),
          "spatial.geometry": parentGeometry,
          "spatial.zMin": 0,
          "spatial.zMax": 0.5,
        },
      },
    );

    console.log(`[AlumniReposition] ✓ Parent territory repositioned (r=${Math.round(ALUMNI_RADIUS)}) & z-range set [0, 0.5]`);

    // ── Step 4: Convert sub-territories to world space ──
    // Convert to world space (offset by parent center)
    const subBulkOps = [];

    for (let i = 0; i < subWithImportance.length; i++) {
      const territory = subWithImportance[i];
      const body = subBodies.find((b) => b.id === territory._id.toString());
      if (!body) continue;

      const worldCx = bestPos.cx + body.x;
      const worldCy = bestPos.cy + body.y;
      const geometry = generatePolygon(worldCx, worldCy, body.r);

      subBulkOps.push({
        updateOne: {
          filter: { _id: territory._id },
          update: {
            $set: {
              "spatial.center.cx": worldCx,
              "spatial.center.cy": worldCy,
              "spatial.radius": body.r,
              "spatial.bbox": computeBBox(worldCx, worldCy, body.r),
              "spatial.geometry": geometry,
              "spatial.zMin": 0.5,
              "spatial.zMax": 1.0,
            },
          },
        },
      });

      console.log(
        `[AlumniReposition]   Sub-territory "${territory.name}" → (${Math.round(worldCx)}, ${Math.round(worldCy)}), r=${Math.round(body.r)}, z=[0.5, 1.0]`,
      );
    }

    if (subBulkOps.length) {
      await Territory.bulkWrite(subBulkOps);
    }

    console.log(`[AlumniReposition] ✓ ${subBulkOps.length} sub-territories repositioned`);

    // ── Step 5: Reassign individual alumni node positions inside sub-territories ──
    console.log(`[AlumniReposition] Reassigning alumni node positions...`);

    // Re-fetch updated sub-territories
    const updatedSubs = await Territory.find({
      source: "alumni",
      parentTerritoryId: { $ne: null },
    })
      .select("+centroidEmbedding")
      .lean();

    let totalNodesPlaced = 0;

    for (const territory of updatedSubs) {
      const { memberNodeIds, spatial, centroidEmbedding } = territory;
      if (!memberNodeIds?.length || !spatial) continue;

      const nodes = await SemanticNode.find({
        _id: { $in: memberNodeIds },
      }).lean();

      if (!nodes.length) continue;

      // Score by similarity to centroid
      const scored = nodes.map((node) => {
        const sim =
          node.embedding && centroidEmbedding
            ? cosineSimilarity(node.embedding, centroidEmbedding)
            : 0;
        return { node, similarity: sim };
      });

      scored.sort((a, b) => b.similarity - a.similarity);

      const sims = scored.map((s) => s.similarity);
      const simMin = Math.min(...sims);
      const simMax = Math.max(...sims);
      const simRange = simMax - simMin || 1;

      const maxR = spatial.radius * 0.85;
      const NODE_VISUAL_RADIUS = 10;

      const numAnchors = 3 + Math.floor(Math.random() * 3);
      const anchors = Array.from(
        { length: numAnchors },
        () => Math.random() * Math.PI * 2,
      );

      const nodeBodies = scored.map(({ node, similarity }) => {
        const normSim = (similarity - simMin) / simRange;
        const bandLow = (1 - normSim) * maxR * 0.3;
        const bandHigh = maxR * (0.4 + (1 - normSim) * 0.6);
        const r = bandLow + Math.random() * (bandHigh - bandLow);

        const baseAngle = anchors[Math.floor(Math.random() * anchors.length)];
        const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 1.5;
        const angle = baseAngle + noise;

        return {
          nodeId: node._id,
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          r: NODE_VISUAL_RADIUS,
        };
      });

      // Collision resolution
      const padding = 4;
      for (let iter = 0; iter < 60; iter++) {
        for (let i = 0; i < nodeBodies.length; i++) {
          for (let j = i + 1; j < nodeBodies.length; j++) {
            const A = nodeBodies[i];
            const B = nodeBodies[j];
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

      // Write to DB in world space
      const cx = spatial.center.cx;
      const cy = spatial.center.cy;

      const nodeBulkOps = nodeBodies.map((body) => ({
        updateOne: {
          filter: { _id: body.nodeId },
          update: {
            $set: {
              "position.x": cx + body.x,
              "position.y": cy + body.y,
              "position.zMin": 0.6,
              "position.zMax": 1.0,
            },
          },
        },
      }));

      if (nodeBulkOps.length) {
        await SemanticNode.bulkWrite(nodeBulkOps);
      }

      totalNodesPlaced += nodeBodies.length;
    }

    console.log(`[AlumniReposition] ✓ ${totalNodesPlaced} alumni nodes repositioned with z=[0.6, 1.0]`);

    console.log(`[AlumniReposition] ── Repositioning complete ──`);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Alumni territories repositioned successfully.",
      parentPosition: bestPos,
      parentRadius: ALUMNI_RADIUS,
      subTerritoriesRepositioned: subBulkOps.length,
      nodesRepositioned: totalNodesPlaced,
      zRanges: {
        parentTerritory: { zMin: 0, zMax: 0.5 },
        subTerritories: { zMin: 0.5, zMax: 1.0 },
        alumniNodes: { zMin: 0.6, zMax: 1.0 },
      },
    });
  } catch (error) {
    console.error("[AlumniReposition] Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while repositioning alumni territories.",
      error: error.message,
    });
  }
};

// ─────────────────────────────
// Exports
// ─────────────────────────────
module.exports = {
  clusterAlumniIntoTerritories,
  assignAlumniSpatialCoordinates,
  repositionAlumniTerritories,
};
