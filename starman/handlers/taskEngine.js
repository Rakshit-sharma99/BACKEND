/**
 * Task Engine – executes multi-step agentic workflows asynchronously.
 *
 * Lifecycle:
 *   createTask()     → Persists a new task with QUEUED status
 *   executeTask()    → Runs steps sequentially, updating state after each
 *   getTask()        → Read single task
 *   getUserTasks()   → List tasks for a user
 *
 * The engine runs tool calls through the same executeTool() used by the
 * sync path, but wraps each call in lifecycle tracking and publishes
 * Kafka events on state transitions for downstream consumers (SERE).
 */

const crypto = require("crypto");
const Task = require("../models/taskModel");
const { executeTool } = require("./toolHandlers");
const { publishEvent } = require("../config/kafka");

// ── Import the witty status messages from chatController ──
// We'll define a lightweight version here to avoid circular deps
const TOOL_STATUS_MESSAGES = {
  search_events: "lemme check what's poppin on campus rn 🎪",
  get_upcoming_events: "checking the event calendar so you don't have to 📅",
  search_clubs: "scouring the club directory like a freshie on day 1 🏃",
  search_communities:
    "hunting down communities… pls don't judge my search history 🕵️",
  search_users:
    "looking for your people… this feels like Tinder but academic 🎓",
  search_alumni: "stalking alumni LinkedIn-style but make it ethical 🕶️",
  search_territories: "exploring the map like I'm Columbus but with WiFi 🗺️",
  search_content_qa:
    "digging through posts like it's 3AM and I can't stop scrolling 📱",
  search_external_context:
    "brb asking the WhatsApp groups so you don't have to 💬",
  query_universe_knowledge: "tapping into the campus hive mind 🧠",
  web_search_fallback:
    "asking the internet because campus didn't know either 🌐",
  post_question_to_community:
    "posting your question to the community, manifesting answers 🙌",
  send_message_get_recipients: "finding people to send your message to 📬",
  send_message_compose: "cooking up a message draft for you ✍️",
  send_message_execute: "sending messages at the speed of light ⚡",
  _default: "working on it, gimme a sec… 😩",
};

/**
 * Generate a human-readable summary of a tool's execution result.
 * Used for chat feedback, task dashboard descriptions, and SSE updates.
 */
function summarizeStepResult(toolName, args, result) {
  if (!result || result.error) {
    return result?.message || `${toolName} encountered an error`;
  }

  switch (toolName) {
    case "post_question_to_community":
      return `Posted your question in the **${result.communityName || "community"}** community 📝`;

    case "search_events":
    case "get_upcoming_events": {
      const count = Array.isArray(result) ? result.length : result?.events?.length || 0;
      return `Found ${count} event${count !== 1 ? "s" : ""} 📅`;
    }
    case "search_clubs": {
      const count = Array.isArray(result) ? result.length : 0;
      return `Found ${count} club${count !== 1 ? "s" : ""} 🏃`;
    }
    case "search_communities": {
      const count = Array.isArray(result) ? result.length : 0;
      return `Found ${count} communit${count !== 1 ? "ies" : "y"} 🕵️`;
    }
    case "search_users": {
      const count = Array.isArray(result) ? result.length : result?.users?.length || 0;
      return `Found ${count} user${count !== 1 ? "s" : ""} 🎓`;
    }
    case "search_alumni": {
      const count = Array.isArray(result) ? result.length : 0;
      return `Found ${count} alumni profile${count !== 1 ? "s" : ""} 🕶️`;
    }
    case "search_content_qa": {
      const count = Array.isArray(result) ? result.length : 0;
      return `Found ${count} relevant post${count !== 1 ? "s" : ""} 📱`;
    }
    case "search_external_context":
    case "query_universe_knowledge":
      return `Retrieved knowledge context 🧠`;

    case "web_search_fallback": {
      const count = Array.isArray(result) ? result.length : result?.results?.length || 0;
      return `Found ${count} web result${count !== 1 ? "s" : ""} 🌐`;
    }
    case "send_message_get_recipients": {
      const count = Array.isArray(result) ? result.length : result?.recipients?.length || 0;
      return `Found ${count} recipient${count !== 1 ? "s" : ""} 📬`;
    }
    case "send_message_compose":
      return `Draft message composed ✍️`;
    case "send_message_execute":
      return `Message${result?.count > 1 ? "s" : ""} sent ⚡`;

    case "search_territories": {
      const count = Array.isArray(result) ? result.length : 0;
      return `Found ${count} territor${count !== 1 ? "ies" : "y"} 🗺️`;
    }
    default:
      return `${toolName} completed successfully ✅`;
  }
}

// ────────────────────────────────────────────────
// Task Creation
// ────────────────────────────────────────────────

/**
 * Create a new task from a batch of function calls.
 *
 * @param {object} user             - { id, uid }
 * @param {string} sessionId        - Originating chat session ID
 * @param {string} description      - LLM-generated task description
 * @param {Array}  functionCalls    - Array of { functionCall: { name, args } }
 * @param {string} classificationReason - Why this was classified as async
 * @returns {object} The created task document
 */
async function createTask(
  user,
  sessionId,
  description,
  functionCalls,
  classificationReason,
) {
  const taskId = `task_${crypto.randomBytes(8).toString("hex")}`;

  const steps = functionCalls.map((fc, index) => ({
    index,
    toolName: fc.functionCall.name,
    args: fc.functionCall.args || {},
    status: "pending",
    statusMessage:
      TOOL_STATUS_MESSAGES[fc.functionCall.name] ||
      TOOL_STATUS_MESSAGES._default,
  }));

  const task = await Task.create({
    taskId,
    userId: user.id,
    uid: user.uid || null,
    sessionId,
    description,
    status: "QUEUED",
    steps,
    currentStepIndex: 0,
    classificationReason,
  });

  console.log(
    `📋 [TaskEngine] Created task ${taskId}: "${description}" (${steps.length} steps)`,
  );

  // Publish creation event
  publishEvent("task.created", {
    taskId,
    userId: user.id,
    uid: user.uid,
    description,
    stepCount: steps.length,
  });

  return task;
}

// ────────────────────────────────────────────────
// Task Execution
// ────────────────────────────────────────────────

/**
 * Execute a task's steps sequentially.
 * This runs in the background — the caller does NOT await it.
 *
 * @param {string} taskId  - The task to execute
 * @param {object} user    - User context for tool calls
 * @param {function} onStepUpdate - Optional callback for real-time SSE updates:
 *   (taskId, stepIndex, status, message, result?) => void
 */
async function executeTask(taskId, user, onStepUpdate) {
  const task = await Task.findOne({ taskId });
  if (!task) {
    console.error(`[TaskEngine] Task ${taskId} not found`);
    return;
  }

  // Transition: QUEUED → IN_PROGRESS
  task.status = "IN_PROGRESS";
  await task.save();

  publishEvent("task.started", {
    taskId,
    userId: task.userId,
    description: task.description,
  });

  const results = {};

  for (let i = 0; i < task.steps.length; i++) {
    const step = task.steps[i];
    task.currentStepIndex = i;

    // Mark step as running
    step.status = "running";
    step.startedAt = new Date();
    step.statusMessage =
      TOOL_STATUS_MESSAGES[step.toolName] || TOOL_STATUS_MESSAGES._default;
    await task.save();

    // Notify about step start
    onStepUpdate?.(taskId, i, "running", step.statusMessage);

    publishEvent("task.step_started", {
      taskId,
      stepIndex: i,
      toolName: step.toolName,
      message: step.statusMessage,
    });

    try {
      // Execute the tool
      const result = await executeTool(step.toolName, step.args, user);

      if (result?.error) {
        // Tool returned an error (not a thrown exception)
        step.status = "error";
        step.error = result.message || "Tool returned an error";
        step.result = result;
        step.completedAt = new Date();
        await task.save();

        onStepUpdate?.(taskId, i, "error", step.error, result);

        // Check if we should retry or fail the whole task
        if (task.retryCount < task.maxRetries) {
          console.log(`[TaskEngine] Step ${i} failed, but retries available`);
          // For now, continue to next step — future: implement retry logic
        }
      } else {
        step.status = "done";
        step.result = result;
        step.completedAt = new Date();
        step.resultSummary = summarizeStepResult(step.toolName, step.args, result);
        results[step.toolName] = result;
        await task.save();

        onStepUpdate?.(taskId, i, "done", step.resultSummary, result);

        publishEvent("task.step_completed", {
          taskId,
          stepIndex: i,
          toolName: step.toolName,
        });
      }
    } catch (err) {
      // Uncaught exception
      step.status = "error";
      step.error = err.message;
      step.completedAt = new Date();
      await task.save();

      onStepUpdate?.(taskId, i, "error", `Step failed: ${err.message}`);

      console.error(
        `[TaskEngine] Step ${i} (${step.toolName}) threw:`,
        err.message,
      );

      // Fail the entire task on uncaught exception
      task.status = "FAILED";
      task.error = `Step ${i} (${step.toolName}) failed: ${err.message}`;
      await task.save();

      publishEvent("task.failed", {
        taskId,
        userId: task.userId,
        description: task.description,
        error: task.error,
        failedStep: i,
      });

      return task;
    }
  }

  // All steps completed — check if any had errors
  const hasErrors = task.steps.some((s) => s.status === "error");

  if (hasErrors) {
    // Partial failure — some steps errored but didn't throw
    const errorSteps = task.steps
      .filter((s) => s.status === "error")
      .map((s) => `${s.toolName}: ${s.error}`);

    task.status = "FAILED";
    task.error = `Partial failure: ${errorSteps.join("; ")}`;
  } else {
    task.status = "COMPLETED";
    task.result = results;
    task.completedAt = new Date();
  }

  await task.save();

  const eventName =
    task.status === "COMPLETED" ? "task.completed" : "task.failed";
  publishEvent(eventName, {
    taskId,
    userId: task.userId,
    uid: task.uid,
    description: task.description,
    status: task.status,
    result: task.status === "COMPLETED" ? results : undefined,
    error: task.status === "FAILED" ? task.error : undefined,
  });

  // Build a rich summary from step results
  const stepSummaries = task.steps
    .filter((s) => s.status === "done" && s.resultSummary)
    .map((s) => s.resultSummary);
  const richSummary =
    stepSummaries.length > 0
      ? stepSummaries.join("\n")
      : "All done! Here's what I found 🎉";

  onStepUpdate?.(
    taskId,
    -1, // -1 signals "task complete"
    task.status === "COMPLETED" ? "completed" : "failed",
    task.status === "COMPLETED"
      ? richSummary
      : `Task failed: ${task.error}`,
    task.result,
  );

  console.log(`📋 [TaskEngine] Task ${taskId} → ${task.status}`);
  return task;
}

// ────────────────────────────────────────────────
// Task Queries
// ────────────────────────────────────────────────

/**
 * Get a single task by taskId.
 */
async function getTask(taskId) {
  return Task.findOne({ taskId }).lean();
}

/**
 * Get all tasks for a user, grouped by status.
 *
 * @param {string} userId
 * @param {object} options - { limit, status, skip }
 * @returns {{ active: [], completed: [], failed: [] }}
 */
async function getUserTasks(userId, { limit = 20, status, skip = 0 } = {}) {
  const query = { userId };
  if (status) query.status = status;

  const tasks = await Task.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    active: tasks.filter((t) =>
      ["QUEUED", "IN_PROGRESS", "AWAITING_EXTERNAL"].includes(t.status),
    ),
    completed: tasks.filter((t) => t.status === "COMPLETED"),
    failed: tasks.filter((t) => t.status === "FAILED"),
    total: tasks.length,
  };
}

/**
 * Retry a failed task from the first failed step.
 *
 * @param {string} taskId
 * @param {object} user
 * @param {function} onStepUpdate
 */
async function retryTask(taskId, user, onStepUpdate) {
  const task = await Task.findOne({ taskId });
  if (!task) return null;
  if (task.status !== "FAILED") return task;

  // Increment retry count
  task.retryCount += 1;
  if (task.retryCount > task.maxRetries) {
    return { error: true, message: "Max retries exceeded" };
  }

  // Reset failed steps to pending
  for (const step of task.steps) {
    if (step.status === "error") {
      step.status = "pending";
      step.result = null;
      step.error = null;
      step.startedAt = null;
      step.completedAt = null;
    }
  }

  task.status = "QUEUED";
  task.error = null;
  await task.save();

  // Re-execute (fire and forget)
  executeTask(taskId, user, onStepUpdate);

  return task;
}

module.exports = {
  createTask,
  executeTask,
  getTask,
  getUserTasks,
  retryTask,
};
