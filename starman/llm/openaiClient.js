/**
 * OpenAI client with streaming support, mimicking the Gemini client interface.
 */

const { OpenAI } = require("openai");
const tools = require("./tools");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure OPENAI_API_KEY is in your .env
});

// Convert Gemini tools to OpenAI tools format
const openaiTools = tools[0].functionDeclarations.map((fn) => ({
  type: "function",
  function: {
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters,
  },
}));

/**
 * Creates an OpenAI chat session that mimics Gemini's streaming interface
 */
function createChat(history = [], systemPrompt = "") {
  // Store the conversation messages for this specific instance
  let messages = [{ role: "system", content: systemPrompt }];

  // Convert Gemini history format to OpenAI format
  // Gemini history item: { role: "user" | "model", parts: [{ text: "..." }] }
  for (const item of history) {
    const role = item.role === "model" ? "assistant" : "user";
    const textPart = item.parts?.find((p) => p.text);
    if (textPart) {
      messages.push({ role, content: textPart.text });
    }
  }

  // To map tool calls back to their IDs when chatController resolves them
  let toolCallIds = {};

  return {
    async sendMessageStream(message) {
      // 1. Append the new message to our messages array
      if (typeof message === "string") {
        messages.push({ role: "user", content: message });
      } else if (Array.isArray(message) && message[0]?.functionResponse) {
        // Handling tool resolution from chatController
        const fnResp = message[0].functionResponse;
        const toolCallId = toolCallIds[fnResp.name] || fnResp.name;

        messages.push({
          role: "tool",
          tool_call_id: toolCallId,
          name: fnResp.name,
          // Stringify the result if it's an object as OpenAI requires strings for tool messages
          content:
            typeof fnResp.response.result === "string"
              ? fnResp.response.result
              : JSON.stringify(fnResp.response.result),
        });
      }

      // 2. Call OpenAI with streaming
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini", // You can change this to "gpt-4o-mini" to save credits
        messages: messages,
        tools: openaiTools,
        stream: true,
      });

      // 3. Create an async generator that yields Gemini-styled chunks
      async function* generateStream() {
        let fullContent = "";

        // Map to hold multiple tool calls if OpenAI decides to return parallel calls
        let toolCalls = {};

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          // If there's text content, yield it like Gemini does
          if (delta.content) {
            fullContent += delta.content;
            yield {
              candidates: [
                {
                  content: { parts: [{ text: delta.content }] },
                },
              ],
            };
          }

          // If there's a tool call chunk, accumulate it
          if (delta.tool_calls && delta.tool_calls.length > 0) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!toolCalls[index]) {
                toolCalls[index] = { id: "", name: "", arguments: "" };
              }
              if (tc.id) toolCalls[index].id = tc.id;
              if (tc.function?.name) toolCalls[index].name += tc.function.name;
              if (tc.function?.arguments)
                toolCalls[index].arguments += tc.function.arguments;
            }
          }
        }

        const toolCallsArray = Object.values(toolCalls);

        // After the stream ends, if we have complete tool calls, yield them
        if (toolCallsArray.length > 0) {
          const messageToolCalls = [];
          const parts = [];

          for (const tc of toolCallsArray) {
            toolCallIds[tc.name] = tc.id;

            messageToolCalls.push({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            });

            let argsObj = {};
            try {
              argsObj = JSON.parse(tc.arguments);
            } catch (e) {
              console.error("OpenAI tool args parse error", e, tc.arguments);
            }

            parts.push({ functionCall: { name: tc.name, args: argsObj } });
          }

          // Add the assistant's tool calls to our history so follow-ups work
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: messageToolCalls,
          });

          // Yield the tool calls in Gemini format
          yield {
            candidates: [
              {
                content: {
                  parts: parts,
                },
              },
            ],
          };
        } else if (fullContent) {
          // Add the assistant's text response to our local history
          messages.push({ role: "assistant", content: fullContent });
        }
      }

      return { stream: generateStream() };
    },

    async sendMessage(message) {
      const msgObj =
        typeof message === "string"
          ? { role: "user", content: message }
          : message;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [...messages, msgObj],
      });

      return {
        response: {
          text: () => response.choices[0].message.content,
        },
      };
    },
  };
}

async function sendMessageStreaming(message, history = []) {
  const chat = createChat(history);
  return chat.sendMessageStream(message);
}

async function sendMessage(message, history = []) {
  const chat = createChat(history);
  const result = await chat.sendMessage(message);
  return result.response;
}

module.exports = {
  createChat,
  sendMessageStreaming,
  sendMessage,
};
