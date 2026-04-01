/**
 * Task Model – persists agentic task lifecycle in MongoDB.
 *
 * Each task tracks a multi-step workflow:
 *   QUEUED → IN_PROGRESS → [AWAITING_EXTERNAL] → COMPLETED | FAILED
 *
 * Steps are the individual tool calls that make up the workflow.
 */

const mongoose = require("mongoose");

const stepSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    toolName: { type: String, required: true },
    args: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["pending", "running", "done", "error", "skipped"],
      default: "pending",
    },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    statusMessage: { type: String, default: null }, // Witty status line
    resultSummary: { type: String, default: null }, // Human-readable result description
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    taskId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    uid: { type: String, default: null }, // Universe ID
    sessionId: { type: String, default: null }, // Originating chat session
    description: { type: String, required: true }, // LLM-generated summary
    status: {
      type: String,
      enum: [
        "QUEUED",
        "IN_PROGRESS",
        "AWAITING_EXTERNAL",
        "COMPLETED",
        "FAILED",
      ],
      default: "QUEUED",
      index: true,
    },
    steps: [stepSchema],
    currentStepIndex: { type: Number, default: 0 },
    result: { type: mongoose.Schema.Types.Mixed, default: null }, // Final aggregated result
    error: { type: String, default: null }, // Terminal error message
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    classificationReason: { type: String, default: null }, // Why it was classified as async
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

// Compound index for user task listing (most recent first)
taskSchema.index({ userId: 1, createdAt: -1 });

const Task = mongoose.model("Task", taskSchema);

module.exports = Task;
