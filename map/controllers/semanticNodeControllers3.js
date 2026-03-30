/**
 * Semantic Node Controllers 3 — Alumni Facet Pipeline
 * ────────────────────────────────────────────────────
 * Pipeline:
 * 1. Fetch all alumni users (profession: "Alumni") with company/role data
 * 2. Build alumni-specific context (company, position, field, career)
 * 3. Use LLM to extract 1–2 work-focused facets
 * 4. Generate canonical text per facet
 * 5. Embed each facet → SemanticNode (entityType: "alumni_facet")
 */

const { StatusCodes } = require("http-status-codes");
const OpenAI = require("openai");
const SemanticNode = require("../models/semanticNode");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ───────────────────────────────────────
// Constants
// ───────────────────────────────────────
const EMBED_MODEL = "text-embedding-3-large";
const LLM_MODEL = "gpt-4.1-mini";
const BATCH_SIZE = 5;

// ───────────────────────────────────────
// Internal: Service Token & User Fetch
// ───────────────────────────────────────

function generateServiceToken() {
  const token = jwt.sign(
    { service: "map", role: "internal" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
  return { headers: { authorization: `Bearer ${token}` } };
}

/**
 * Fetches alumni users from the universe service using getUsersByFields.
 * Returns users with company, workingPosition, field, career, name, image, etc.
 */
async function fetchAlumniUsers() {
  try {
    const config = generateServiceToken();
    const res = await axios.post(
      `http://universe:5050/universe/api/v1/user/getUsersByFields`,
      {
        filters: { profession: "Alumni" },
        fields: [
          "_id",
          "name",
          "image",
          "company",
          "workingPosition",
          "field",
          "career",
          "interests",
          "course",
          "uid",
          "universeMetaData",
        ],
      },
      config,
    );
    return res.data?.users || [];
  } catch (error) {
    console.error("[AlumniFacet] Failed to fetch alumni users:", error.message);
    return [];
  }
}

// ───────────────────────────────────────
// Step 1: Build alumni-specific context
// ───────────────────────────────────────

/**
 * Builds a context string heavily weighted toward company and role information.
 */
function buildAlumniContext(user) {
  const parts = [];

  parts.push(`Name: ${user.name || "Unknown"}`);

  if (user.company) parts.push(`Company: ${user.company}`);
  if (user.workingPosition) parts.push(`Position/Role: ${user.workingPosition}`);
  if (user.career) parts.push(`Career Domain: ${user.career}`);
  if (user.field) parts.push(`Field of Study: ${user.field}`);
  if (user.course) parts.push(`Course: ${user.course}`);

  if (Array.isArray(user.interests) && user.interests.length) {
    parts.push(`Interests: ${user.interests.join(", ")}`);
  }

  return parts.join("\n");
}

// ───────────────────────────────────────
// Step 2: LLM facet extraction (alumni)
// ───────────────────────────────────────

function extractJSON(text) {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Uses the LLM to extract 1–2 work-focused facets from an alumni profile.
 * Facets are heavily focused on company and role.
 */
async function extractAlumniFacets(profileContext) {
  const response = await client.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `
You are a semantic profiling agent specializing in alumni career mapping.
Given an alumni's profile — their company, role/position, career domain, and background —
extract 1 to 2 distinct work-focused facets.

Each facet should capture a distinct aspect of their professional identity:
- Primary facet: Their company + specific role (e.g. "Software Engineering at Google")
- Optional secondary facet: Their broader career domain or industry niche

Rules:
- Each facet must have a short, lowercase, snake_case id (e.g. "swe_at_google", "data_science")
- Each facet must have a human-readable label
- Each facet must have a rich canonical text paragraph (50-100 words) that describes
  the alumnus's professional profile and connection to their company and role.
  This text will be embedded for semantic similarity, so emphasize:
  1. The specific company name and what it does
  2. The specific role/position and its responsibilities
  3. The industry or domain they operate in
- Never fabricate information not implied by the profile data.
- If company or role is missing, create a single generic career facet.

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
// Step 4: Persist alumni facet nodes
// ───────────────────────────────────────

/**
 * Creates SemanticNode documents for alumni facets.
 * Stores company in meta for downstream company-based grouping.
 */
async function createAlumniFacetNodes(userId, userName, userImage, company, uid, facets) {
  const created = [];

  for (const facet of facets) {
    // Skip if this exact facet already exists
    const exists = await SemanticNode.findOne({
      entityType: "alumni_facet",
      parentEntityId: userId,
      facetId: facet.facetId,
    }).lean();

    if (exists) continue;

    let embedding = null;
    try {
      embedding = await embedText(facet.canonicalText);
    } catch (err) {
      console.error(
        `[AlumniFacet] Embedding failed for ${userName}/${facet.facetId}:`,
        err.message,
      );
      continue;
    }

    const node = await SemanticNode.create({
      entityId: userId,
      parentEntityId: userId,
      entityType: "alumni_facet",
      facetId: facet.facetId,
      text: facet.canonicalText,
      embedding,
      embeddingModel: EMBED_MODEL,
      embeddedAt: new Date(),
      uid: uid || "unknown",
      meta: {
        name: userName,
        image: userImage,
        facetLabel: facet.label,
        company: company || "Unknown",
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
// Background processor (runs after response is sent)
// ═══════════════════════════════════════
async function processAlumniBatch(users) {
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalNoCompany = 0;

  console.log(`[AlumniFacet] ──── Starting background processing of ${users.length} alumni ────`);

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(users.length / BATCH_SIZE);

    console.log(`[AlumniFacet] ── Batch ${batchNum}/${totalBatches} (users ${i + 1}–${Math.min(i + BATCH_SIZE, users.length)}) ──`);

    for (const user of batch) {
      try {
        // Skip alumni who have NOT specified their company
        if (!user.company || !user.company.trim()) {
          totalNoCompany++;
          console.log(`[AlumniFacet] SKIP (no company): ${user.name} [${user._id}]`);
          continue;
        }

        // Check if this alumni already has facet nodes
        const existingCount = await SemanticNode.countDocuments({
          entityType: "alumni_facet",
          parentEntityId: user._id,
        });

        if (existingCount >= 1) {
          totalSkipped++;
          console.log(`[AlumniFacet] SKIP (already exists, ${existingCount} nodes): ${user.name} [${user._id}]`);
          continue;
        }

        // Build context
        const context = buildAlumniContext(user);
        console.log(`[AlumniFacet] Processing: ${user.name} | Company: ${user.company} | Position: ${user.workingPosition || "N/A"}`);

        // Extract facets via LLM
        console.log(`[AlumniFacet]   → Extracting facets via LLM...`);
        const facets = await extractAlumniFacets(context);

        if (!facets.length) {
          totalSkipped++;
          console.log(`[AlumniFacet]   → LLM returned 0 facets, skipping`);
          continue;
        }

        console.log(`[AlumniFacet]   → LLM extracted ${facets.length} facet(s): ${facets.map((f) => f.label).join(", ")}`);

        // Embed + persist
        console.log(`[AlumniFacet]   → Embedding & persisting...`);
        const created = await createAlumniFacetNodes(
          user._id,
          user.name,
          user.image,
          user.company,
          user.uid,
          facets,
        );

        totalCreated += created.length;
        console.log(`[AlumniFacet]   ✓ Created ${created.length} node(s) for ${user.name}`);
      } catch (err) {
        console.error(
          `[AlumniFacet]   ✗ FAILED for ${user.name} [${user._id}]:`,
          err.message,
        );
        totalFailed++;
      }
    }

    console.log(`[AlumniFacet] ── Batch ${batchNum} done | Running totals: created=${totalCreated}, skipped=${totalSkipped}, noCompany=${totalNoCompany}, failed=${totalFailed} ──`);
  }

  console.log(`[AlumniFacet] ════════════════════════════════════════`);
  console.log(`[AlumniFacet] COMPLETE — Total alumni: ${users.length}`);
  console.log(`[AlumniFacet]   Created:    ${totalCreated}`);
  console.log(`[AlumniFacet]   Skipped:    ${totalSkipped}`);
  console.log(`[AlumniFacet]   No Company: ${totalNoCompany}`);
  console.log(`[AlumniFacet]   Failed:     ${totalFailed}`);
  console.log(`[AlumniFacet] ════════════════════════════════════════`);
}

// ═══════════════════════════════════════
// Controller: Create Alumni Nodes
// ═══════════════════════════════════════
const createAlumniNodes = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }

    const { userId } = req.query; // optional: process a single alumni user

    console.log(`[AlumniFacet] Fetching alumni users...`);
    let users = await fetchAlumniUsers();
    console.log(`[AlumniFacet] Fetched ${users.length} alumni users from universe service`);

    if (userId) {
      users = users.filter((u) => String(u._id) === String(userId));
      console.log(`[AlumniFacet] Filtered to single user: ${userId}, found: ${users.length}`);
    }

    if (!users.length) {
      console.log(`[AlumniFacet] No alumni users found, aborting`);
      return res.status(StatusCodes.OK).json({
        message: "No alumni users found.",
        created: 0,
      });
    }

    // Filter out alumni without company upfront
    const usersWithCompany = users.filter((u) => u.company && u.company.trim());
    const usersWithoutCompany = users.length - usersWithCompany.length;

    console.log(`[AlumniFacet] Alumni with company: ${usersWithCompany.length}, without company (will skip): ${usersWithoutCompany}`);

    // Send response immediately, process in background
    res.status(StatusCodes.ACCEPTED).json({
      message: "Alumni facet node creation started in background. Check server logs for progress.",
      totalAlumni: users.length,
      alumniWithCompany: usersWithCompany.length,
      alumniWithoutCompany: usersWithoutCompany,
    });

    // Fire-and-forget background processing
    processAlumniBatch(users).catch((err) => {
      console.error("[AlumniFacet] Background processing crashed:", err);
    });
  } catch (error) {
    console.error("[AlumniFacet] Controller error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while creating alumni facet nodes.",
    });
  }
};

// ═══════════════════════════════════════
// Controller: Refresh Alumni Nodes
// ═══════════════════════════════════════
/**
 * Re-generates alumni facets for a single user.
 * Deletes existing alumni_facet nodes and creates fresh ones.
 */
const refreshAlumniNodes = async (req, res) => {
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

    // Delete existing alumni facets for this user
    const deleteResult = await SemanticNode.deleteMany({
      entityType: "alumni_facet",
      parentEntityId: userId,
    });

    // Fetch the user
    const users = await fetchAlumniUsers();
    const user = users.find((u) => String(u._id) === String(userId));

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Alumni user not found.",
      });
    }

    const context = buildAlumniContext(user);
    const facets = await extractAlumniFacets(context);
    const created = await createAlumniFacetNodes(
      user._id,
      user.name,
      user.image,
      user.company,
      user.uid,
      facets,
    );

    return res.status(StatusCodes.CREATED).json({
      message: "Alumni facets refreshed.",
      deleted: deleteResult.deletedCount,
      created: created.length,
      facets: created.map((c) => ({
        facetId: c.facetId,
        label: c.label,
      })),
    });
  } catch (error) {
    console.error("[AlumniFacet] Refresh error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while refreshing alumni facet nodes.",
    });
  }
};

// ───────────────────────────────────────
// Exports
// ───────────────────────────────────────
module.exports = {
  createAlumniNodes,
  refreshAlumniNodes,
};
