/**
 * Context Interpreter — gives Starman situational awareness.
 *
 * Maps the frontend's `navContext` (screen + params) into a rich context block
 * that is injected into the system prompt, so the LLM knows exactly what the
 * user is looking at and can answer implicit questions accordingly.
 *
 * Each screen handler returns:
 *   contextBlock  — multi-line instruction for the system prompt
 *   entitySummary — one-liner like 'Viewing club: Coding Society'
 */

// ────────────────────────────────────────────────
// Screen Context Handlers
// ────────────────────────────────────────────────

const SCREEN_HANDLERS = {
  // ── Club Page ──
  club: (params) => {
    const name = params.name || params.clubName || "Unknown Club";
    const id = params.id || params.clubId;
    const tags = params.tags || [];
    const motto = params.motto || "";
    const isMember = params.isMember;

    return {
      entitySummary: `Viewing club: "${name}"`,
      contextBlock: `
SCREEN CONTEXT — CLUB PAGE:
- The user is currently viewing the club: "${name}" (ID: ${id || "unknown"})
${motto ? `- Club motto: "${motto}"` : ""}
${tags.length > 0 ? `- Tags: ${tags.join(", ")}` : ""}
${isMember !== undefined ? `- The user ${isMember ? "IS" : "is NOT"} a member of this club` : ""}
- If the user asks "What is this club?", "Tell me about this club", or "Should I join?", use search_clubs with the club name "${name}" to fetch details and answer.
- If the user asks about club events, use search_events with clubName "${name}".
- If the user asks about club posts or content, use search_content_qa with "${name}".
- You can suggest actions like: viewing club events, reading club posts, joining/leaving the club.
      `.trim(),
    };
  },

  // ── Community Page ──
  community: (params) => {
    const title = params.name || params.title || "Unknown Community";
    const id = params.id || params.communityId;
    const tags = params.tag || params.tags || [];
    const label = params.label || "";

    return {
      entitySummary: `Viewing community: "${title}"`,
      contextBlock: `
SCREEN CONTEXT — COMMUNITY PAGE:
- The user is currently viewing the community: "${title}" (ID: ${id || "unknown"})
${label ? `- Label: "${label}"` : ""}
${tags.length > 0 ? `- Tags: ${tags.join(", ")}` : ""}
- If the user asks "What is this community?", "Tell me about this community", use search_communities with query "${title}" to get details.
- If the user asks about community posts or content, use search_content_qa with "${title}".
- You can suggest actions like: browsing posts, asking questions, connecting with members.
      `.trim(),
    };
  },

  // ── User Profile ──
  profile2: (params) => {
    const name = params.name || "Someone";
    const id = params.id || params.userId;
    const isOwnProfile = params.isOwnProfile;

    if (isOwnProfile) {
      return {
        entitySummary: "Viewing own profile",
        contextBlock: `
SCREEN CONTEXT — OWN PROFILE:
- The user is viewing their own profile page.
- You can suggest actions like: updating interests, viewing memories, checking followers.
- If they ask about their stats or activity, help them explore the profile.
        `.trim(),
      };
    }

    return {
      entitySummary: `Viewing profile: "${name}"`,
      contextBlock: `
SCREEN CONTEXT — USER PROFILE:
- The user is currently viewing the profile of: "${name}" (ID: ${id || "unknown"})
- If the user asks about this person (interests, hobbies, what they're like), use the get_user_facet_texts tool with userId "${id}" to fetch their profile facets and answer.
- If the user wants to see this person's 3D territory, use navigate_to_user_territory with userId "${id}".
- If the user wants to compute similarity, use compute_similarity with targetUserId "${id}".
- You can suggest actions like: viewing their territory, comparing interests, sending a message.
      `.trim(),
    };
  },

  // ── 3D Territory Overlay ──
  territory3DOverlay: (params) => {
    const userId = params.userId;
    const memberName = params.member?.name || "Someone";

    return {
      entitySummary: `Viewing 3D territory of: "${memberName}"`,
      contextBlock: `
SCREEN CONTEXT — 3D TERRITORY:
- The user is currently viewing ${memberName}'s 3D territory.
- The userId of the person being viewed is: "${userId}"
- If the user asks about this person (likes, dislikes, interests, hobbies, etc.), use the get_user_facet_texts tool with userId "${userId}" to fetch their profile facets and answer based on the facet texts.
- If the user wants to compare interests, use compute_similarity with targetUserId "${userId}".
- You can suggest actions like: learning about this person, sending them a message, comparing profiles.
      `.trim(),
    };
  },

  // ── Universe Territory Map ──
  universeTerritoryMap: (params) => {
    const selectedTerritory = params.selectedTerritory;
    const selectedNodeId = params.selectedNodeId;

    if (selectedTerritory) {
      return {
        entitySummary: `Viewing map territory: "${selectedTerritory.name || "Unknown"}"`,
        contextBlock: `
SCREEN CONTEXT — MAP (TERRITORY FOCUS):
- The user is on the semantic map, focused on the territory: "${selectedTerritory.name || "Unknown"}"
${selectedTerritory.description ? `- Territory description: "${selectedTerritory.description}"` : ""}
${selectedTerritory.tags?.length > 0 ? `- Territory tags: ${selectedTerritory.tags.join(", ")}` : ""}
- If the user asks about this territory, describe it based on the above info.
- If the user asks what's here, use search_territories with interests related to the territory name.
- You can suggest: exploring clubs/people in this territory, navigating to a different territory.
        `.trim(),
      };
    }

    if (selectedNodeId) {
      return {
        entitySummary: `Viewing map node: ${selectedNodeId}`,
        contextBlock: `
SCREEN CONTEXT — MAP (NODE FOCUS):
- The user is on the semantic map, focused on a specific node (ID: ${selectedNodeId}).
- If the user asks about this node or what's nearby, use navigate_to_node with nodeId "${selectedNodeId}" to get details.
        `.trim(),
      };
    }

    return {
      entitySummary: "Browsing the map",
      contextBlock: `
SCREEN CONTEXT — MAP:
- The user is browsing the universe territory map.
- You can help them find territories by interest using search_territories.
- You can navigate to a specific territory using navigate_to_territory.
- You can suggest: exploring by interest, finding friends on the map.
      `.trim(),
    };
  },

  // ── Map Landing ──
  mapLanding: () => ({
    entitySummary: "On the map landing",
    contextBlock: `
SCREEN CONTEXT — MAP LANDING:
- The user is on the semantic map landing page.
- You can help them explore territories by interest using search_territories.
- You can navigate to a specific territory using navigate_to_territory.
- You can help them find people on the map using search_nodes_by_name.
    `.trim(),
  }),

  // ── Event Expand ──
  eventExpand: (params) => {
    const eventData = params.eventData || params;
    const name = eventData.name || eventData.title || "Unknown Event";
    const eventId = eventData.eventId || eventData._id;
    const place = eventData.place || "";
    const date = eventData.eventDate || eventData.date || "";

    return {
      entitySummary: `Viewing event: "${name}"`,
      contextBlock: `
SCREEN CONTEXT — EVENT PAGE:
- The user is currently viewing the event: "${name}" (ID: ${eventId || "unknown"})
${place ? `- Venue: "${place}"` : ""}
${date ? `- Date: ${date}` : ""}
- If the user asks about this event, use search_events with query "${name}" to get full details.
- If the user asks about tickets, use search_my_tickets with eventName "${name}".
- You can suggest actions like: booking tickets, sharing the event, finding who else is going.
      `.trim(),
    };
  },

  // ── Explore ──
  explore: (params) => {
    const activeTab = params.activeTab || "all";

    return {
      entitySummary: `Exploring (tab: ${activeTab})`,
      contextBlock: `
SCREEN CONTEXT — EXPLORE:
- The user is on the Explore/Discover screen (active tab: "${activeTab}").
- You can help them discover clubs, communities, events, and people.
- Use the INTEREST DISCOVERY multi-tool flow if they express a broad interest.
- You can suggest: searching by interest, browsing trending content, finding new clubs.
      `.trim(),
    };
  },

  // ── Event Landing ──
  eventLanding: () => ({
    entitySummary: "Browsing events",
    contextBlock: `
SCREEN CONTEXT — EVENTS:
- The user is on the Events landing page.
- You can help them find events using search_events (by topic, date, venue, or club).
- You can check their tickets using search_my_tickets.
- You can suggest: finding events this week, searching by interest, checking bought tickets.
    `.trim(),
  }),

  // ── Home Feed ──
  landingHome: () => ({
    entitySummary: "On the home feed",
    contextBlock: `
SCREEN CONTEXT — HOME FEED:
- The user is on the main home feed.
- You can help them navigate anywhere: clubs, communities, events, map, profile.
- You can suggest: exploring territories, finding events, discovering clubs.
    `.trim(),
  }),

  // ── Chat ──
  chat: (params) => {
    const recipientName = params.recipientName || params.chatName;

    if (recipientName) {
      return {
        entitySummary: `In chat with: "${recipientName}"`,
        contextBlock: `
SCREEN CONTEXT — CHAT:
- The user is in a chat conversation with "${recipientName}".
- If the user asks about this person, use get_user_facet_texts or search_users to learn more.
- You can suggest: viewing their profile, comparing interests.
        `.trim(),
      };
    }

    return {
      entitySummary: "Browsing chats",
      contextBlock: `
SCREEN CONTEXT — CHATS:
- The user is on the chat conversations list.
- You can help them send messages using the message sending flow.
      `.trim(),
    };
  },

  // ── Following ──
  following: () => ({
    entitySummary: "Viewing followed clubs/communities",
    contextBlock: `
SCREEN CONTEXT — FOLLOWING:
- The user is viewing their followed clubs and communities.
- You can help them find new clubs using search_clubs or new communities using search_communities.
    `.trim(),
  }),

  // ── Your Tickets ──
  yourTickets: () => ({
    entitySummary: "Viewing tickets",
    contextBlock: `
SCREEN CONTEXT — TICKETS:
- The user is viewing their purchased tickets.
- You can help them check ticket details using search_my_tickets.
    `.trim(),
  }),

  // ── Memory List ──
  memoryList: () => ({
    entitySummary: "Viewing memories",
    contextBlock: `
SCREEN CONTEXT — MEMORIES:
- The user is viewing their memory lane — past moments and memories.
    `.trim(),
  }),

  // ── Settings ──
  settings: () => ({
    entitySummary: "In settings",
    contextBlock: `
SCREEN CONTEXT — SETTINGS:
- The user is in the app settings.
- You can help with theme toggling (app_action: "toggle_theme") or logging out.
    `.trim(),
  }),

  // ── Notifications ──
  notifications: () => ({
    entitySummary: "Viewing notifications",
    contextBlock: `
SCREEN CONTEXT — NOTIFICATIONS:
- The user is in the notification center.
- You can help them navigate to specific items mentioned in notifications.
    `.trim(),
  }),
};

// ────────────────────────────────────────────────
// Main Interpreter
// ────────────────────────────────────────────────

/**
 * Interpret navContext and produce a context block for the system prompt.
 *
 * @param {object} navContext - { currentScreen, screenParams, metadata }
 * @returns {{ contextBlock: string, entitySummary: string }}
 */
function interpretContext(navContext) {
  if (!navContext || !navContext.currentScreen) {
    return { contextBlock: "", entitySummary: "Screen: unknown" };
  }

  const { currentScreen, screenParams = {}, metadata = {} } = navContext;

  // Merge screenParams + metadata for the handler
  const params = { ...screenParams, ...metadata };

  const handler = SCREEN_HANDLERS[currentScreen];

  if (!handler) {
    return {
      entitySummary: `On screen: ${currentScreen}`,
      contextBlock: `
SCREEN CONTEXT:
- The user is currently on the "${currentScreen}" screen.
- Answer their questions as best you can and suggest relevant actions.
      `.trim(),
    };
  }

  try {
    return handler(params);
  } catch (err) {
    console.error(`Context interpreter error for "${currentScreen}":`, err.message);
    return {
      entitySummary: `On screen: ${currentScreen}`,
      contextBlock: "",
    };
  }
}

module.exports = { interpretContext, SCREEN_HANDLERS };
