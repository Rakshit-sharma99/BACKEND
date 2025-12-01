const mongoose = require("mongoose");
const { Types } = mongoose;

/**
 * @typedef {Object} CONTENT_ADDEDTO_PROJECT_PAYLOAD
 * @property {string} projectId
 * @property {string} contentId
 */

const CONTENT_ADDEDTO_PROJECT = {
  CONTENT_ADDEDTO_PROJECT: {
    topicSuffix: "_content_addedto_project",

    validate: (data) => {
  
      if (typeof data.projectId !== "string") {
        throw new Error("'projectId' must be a string");
      }

      if (typeof data.contentId !== "string") {
        throw new Error("'contentId' must be a string");
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UPDATE_MACBEASECONTENT_CONTRIIBUTION_PAYLOAD
 * @property {string} userId
 * @property {string} contentId
 */

const  UPDATE_MACBEASECONTENT_CONTRIIBUTION = {
  UPDATE_MACBEASECONTENT_CONTRIIBUTION: {
    topicSuffix: "_update_macbeasecontent_contriibution",

    validate: (data) => {
  
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.contentId !== "string") {
        throw new Error("'contentId' must be a string");
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} NOTIFY_TUNEDIN_USERS_PAYLOAD
 * @property {{_id:String,name:String,image:String,pushToken:String}} contributorMetaData
 * @property {Types.ObjectId[]} tunedIn_By
 * @property {{contentId:String,text:String,contentType:String,image:String}} contentMetaData
 */

const  NOTIFY_TUNEDIN_USERS = {
  NOTIFY_TUNEDIN_USERS: {
    topicSuffix: "_notify_tunedin_users",

    validate: (data) => {
  
      if (
        !data.contributorMetaData ||
        typeof data.contributorMetaData._id !== "string" || typeof data.contributorMetaData.name !== "string" || typeof data.contributorMetaData.image !== "string" || typeof data.contributorMetaData.pushToken !== "string"
      ) {
        throw new Error("'contributorMetaData' must be a complete");
      }
      if (
        !data.contentMetaData ||
        typeof data.contentMetaData.contentId !== "string" || typeof data.contentMetaData.text !== "string" || typeof data.contentMetaData.contentType !== "string"
      ) {
        throw new Error("'contentMetaData' must be a complete");
      }

     if (
      !Array.isArray(data.tunedIn_By) ||
      !data.tunedIn_By.every((id) => mongoose.Types.ObjectId.isValid(id))
        ) {
      throw new Error("'tunedIn_By' must be an array of valid MongoDB ObjectIds");
    }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} PERSON_TAG_MACBEASE_PAYLOAD
 * @property {string} taggedUser
 * @property {{ name: string, image: string }} sender
 * @property {{ _id: ObjectId,... }} content
 */

const PERSON_TAG_MACBEASE = {
  PERSON_TAG_MACBEASE: {
    topicSuffix: "_person_tag_macbease",

    validate: (data) => {

      if (typeof data.taggedUser !== "string") {
        throw new Error("'taggedUser' must be a string");
      }

      if (
        !data.sender ||
        typeof data.sender.name !== "string" ||
        typeof data.sender.image !== "string"
      ) {
        throw new Error("'sender' must contain 'name' and 'image' as strings");
      }

      if (!data.content) {
        throw new Error("content is required");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} LIKE_CONTENT_MACBEASE_PAYLOAD
 * @property {string} contentId
 * @property {string} userId
 * @property {"Macbease"} type
 */

const LIKE_CONTENT_MACBEASE = {
  LIKE_CONTENT_MACBEASE: {
    topicSuffix: "_like_content_macbease",

    validate: (data) => {
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
      if (data.type !== "macbease") {
        throw new Error("'type' must be 'macbease'");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} LIKE_CONTENT_MACBEASE_SECONDARY_ACTION_PAYLOAD
 * @property {string} contentId
 * @property {string} publisherId
 * @property {{ name: string, image: string,_id: string, pushToken:string }} userInfo
 * @property {{ _id: ObjectId,... }} contentInfo
 */

const LIKE_CONTENT_MACBEASE_SECONDARY_ACTION = {
  LIKE_CONTENT_MACBEASE_SECONDARY_ACTION: {
    topicSuffix: "_like_content_macbease_secondary_action",

    validate: (data) => {
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
      if (typeof data.publisherId !== "string") {
        throw new Error("publisherId required in payload");
      }
      if (
        !data.userInfo ||
        typeof data.userInfo.name !== "string" ||
        typeof data.userInfo.image !== "string" ||
        typeof data.userInfo._id !== "string" ||
        typeof data.userInfo.pushToken !== "string"
      ) {
        throw new Error(
          "'userInfo' must contain 'name','image','_id' and 'pushToken' as strings"
        );
      }
      if (!data.contentInfo) {
        throw new Error("contentInfo is required");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} COMMENT_CONTENT_MACBEASE_PAYLOAD
 * @property {string} cid
 * @property {string} userId
 * @property {string} contentId
 * @property {"Macbease"} type
 */

const COMMENT_CONTENT_MACBEASE = {
  COMMENT_CONTENT_MACBEASE: {
    topicSuffix: "_comment_content_macbease",

    validate: (data) => {
      if (typeof data.cid !== "string") {
        throw new Error("cid required in payload");
      }
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
      if (data.type !== "macbease") {
        throw new Error("'type' must be 'macbease'");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UNLIKE_CONTENT_MACBEASE_PAYLOAD
 * @property {string} userId
 * @property {string} contentId
 */

const UNLIKE_CONTENT_MACBEASE = {
  UNLIKE_CONTENT_MACBEASE: {
    topicSuffix: "_unlike_content_macbease",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} DELETE_CONTENT_MACBEASE_PAYLOAD
 * @property {string} adminId
 * @property {string} contentUrl
 */

const DELETE_CONTENT_MACBEASE = {
  DELETE_CONTENT_MACBEASE: {
    topicSuffix: "_delete_content_macbease",

    validate: (data) => {
       if (!data || typeof data !== "object") {
        throw new Error("Payload must be a non-null object.");
      }

      const { adminId, contentUrl } = data;

      if (typeof adminId !== "string" || adminId.trim() === "") {
        throw new Error("adminId (string) is required and cannot be empty.");
      }

      if (typeof contentUrl !== "string" || contentUrl.trim() === "") {
        throw new Error("contentUrl (string) is required and cannot be empty.");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


module.exports = {
  ...CONTENT_ADDEDTO_PROJECT,
  ...UPDATE_MACBEASECONTENT_CONTRIIBUTION,
  ...NOTIFY_TUNEDIN_USERS,
  ...PERSON_TAG_MACBEASE,
  ...LIKE_CONTENT_MACBEASE,
  ...LIKE_CONTENT_MACBEASE_SECONDARY_ACTION,
  ...COMMENT_CONTENT_MACBEASE,
  ...UNLIKE_CONTENT_MACBEASE,
  ...DELETE_CONTENT_MACBEASE,
}
