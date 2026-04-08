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
const { getRegistrySummary } = require("../llm/routeRegistry");
const { executeTool } = require("../handlers/toolHandlers");
const buildSystemPrompt = require("../llm/systemPrompt");
const { classifyRequest } = require("../handlers/taskClassifier");
const { createTask, executeTask } = require("../handlers/taskEngine");
const { taskEvents } = require("./taskController");
const {
  getOrCreateSession,
  updateHistory,
  setLastResults,
} = require("../session/sessionStore");
const { loadIdentityContext } = require("../identity/identityManager");
const axios = require("axios");
const { publishEvent } = require("../config/kafka");

// ── Service URLs ──
const CREDIT_URL = process.env.CREDIT_URL || "http://credit:7090/credit/api/v1";
const QUESTION_URL =
  process.env.QUESTION_URL || "http://question:7070/question/api/v1";
const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";

// ── Witty tool-status messages (college-friend energy) ──
const TOOL_STATUS_MESSAGES = {
  search_events: {
    searching: "lemme check what's poppin on campus rn 🎪",
    done: "found the goods, you're welcome 😎",
    error: "the events page ghosted me… rude 💀",
  },
  get_upcoming_events: {
    searching: "checking the event calendar so you don't have to 📅",
    done: "here's what's coming up, mark your calendar bestie 🗓️",
    error: "events calendar said 'connection refused'… it's giving introvert 🫠",
  },
  search_clubs: {
    searching: "scouring the club directory like a freshie on day 1 🏃",
    done: "clubs locked and loaded 🔒",
    error: "club search crashed harder than my GPA last sem 📉",
  },
  search_communities: {
    searching: "hunting down communities… pls don't judge my search history 🕵️",
    done: "community intel acquired ✅",
    error: "communities are playing hard to get rn 😤",
  },
  search_users: {
    searching: "looking for your people… this feels like Tinder but academic 🎓",
    done: "found some interesting humans for you 👀",
    error: "user search said no <3 try again maybe? 🤷",
  },
  search_alumni: {
    searching: "stalking alumni LinkedIn-style but make it ethical 🕶️",
    done: "alumni data in the bag 💼",
    error: "alumni database threw me out like a bouncer at a frat party 🚪",
  },
  search_territories: {
    searching: "exploring the map like I'm Columbus but with WiFi 🗺️",
    done: "territory scouted, reporting back 🫡",
    error: "map loading error… the territory remains uncharted 🏴‍☠️",
  },
  search_content_qa: {
    searching: "digging through posts like it's 3AM and I can't stop scrolling 📱",
    done: "found some relevant posts, you owe me coffee ☕",
    error: "content search broke… I blame the wifi 📶",
  },
  search_external_context: {
    searching: "brb asking the WhatsApp groups so you don't have to 💬",
    done: "WhatsApp intelligence gathered 🕵️‍♂️",
    error: "WhatsApp data said 'seen' but didn't reply 😒",
  },
  search_leaderboard: {
    searching: "pulling up the rankings, this is gonna be spicy 🏆",
    done: "leaderboard is in — bow before the top-rated 👑",
    error: "leaderboard is on vacation rn 🏖️",
  },
  query_universe_knowledge: {
    searching: "tapping into the campus hive mind 🧠",
    done: "hive mind has spoken 🐝",
    error: "the hive mind is napping rn… try again later 😴",
  },
  get_platform_stats: {
    searching: "crunching numbers like it's finals week 🔢",
    done: "stats served fresh 📊",
    error: "stats machine broke 🤖",
  },
  compute_similarity: {
    searching: "calculating your vibe compatibility… no pressure 🔮",
    done: "compatibility report ready, don't shoot the messenger 💘",
    error: "vibe calculator threw a tantrum 😵‍💫",
  },
  search_nodes_by_name: {
    searching: "scanning the map for that name… CIA who? 🔍",
    done: "found 'em on the map 📍",
    error: "map search went MIA 🫥",
  },
  navigate_to_node: {
    searching: "zooming into the map like Google Earth but cooler 🌍",
    done: "navigation locked in 🧭",
    error: "GPS recalculating… again 🔄",
  },
  app_navigate: {
    searching: "teleporting you there rn 🚀",
    done: "arrived at destination ✨",
    error: "navigation failed, we're lost bestie 🫣",
  },
  app_action: {
    searching: "pressing buttons behind the scenes 🎛️",
    done: "done, that was easy 😌",
    error: "the button broke idk what happened 🫠",
  },
  search_my_tickets: {
    searching: "checking your ticket stash 🎟️",
    done: "tickets found, you event-hopper you 🎉",
    error: "ticket system is being dramatic rn 🎭",
  },
  web_search_fallback: {
    searching: "asking the internet because campus didn't know either 🌐",
    done: "the internet has blessed us with knowledge 🙏",
    error: "even the internet doesn't know… we're cooked 🍳",
  },
  community_post_search: {
    searching: "finding communities where your question fits best 🔍",
    done: "communities found, pick your arena! 🏟️",
    error: "couldn't find communities right now 😤",
  },
  community_post_compose: {
    searching: "drafting a post for you, Shakespeare mode activated ✍️",
    done: "draft ready for your review 📝",
    error: "writer's block hit hard 😵",
  },
  community_post_execute: {
    searching: "posting your question to the community, manifesting answers 🙌",
    done: "posted! now we wait for the community brain trust 🧠",
    error: "couldn't post… the community is giving silent treatment 🤐",
  },
  send_message_get_recipients: {
    searching: "finding people to send your message to 📬",
    done: "recipient list ready, choose your fighters 🥊",
    error: "couldn't find recipients… everyone's hiding 🙈",
  },
  send_message_compose: {
    searching: "cooking up a message draft for you ✍️",
    done: "draft ready, Shakespeare is shaking 📝",
    error: "writer's block hit hard 😵",
  },
  send_message_execute: {
    searching: "sending messages at the speed of light ⚡",
    done: "messages sent, you're a networking pro 🤝",
    error: "messages got lost in the void 🕳️",
  },
  top_universes: {
    searching: "ranking universes like it's a tier list video 🏆",
    done: "tier list ready 🥇",
    error: "universe ranking system crashed 💥",
  },
  search_universe: {
    searching: "searching across the multiverse for you 🌌",
    done: "universes found, pick your reality ✨",
    error: "multiverse search went wrong… variant timeline? 🫠",
  },
  navigate_to_user_territory: {
    searching: "finding their territory on the map 🗺️",
    done: "territory located, entering now 🚶",
    error: "territory not found… they're off the grid 👻",
  },
  navigate_to_territory: {
    searching: "locating that territory for you 📍",
    done: "territory found, let's explore 🧭",
    error: "territory is hiding from us 🌫️",
  },
  get_user_facet_texts: {
    searching: "reading their profile like a detective novel 🔎",
    done: "profile intel acquired 🕵️",
    error: "their profile is being mysterious 🎭",
  },
  fetch_credit_question: {
    searching: "fetching a question to earn you some stardust ⭐",
    done: "question ready, big brain time 🧠",
    error: "question machine jammed 🫤",
  },
  _default: {
    searching: "working on it, gimme a sec… why you ask me these things 😩",
    done: "done! that was exhausting ngl 😮‍💨",
    error: "something broke and I'm lowkey panicking 😰",
  },
};

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

  console.log("🌟 [STARMAN] Received navContext from frontend:", JSON.stringify(navContext, null, 2));

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
      console.error(
        "Credit check failed, proceeding without:",
        creditErr.message,
      );
    }

    // If credits are exhausted, notify the client
    if (creditBalance && !creditBalance.hasCredits) {
      sendSSE("credits_exhausted", {
        balance: 0,
        message:
          "You've used all your daily stardust! ✨ Answer a quick question to fuel back up 🚀",
        refillOptions: ["answer_question"],
      });
      sendSSE("done", { sessionId: sessionId || "none" });
      res.end();
      return;
    }

    // ── Session ──
    const session = await getOrCreateSession(sessionId, user.id);

    // ── Load Identity Context ──
    let identityContext = null;
    try {
      identityContext = await loadIdentityContext(user.id, user.uid);
    } catch (identityErr) {
      console.error(
        "Identity context load failed, proceeding with defaults:",
        identityErr.message,
      );
    }

    const systemPrompt = buildSystemPrompt(navContext || {}, creditBalance, identityContext);
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
        // ── Classify the function calls ──
        const classification = classifyRequest(functionCalls);
        console.log(
          `[ChatController] Classification: ${classification.mode} (Reason: ${classification.reason})`,
        );

        if (classification.mode === "async") {
          // ── Inline Async Task Path ──
          // Task executes on the SAME SSE connection.
          // User sees progress inline and can choose to background it.
          const toolNames = functionCalls
            .map((fc) => fc.functionCall.name)
            .join(", ");
          const taskDescription = `Running task for: ${toolNames}`;

          const task = await createTask(
            user,
            session.sessionId,
            taskDescription,
            functionCalls,
            classification.reason,
          );

          // 1. Emit task_created with a button to open the Tasks dashboard
          sendSSE("task_created", {
            taskId: task.taskId,
            description: task.description,
            steps: task.steps.length,
            message: "On it! I've queued this up. Hang tight or check your Tasks… 🚀",
          });

          // 2. Schedule background_option after 3 seconds
          const bgTimeout = setTimeout(() => {
            sendSSE("background_option", {
              taskId: task.taskId,
              message: "This might take a bit. Want me to keep working in the background?",
            });
          }, 3000);

          // 3. Execute task inline, streaming step updates on this SSE
          let clientDisconnected = false;
          req.on("close", () => {
            clientDisconnected = true;
          });

          const completedTask = await executeTask(
            task.taskId,
            user,
            (tid, stepIndex, status, stepMessage, result) => {
              // Broadcast to task dashboard listeners too
              taskEvents.emit("update", {
                userId: user.id,
                taskId: tid,
                stepIndex,
                status,
                message: stepMessage,
                result,
              });

              // Stream step updates on this SSE (if client still connected)
              if (!clientDisconnected) {
                sendSSE("task_update", {
                  taskId: tid,
                  stepIndex,
                  status,
                  message: stepMessage,
                });
              }
            },
          );

          clearTimeout(bgTimeout);

          // 4. If client is still connected, stream the final result inline
          if (!clientDisconnected && completedTask) {
            if (completedTask.status === "COMPLETED" && completedTask.result) {
              // Build a rich summary from step results
              const stepSummaries = completedTask.steps
                .filter((s) => s.status === "done" && s.resultSummary)
                .map((s) => s.resultSummary);
              const doneText =
                stepSummaries.length > 0
                  ? stepSummaries.join("\n")
                  : "All done! Here's what I found 🎉";
              fullText += doneText;
              sendSSE("chunk", { text: doneText });

              // Format results into buttons using the same extractButtons() the sync path uses
              const allButtons = [];
              for (const step of completedTask.steps) {
                if (step.status !== "done" || !step.result) continue;
                try {
                  const formatted = extractButtons(step.toolName, step.result);
                  if (formatted && formatted.length > 0) {
                    allButtons.push(...formatted);
                  }
                } catch (fmtErr) {
                  console.log(`[ChatController] Button format error for ${step.toolName}:`, fmtErr.message);
                }
              }

              if (allButtons.length > 0) {
                sendSSE("buttons", { buttons: allButtons });
              }

              sendSSE("task_completed", {
                taskId: task.taskId,
                status: "COMPLETED",
              });
            } else if (completedTask.status === "FAILED") {
              const failText = `Hmm, something went wrong: ${completedTask.error || "unknown error"} 😓`;
              fullText += failText;
              sendSSE("chunk", { text: failText });

              sendSSE("task_completed", {
                taskId: task.taskId,
                status: "FAILED",
                error: completedTask.error,
              });
            }
          }

          continue;
        }

        // ── Sync Path (Original) ──
        const toolResponses = [];

        // Execute each tool call in the parallel batch
        for (const part of functionCalls) {
          const { name, args, id } = part.functionCall;
          console.log(`🔧 Tool call: ${name}`, args);

          // ── Emit "searching" status to frontend ──
          const msgs = TOOL_STATUS_MESSAGES[name] || TOOL_STATUS_MESSAGES._default;
          sendSSE("tool_status", {
            tool: name,
            status: "searching",
            message: msgs.searching,
          });

          const toolResult = await executeTool(name, args || {}, user);

          // ── Emit "done" or "error" status to frontend ──
          const hasError = toolResult?.error;
          sendSSE("tool_status", {
            tool: name,
            status: hasError ? "error" : "done",
            message: hasError ? msgs.error : msgs.done,
          });

          // Store results for follow-ups
          await setLastResults(session.sessionId, { [name]: toolResult });

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
      const allEmpty =
        toolsCalled.length > 0 &&
        toolsCalled.every((key) => {
          const r = lastResults[key];
          if (!r) return true;
          if (r.error) return true;
          if (Array.isArray(r) && r.length === 0) return true;
          if (r.data && Array.isArray(r.data) && r.data.length === 0)
            return true;
          if (r.results && Array.isArray(r.results) && r.results.length === 0)
            return true;
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
    await updateHistory(session.sessionId, message, fullText);

    // ── Deduct credit ──
    if (creditBalance && creditBalance.hasCredits) {
      try {
        const spendRes = await axios.post(
          `${CREDIT_URL}/spend`,
          {
            userId: user.id,
            uid: user.uid,
            amount: 1,
            ref: session.sessionId,
            reason: "Chat interaction",
          },
          { headers: internalHeaders() },
        );
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
      creditsRemaining:
        creditBalance?.balance != null
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
  // ── Special case: search_leaderboard returns { clubs: [], communities: [] }
  if (toolName === "search_leaderboard") {
    const cards = [];
    if (rawResult.clubs && Array.isArray(rawResult.clubs)) {
      rawResult.clubs.forEach((item, index) => {
        cards.push({
          id: item._id || item.id,
          type: "club",
          label: item.name,
          subtitle:
            item.motto || (item.tags && item.tags.slice(0, 3).join(", ")) || "",
          image: item.secondaryImg || null,
          meta: {
            rank: index + 1,
            rating: item.rating || 0,
            membersCount: item.membersCount,
            isMember: item.isMember,
            isAdmin: item.isAdmin,
            isCore: item.isCore,
          },
        });
      });
    }
    if (rawResult.communities && Array.isArray(rawResult.communities)) {
      rawResult.communities.forEach((item, index) => {
        cards.push({
          id: item._id || item.id,
          type: "community",
          label: item.title || item.name,
          subtitle:
            item.label || (item.tag && item.tag.slice(0, 3).join(", ")) || "",
          image: item.secondaryCover || null,
          meta: {
            rank: index + 1,
            rating: item.rating || 0,
            membersCount: item.membersCount,
            activeMembers: item.activeMembers,
            isMember: item.isMember,
          },
        });
      });
    }
    return cards;
  }

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
        : rawResult.recipients
          ? rawResult.recipients
          : rawResult.territories
            ? rawResult.territories
            : rawResult.tickets
              ? rawResult.tickets
              : rawResult.communities
                ? rawResult.communities
                : rawResult.success || rawResult.step
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

    community_post_search: (item) => ({
      id: item._id || item.id || null,
      type: "community_selection",
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
        communityId: item._id || item.id,
        communityName: item.title,
        tags: item.tag,
        membersCount: item.membersCount,
      },
      action: {
        mode: "select",
        communityId: item._id || item.id,
        communityName: item.title,
      },
    }),

    community_post_compose: (item) => ({
      id: null,
      type: "post_preview",
      label: "Draft Post",
      subtitle: `${item.tone || "friendly"} tone`,
      image: null,
      meta: {
        draft: item.draft,
        originalQuestion: item.originalQuestion,
        tone: item.tone,
      },
    }),

    community_post_execute: (item) => ({
      id: item.communityId || null,
      type: "click-navigation",
      label: item.communityName || "Community",
      subtitle: "Your question was posted here ✅",
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

    navigate_to_territory: (item) => ({
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

    send_message_get_recipients: (item) => ({
      id: item._id || item.id || null,
      type: "recipient_selection",
      label: item.name || "User",
      subtitle: item.course || item.interests?.slice(0, 3).join(", ") || "",
      image: item.image || null,
      meta: {
        interests: item.interests,
        course: item.course,
      },
      action: {
        mode: "select",
        userId: item._id || item.id,
      },
    }),

    send_message_compose: (item) => ({
      id: null,
      type: "message_preview",
      label: "Draft Message",
      subtitle: `${item.recipientCount || 0} recipient(s) · ${item.tone || "friendly"} tone`,
      image: null,
      meta: {
        draft: item.draft,
        recipientCount: item.recipientCount,
        tone: item.tone,
      },
    }),

    send_message_execute: (item) => ({
      id: null,
      type: "message_sent",
      label: "Messages Sent",
      subtitle: `Sent to ${item.sentCount || 0} user(s)`,
      image: null,
      meta: {
        sentCount: item.sentCount,
        failedCount: item.failedCount || 0,
      },
    }),

    fetch_credit_question: (item) => ({
      id: null,
      type: "app-action",
      label: "Fetch Credit Question",
      action: {
        actionName: "fetch_credit_question",
      },
    }),

    search_external_context: (item) => {
      const messageSnippet = item.text
        ? item.text.length > 100
          ? item.text.substring(0, 100) + "…"
          : item.text
        : "View message";
        
      const senderPrefix = item.sender ? `${item.sender}: ` : "";
      
      return {
        id: item.id || null,
        type: "wa-source",
        label: `💬 WhatsApp · ${item.entityName || "Community"}`,
        subtitle: `${senderPrefix}${messageSnippet}`,
        image: null,
        meta: {
          text: item.text,
          community: item.entityName,
          sender: item.sender,
          tier: item.tier,
          category: item.category || null,
          timestamp: item.timestamp || item.addedAt,
        },
      };
    },
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
