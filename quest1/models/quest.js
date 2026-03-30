const mongoose = require("mongoose");

const quest_metric_enums = [
  'active_member_posts',
  'category_event_combo',
  'clubs_created',
  'clubs_with_min_events',
  'clubs_with_min_members',
  'clubs_with_min_posts',
  'communities_created',
  'communities_with_min_events',
  'communities_with_min_members',
  'communities_with_min_posts',
  'cross_campus_events_registrations',
  'member_event_attendance',
  'registered_alumni',
  'registered_professors',
  'registered_students',
  'top_event_registration',
  'total_club_members',
  'total_club_posts',
  'total_community_members',
  'total_community_posts',
  'total_event_created',
  'total_event_registration',
  'total_members'
]

const OrbitSchema = new mongoose.Schema({
  id: Number,
  title: String,
  subTitle: String,
}, { _id: false });

const QuestSchema = new mongoose.Schema({
  orbit: OrbitSchema,

  title: {
    type: String,
    required: true
  },

  description: String,

  logo: String,
  secondaryLogo: String,

  entity: {
    type: String,
    enum: ["Club", "Community", "Event", "Member"],
    required: true
  },

  metric: {
    type: String,
    required: true,
    enum: quest_metric_enums
  },

  type: {
    type: String,
    enum: ["continuous", "discrete"],
    required: true
  },

  // how many entities required (only for discrete)
  entityLimit: {
    type: Number,
    default: 0
  },

  // per entity target OR total target
  target: {
    type: Number,
    required: true
  },

  ip: {
    type: Number,
    required: true
  },

  is_active: {
    type: Boolean,
    default: true
  },

}, { timestamps: true });

module.exports = mongoose.model("Quest", QuestSchema);