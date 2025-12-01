/**
 * @typedef {Object} CREATE_INVITATION_PAYLOAD
 * @property {String} invitationId
 * @property {String} sendBy
 * @property {String} sentTo
 * @property {String} img1
 * @property {String} img2
 * @property {String} type
 * @property {Object} action
 * @property {String} subject
 * @property {String} text
 */

const CREATE_INVITATION = {
  CREATE_INVITATION: {
    topicSuffix: "_create_invitation",

    validate: (data) => {
      if (typeof data !== "object" || data === null) {
      throw new Error("Payload must be a non-null object");
    }

    if (typeof data.invitationId !== "string" || !data.invitationId.trim()) {
      throw new Error("'invitationId' must be a non-empty string");
    }

    if (typeof data.sendBy !== "string" || !data.sendBy.trim()) {
      throw new Error("'sendBy' must be a non-empty string'");
    }

    if (typeof data.sentTo !== "string" || !data.sentTo.trim()) {
      throw new Error("'sentTo' must be a non-empty string");
    }

    if (typeof data.type !== "string" || !data.type.trim()) {
      throw new Error("'type' must be a non-empty string");
    }

    if (typeof data.action !== "object" || data.action === null) {
      throw new Error("'action' must be a non-null object");
    }

    if (typeof data.subject !== "undefined" && typeof data.subject !== "string") {
      throw new Error("'subject' must be a string if provided");
    }

    if (typeof data.text !== "undefined" && typeof data.text !== "string") {
      throw new Error("'text' must be a string if provided");
    }

    if (typeof data.img1 !== "undefined" && typeof data.img1 !== "string") {
      throw new Error("'img1' must be a string if provided");
    }

    if (typeof data.img2 !== "undefined" && typeof data.img2 !== "string") {
      throw new Error("'img2' must be a string if provided");
    }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} SECONDARY_INVITATION_ACTION_PAYLOAD
 * @property {String} sentBy
 * @property {String} sentTo
 * @property {Number} pingLevel
 * @property {Object} receiverEmail
 * @property {Object} senderEmail
 * @property {Object} receiverNotification
 * @property {Object} senderNotification
 * @property {String} sentByModal
 * @property {String} sentToModal
 */

const SECONDARY_INVITATION_ACTION = {
  SECONDARY_INVITATION_ACTION: {
    topicSuffix: "_secondary_invitation_action",

    validate: (data) => {
      if (typeof data !== "object" || data === null) {
      throw new Error("Payload must be a non-null object");
    }
    if (typeof data.sentBy !== "string" || !data.sentBy.trim()) {
      throw new Error("'sentBy' must be a non-empty string");
    }

    if (typeof data.sentTo !== "string" || !data.sentTo.trim()) {
      throw new Error("'sentTo' must be a non-empty string");
    }

    if (typeof data.pingLevel !== "number") {
      throw new Error("'pingLevel' must be a number");
    }

    if (typeof data.sentByModal !== "string" || !data.sentByModal.trim()) {
      throw new Error("'sentByModal' must be a non-empty string");
    }

    if (typeof data.sentToModal !== "string" || !data.sentToModal.trim()) {
      throw new Error("'sentToModal' must be a non-empty string");
    }
    
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...CREATE_INVITATION,
  ...SECONDARY_INVITATION_ACTION
};
