/**
 * Task Classifier – determines whether a request should follow
 * the synchronous chat path or the asynchronous task path.
 *
 * Classification signals:
 *   1. Number of tool calls (≥ 2 chained = likely async)
 *   2. Tool latency profiles (any "slow" or "external" tool = async)
 *   3. Side-effect tools (write operations promote to async)
 *   4. Known multi-step pipelines (pattern matching)
 */

// ────────────────────────────────────────────────
// Tool Latency & Side-Effect Registry
// ────────────────────────────────────────────────
const TOOL_PROFILES = {
  // Instant (< 1s, no I/O)
  app_navigate: { latency: "instant", sideEffects: false },
  app_action: { latency: "instant", sideEffects: false },
  fetch_credit_question: { latency: "instant", sideEffects: false },

  // Fast (1–5s, single service call, read-only)
  search_clubs: { latency: "fast", sideEffects: false },
  search_events: { latency: "fast", sideEffects: false },
  search_users: { latency: "fast", sideEffects: false },
  search_alumni: { latency: "fast", sideEffects: false },
  search_communities: { latency: "fast", sideEffects: false },
  search_territories: { latency: "fast", sideEffects: false },
  search_nodes_by_name: { latency: "fast", sideEffects: false },
  search_universe: { latency: "fast", sideEffects: false },
  search_content_qa: { latency: "fast", sideEffects: false },
  search_my_tickets: { latency: "fast", sideEffects: false },
  search_external_context: { latency: "fast", sideEffects: false },
  get_upcoming_events: { latency: "fast", sideEffects: false },
  get_platform_stats: { latency: "fast", sideEffects: false },
  get_user_facet_texts: { latency: "fast", sideEffects: false },
  compute_similarity: { latency: "fast", sideEffects: false },
  top_universes: { latency: "fast", sideEffects: false },
  navigate_to_node: { latency: "fast", sideEffects: false },
  navigate_to_territory: { latency: "fast", sideEffects: false },
  navigate_to_user_territory: { latency: "fast", sideEffects: false },
  query_universe_knowledge: { latency: "fast", sideEffects: false },

  // Slow (5–30s, external LLM call or multi-step)
  web_search_fallback: { latency: "slow", sideEffects: false },
  send_message_compose: { latency: "slow", sideEffects: false },

  // Slow with side effects (writes data)
  post_question_to_community: { latency: "slow", sideEffects: true },
  send_message_get_recipients: { latency: "fast", sideEffects: false },
  send_message_execute: { latency: "slow", sideEffects: true },
};

// ────────────────────────────────────────────────
// Known Multi-Step Pipelines
// ────────────────────────────────────────────────
// If the LLM calls any combination from these sets, it's a pipeline
const PIPELINE_PATTERNS = [
  // Notes discovery: search → fallback → post to community
  new Set(["search_content_qa", "web_search_fallback", "post_question_to_community"]),
  // Full message flow: find recipients + compose + send
  new Set(["send_message_get_recipients", "send_message_compose", "send_message_execute"]),
];

// ────────────────────────────────────────────────
// Classification Logic
// ────────────────────────────────────────────────

/**
 * Classify a batch of function calls as sync or async.
 *
 * @param {Array<{functionCall: {name: string, args: object}}>} functionCalls
 *   Array of function call parts from the LLM response
 * @returns {{ mode: 'sync'|'async', reason: string }}
 */
function classifyRequest(functionCalls) {
  if (!functionCalls || functionCalls.length === 0) {
    return { mode: "sync", reason: "no_tool_calls" };
  }

  const toolNames = functionCalls.map((fc) => fc.functionCall.name);

  // ── Check 1: Any unknown tool defaults to async (safety) ──
  const unknownTools = toolNames.filter((name) => !TOOL_PROFILES[name]);
  if (unknownTools.length > 0) {
    return {
      mode: "async",
      reason: `unknown_tools: ${unknownTools.join(", ")}`,
    };
  }

  // ── Check 2: Pipeline pattern match ──
  const toolSet = new Set(toolNames);
  for (const pattern of PIPELINE_PATTERNS) {
    // If ≥2 tools from a pipeline pattern are present, classify as async
    let matches = 0;
    for (const tool of pattern) {
      if (toolSet.has(tool)) matches++;
    }
    if (matches >= 2) {
      return {
        mode: "async",
        reason: `pipeline_detected: ${[...pattern].join(" → ")}`,
      };
    }
  }

  // ── Check 3: Any slow tool with side effects ──
  const hasSideEffectSlow = toolNames.some((name) => {
    const profile = TOOL_PROFILES[name];
    return profile && profile.latency === "slow" && profile.sideEffects;
  });
  if (hasSideEffectSlow) {
    return { mode: "async", reason: "slow_side_effect_tool" };
  }

  // ── Check 4: Multiple slow tools ──
  const slowCount = toolNames.filter(
    (name) => TOOL_PROFILES[name]?.latency === "slow",
  ).length;
  if (slowCount >= 2) {
    return { mode: "async", reason: `multiple_slow_tools (${slowCount})` };
  }

  // ── Check 5: High tool count (≥ 3 distinct tools in one batch) ──
  if (toolNames.length >= 3) {
    // Exception: if ALL are fast/instant, keep sync (e.g., interest discovery)
    const allFastOrInstant = toolNames.every((name) => {
      const lat = TOOL_PROFILES[name]?.latency;
      return lat === "fast" || lat === "instant";
    });
    if (!allFastOrInstant) {
      return { mode: "async", reason: `high_tool_count (${toolNames.length})` };
    }
  }

  // ── Default: synchronous ──
  return { mode: "sync", reason: "all_fast_or_instant" };
}

/**
 * Get the latency profile for a specific tool.
 * Used by the task engine for step-level timing estimates.
 */
function getToolProfile(toolName) {
  return TOOL_PROFILES[toolName] || { latency: "unknown", sideEffects: false };
}

module.exports = { classifyRequest, getToolProfile, TOOL_PROFILES };
