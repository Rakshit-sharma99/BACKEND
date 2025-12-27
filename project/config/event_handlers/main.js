const {
  content_addedto_project
} = require("./macbeaseContent_event_handlers/content_addedto_project");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_content_addedto_project`]: content_addedto_project,
};

module.exports = { handlers };
