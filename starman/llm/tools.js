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
      {
        name: "search_universe",
        description:
          "Search for a universe on the platform by its name, call sign, or location.",
        parameters: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description:
                "The search query (e.g. name, location, or acronym).",
            },
          },
          required: ["q"],
        },
      },
      {
        name: "top_universes",
        description:
          "Get the top universes on the platform ranked by popularity or activity.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of universes to return. Default 5.",
            },
          },
        },
      },
      {
        name: "search_nodes_by_name",
        description:
          "Search for users by name on the semantic map. Returns user profiles mapping to nodes.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the user to search for on the map.",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "navigate_to_node",
        description:
          "Navigate the map to focus on a specific node. Use this when the user wants to see, explore, or zoom into a node that was returned by a previous search (e.g. search_nodes_by_name). Pass the nodeId from the earlier search result.",
        parameters: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description:
                "The ID of the semantic node to navigate to (from a previous search result).",
            },
          },
          required: ["nodeId"],
        },
      },
      {
        name: "app_navigate",
        description:
          "Navigate the user to any screen in the app. Use the screen names from your NAVIGATION knowledge. For simple screens (no params), just pass the screen name. For screens needing params (like club or community), also pass a query string so the system can resolve the right entity.",
        parameters: {
          type: "object",
          properties: {
            screen: {
              type: "string",
              description:
                "The screen name to navigate to (e.g. 'explore', 'club', 'chat', 'memoryList')",
            },
            query: {
              type: "string",
              description:
                "Optional search query to resolve params. For example, 'coding' to find a coding club the user is in.",
            },
          },
          required: ["screen"],
        },
      },
      {
        name: "app_action",
        description:
          "Perform a client-side app action such as opening/closing the sidebar, toggling dark/light mode, or logging out. Use this when the user asks to change a UI setting or perform an account action.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description:
                "The action to perform. One of: 'toggle_sidebar', 'toggle_theme', 'logout'",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "search_my_tickets",
        description:
          "Search for tickets the current user has bought. Use this to check if the user has a ticket for a specific event, count total tickets, find active or upcoming tickets, etc.",
        parameters: {
          type: "object",
          properties: {
            eventName: {
              type: "string",
              description:
                "Optional event name to search for (fuzzy match). E.g. 'Movie Night' or 'Sunburn'",
            },
            status: {
              type: "string",
              description:
                "Optional ticket status filter. One of: 'active', 'redeemed', 'refunded', 'expired'",
            },
            upcoming: {
              type: "boolean",
              description:
                "If true, only return tickets for events that haven't happened yet",
            },
          },
        },
      },
      {
        name: "search_content_qa",
        description:
          "Search through all club and community posts to answer a knowledge or factual question. Use this when the user asks a question that might be answered by content posted in clubs or communities (e.g. 'Did Ishan Kishan visit LPU?', 'What is Edu-Rev?', 'When is next holiday?'). Returns matching posts from which you should synthesize a concise answer.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "The user's question or search query to find relevant posts",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "web_search_fallback",
        description:
          "Search the internet for an answer when no relevant content was found in campus posts. Only use this AFTER search_content_qa returned no results. Returns an answer from the internet.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The question to search the internet for",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "post_question_to_community",
        description:
          "Post a question on behalf of the user in the most relevant community. Use this only when the user explicitly confirms they want their question posted after no answer was found.",
        parameters: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The question text to post in the community",
            },
          },
          required: ["question"],
        },
      },
      {
        name: "search_communities",
        description:
          "Search for relevant communities by name, tags, or topic. Use this when the user asks to find communities related to a topic, wants to join a community, or needs to browse available communities. Returns matching communities with their details.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Search query — a topic, interest, or community name to search for, e.g. 'cricket', 'coding', 'photography club'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "navigate_to_user_territory",
        description:
          "Navigate to a specific user's 3D territory overlay map. Use this when the user asks to visit, see, or go to another user's territory or profile. You can pass either a userId (if known from previous results) or a name (which will be resolved to a userId).",
        parameters: {
          type: "object",
          properties: {
            userId: {
              type: "string",
              description:
                "The ID of the user whose territory to navigate to (if already known from a previous search).",
            },
            name: {
              type: "string",
              description:
                "The user's name to search for, e.g. 'Amartya'. Used when the userId is not known.",
            },
          },
        },
      },
      {
        name: "get_user_facet_texts",
        description:
          "Fetch the semantic profile facet texts for a user. Use this when the user is viewing someone's 3D territory and asks about that person — e.g. 'tell me about this user', 'what does he like', 'does she play basketball', 'what books does he read'. Returns the user's interests and profile facets as text.",
        parameters: {
          type: "object",
          properties: {
            userId: {
              type: "string",
              description:
                "The userId or name of the user whose facets to fetch. You can pass a known userId or just the user's name.",
            },
          },
          required: ["userId"],
        },
      },
      {
        name: "search_events",
        description:
          "Search for events by topic, date, status, or club name. Use this to find events related to a specific interest, activity, or goal (e.g. 'startup', 'music').",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Comma-separated keywords to search events by, e.g. 'startup,entrepreneurship,pitch'",
            },
            status: {
              type: "string",
              description:
                "Optional status to filter events by, e.g. 'expired', 'pending', 'featured', 'past and unclear', 'past and clear'",
            },
            date: {
              type: "string",
              description:
                "Optional exact date string (e.g., '2026-03-19') to find events happening on that day.",
            },
            clubName: {
              type: "string",
              description:
                "Optional club name to find events hosted BY a specific club (e.g., 'Music Club', 'Coding Society').",
            },
            place: {
              type: "string",
              description:
                "Optional location or venue to find events happening AT a specific place (e.g., 'SDMA', 'Main Audi', 'Ground', 'OAT').",
            },
          },
        },
      },
    ],
  },
];

module.exports = tools;
