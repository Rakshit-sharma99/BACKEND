/**
 * Search Engine — unified cross-tier search for a specific user's data.
 *
 * Searches both the hot tier (SQLite) and warm tier (context files),
 * deduplicates, ranks by relevance + recency, and returns fragments
 * with source attribution.
 */

/**
 * Search across both hot and warm tiers for a specific user.
 *
 * @param {string} query - Search query
 * @param {object} db - User-scoped database instance
 * @param {object} contextManager - User-scoped context manager
 * @param {string|null} communityFilter - Optional community name/ID filter
 * @param {number} limit - Max results to return
 * @returns {{ found: boolean, results: Array, stats: object }}
 */
function search(query, db, contextManager, communityFilter = null, limit = 15) {
  if (!query || !query.trim()) {
    return { found: false, results: [], stats: { hot: 0, warm: 0 } };
  }

  const results = [];

  // ── Hot Tier: SQLite search ──
  const selectedCommunities = db.getSelectedCommunities();

  let communityId = null;
  if (communityFilter) {
    const filterLower = communityFilter.toLowerCase();
    const match = selectedCommunities.find(
      (c) =>
        c.id === communityFilter ||
        c.name?.toLowerCase().includes(filterLower),
    );
    communityId = match?.id || null;
  }

  const hotResults = db.searchMessages(query, communityId, limit);
  for (const msg of hotResults) {
    results.push({
      id: msg.id,
      communityId: msg.community_id,
      communityName: msg.community_name,
      senderName: msg.sender_name,
      text: msg.text,
      timestamp: msg.timestamp,
      tier: "hot",
      mediaMetadata: msg.media_metadata
        ? JSON.parse(msg.media_metadata)
        : null,
    });
  }

  // ── Warm Tier: Context file search ──
  const warmResults = contextManager.searchAllContextFiles(
    query,
    communityFilter,
  );
  for (const entry of warmResults) {
    results.push({
      id: `ctx_${entry.communityId}_${entry.category}_${Date.now()}`,
      communityId: entry.communityId,
      communityName: entry.communityName,
      senderName: null,
      text: entry.text,
      timestamp: null,
      tier: "warm",
      category: entry.category,
      lastDistilled: entry.lastDistilled,
    });
  }

  // ── Rank: Hot tier first (more specific), then warm tier ──
  results.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "hot" ? -1 : 1;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  const trimmed = results.slice(0, limit);

  return {
    found: trimmed.length > 0,
    results: trimmed,
    stats: {
      hot: hotResults.length,
      warm: warmResults.length,
      total: trimmed.length,
    },
  };
}

module.exports = { search };
