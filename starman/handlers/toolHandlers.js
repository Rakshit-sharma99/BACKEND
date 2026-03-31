/**
 * Tool handlers – each function calls an existing macbease microservice.
 * These are invoked when Gemini makes a function call.
 *
 * For now these return mock data. Replace the mock responses
 * with real axios calls to your microservices once the endpoints exist.
 */

const axios = require("axios");

// ────────────────────────────────────────────────
// Internal JWT for service-to-service calls
// ────────────────────────────────────────────────
const jwt = require("jsonwebtoken");

function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "starman" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function internalHeaders() {
  return { Authorization: `Bearer ${getInternalToken()}` };
}

// Creates a token that looks like a real user — needed for controllers that read req.user.id
function getUserToken(user) {
  return jwt.sign(
    { id: user.id || user._id, role: user.role || "user" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function userHeaders(user) {
  return { Authorization: `Bearer ${getUserToken(user)}` };
}

// ────────────────────────────────────────────────
// Service base URLs (from environment)
// ────────────────────────────────────────────────
const MAP_URL = process.env.MAP_URL || "http://map:5090/map/api/v1";
const EVENT_URL = process.env.EVENT_URL || "http://event:5060/event/api/v1";
const UNIVERSE_URL =
  process.env.UNIVERSE_URL || "http://universe:5050/universe/api/v1";
const MULTIVERSE_URL =
  process.env.MULTIVERSE_URL || "http://multiverse:5020/multiverse/api/v1";
const IPLS_URL = process.env.IPLS_URL || "http://ipls:5080/ipls/api/v1";
const TICKET_URL = process.env.TICKET_URL || "http://ticket:6000/ticket/api/v1";
const CONTENT_URL =
  process.env.CONTENT_URL || "http://content:5000/content/api/v1";
const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";


// ────────────────────────────────────────────────
// Tool Handlers
// ────────────────────────────────────────────────

/**
 * Search territories on the semantic map by interests.
 */
async function search_territories({ interests }, user) {
  try {
    const res = await axios.get(`${MAP_URL}/territory/searchTerritories`, {
      params: { interests: interests.join(","), uid: user.uid },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_territories error:", err.message);
    return {
      error: true,
      message: "Could not search territories right now.",
    };
  }
}

/**
 * Get upcoming events in the user's universe.
 */
async function get_upcoming_events({ limit = 5 }, user) {
  try {
    const params = {};

    params.status = "featured";

    const res = await axios.get(`${EVENT_URL}/searchEvents`, {
      params,
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("get_upcoming_events error:", err.message);
    return { error: true, message: "Could not fetch events right now." };
  }
}

/**
 * Search clubs by interests.
 */
async function search_clubs({ interests }, user) {
  try {
    const res = await axios.get(`${UNIVERSE_URL}/club/searchClubs`, {
      params: { query: interests.join(","), uid: user.uid },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_clubs error:", err.message);
    return { error: true, message: "Could not search clubs right now." };
  }
}

/**
 * Get platform stats (active universes, etc).
 */
async function get_platform_stats() {
  try {
    const res = await axios.get(`${MULTIVERSE_URL}/getStats`, {
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("get_platform_stats error:", err.message);
    return { error: true, message: "Could not fetch stats right now." };
  }
}

/**
 * Search users by interests/skills.
 */
async function search_users({ interests, lookingFor }, user) {
  try {
    const res = await axios.get(`${UNIVERSE_URL}/user/searchUsersByFacet`, {
      params: {
        query: interests.join(","),
        uid: user.uid,
      },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_users error:", err.message);
    return { error: true, message: "Could not search users right now." };
  }
}

/**
 * Find alumni at a specific company.
 */
async function search_alumni({ company }, user) {
  try {
    const res = await axios.get(`${UNIVERSE_URL}/searchAlumni`, {
      params: { company, uid: user.uid },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_alumni error:", err.message);
    return {
      error: true,
      message: "Could not search alumni right now.",
    };
  }
}

/**
 * Compute similarity between two users.
 */
async function compute_similarity({ targetUserId }, user) {
  try {
    const res = await axios.get(`${MAP_URL}/computeSimilarity`, {
      params: { userId1: user.id, userId2: targetUserId },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("compute_similarity error:", err.message);
    return {
      error: true,
      message: "Could not compute similarity right now.",
    };
  }
}

/**
 * STEP 1: Find potential recipients for a message.
 * Searches by interests (facets) and/or by name.
 * Returns a deduplicated user list for the frontend to render with checkboxes.
 */
async function send_message_get_recipients({ interests, names, lookingFor }, user) {
  try {
    const results = [];
    const seenIds = new Set();

    // Search by interests/facets if provided
    if (interests && interests.length > 0) {
      const res = await axios.get(`${UNIVERSE_URL}/user/searchUsersByFacet`, {
        params: {
          query: interests.join(","),
          uid: user.uid,
        },
        headers: internalHeaders(),
      });
      const users = Array.isArray(res.data) ? res.data : [];
      for (const u of users) {
        const id = u._id || u.id;
        if (id && !seenIds.has(id.toString()) && id.toString() !== user.id) {
          seenIds.add(id.toString());
          results.push({
            _id: id,
            name: u.name || u.callSign,
            image: u.image || u.img || null,
            interests: u.interests || [],
            course: u.course || "",
          });
        }
      }
    }

    // Search by names if provided
    if (names && names.length > 0) {
      for (const name of names) {
        try {
          const res = await axios.get(`${UNIVERSE_URL}/user/searchUserByName`, {
            params: { name },
            headers: internalHeaders(),
          });
          const users = Array.isArray(res.data) ? res.data : [];
          for (const u of users) {
            const id = u._id || u.id;
            if (id && !seenIds.has(id.toString()) && id.toString() !== user.id) {
              seenIds.add(id.toString());
              results.push({
                _id: id,
                name: u.name || u.callSign,
                image: u.image || u.img || null,
                interests: u.interests || [],
                course: u.course || "",
              });
            }
          }
        } catch (nameErr) {
          console.error(`search by name "${name}" failed:`, nameErr.message);
        }
      }
    }

    return {
      recipients: results.slice(0, 20), // Cap at 20 to keep SSE payload manageable
      totalFound: results.length,
      step: "recipient_selection",
    };
  } catch (err) {
    console.error("send_message_get_recipients error:", err.message);
    return { error: true, message: "Could not find recipients right now." };
  }
}

/**
 * STEP 2: Generate a draft message using OpenAI based on the user's intent.
 * This is optional — the user can also type the message themselves.
 */
async function send_message_compose({ recipientNames, intent, tone = "friendly" }, user) {
  try {
    const { OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const toneGuide = {
      formal: "Write in a professional and formal tone.",
      casual: "Write in a relaxed, casual tone with slang where appropriate.",
      friendly: "Write in a warm, friendly and approachable tone.",
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a message composer for a campus social platform. ${toneGuide[tone] || toneGuide.friendly} Keep messages concise (2-4 sentences). Use 1-2 emojis max. Do not include subject lines or greetings like "Dear". Just write the message body.`,
        },
        {
          role: "user",
          content: `Write a message to send to ${recipientNames.length} user(s) about: ${intent}`,
        },
      ],
      max_tokens: 200,
    });

    const draft = completion?.choices?.[0]?.message?.content || "";

    return {
      draft,
      recipientCount: recipientNames.length,
      tone,
      step: "message_preview",
    };
  } catch (err) {
    console.error("send_message_compose error:", err.message);
    return { error: true, message: "Could not compose message right now." };
  }
}

/**
 * STEP 3: Execute — send the confirmed message to confirmed recipients.
 * Calls the universe service's sendBulkMessage endpoint.
 */
async function send_message_execute({ recipientNames, message }, user) {
  try {
    // Resolve names to ObjectIds 
    const resolvedIds = [];
    for (const name of recipientNames) {
      if (!name) continue;
      
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(name);
      if (isObjectId) {
        resolvedIds.push(name);
      } else {
        // Treat as a name, resolve via search
        try {
          const searchRes = await axios.get(
            `${UNIVERSE_URL}/user/searchUserByName`,
            { params: { name }, headers: internalHeaders() },
          );
          const users = Array.isArray(searchRes.data) ? searchRes.data : [];
          if (users.length > 0) {
            resolvedIds.push(users[0]._id.toString());
          } else {
            console.error(`send_message_execute: Could not resolve name "${name}" to a user.`);
          }
        } catch (resolveErr) {
          console.error(`send_message_execute: Error resolving name "${name}":`, resolveErr.message);
        }
      }
    }

    if (resolvedIds.length === 0) {
      return { error: true, message: "Could not find any valid recipients to send to." };
    }

    const res = await axios.post(
      `${UNIVERSE_URL}/chat/sendBulkMessage`,
      { recipientIds: resolvedIds, message, senderId: user.id },
      { headers: userHeaders(user) },
    );
    return res.data;
  } catch (err) {
    console.error("send_message_execute error:", err.message);
    return { error: true, message: "Could not send messages right now." };
  }
}

/**
 * Get top universes by popularity.
 */
async function top_universes({ limit = 5 }, user) {
  try {
    const res = await axios.get(
      `${MULTIVERSE_URL}/universe/getPopularUniverses`,
      {
        params: { limit },
        headers: internalHeaders(),
      },
    );
    console.log(res.data);
    return res.data;
  } catch (err) {
    console.error("top_universes error:", err.message);
    return { error: true, message: "Could not fetch top universes right now." };
  }
}

/**
 * Search universes by query string.
 */
async function search_universe({ q }, user) {
  try {
    const res = await axios.get(`${MULTIVERSE_URL}/universe/searchUniverse`, {
      params: { q },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_universe error:", err.message);
    return { error: true, message: "Could not search universes right now." };
  }
}

/**
 * Search user nodes on the map by name.
 */
async function search_nodes_by_name({ name }, user) {
  try {
    const res = await axios.post(
      `${MAP_URL}/nodes/metaSearchProfileFacets`,
      { metaQuery: name, limit: 10 },
      { headers: internalHeaders() },
    );
    return res.data;
  } catch (err) {
    console.error("search_nodes_by_name error:", err.message);
    return {
      error: true,
      message: "Could not search nodes by name right now.",
    };
  }
}

/**
 * Navigate the map to focus on a specific node.
 * Fetches the node's position and territory data.
 */
async function navigate_to_node({ nodeId }) {
  try {
    const res = await axios.get(
      `${MAP_URL}/territory/getNodeTerritoryAndPosition`,
      {
        params: { nodeId },
        headers: internalHeaders(),
      },
    );
    return res.data;
  } catch (err) {
    console.error("navigate_to_node error:", err.message);
    return {
      error: true,
      message: "Could not navigate to node right now.",
    };
  }
}

/**
 * Universal app navigation — resolves params and returns a navigation payload.
 */
async function app_navigate({ screen, query }, user) {
  const { ROUTE_REGISTRY } = require("../llm/routeRegistry");

  const route = ROUTE_REGISTRY[screen];
  if (!route) {
    return {
      error: true,
      message: `Unknown screen: "${screen}". I can't navigate there.`,
    };
  }

  // If the screen has no required params, navigate directly
  if (!route.params.length) {
    return {
      success: true,
      screen,
      tab: route.tab,
      params: {},
    };
  }

  // Resolvers for screens that need params
  const resolvers = {
    club: async () => {
      if (!query) return null;
      const res = await axios.get(`${UNIVERSE_URL}/club/searchClubs`, {
        params: { query, uid: user.uid },
        headers: internalHeaders(),
      });
      const clubs = res.data;
      const club = Array.isArray(clubs) && clubs.length > 0 ? clubs[0] : null;
      if (!club) return null;
      return {
        id: club._id || club.id,
        name: club.name,
        secondaryImg: club.secondaryImg || null,
      };
    },

    community: async () => {
      if (!query) return null;
      const res = await axios.get(
        `${UNIVERSE_URL}/community/searchCommunities`,
        {
          params: { query, uid: user.uid },
          headers: internalHeaders(),
        },
      );
      const communities = res.data;
      const community =
        Array.isArray(communities) && communities.length > 0
          ? communities[0]
          : null;
      if (!community) return null;
      return {
        id: community._id || community.id,
        name: community.name || community.title,
        secondaryImg:
          community.secondaryCover || community.secondaryImg || null,
      };
    },

    profile2: async () => {
      if (!query) return {}; // Open current user's own profile

      const res = await axios.get(`${UNIVERSE_URL}/user/searchUserByName`, {
        params: { name: query },
        headers: internalHeaders(),
      });
      const users = res.data;
      const match = Array.isArray(users) && users.length > 0 ? users[0] : null;
      if (!match) return null;
      return {
        id: match._id || match.id,
        name: match.name,
        img: match.image || null,
      };
    },
  };

  const resolver = resolvers[screen];
  if (resolver) {
    const resolved = await resolver();
    if (!resolved) {
      return {
        error: true,
        message: `Couldn't find a matching ${screen} for "${query}".`,
      };
    }
    return {
      success: true,
      screen,
      tab: route.tab,
      params: resolved,
    };
  }

  // Fallback for screens with params but no resolver yet
  return {
    success: true,
    screen,
    tab: route.tab,
    params: {},
  };
}

/**
 * Perform a client-side app action (toggle sidebar, theme, logout, etc.).
 * No backend call needed — just returns a payload the frontend will act on.
 */
async function app_action({ action }) {
  const VALID_ACTIONS = ["toggle_sidebar", "toggle_theme", "logout"];
  if (!VALID_ACTIONS.includes(action)) {
    return { error: true, message: `Unknown action: "${action}"` };
  }
  return { success: true, action };
}

/**
 * Search for tickets bought by the current user.
 * Supports optional filters: eventName, status, upcoming.
 */
async function search_my_tickets({ eventName, status, upcoming }, user) {
  try {
    const params = { userId: user.id };
    if (eventName) params.eventName = eventName;
    if (status) params.status = status;
    if (upcoming) params.upcoming = "true";

    const res = await axios.get(`${TICKET_URL}/searchMyTickets`, {
      params,
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_my_tickets error:", err.message);
    return { error: true, message: "Could not search tickets right now." };
  }
}

/**
 * Search content posts (clubs/communities) for a knowledge question.
 * Calls the Content service's hybrid vector + text search endpoint.
 */
async function search_content_qa({ query }, user) {
  try {
    const res = await axios.post(
      `${CONTENT_URL}/searchContentQA`,
      { query, uid: user.uid },
      { headers: internalHeaders() },
    );
    return res.data;
  } catch (err) {
    console.error("search_content_qa error:", err.message);
    return {
      error: true,
      found: false,
      message: "Could not search content right now.",
    };
  }
}

/**
 * Fallback: search the internet via a separate LLM call when no
 * campus content matched the user's question.
 */
async function web_search_fallback({ query }) {
  try {
    const { OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Answer the user's question concisely based on your knowledge. Indicate that this answer is from general knowledge, not from campus-specific sources.",
        },
        { role: "user", content: query },
      ],
      max_tokens: 500,
    });

    const answer = completion?.choices?.[0]?.message?.content || "";
    return {
      answer,
      source: "internet",
      found: answer.length > 0,
      askToCommunity: true,
    };
  } catch (err) {
    console.error("web_search_fallback error:", err.message);
    return {
      error: true,
      found: false,
      message: "Could not search the internet right now.",
    };
  }
}

/**
 * Post a question in the most relevant community on the user's behalf.
 * 1. Searches for a relevant community
 * 2. Creates a text post in that community
 */
async function post_question_to_community({ question, communityKeyword }, user) {
  try {
    // 1. Find relevant community by keyword-ranked search (fallback to question if keyword missing)
    const searchQuery = communityKeyword || question;
    console.log(`[toolHandlers] Finding community for: "${searchQuery}"`);
    const searchRes = await axios.get(
      `${UNIVERSE_URL}/community/searchCommunities`,
      {
        params: { query: searchQuery, uid: user.uid },
        headers: internalHeaders(),
      },
    );

    const communities = searchRes.data;
    let community =
      Array.isArray(communities) && communities.length > 0
        ? communities[0]
        : null;

    // 2. If no relevant community found, fall back to MacbeaseNEWS
    if (!community) {
      console.log(
        "🔍 No relevant community found — falling back to MacbeaseNEWS",
      );
      const fallbackRes = await axios.get(
        `${UNIVERSE_URL}/community/searchCommunities`,
        {
          params: { query: "MacbeaseNEWS" },
          headers: internalHeaders(),
        },
      );
      const fallbackList = fallbackRes.data;
      community =
        Array.isArray(fallbackList) && fallbackList.length > 0
          ? fallbackList[0]
          : null;
    }

    if (!community) {
      return {
        error: true,
        message: "Could not find a community to post your question in.",
      };
    }

    // 3. Auto-join the user to the community so the post call succeeds
    try {
      await axios.post(
        `${UNIVERSE_URL}/community/joinAsMember`,
        { communityId: community._id || community.id },
        { headers: userHeaders(user) },
      );
      console.log(`✅ User joined community ${community.title}`);
    } catch (joinErr) {
      // Ignore — user may already be a member
      console.log(
        `ℹ️ Join community skipped: ${joinErr?.response?.data || joinErr.message}`,
      );
    }

    // 4. Create the content document
    const postRes = await axios.post(
      `${CONTENT_URL}/createContent`,
      {
        contentType: "text",
        sendBy: "userCommunity",
        url: "", // must exist — frontend's getUrls() crashes on null url
        text: question,
        title: question,
        belongsTo: community._id || community.id,
        peopleTagged: [],
        universeMetaData: community.universeMetaData || {},
        tags: [],
      },
      { headers: userHeaders(user) },
    );

    const contentId = postRes.data?.contentId || null;
    console.log(
      `📝 Content created: ${contentId}, registering in community feed...`,
    );

    // 5. Register the content in the community's feed array (makes it visible)
    if (contentId) {
      await axios.post(
        `${UNIVERSE_URL}/community/post`,
        {
          contentId,
          communityId: community._id || community.id,
          contentType: "text",
        },
        { headers: userHeaders(user) },
      );
    }

    return {
      success: true,
      communityName: community.title || community.name || "MacbeaseNEWS",
      communityId: community._id || community.id,
      postId: contentId,
    };
  } catch (err) {
    console.error("post_question_to_community error:", err.message);
    return {
      error: true,
      message: "Could not post the question right now.",
    };
  }
}

/**
 * Search communities by topic/name/tags.
 */
async function search_communities({ query }, user) {
  try {
    const res = await axios.get(`${UNIVERSE_URL}/community/searchCommunities`, {
      params: { query },
      headers: internalHeaders(),
    });

    // The endpoint returns an array of communities
    const communities = (Array.isArray(res.data) ? res.data : []).slice(0, 5);

    return {
      results: communities.map((c) => ({
        _id: c._id,
        title: c.title,
        tag: c.tag || [],
        label: c.label || "",
        secondaryCover: c.secondaryCover || null,
        membersCount: c.membersCount || 0,
        activeMembers: c.activeMembers || 0,
      })),
      found: communities.length > 0,
    };
  } catch (err) {
    console.error("search_communities error:", err.message);
    return { error: true, message: "Could not search communities right now." };
  }
}

/**
 * Navigate to a user's 3D territory.
 * Accepts userId directly, or resolves a name → userId.
 */
async function navigate_to_user_territory({ userId, name }, user) {
  try {
    let resolvedUserId = userId;
    let resolvedUser = null;

    if (!resolvedUserId && name) {
      const res = await axios.get(`${UNIVERSE_URL}/user/searchUserByName`, {
        params: { name },
        headers: internalHeaders(),
      });
      const users = res.data;
      if (!Array.isArray(users) || users.length === 0) {
        return {
          error: true,
          message: `Could not find a user named "${name}".`,
        };
      }
      resolvedUserId = users[0]._id;
      resolvedUser = users[0];
    }

    if (!resolvedUserId) {
      return { error: true, message: "Please provide a user name or ID." };
    }

    return {
      success: true,
      screen: "territory3DOverlay",
      tab: "Map",
      params: {
        userId: resolvedUserId,
        member: { name: resolvedUser.name, image: resolvedUser.image },
      },
    };
  } catch (err) {
    console.error("navigate_to_user_territory error:", err.message);
    return {
      error: true,
      message: "Could not navigate to user territory right now.",
    };
  }
}

/**
 * Fetch profile facet texts for a user.
 * Used by Starman to answer questions about the user the viewer is looking at.
 * Accepts an ObjectId or a user's name.
 */
async function get_user_facet_texts({ userId }) {
  try {
    let resolvedUserId = userId;

    // Check if it's a valid ObjectId (24 hex chars)
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(resolvedUserId);

    if (!isObjectId) {
      // It's likely a name, try to resolve it
      const searchRes = await axios.get(
        `${UNIVERSE_URL}/user/searchUserByName`,
        {
          params: { name: userId },
          headers: internalHeaders(),
        },
      );
      const users = searchRes.data;
      if (!Array.isArray(users) || users.length === 0) {
        return {
          error: true,
          message: `Could not find a user named "${userId}".`,
        };
      }
      resolvedUserId = users[0]._id;
    }

    const res = await axios.get(`${MAP_URL}/nodes/getUserFacetTexts`, {
      params: { parentId: resolvedUserId },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("get_user_facet_texts error:", err.message);
    return {
      error: true,
      message: "Could not fetch user facet texts right now.",
    };
  }
}

/**
 * Search events by topic/interest keywords, date, status, or club name.
 */
async function search_events({ query, status, date, clubName, place }, user) {
  try {
    const params = {};
    if (query) params.q = query;
    if (status) params.status = status;
    if (date) params.date = date;
    if (clubName) params.clubName = clubName;
    if (place) params.place = place;

    const res = await axios.get(`${EVENT_URL}/searchEvents`, {
      params,
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_events error:", err.message);
    return { error: true, message: "Could not search events right now." };
  }
}

/**
 * Query the crowdsourced campus knowledge base.
 * Returns aggregated insights with confidence scores and consensus data.
 */
async function query_universe_knowledge({ query }, user) {
  try {
    const res = await axios.get(`${KNOWLEDGE_URL}/insight/query`, {
      params: { query, uid: user.uid },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("query_universe_knowledge error:", err.message);
    return {
      error: true,
      found: false,
      message: "Could not query campus knowledge right now.",
    };
  }
}

/**
 * Trigger the frontend to fetch a credit question and show the refill banner UI
 */
async function fetch_credit_question(args, user) {
  // We don't fetch the question here; the frontend does it via app-action
  return [{ success: true, action: "fetch_credit_question" }];
}

/**
 * Navigate to a specific territory by name.
 * Searches territories by name and returns a navigation payload.
 */
async function navigate_to_territory({ territoryName }, user) {
  try {
    const res = await axios.get(`${MAP_URL}/territory/searchTerritories`, {
      params: { q: territoryName, limit: 1, uid: user.uid },
      headers: internalHeaders(),
    });

    const territories = Array.isArray(res.data) ? res.data : [];
    if (territories.length === 0) {
      return {
        error: true,
        message: `Could not find a territory named "${territoryName}".`,
      };
    }

    const territory = territories[0];
    return {
      success: true,
      screen: "universeTerritoryMap",
      tab: "Map",
      params: {
        selectedTerritory: territory,
      },
    };
  } catch (err) {
    console.error("navigate_to_territory error:", err.message);
    return {
      error: true,
      message: "Could not navigate to territory right now.",
    };
  }
}

/**
 * Search external network knowledge base via the knowledge service.
 * Called when users ask about class announcements, deadlines, assignments, etc.
 */
async function search_external_context({ query, communityFilter, userOnly }, user) {
  try {
    const params = { query, uid: user.uid };
    if (communityFilter) params.entityFilter = communityFilter;
    if (userOnly) params.contributorId = user.id;

    const res = await axios.get(`${KNOWLEDGE_URL}/external/search`, {
      params,
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_external_context error:", err.message);
    return {
      error: true,
      found: false,
      message: "Could not search external network context right now.",
    };
  }
}

// ────────────────────────────────────────────────
// Registry – maps function name → handler
// ────────────────────────────────────────────────
const TOOL_HANDLERS = {
  search_territories,
  get_upcoming_events,
  search_clubs,
  get_platform_stats,
  search_users,
  search_alumni,
  compute_similarity,
  send_message_get_recipients,
  send_message_compose,
  send_message_execute,
  fetch_credit_question,
  top_universes,
  search_universe,
  search_nodes_by_name,
  navigate_to_node,
  app_navigate,
  app_action,
  search_my_tickets,
  search_content_qa,
  web_search_fallback,
  post_question_to_community,
  search_communities,
  navigate_to_user_territory,
  navigate_to_territory,
  get_user_facet_texts,
  search_events,
  query_universe_knowledge,
  search_external_context,
};

/**
 * Execute a tool by name with given args.
 */
async function executeTool(name, args, user) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { error: true, message: `Unknown tool: ${name}` };
  }
  return handler(args, user);
}

module.exports = { executeTool, TOOL_HANDLERS };
