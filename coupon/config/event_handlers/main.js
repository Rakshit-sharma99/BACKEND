const { update_coupon } = require("./update_coupon");


const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_update_coupon`]: update_coupon,
};

module.exports = { handlers };
