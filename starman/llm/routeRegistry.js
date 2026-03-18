/**
 * Route Registry — maps frontend screen names to their descriptions and required params.
 * These are injected into the LLM's system prompt so it knows where it can navigate the user.
 *
 * Start small: tabs + club/community navigation.
 */

const ROUTE_REGISTRY = {
  // ── Tab-level screens (no params, just switch tab) ──
  landingHome: {
    tab: "Home",
    params: [],
    description: "Main home feed with posts and updates",
  },
  explore: {
    tab: "Explorer",
    params: [],
    description:
      "Explore/discover section — browse clubs, communities, events, people",
  },
  mapLanding: {
    tab: "Map",
    params: [],
    description: "Semantic map landing — browse the universe map",
  },
  chat: {
    tab: "Chat",
    params: [],
    description: "Chat conversations list — all DMs and group chats",
  },
  eventLanding: {
    tab: "Event",
    params: [],
    description: "Events landing — browse and manage events",
  },
  profile2: {
    tab: "Profile",
    params: ["id", "name", "img"],
    description:
      "User profile page. If no params, opens the current user's own profile",
  },

  // ── Sub-screens inside tabs (need params) ──
  club: {
    tab: "Home",
    params: ["id", "name", "secondaryImg"],
    description: "A specific club page. Requires club id.",
  },
  community: {
    tab: "Home",
    params: ["id", "name", "secondaryImg"],
    description: "A specific community page. Requires community id.",
  },
  notifications: {
    tab: "Home",
    params: [],
    description: "Notification center",
  },
  settings: {
    tab: "Home",
    params: [],
    description: "App settings",
  },
  memoryList: {
    tab: "Profile",
    params: [],
    description: "User's memory lane — past memories and moments",
  },
  following: {
    tab: "Home",
    params: [],
    description: "Clubs and communities the user follows or is part of",
  },
  universeTerritoryMap: {
    tab: "Map",
    params: ["selectedNodeId", "universe", "uid"],
    description: "Semantic map focused on a specific territory/node",
  },
  yourTickets: {
    tab: "Home",
    params: [],
    description: "Your tickets screen — view and manage your tickets",
  },
};

/**
 * Build a concise summary for the system prompt.
 */
function getRegistrySummary() {
  const lines = Object.entries(ROUTE_REGISTRY).map(
    ([screen, info]) =>
      `- ${screen}: ${info.description}${info.params.length ? ` (needs: ${info.params.join(", ")})` : ""}`,
  );
  return lines.join("\n");
}

module.exports = { ROUTE_REGISTRY, getRegistrySummary };
