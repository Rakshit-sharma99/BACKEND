/**
 * Gemini 2.0 Flash client with streaming support.
 */

const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const SYSTEM_PROMPT = require("./systemPrompt");
const tools = require("./tools");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

/**
 * Creates a Gemini chat session for a given conversation history.
 */
function createChat(history = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    safetySettings,
    tools,
  });

  return model.startChat({
    history,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  });
}

/**
 * Send a message and stream the response.
 * Returns an async generator that yields text chunks and function calls.
 *
 * @param {string} message - The user's message
 * @param {Array} history - Previous conversation turns
 * @returns {object} { stream, functionCalls }
 */
async function sendMessageStreaming(message, history = []) {
  const chat = createChat(history);
  const result = await chat.sendMessageStream(message);
  return result;
}

/**
 * Send a message and wait for the full response (non-streaming).
 * Useful for handling tool call results.
 */
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
