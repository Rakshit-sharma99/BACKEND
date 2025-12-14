/**
 * @typedef {Object} USER_OVERLAY_OPERATION_PAYLOAD
 * @property {string} overlayId
 * @property {string} userId // SINGLE
 * @property {string} userIds // MULTIPLE
 * @property {"add"|"remove"} operation
 * @property {"single" || "multiple" || "all"} targetType 
 */

const USER_OVERLAY_OPERATION = {
  PERSON_TAG: {
    topicSuffix: "_user_overlay_operation",

    validate: (data) => {
      const { operation, targetType, overlayId } = payload;

    if (!["add", "remove"].includes(operation)) {
      throw new Error("operation must be 'add' or 'remove'");
    }

    if (!["single", "multiple", "all"].includes(targetType)) {
      throw new Error("Invalid targetType");
    }

    if (!overlayId || typeof overlayId !== "string") {
      throw new Error("overlayId must be a string");
    }

    if (targetType === "single" && !payload.userId) {
      throw new Error("userId required for 'single'");
    }

    if (targetType === "multiple" && !Array.isArray(payload.userIds)) {
      throw new Error("userIds must be array for multiple");
    }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


module.exports = {
  ...USER_OVERLAY_OPERATION,
};
