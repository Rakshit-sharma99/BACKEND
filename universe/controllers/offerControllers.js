const Offer = require("../models/offer");
const Quest = require("../models/quest");
const User = require("../models/user");
const mongoose = require("mongoose");
const StatusCodes = require("http-status-codes");
const { v4: uuidv4 } = require("uuid");
const {
  updateUserIP,
  scheduleNotification2,
  generateOfferPDFAndUpload,
} = require("./utils");
const schedule = require("node-schedule");

const generateCoupons = (count) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes O, I, 0, 1 to avoid confusion
  return Array.from({ length: count }, () =>
    Array.from(
      { length: Math.floor(Math.random() * 3) + 4 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("")
  );
};

const getTimerInMs = (timer) => {
  switch (timer) {
    case "Immediately":
      return 100; // no delay, 100ms for entering if block
    case "30 mins":
      return 30 * 60 * 1000; // 30 minutes
    case "1 hour":
      return 60 * 60 * 1000; // 1 hour
    case "1 day":
      return 24 * 60 * 60 * 1000; // 1 day
    case "Never":
      return null; // don't schedule
    default:
      throw new Error(`Invalid timer value: ${timer}`);
  }
};

//Controller 1 - create an offer
const createOffer = async (req, res) => {
  try {
    const {
      ip,
      expiryDate,
      description,
      couponCount,
      status,
      metaData,
      action = {},
      navigation = {},
      visibleTo = [],
      dispatchCustomNotification,
      notificationMetaData,
      chosenTimer,
    } = req.body;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    // Validate required fields
    if (!ip || !expiryDate || !description) {
      return res.status(400).json({
        message: "ip, expiryDate, and description are required.",
      });
    } else if (!couponCount && Object.keys(action).length === 0) {
      return res.status(400).json({
        message: "Either couponCount or action is needed.",
      });
    }

    let coupons = [];

    // Generate random coupon codes if couponCount is provided
    if (couponCount) {
      coupons = generateCoupons(couponCount);
    }

    // Create the offer
    const newOffer = new Offer({
      _id: new mongoose.Types.ObjectId(), // Generate a unique ObjectId
      ip,
      expiryDate,
      description,
      available: coupons, // Store generated coupons
      status: status ?? 1, // Default to active if not provided
      metaData,
      action,
      navigation,
      visibleTo,
      availedBy: [],
      notificationMetaData,
    });

    await newOffer.save();

    // Dispatch the notification
    if (chosenTimer && visibleTo.length > 0) {
      const delay = getTimerInMs(chosenTimer);
      if (delay) {
        const jobTime = new Date(Date.now() + delay);
        schedule.scheduleJob(
          `offer_creation_${newOffer._id}`,
          jobTime,
          async () => {
            try {
              // Fetch users' push tokens
              const users = await User.find({ _id: { $in: visibleTo } }).select(
                "pushToken"
              );

              const pushTokens = users
                .map((user) => user.pushToken)
                .filter(Boolean);
              if (pushTokens.length > 0) {
                const notificationPayload = dispatchCustomNotification
                  ? {
                      pushToken: pushTokens,
                      title: notificationMetaData.noticeTitle,
                      body: notificationMetaData.noticeBody,
                      image: notificationMetaData.noticeImage,
                      url: `https://macbease.com/app/ip`,
                    }
                  : {
                      pushToken: pushTokens,
                      title: "Hey there!",
                      body: "We have got a new offer for you. Tap to view.",
                      url: `https://macbease.com/app/ip`,
                    };
                scheduleNotification2(notificationPayload);
              }
            } catch (error) {
              console.error(
                `Failed to send scheduled notification for offer ${newOffer._id}:`,
                error
              );
            }
          }
        );
      }
    }

    res.status(201).json({
      success: true,
      message: "Offer created successfully!",
      offer: newOffer,
    });
  } catch (error) {
    console.error("Error creating offer:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

//Controller 2 - get valid offers for a user
const getValidOffersForUser = async (req, res) => {
  try {
    const { psQuests } = req.query;
    const user = await User.findById(req.user.id, { ip: 1 });
    if (!user) {
      return res.status(404).json({
        message: "User does not exist.",
      });
    }
    const currentDate = new Date();
    const userId = mongoose.Types.ObjectId(req.user.id);

    // Fetch valid offers where user meets the IP requirement
    let validOffers = [];
    validOffers = await Offer.find(
      {
        expiryDate: { $gte: currentDate }, // Not expired
        ip: { $lte: user.ip }, // User IP is sufficient
        status: 1, // Offer is active
        $or: [
          { available: { $ne: [] } }, // Coupons are still available
          { "navigation.body": { $exists: true, $ne: {} } }, // Navigation body is present
        ],
        $or: [
          { visibleTo: { $size: 0 } }, // Open to all
          { visibleTo: req.user.id }, // User is allowed
        ],
        availedBy: { $not: { $elemMatch: { userId } } },
      },
      { available: 0 }
    );
    //in case no valid offers are there we show already availed offers
    if (validOffers.length === 0) {
      console.log("if");
      validOffers = await Offer.find(
        {
          expiryDate: { $gte: currentDate }, // Not expired
          status: 1, // Offer is active
          $or: [
            { available: { $ne: [] } }, // Coupons are still available
            { "navigation.body": { $exists: true, $ne: {} } }, // Navigation body is present
          ],
          $or: [
            { visibleTo: { $size: 0 } }, // Open to all
            { visibleTo: req.user.id }, // User is allowed
          ],
          availedBy: { $elemMatch: { userId } },
        },
        { available: 0 }
      ).limit(3);
    }

    // Fetch next-level offers where IP required is higher than user's IP
    const nextLevelOffers = await Offer.find(
      {
        expiryDate: { $gte: currentDate }, // Not expired
        ip: { $gt: user.ip }, // User IP is lower
        status: 1, // Offer is active
        $or: [
          { available: { $ne: [] } }, // Coupons are still available
          { "navigation.body": { $exists: true, $ne: {} } }, // Navigation body is present
        ],
        $or: [
          { visibleTo: { $size: 0 } }, // Open to all
          { visibleTo: req.user.id }, // User is allowed
        ],
        availedBy: { $not: { $elemMatch: { userId } } },
      },
      { available: 0 }
    );

    let validQuests = [];
    if (psQuests) {
      const userId = mongoose.Types.ObjectId(req.user.id);
      validQuests = await Quest.find({
        $and: [
          {
            $or: [{ visibleTo: { $size: 0 } }, { visibleTo: userId }],
          },
          { status: 1 },
          {
            $or: [{ isRepeatable: true }, { completedBy: { $ne: userId } }],
          },
          {
            $expr: {
              $lt: [{ $size: "$completedBy" }, "$available"],
            },
          },
        ],
      });
      //in case no valid quests are available , we show already completed quests
      validQuests = await Quest.find({
        $and: [
          {
            $or: [{ visibleTo: { $size: 0 } }, { visibleTo: userId }],
          },
          { status: 1 },
          {
            $expr: {
              $lt: [{ $size: "$completedBy" }, "$available"],
            },
          },
        ],
      }).limit(3);
    }

    //Fetching the offers user has already availed
    const availedOffers = await Offer.find(
      {
        availedBy: { $elemMatch: { userId } },
      },
      { available: 0 }
    )
      .sort({ "availedBy.availedAt": -1 })
      .limit(12);

    return res.status(200).json({
      validOffers,
      nextLevelOffers,
      validQuests,
      availedOffers,
      currentIp: user.ip,
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).json({ message: "Server error while fetching offers." });
  }
};

//Controller 3 - avail offers
const availOffer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { offerId } = req.body;

    if (!offerId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Offer ID is required." });
    }

    // Fetch offer inside transaction
    const offer = await Offer.findById(offerId).session(session);
    if (!offer || offer.status !== 1) {
      await session.abortTransaction();
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Offer not available." });
    }

    // Fetch only IP field for user
    const user = await User.findById(userId, { ip: 1 }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "User not found." });
    }

    if (user.ip < offer.ip) {
      await session.abortTransaction();
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Insufficient Interstellar Points." });
    }

    if (offer.available.length === 0) {
      await session.abortTransaction();
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "No coupons left." });
    }

    // Use a Set for fast O(1) lookup
    const alreadyAvailed = new Set(
      offer.availedBy.map((entry) => entry.userId.toString())
    );
    if (alreadyAvailed.has(userId)) {
      await session.abortTransaction();
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "You have already availed this offer." });
    }

    // Get a coupon code & remove from available list
    const couponCode = offer.available.shift();

    // Add user to availedBy list
    offer.availedBy.push({
      userId: mongoose.Types.ObjectId(userId),
      couponId: couponCode,
      availedAt: new Date(),
    });

    // Deduct IP from user
    await updateUserIP({
      userId,
      ipChange: -offer.ip,
      c_source: "offer",
      d_source: "user",
      c_ref: offerId,
      d_ref: userId,
      description: offer.description,
    });

    // Save updates atomically
    await offer.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.OK).json({
      message: "Offer successfully availed.",
      couponCode,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction(); // Only abort if transaction is still active
    }
    session.endSession();

    console.error("Error availing offer:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong.",
      error: error.message,
    });
  }
};

//Controller 4 - get batched offers for admin app
const getBatchedOffers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(401).json({ success: false, message: "Unauthorized!" });
    }
    const batch = parseInt(req.query.batchNumber) || 1;
    const batchSize = parseInt(req.query.batchSize) || 10;

    const skip = (batch - 1) * batchSize;

    const offers = await Offer.find({ status: 1 }) // only active offers
      .sort({ createdAt: -1 }) // latest offers first
      .skip(skip)
      .limit(batchSize);

    res.status(200).json({ success: true, offers });
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//Controller 5 - add user to visible list
const addUserToVisibleTo = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }
    const { offerId, userId } = req.body;

    if (!offerId || !userId) {
      return res
        .status(400)
        .json({ message: "offerId and userId are required." });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      {
        $addToSet: { visibleTo: userId },
      },
      { new: true }
    );

    if (!updatedOffer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    // pinging the user
    schedule.scheduleJob(
      `offer_add_${userId}_${offerId}`,
      new Date(Date.now() + 1000),
      async () => {
        const { pushToken } = await User.findById(userId, { pushToken: 1 });
        const { notificationMetaData } = await Offer.findById(offerId, {
          notificationMetaData: 1,
        });
        const notificationPayload = notificationMetaData?.noticeTitle
          ? {
              pushToken: [pushToken],
              title: notificationMetaData.noticeTitle,
              body: notificationMetaData.noticeBody,
              image: notificationMetaData.noticeImage,
              url: `https://macbease.com/app/ip`,
            }
          : {
              pushToken: [pushToken],
              title: "Hey there!",
              body: "We have got a new offer for you. Tap to view.",
              url: `https://macbease.com/app/ip`,
            };
        scheduleNotification2(notificationPayload);
      }
    );

    return res.status(200).json({
      message: "User added to visibleTo successfully.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Error adding user to visibleTo:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const removeUserFromVisibleTo = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }
    const { offerId, userId } = req.body;

    if (!offerId || !userId) {
      return res
        .status(400)
        .json({ message: "offerId and userId are required." });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      { $pull: { visibleTo: userId } },
      { new: true }
    );

    if (!updatedOffer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    return res.status(200).json({
      message: "User removed from visibleTo successfully.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Error removing user from visibleTo:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const generateCouponPdf = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }
    const { offerId } = req.query;
    if (!offerId) {
      return res.status(400).send("Please provide an offer id.");
    }
    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res.status(404).send("Offer not found.");
    }
    // Sort the coupon codes alphabetically
    const sortedCoupons = [...offer.available].sort();
    const pdfUrl = await generateOfferPDFAndUpload({
      offerName: offer.metaData?.store || "Offer",
      offerDescription: offer.description,
      couponCodes: sortedCoupons,
    });
    return res.status(200).json({ reportURL: pdfUrl });
  } catch (error) {
    console.error("Error sending report:", error);
    return res.status(500).send("Server error");
  }
};

const editOffer = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }
    const { offerId } = req.query;
    const updateData = req.body;
    console.log(updateData);
    if (!offerId) {
      return res
        .status(400)
        .json({ message: "offerId is required in the URL." });
    }

    // Sanitize or validate fields as needed here
    if (updateData.ip && isNaN(updateData.ip)) {
      return res.status(400).json({ message: "Invalid value for ip." });
    }
    console.log("just before");
    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    console.log(`first`, updatedOffer);
    if (!updatedOffer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    return res
      .status(200)
      .json({ message: "Offer updated successfully.", offer: updatedOffer });
  } catch (error) {
    console.error("Error editing offer:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const deleteOffer = async (req, res) => {
  try {
    // Ensure only admins can delete offers
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You are not authorized to access this route." });
    }

    const { offerId } = req.query;

    if (!offerId) {
      return res
        .status(400)
        .json({ message: "offerId query parameter is required." });
    }

    const offer = await Offer.findByIdAndDelete(offerId);

    if (!offer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    return res.status(200).json({ message: "Offer successfully deleted." });
  } catch (error) {
    console.error("Error deleting offer:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const getAvailedOffers = async (req, res) => {
  try {
    const userId = req.user.id;
    const offers = await Offer.find(
      {
        availedBy: { $elemMatch: { userId } },
      },
      { available: 0 }
    )
      .sort({ "availedBy.availedAt": -1 })
      .limit(12);
    return res.status(200).json({ offers });
  } catch (error) {
    console.error("Error fetching availed offers:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createOffer,
  getValidOffersForUser,
  availOffer,
  getBatchedOffers,
  addUserToVisibleTo,
  removeUserFromVisibleTo,
  generateCouponPdf,
  deleteOffer,
  getAvailedOffers,
  editOffer,
};
