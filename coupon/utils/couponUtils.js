const Coupon = require("../models/coupon");

const normalizeCouponCode = (code) => String(code || "").trim().toUpperCase();

const buildCouponEligibilityQuery = ({
  couponId,
  couponCode,
  eventId,
  userId,
  isPublic,
}) => {
  const query = { isActive: true };
  const andConditions = [];

  if (couponId) {
    query._id = couponId;
  }

  if (couponCode) {
    query.code = normalizeCouponCode(couponCode);
  }

  if (typeof isPublic === "boolean") {
    query.isPublic = isPublic;
  }

  if (eventId) {
    andConditions.push({
      $or: [
        { validForEvents: { $exists: false } },
        { validForEvents: { $size: 0 } },
        { validForEvents: eventId },
      ],
    });
  }

  if (userId) {
    andConditions.push(
      {
        $or: [
          { validForUsers: { $exists: false } },
          { validForUsers: { $size: 0 } },
          { validForUsers: userId },
        ],
      },
      {
        $or: [{ singleUsePerUser: { $ne: true } }, { usedBy: { $ne: userId } }],
      },
    );
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  return query;
};

const redeemCouponForUser = ({ couponId, eventId, userId }) => {
  return Coupon.findOneAndUpdate(
    buildCouponEligibilityQuery({ couponId, eventId, userId }),
    { $addToSet: { usedBy: userId } },
    { new: true },
  );
};

module.exports = {
  buildCouponEligibilityQuery,
  normalizeCouponCode,
  redeemCouponForUser,
};
