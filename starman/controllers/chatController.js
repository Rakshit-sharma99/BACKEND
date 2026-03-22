/**
 * Chat controller – handles the SSE streaming chat endpoint.
 *
 * Flow:
 * 1. Receive user message + optional sessionId
 * 2. Get or create session with conversation history
 * 3. Send message to Gemini with streaming
 * 4. If Gemini calls a tool → execute it → feed result back → continue streaming
 * 5. Stream text chunks to client via SSE
 * 6. Send rich cards at the end (if any tool returned structured data)
 * 7. Close the SSE connection
 */

// Toggle between Gemini and OpenAI by commenting/uncommenting the appropriate line below:
// const { createChat } = require("../llm/geminiClient");
const { createChat } = require("../llm/openaiClient");
const { executeTool } = require("../handlers/toolHandlers");
const buildSystemPrompt = require("../llm/systemPrompt");
const {
  getOrCreateSession,
  updateHistory,
  setLastResults,
} = require("../session/sessionStore");
const axios = require("axios");
const { publishEvent } = require("../config/kafka");

// ── Service URLs ──
const CREDIT_URL =
  process.env.CREDIT_URL || "http://credit:7090/credit/api/v1";
const QUESTION_URL =
  process.env.QUESTION_URL || "http://question:7070/question/api/v1";
const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";

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

/**
 * POST /starman/api/v1/chat
 *
 * Body: { message: string, sessionId?: string, navContext?: object }
 * Response: SSE stream
 *
 * SSE event types:
 *   chunk   – { text: "partial text" }
 *   cards   – { cards: [{type, ...data}] }
 *   done    – { sessionId }
 *   error   – { message }
 */
const chat = async (req, res) => {
  const { message, sessionId, navContext } = req.body;
  const user = req.user; // from JWT middleware: { id, uid, callSign, role }

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }

  // ── Setup SSE ──
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── Credit Check ──
    let creditBalance = null;
    try {
      const creditRes = await axios.get(`${CREDIT_URL}/balance`, {
        params: { userId: user.id, uid: user.uid },
        headers: internalHeaders(),
      });
      creditBalance = creditRes.data;
    } catch (creditErr) {
      console.error("Credit check failed, proceeding without:", creditErr.message);
    }

    // If credits are exhausted, notify the client
    if (creditBalance && !creditBalance.hasCredits) {
      sendSSE("credits_exhausted", {
        balance: 0,
        message: "You've used all your daily stardust! ✨ Answer a quick question to fuel back up 🚀",
        refillOptions: ["answer_question"],
      });
      sendSSE("done", { sessionId: sessionId || "none" });
      res.end();
      return;
    }

    // ── Session ──
    const session = getOrCreateSession(sessionId, user.id);
    const systemPrompt = buildSystemPrompt(navContext || {}, creditBalance);
    const chat = createChat(session.history, systemPrompt);

    // ── Send message to Gemini (streaming) ──
    let result = await chat.sendMessageStream(message);

    let fullText = "";
    let cards = [];

    // Process the stream
    for await (const chunk of result.stream) {
      const candidate = chunk.candidates?.[0];
      if (!candidate) continue;

      // Check for function calls
      const functionCalls = candidate.content?.parts?.filter(
        (p) => p.functionCall,
      );

      if (functionCalls && functionCalls.length > 0) {
        const toolResponses = [];

        // Execute each tool call in the parallel batch
        for (const part of functionCalls) {
          const { name, args, id } = part.functionCall;
          console.log(`🔧 Tool call: ${name}`, args);

          const toolResult = await executeTool(name, args || {}, user);

          // Store results for follow-ups
          setLastResults(session.sessionId, { [name]: toolResult });

          // Extract clickable buttons from tool results
          if (toolResult && !toolResult.error) {
            const extracted = extractButtons(name, toolResult);
            if (extracted.length > 0) {
              cards.push(...extracted);
            }
          }

          // Prepare the response for OpenAI (including the tool call ID)
          toolResponses.push({
            functionResponse: {
              id, // Pass the ID back to openaiClient
              name,
              response: { result: toolResult },
            },
          });
        }

        // Feed ALL tool results back to generate a natural response in one go
        result = await chat.sendMessageStream(toolResponses);

        // Stream the follow-up text
        for await (const followUpChunk of result.stream) {
          const text = followUpChunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullText += text;
            sendSSE("chunk", { text });
          }
        }
      } else {
        // Regular text chunk
        const text = candidate.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
          sendSSE("chunk", { text });
        }
      }
    }

    // ── Send clickable buttons if any ──
    if (cards.length > 0) {
      console.log(`Sending ${cards.length} buttons to frontend:`);
      sendSSE("buttons", { buttons: cards });
    }

    // ── Publish deferred query if tools returned no results ──
    // This tells SERE to track the question and notify the user later
    if (cards.length === 0 && fullText.length > 0) {
      // Check if any tool was called but returned empty
      const lastResults = session.lastResults || {};
      const toolsCalled = Object.keys(lastResults);
      const allEmpty = toolsCalled.length > 0 && toolsCalled.every((key) => {
        const r = lastResults[key];
        if (!r) return true;
        if (r.error) return true;
        if (Array.isArray(r) && r.length === 0) return true;
        if (r.data && Array.isArray(r.data) && r.data.length === 0) return true;
        if (r.results && Array.isArray(r.results) && r.results.length === 0) return true;
        return false;
      });

      if (allEmpty) {
        publishEvent("query.deferred", {
          userId: user.id,
          uid: user.uid,
          query: message,
          sessionId: session.sessionId,
          toolsCalled,
        });
      }
    }

    // ── Update session history ──
    updateHistory(session.sessionId, message, fullText);

    // ── Deduct credit ──
    if (creditBalance && creditBalance.hasCredits) {
      try {
        const spendRes = await axios.post(`${CREDIT_URL}/spend`, {
          userId: user.id,
          uid: user.uid,
          amount: 1,
          ref: session.sessionId,
          reason: "Chat interaction",
        }, { headers: internalHeaders() });
        const newBalance = spendRes.data?.balance;
        sendSSE("credit_update", {
          balance: newBalance,
          spent: 1,
        });
      } catch (spendErr) {
        console.error("Credit spend failed:", spendErr.message);
      }
    }

    // ── Publish chat.completed to Kafka for question learning ──
    publishEvent("chat.completed", {
      messages: [
        { role: "user", text: message },
        { role: "model", text: fullText },
      ],
      userId: user.id,
      uid: user.uid,
      sessionId: session.sessionId,
    });

    // ── Done ──
    sendSSE("done", {
      sessionId: session.sessionId,
      creditsRemaining: creditBalance?.balance != null
        ? Math.max(0, creditBalance.balance - 1)
        : null,
    });
    res.end();
  } catch (error) {
    console.error("Chat error:", error);
    sendSSE("error", {
      message: "Oops! The Starman hit a cosmic glitch. Try again! 🛸",
    });
    res.end();
  }
};

/**
 * Extract clickable buttons from raw tool results.
 * Returns a flat array of { id, type, label, subtitle, image, meta }.
 */
function extractButtons(toolName, rawResult) {
  // Normalise input – some endpoints return an array directly,
  // others wrap it inside { data: [] } or { results: [] } or { territories: [] }.
  // Single-object responses (e.g. navigate_to_node) get wrapped as [rawResult].
  const items = Array.isArray(rawResult)
    ? rawResult
    : rawResult.data
      ? Array.isArray(rawResult.data)
        ? rawResult.data
        : [rawResult.data]
      : rawResult.results
        ? rawResult.results
        : rawResult.territories
          ? rawResult.territories
          : rawResult.tickets
            ? rawResult.tickets
            : rawResult.success
              ? [rawResult]
              : [];

  if (items.length === 0) return [];

  console.log(items);

  const extractors = {
    search_clubs: (item) => ({
      id: item._id || item.id,
      type: "club",
      label: item.name,
      subtitle:
        item.motto || (item.tags && item.tags.slice(0, 3).join(", ")) || "",
      image: item.secondaryImg || null,
      meta: {
        membersCount: item.membersCount,
        isMember: item.isMember,
      },
    }),

    search_territories: (item, index) => {
      // Strip heavy spatial/geometry data to keep SSE payload small
      const {
        spatial,
        centroidEmbedding,
        memberNodeIds,
        representativeTexts,
        ...lightTerritory
      } = item;
      console.log("lightTerritory", lightTerritory);
      return {
        id: item._id || item.id,
        type: "territory",
        label: item.name || item.title,
      };
    },

    get_upcoming_events: (item) => ({
      id: item._id || item.id,
      type: "event",
      label: item.name || item.title,
      subtitle: [
        item.belongsTo?.name,
        item.place,
        item.eventDate ? new Date(item.eventDate).toLocaleDateString() : null,
      ]
        .filter(Boolean)
        .join(" · "),
      image: item.url || null,
      meta: { date: item.eventDate, venue: item.place },
      action: {
        mode: "navigate",
        navigateTo: "eventExpand",
        params: {
          eventData: {
            name: item.name,
            eventId: item._id,
          },
        },
      },
    }),

    search_events: (item) => ({
      id: item._id || item.id,
      type: "event",
      label: item.name || item.title,
      subtitle: [
        item.belongsTo?.name,
        item.place,
        item.eventDate ? new Date(item.eventDate).toLocaleDateString() : null,
      ]
        .filter(Boolean)
        .join(" · "),
      image: item.url || null,
      meta: { date: item.eventDate, venue: item.place },
      action: {
        mode: "navigate",
        navigateTo: "eventExpand",
        params: {
          eventData: {
            name: item.name,
            eventId: item._id,
          },
        },
      },
    }),

    search_users: (item) => ({
      id: item._id || item.id,
      type: "profile",
      label: item.name || item.callSign,
      subtitle: item.interests?.join(", ") || item.course || item.bio || "",
      image: item.image || item.img || null,
      meta: {},
      action: {
        mode: "navigate",
        navigateTo: "profile2",
        params: {
          img: item.image || item.img || null,
          name: item.name || item.callSign,
          id: item._id || item.id,
        },
      },
    }),

    search_alumni: (item) => ({
      id: item._id || item.id,
      type: "profile",
      label: item.name || item.callSign,
      subtitle: item.company || item.course || "",
      image: item.image || item.img || null,
      meta: { company: item.company },
    }),
    search_universe: (item) => ({
      id: item._id || item.id || item.uid,
      type: "universe",
      label: item.name,
      subtitle: item.callSign || item.location || "",
      image: item.logoKey || null,
      meta: { rank: item.rank },
      lat: item.lat,
      lng: item.lng,
      action: {
        mode: "navigate",
        navigateTo: "mapLanding",
        params: {
          selectedUniverse: item,
        },
      },
    }),

    search_nodes_by_name: (item) => {
      const firstFacet = item.facets && item.facets[0];
      const meta = (firstFacet && firstFacet.meta) || {};
      return {
        id: item._id, // parentEntityId which is the userId
        type: "click-navigation",
        label: meta.name || "User",
        subtitle: meta.facetLabel || "Found on map",
        image: meta.image || null,
        meta: {},
        action: {
          mode: "navigate",
          navigateTo: "universeTerritoryMap",
          params: {
            selectedNodeId: firstFacet ? firstFacet.nodeId : null,
            universe: firstFacet?.universeMetaData,
            uid: firstFacet?.uid,
          },
        },
      };
    },

    navigate_to_node: (item) => ({
      id: item.node?.id || null,
      type: "auto-navigation",
      label: "Navigate to node",
      subtitle: item.territory?.name || "On the map",
      image: null,
      meta: {},
      action: {
        mode: "navigate",
        navigateTo: "universeTerritoryMap",
        params: {
          selectedNodeId: item.node?.id || null,
          universe: item.universeMetaData || null,
          uid: item.uid || null,
        },
      },
    }),

    app_navigate: (item) => ({
      id: null,
      type: "auto-navigation",
      label: item.screen,
      subtitle: item.tab || "",
      image: null,
      meta: {},
      action: {
        mode: "navigate",
        navigateTo: item.screen,
        tab: item.tab || null,
        params: item.params || {},
      },
    }),

    app_action: (item) => ({
      id: null,
      type: "app-action",
      label: item.action,
      subtitle: "",
      image: null,
      meta: {},
      action: {
        mode: "app_action",
        actionName: item.action,
      },
    }),

    search_my_tickets: (item) => ({
      id: item.ticketId || null,
      type: "ticket",
      label: item.eventName || "Ticket",
      subtitle: [
        item.ticketType,
        item.ticketStatus,
        item.eventDate ? new Date(item.eventDate).toLocaleDateString() : null,
      ]
        .filter(Boolean)
        .join(" · "),
      image: item.eventImage || null,
      meta: {},
      action: {
        mode: "navigate",
        navigateTo: "yourTickets",
        tab: "Home",
        params: {
          belongsTo: item.belongsTo,
          startTime: item.startTime,
          endTime: item.endTime,
          eventDate: item.eventDate,
          eventEndDate: item.eventEndDate,
          name: item.eventName,
          place: item.eventPlace,
          url: item.eventUrl,
          ticketData: item,
        },
      },
    }),

    search_content_qa: (item) => ({
      id: item._id || item.id || null,
      type: "source-post",
      label:
        item.title || (item.text ? item.text.substring(0, 60) + "…" : "Post"),
      subtitle: [
        item.params?.clubTitle || item.params?.communityTitle || "",
        item.timeStamp ? new Date(item.timeStamp).toLocaleDateString() : "",
      ]
        .filter(Boolean)
        .join(" · "),
      image:
        item.url ||
        item.params?.clubCover ||
        item.params?.communityCover ||
        null,
      meta: {
        text: item.text,
        contentType: item.contentType,
        commentsNum: item.commentsNum || (item.comments || []).length,
        likeCount: (item.likes || []).length,
      },
      action: {
        mode: "navigate",
        navigateTo: "expandPost",
        tab: "Home",
        params: { data: item },
      },
    }),

    post_question_to_community: (item) => ({
      id: item.communityId || null,
      type: "click-navigation",
      label: item.communityName || "Community",
      subtitle: "Your question was posted here",
      image: null,
      meta: { postId: item.postId },
      action: {
        mode: "navigate",
        navigateTo: "community",
        params: {
          id: item.communityId,
          name: item.communityName,
        },
      },
    }),

    search_communities: (item) => ({
      id: item._id || item.id || null,
      type: "click-navigation",
      label: item.title || "Community",
      subtitle: [
        item.label || "",
        item.membersCount ? `${item.membersCount} members` : "",
        ...(item.tag || []).slice(0, 3),
      ]
        .filter(Boolean)
        .join(" · "),
      image: item.secondaryCover || null,
      meta: {
        tags: item.tag,
        membersCount: item.membersCount,
        activeMembers: item.activeMembers,
      },
      action: {
        mode: "navigate",
        navigateTo: "community",
        params: {
          id: item._id || item.id,
          name: item.title,
          secondary: item.secondaryCover,
        },
      },
    }),

    navigate_to_user_territory: (item) => ({
      id: null,
      type: "auto-navigation",
      label: item.screen,
      subtitle: item.tab || "",
      image: null,
      meta: {},
      action: {
        mode: "navigate",
        navigateTo: item.screen,
        tab: item.tab || null,
        params: item.params || {},
      },
    }),
  };

  const extractor = extractors[toolName];

  console.log(extractor);

  // Fallback: pass items through with a generic shape
  if (!extractor) {
    return items.map((item) => ({
      id: item._id || item.id || null,
      type: toolName,
      label: item.name || item.title || "Result",
      subtitle: "",
      image: null,
      meta: item,
    }));
  }

  return items.map(extractor);
}

module.exports = { chat };
