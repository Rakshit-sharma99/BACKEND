/**
 * Tool (function) definitions for Gemini function calling.
 * Each tool maps to an existing macbease microservice endpoint.
 */

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_territories",
        description:
          "Search territories on the semantic map by interest keywords. Returns territory names and IDs the user can navigate to.",
        parameters: {
          type: "object",
          properties: {
            interests: {
              type: "array",
              items: { type: "string" },
              description:
                "List of interest keywords to search for, e.g. ['coding', 'photography']",
            },
          },
          required: ["interests"],
        },
      },
      {
        name: "get_upcoming_events",
        description:
          "Get upcoming events in the user's active universe. Returns event names, dates, and details.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of events to return. Default 5.",
            },
          },
        },
      },
      {
        name: "search_clubs",
        description:
          "Find clubs matching given interests within the user's universe.",
        parameters: {
          type: "object",
          properties: {
            interests: {
              type: "array",
              items: { type: "string" },
              description: "Interest tags to filter clubs by",
            },
          },
          required: ["interests"],
        },
      },
      {
        name: "get_platform_stats",
        description:
          "Get high-level platform statistics like active universe count.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_users",
        description:
          "Search for users by interests, skills, or other criteria within the user's universe.",
        parameters: {
          type: "object",
          properties: {
            interests: {
              type: "array",
              items: { type: "string" },
              description: "Interests or skills to match users against",
            },
            lookingFor: {
              type: "string",
              description:
                "What the user is looking for, e.g. 'hackathon partner', 'study buddy'",
            },
          },
          required: ["interests"],
        },
      },
      {
        name: "search_alumni",
        description:
          "Find alumni from the user's universe who work at a specific company.",
        parameters: {
          type: "object",
          properties: {
            company: {
              type: "string",
              description: "Company name to search for, e.g. 'Microsoft'",
            },
          },
          required: ["company"],
        },
      },
      {
        name: "compute_similarity",
        description:
          "Compare the interest/profile overlap between the current user and another user. Returns a similarity percentage.",
        parameters: {
          type: "object",
          properties: {
            targetUserId: {
              type: "string",
              description: "The ID of the user to compare against",
            },
          },
          required: ["targetUserId"],
        },
      },
      {
        name: "send_message",
        description:
          "Send a direct message to one or more users on behalf of the current user. Always confirm with the user before calling this.",
        parameters: {
          type: "object",
          properties: {
            recipientIds: {
              type: "array",
              items: { type: "string" },
              description: "User IDs to send the message to",
            },
            message: {
              type: "string",
              description: "The message text to send",
            },
          },
          required: ["recipientIds", "message"],
        },
      },
    ],
  },
];

module.exports = tools;
