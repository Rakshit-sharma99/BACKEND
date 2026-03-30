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
        name: "send_message_get_recipients",
        description:
          "Find potential recipients for sending a message. ALWAYS call this IN PARALLEL with send_message_compose when the user wants to send a message. Returns a list of users that the frontend will display with checkboxes for selection.",
        parameters: {
          type: "object",
          properties: {
            interests: {
              type: "array",
              items: { type: "string" },
              description:
                "Interest keywords to find relevant recipients, e.g. ['coding', 'hackathon']",
            },
            names: {
              type: "array",
              items: { type: "string" },
              description:
                "Optional specific user names to search for, e.g. ['Amartya', 'Ravi']",
            },
            lookingFor: {
              type: "string",
              description:
                "Optional context for what kind of recipients to find, e.g. 'hackathon partners', 'study group members'",
            },
          },
        },
      },
      {
        name: "send_message_compose",
        description:
          "Generate a draft message based on the user's intent and tone. ALWAYS call this IN PARALLEL with send_message_get_recipients when the user wants to send a message. The draft will be shown for review and refinement.",
        parameters: {
          type: "object",
          properties: {
            recipientNames: {
              type: "array",
              items: { type: "string" },
              description: "The names of the users to send the message to (e.g. ['Ayush', 'Ravi']). NEVER use ObjectIds or hex strings here. ONLY use conversational names.",
            },
            intent: {
              type: "string",
              description:
                "What the user wants to communicate, e.g. 'invite to hackathon this weekend', 'ask about study group'",
            },
            tone: {
              type: "string",
              description:
                "Optional tone preference: 'formal', 'casual', or 'friendly'. Defaults to 'friendly'.",
            },
          },
          required: ["recipientIds", "intent"],
        },
      },
      {
        name: "send_message_execute",
        description:
          "Send the final confirmed message to the confirmed recipients. ONLY call this after the user has confirmed the recipient list AND the message content. ALWAYS use the user's name, NEVER use ObjectIds.",
        parameters: {
          type: "object",
          properties: {
            recipientNames: {
              type: "array",
              items: { type: "string" },
              description: "The names of the users who will receive the message (e.g. ['Ayush']). NEVER use ObjectIds or hex strings here. The backend will automatically find the correct user by their name.",
            },
            message: {
              type: "string",
              description: "The final confirmed message text to send",
            },
          },
          required: ["recipientIds", "message"],
        },
      },
      {
        name: "fetch_credit_question",
        description:
          "Fetch a question for the user to answer to earn credits. Use this tool ONLY when the user asks how to earn credits, asks for a question to earn credits, or when you want to explicitly offer them a chance to earn more credits.",
        parameters: {
          type: "object",
          properties: {},
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
        name: "navigate_to_territory",
        description:
          "Navigate the map to focus on a specific territory by its name. Use this when the user wants to visit, go to, or explore a specific territory (e.g. 'take me to Alumni territory', 'show me the Tech territory'). Searches by territory name and navigates there if found.",
        parameters: {
          type: "object",
          properties: {
            territoryName: {
              type: "string",
              description:
                "The name of the territory to navigate to, e.g. 'Alumni', 'Tech & Innovation'",
            },
          },
          required: ["territoryName"],
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
      {
        name: "query_universe_knowledge",
        description:
          "Query the crowdsourced campus knowledge base for answers to campus-life questions. Use this when users ask about popular spots, best food places, campus culture, or any subjective campus question. Returns aggregated insights from many users with confidence scores and consensus data.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "The campus question to look up in the knowledge base, e.g. 'best momos', 'sunset spot', 'bunking places'",
            },
          },
          required: ["query"],
        },
      },
    ],
  },
];

module.exports = tools;
