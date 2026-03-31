const { StatusCodes } = require("http-status-codes");
const { EventEmitter } = require("events");
const {
  getTask,
  getUserTasks,
  retryTask,
  executeTask,
} = require("../handlers/taskEngine");

const taskEvents = new EventEmitter();

// Hook into Kafka consumer or task engine to emit globally to connected clients.
// For now, we will export taskEvents so chatController can emit to it.

/**
 * Get all tasks for the authenticated user, optionally filtered by status.
 * Query params: ?status=ACTIVE|COMPLETED|FAILED & limit=20 & skip=0
 */
const getTasks = async (req, res) => {
  const { id: userId } = req.user;
  const { status, limit, skip } = req.query;

  try {
    const tasks = await getUserTasks(userId, {
      status,
      limit: limit ? parseInt(limit) : 20,
      skip: skip ? parseInt(skip) : 0,
    });
    res.status(StatusCodes.OK).json({ success: true, data: tasks });
  } catch (error) {
    console.error("[TaskController] Error fetching user tasks:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Failed to fetch tasks" });
  }
};

/**
 * Get the full details of a specific task by taskId, including step traces.
 */
const getTaskDetail = async (req, res) => {
  const { taskId } = req.params;
  const { id: userId } = req.user;

  try {
    const task = await getTask(taskId);

    if (!task) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Task not found" });
    }

    // Ensure the user owns the task
    if (task.userId.toString() !== userId) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ success: false, message: "Not authorized to view this task" });
    }

    res.status(StatusCodes.OK).json({ success: true, task });
  } catch (error) {
    console.error("[TaskController] Error fetching task detail:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Failed to fetch task detail" });
  }
};

/**
 * Retry a failed task from the first failed step.
 * Resets the failed step and re-executes the async task pipeline.
 */
const retryTaskFailed = async (req, res) => {
  const { taskId } = req.params;
  const { id: userId, uid } = req.user; // Include universe ID

  try {
    // We don't stream SSE updates for REST retries (could be implemented later if UI handles SSE retries)
    // Here we pass a no-op onStepUpdate function
    const task = await retryTask(
      taskId,
      req.user,
      (tid, stepIndex, status, message, result) => {
        // SSE integration later if needed
      },
    );

    if (!task) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Task not found" });
    }

    if (task.error && task.message === "Max retries exceeded") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Max retries exceeded for this task",
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Task retry initiated",
      taskId: task.taskId,
      status: task.status,
    });
  } catch (error) {
    console.error("[TaskController] Error retrying task:", error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Failed to retry task" });
  }
};

/**
 * SSE Endpoint to stream real-time task updates to the frontend dashboard.
 * GET /starman/api/v1/tasks/stream
 */
const streamTasks = (req, res) => {
  const { id: userId } = req.user;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("connected", { message: "Task stream connected" });

  const onTaskUpdate = (data) => {
    // Only send updates belonging to this user
    if (data.userId === userId) {
      sendEvent("task_update", data);
    }
  };

  taskEvents.on("update", onTaskUpdate);

  req.on("close", () => {
    taskEvents.removeListener("update", onTaskUpdate);
  });
};

module.exports = {
  getTasks,
  getTaskDetail,
  retryTaskFailed,
  streamTasks,
  taskEvents,
};
