const { person_tag } = require('./person_tag');
const { like_content } = require('./like_content');
const { comment_content } = require('./comment_content');
const { unlike_content } = require('./unlike_content');
const { clear_feed } = require('./clear_feed');
const { add_card } = require('./card_event_handlers/add_card');
const { update_card_feed } = require('./card_event_handlers/update_card_feed');
const { delete_card } = require('./card_event_handlers/delete_card');
const { like_card } = require('./card_event_handlers/like_card');
const { unlike_card } = require('./card_event_handlers/unlike_card');
const {
  delete_resource,
} = require("./resource_event_handlers/delete_resource");
const {
  create_resource,
} = require("./resource_event_handlers/create_resource");
const {
  resource_review_secondary_action,
} = require("./resource_event_handlers/resource_review_secondary_action");
const {
  like_card_secondary_action,
} = require("./card_event_handlers/like_card_secondary_action");
const {
  featured_secondary_action,
} = require("./clubEvent_event_handlers/featured_secondary_action");
const {
  like_content_secondary_action,
} = require("./like_content_secondary_action");
const {
  content_addedto_project,
} = require("./macbeaseContent_event_handlers/content_addedto_project");
const {
  update_macbeasecontent_contribution,
} = require("./macbeaseContent_event_handlers/update_macbeasecontent_contriibution");
const {
  person_tag_macbease,
} = require("./macbeaseContent_event_handlers/person_tag_macbease");
const {
  like_content_macbease,
} = require("./macbeaseContent_event_handlers/like_content_macbease");
const {
  like_content_macbease_secondary_action,
} = require("./macbeaseContent_event_handlers/like_content_macbease_secondary_action");
const {
  comment_content_macbease,
} = require("./macbeaseContent_event_handlers/comment_content_macbease");
const {
  unlike_content_macbease,
} = require("./macbeaseContent_event_handlers/unlike_content_macbease");
const {
  delete_content_macbease,
} = require("./macbeaseContent_event_handlers/delete_content_macbease");
const { create_offer } = require("./offer_event_handlers/create_offer");
const { update_user_ip } = require("./offer_event_handlers/update_user_ip");
const {
  create_invitation,
} = require("./invitation_event_handlers/create_invitation");
const {
  secondary_invitation_action,
} = require("./invitation_event_handlers/secondary_invitation_action");
const { create_project } = require("./project_event_handlers/create_project");
const {
  allot_users_to_project,
} = require("./project_event_handlers/allot_users_to_project");
const {
  project_chat_message,
} = require("./project_event_handlers/project_chat_message");
const { allot_chatroom } = require("./project_event_handlers/allot_chatroom");
const { ask_for_review } = require("./clubEvent_event_handlers/ask_for_review");
const { edit_event } = require("./clubEvent_event_handlers/edit_event");
const {
  add_ticket_to_user_schema,
} = require("./ticket_event_handlers/add_ticket_to_user_schema");

const badgeHandlers = require("./badge_event_handlers/index");
const { update_memory_list } = require('./memory_event_handlers/update_memory_list');
const { update_user_memory_list } = require('./memory_event_handlers/update_user_memory_list');
const { update_club_memory_list } = require('./memory_event_handlers/update_club_memory_list');
const { update_user_memory_notice } = require('./memory_event_handlers/update_user_memory_notice');
const { update_user_pinned_memory } = require('./memory_event_handlers/update_user_pinned_memory');
const { user_overlay_operation } = require('./overlay_event_handlers/user_overlay_operation');
const { add_ticket_to_user } = require('./ticket_event_handlers/add_ticket_to_user');

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_person_tag`]: person_tag,
  [`${prefix}_like_content`]: like_content,
  [`${prefix}_like_content_secondary_action`]: like_content_secondary_action,
  [`${prefix}_comment_content`]: comment_content,
  [`${prefix}_unlike_content`]: unlike_content,
  [`${prefix}_clear_feed`]: clear_feed,
  [`${prefix}_add_card`]: add_card,
  [`${prefix}_update_card_feed`]: update_card_feed,
  [`${prefix}_delete_card`]: delete_card,
  [`${prefix}_like_card`]: like_card,
  [`${prefix}_like_card_secondary_action`]: like_card_secondary_action,
  [`${prefix}_unlike_card`]: unlike_card,
  [`${prefix}_create_resource`]: create_resource,
  [`${prefix}_resource_review_secondary_action`]:
    resource_review_secondary_action,
  [`${prefix}_delete_resource`]: delete_resource,
  [`${prefix}_content_addedto_project`]: content_addedto_project,
  [`${prefix}_update_macbeasecontent_contriibution`]:
    update_macbeasecontent_contribution,
  [`${prefix}_person_tag_macbease`]: person_tag_macbease,
  [`${prefix}_like_content_macbease`]: like_content_macbease,
  [`${prefix}_like_content_macbease_secondary_action`]:
    like_content_macbease_secondary_action,
  [`${prefix}_comment_content_macbease`]: comment_content_macbease,
  [`${prefix}_unlike_content_macbease`]: unlike_content_macbease,
  [`${prefix}_delete_content_macbease`]: delete_content_macbease,
  [`${prefix}_create_offer`]: create_offer,
  [`${prefix}_update_user_ip`]: update_user_ip,
  [`${prefix}_create_invitation`]: create_invitation,
  [`${prefix}_secondary_invitation_action`]: secondary_invitation_action,
  [`${prefix}_create_project`]: create_project,
  [`${prefix}_allot_users_to_project`]: allot_users_to_project,
  [`${prefix}_project_chat_message`]: project_chat_message,
  [`${prefix}_allot_chatroom`]: allot_chatroom,
  [`${prefix}_featured_secondary_action`]: featured_secondary_action,
  [`${prefix}_update_club`]: badgeHandlers.updateClub,
  [`${prefix}_update_community`]: badgeHandlers.updateCommunity,
  [`${prefix}_update_user`]: badgeHandlers.updateUser,
  [`${prefix}_ask_for_review`]: ask_for_review,
  [`${prefix}_edit_event`]: edit_event,
  [`${prefix}_add_ticket_to_user_schema`]: add_ticket_to_user_schema,
  [`${prefix}_update_user_memory_list`]: update_user_memory_list,
  [`${prefix}_update_club_memory_list`]: update_club_memory_list,
  [`${prefix}_update_memory_list`]: update_memory_list,
  [`${prefix}_update_user_memory_notice`]: update_user_memory_notice,
  [`${prefix}_update_user_pinned_memory`]: update_user_pinned_memory,
  [`${prefix}_user_overlay_operation`]: user_overlay_operation,
  [`${prefix}_add_ticket_to_user`]: add_ticket_to_user
};

module.exports = { handlers };
