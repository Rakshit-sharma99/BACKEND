/**
 * Multi-tenant Context File Manager — per-user warm tier storage.
 *
 * Each user gets their own context directory at data/{userId}/context/
 * containing JSON files with distilled knowledge per community.
 */

const fs = require("fs");
const path = require("path");

const BASE_DATA_DIR = path.join(__dirname, "../../../data");

/**
 * Create a context manager scoped to a specific user.
 *
 * @param {string} userId - The authenticated user's ID
 * @returns {object} - Context manager API
 */
function createContextManager(userId) {
  const dataDir = path.join(BASE_DATA_DIR, userId, "context");
  const MAX_SIZE_KB = parseInt(process.env.CONTEXT_FILE_MAX_KB || "50", 10);
  const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;

  // Ensure context directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  function getFilePath(communityId) {
    const safe = communityId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(dataDir, `${safe}.json`);
  }

  function createBlankContext(communityId, communityName) {
    return {
      communityId,
      communityName: communityName || communityId,
      lastDistilled: null,
      createdAt: new Date().toISOString(),
      knowledge: {
        deadlines: [],
        announcements: [],
        resources: [],
        decisions: [],
        summaries: [],
      },
    };
  }

  function readContext(communityId, communityName) {
    const filePath = getFilePath(communityId);
    if (!fs.existsSync(filePath)) {
      return createBlankContext(communityId, communityName);
    }
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error(`Error reading context for ${communityId}:`, err.message);
      return createBlankContext(communityId, communityName);
    }
  }

  function writeContext(communityId, context) {
    const filePath = getFilePath(communityId);
    let json = JSON.stringify(context, null, 2);

    // Enforce size cap by dropping oldest entries from each category
    while (Buffer.byteLength(json, "utf8") > MAX_SIZE_BYTES) {
      let dropped = false;
      const categories = Object.keys(context.knowledge);

      for (const cat of categories) {
        if (context.knowledge[cat].length > 1) {
          context.knowledge[cat].shift();
          dropped = true;
        }
      }

      if (!dropped) break;
      json = JSON.stringify(context, null, 2);
    }

    fs.writeFileSync(filePath, json, "utf8");
    return context;
  }

  function mergeKnowledge(communityId, communityName, newKnowledge) {
    const context = readContext(communityId, communityName);

    for (const category of Object.keys(newKnowledge)) {
      if (
        Array.isArray(newKnowledge[category]) &&
        Array.isArray(context.knowledge[category])
      ) {
        context.knowledge[category].push(...newKnowledge[category]);
      }
    }

    context.lastDistilled = new Date().toISOString();
    return writeContext(communityId, context);
  }

  function searchAllContextFiles(query, communityFilter = null) {
    const results = [];
    const queryLower = query.toLowerCase();

    if (!fs.existsSync(dataDir)) return results;

    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dataDir, file), "utf8");
        const context = JSON.parse(raw);

        if (communityFilter) {
          const filterLower = communityFilter.toLowerCase();
          if (
            !context.communityName?.toLowerCase().includes(filterLower) &&
            context.communityId !== communityFilter
          ) {
            continue;
          }
        }

        for (const [category, entries] of Object.entries(context.knowledge)) {
          for (const entry of entries) {
            const entryText =
              typeof entry === "string" ? entry : JSON.stringify(entry);

            if (entryText.toLowerCase().includes(queryLower)) {
              results.push({
                communityId: context.communityId,
                communityName: context.communityName,
                category,
                text: entryText,
                tier: "warm",
                lastDistilled: context.lastDistilled,
              });
            }
          }
        }
      } catch (err) {
        // Skip malformed files
      }
    }

    return results;
  }

  function getAllContextStats() {
    const stats = [];
    if (!fs.existsSync(dataDir)) return stats;

    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const filePath = path.join(dataDir, file);
        const stat = fs.statSync(filePath);
        const raw = fs.readFileSync(filePath, "utf8");
        const context = JSON.parse(raw);

        const entryCount = Object.values(context.knowledge).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0,
        );

        stats.push({
          communityId: context.communityId,
          communityName: context.communityName,
          sizeBytes: stat.size,
          sizeKB: Math.round((stat.size / 1024) * 10) / 10,
          entryCount,
          lastDistilled: context.lastDistilled,
        });
      } catch (err) {
        // Skip malformed files
      }
    }

    return stats;
  }

  function purgeContext(communityId) {
    const filePath = getFilePath(communityId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  return {
    readContext,
    writeContext,
    mergeKnowledge,
    searchAllContextFiles,
    getAllContextStats,
    purgeContext,
  };
}

module.exports = { createContextManager };
