const { create_universe } = require("./create_universe");
const { update_universe_stats } = require("./update_universe_stats");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_create_universe`]: create_universe,
  [`${prefix}_stats_update`]: update_universe_stats,
};

module.exports = { handlers };