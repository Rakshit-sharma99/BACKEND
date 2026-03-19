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

const { createChat } = require("../llm/geminiClient");
const { executeTool } = require("../handlers/toolHandlers");
const {
  getOrCreateSession,
  updateHistory,
  setLastResults,
} = require("../session/sessionStore");

/**
 * POST /starman/api/v1/chat
 *
 * Body: { message: string, sessionId?: string }
 * Response: SSE stream
 *
 * SSE event types:
 *   chunk   – { text: "partial text" }
 *   cards   – { cards: [{type, ...data}] }
 *   done    – { sessionId }
 *   error   – { message }
 */
const chat = async (req, res) => {
  const { message, sessionId } = req.body;
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
    // ── Session ──
    const session = getOrCreateSession(sessionId, user.id);
    const chat = createChat(session.history);

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
        (p) => p.functionCall
      );

      if (functionCalls && functionCalls.length > 0) {
        // Execute each tool call
        for (const part of functionCalls) {
          const { name, args } = part.functionCall;
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

          // Feed tool result back to Gemini to generate a natural response
          result = await chat.sendMessageStream([
            {
              functionResponse: {
                name,
                response: { result: toolResult },
              },
            },
          ]);

          // Stream the follow-up text
          for await (const followUpChunk of result.stream) {
            const text =
              followUpChunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              sendSSE("chunk", { text });
            }
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
      sendSSE("buttons", { buttons: cards });
    }

    // ── Update session history ──
    updateHistory(session.sessionId, message, fullText);

    // ── Done ──
    sendSSE("done", { sessionId: session.sessionId });
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
  // others wrap it inside { data: [] } or { results: [] }.
  const items = Array.isArray(rawResult)
    ? rawResult
    : rawResult.data
      ? Array.isArray(rawResult.data)
        ? rawResult.data
        : [rawResult.data]
      : rawResult.results
        ? rawResult.results
        : [];

  if (items.length === 0) return [];

  const extractors = {
    search_clubs: (item) => ({
      id: item._id || item.id,
      type: "club",
      label: item.name,
      subtitle: item.motto || (item.tags && item.tags.slice(0, 3).join(", ")) || "",
      image: item.secondaryImg || null,
      meta: {
        membersCount: item.membersCount,
        isMember: item.isMember,
      },
    }),

    search_territories: (item) => ({
      id: item._id || item.id,
      type: "territory",
      label: item.name || item.title,
      subtitle: item.description || "",
      image: item.image || null,
      meta: {},
    }),

    get_upcoming_events: (item) => ({
      id: item._id || item.id,
      type: "event",
      label: item.name || item.title,
      subtitle: item.venue || item.date || "",
      image: item.coverImage || item.image || null,
      meta: {
        date: item.date,
        venue: item.venue,
      },
    }),

    search_users: (item) => ({
      id: item._id || item.id,
      type: "profile",
      label: item.name || item.callSign,
      subtitle: item.course || item.bio || "",
      image: item.image || item.img || null,
      meta: {},
    }),

    search_alumni: (item) => ({
      id: item._id || item.id,
      type: "profile",
      label: item.name || item.callSign,
      subtitle: item.company || item.course || "",
      image: item.image || item.img || null,
      meta: { company: item.company },
    }),
  };

  const extractor = extractors[toolName];

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
