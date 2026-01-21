const Offer = require("../models/offer");
// const Quest = require("../models/quest");
// const User = require("../models/user");
const mongoose = require("mongoose");
const StatusCodes = require("http-status-codes");
// const { v4: uuidv4 } = require("uuid");
// const {
//   updateUserIP,
//   scheduleNotification2,
//   generateOfferPDFAndUpload,
// } = require("./utils");
const schedule = require("node-schedule");
const { fetchNativeUserData, fetchNativeQuestData, fetchUserData, scheduleNotification2, generateOfferPDFAndUpload } = require("./utilControllers");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");


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
      universeMetaData
    } = req.body;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    // Validate required fields
    if (!ip || !expiryDate || !description || !universeMetaData) {
      return res.status(400).json({
        message: "Incomplete fields.",
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
      uid: req.user.uid,
      universeMetaData
    });

    await newOffer.save();

    // Dispatch the notification
    if (chosenTimer && visibleTo.length > 0) {
      const delay = getTimerInMs(chosenTimer);
      if (delay) {
        const jobTime = new Date(Date.now() + delay);
        await sendKafkaMessage("CREATE_OFFER", "universe", {
          offerId: newOffer._id.toString(),
          jobTime,
          visibleTo,
          dispatchCustomNotification,
          notificationMetaData
        })
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
    const user_query = {
      id: req.user.id,
      fields: ["name", "image", "pushToken", "ip"],
      callSign: req.user.callSign
    }
    const user = await fetchNativeUserData(user_query);
    if (!user) {
      return res.status(404).json({
        message: "User does not exist.",
      });
    }
    const currentDate = new Date();
    const userId = new mongoose.Types.ObjectId(req.user.id);

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
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const quest_query = {
        id: userId,
        callSign: "quest"
      }

      validQuests = await fetchNativeQuestData(quest_query);
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

    const user_query = {
      id: userId,
      fields: ["name", "image", "pushToken", "ip"],
      callSign: req.user.callSign
    }
    const user = await fetchNativeUserData(user_query);
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
      userId: new mongoose.Types.ObjectId(userId),
      couponId: couponCode,
      availedAt: new Date(),
    });

    await sendKafkaMessage("UPDATE_USER_IP", req.user.callSign, {
      userId,
      ipChange: -offer.ip,
      c_source: "offer",
      d_source: "user",
      c_ref: offerId,
      d_ref: userId,
      description: offer.description
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

    const batchNumber = parseInt(req.query.batch, 10);
    const batchSize = parseInt(req.query.batchSize, 10);

    if (isNaN(batchNumber) || batchNumber <= 0 || isNaN(batchSize) || batchSize <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid batchNumber or batchSize. Must be positive integers.",
      });
    }

    const skip = (batchNumber - 1) * batchSize;

    const offers = await Offer.find({ status: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(batchSize)
      .lean();

    return res.status(200).json({ success: true, offers });
  } catch (error) {
    console.error("❌ Error fetching batched offers:", error);
    return res.status(500).json({ success: false, message: "Server error" });
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

    if (
      !offerId ||
      !userId ||
      !mongoose.Types.ObjectId.isValid(offerId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res
        .status(400)
        .json({ message: "Valid offerId and userId are required." });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      { $addToSet: { visibleTo: userId } },
      { new: true }
    ).lean();

    if (!updatedOffer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    // Ping user after slight delay
    schedule.scheduleJob(
      `offer_add_${userId}_${offerId}`,
      new Date(Date.now() + 1000),
      async () => {
        try {
          const user_query = {
            id: userId,
            fields: ["name", "image", "pushToken"],
          };
          const userData = await fetchUserData(user_query);
          if (!userData || !userData.pushToken) return;

          const { notificationMetaData } = await Offer.findById(offerId, {
            notificationMetaData: 1,
          }).lean();

          const notificationPayload = notificationMetaData?.noticeTitle
            ? {
              pushToken: [userData.pushToken],
              title: notificationMetaData.noticeTitle,
              body: notificationMetaData.noticeBody,
              image: notificationMetaData.noticeImage,
              url: `https://macbease.com/app/ip`,
            }
            : {
              pushToken: [userData.pushToken],
              title: "Hey there!",
              body: "We have got a new offer for you. Tap to view.",
              url: `https://macbease.com/app/ip`,
            };

          scheduleNotification2(notificationPayload);
        } catch (err) {
          console.error(`❌ Failed to notify user ${userId} for offer ${offerId}:`, err);
        }
      }
    );

    return res.status(200).json({
      message: "User added to visibleTo successfully.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("❌ Error adding user to visibleTo:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// Controller 6 - remove user from visible list
const removeUserFromVisibleTo = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { offerId, userId } = req.body;

    if (
      !offerId ||
      !userId ||
      !mongoose.Types.ObjectId.isValid(offerId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res
        .status(400)
        .json({ message: "Valid offerId and userId are required." });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      { $pull: { visibleTo: userId } },
      { new: true }
    ).lean();

    if (!updatedOffer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    return res.status(200).json({
      message: "User removed from visibleTo successfully.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("❌ Error removing user from visibleTo:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// Controller 7 - Generate coupon pdf
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

// Controller 8 - Edit offer
const editOffer = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).send("You are not authorized to access this route.");
    }

    const { offerId } = req.query;
    const updateData = req.body;

    if (!offerId || !mongoose.Types.ObjectId.isValid(offerId)) {
      return res.status(400).json({ message: "A valid offerId is required in the URL." });
    }

    // Validate specific fields (example: ip should be a number if provided)
    if ("ip" in updateData && isNaN(updateData.ip)) {
      return res.status(400).json({ message: "Invalid value for 'ip'. It must be a number." });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedOffer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    return res.status(200).json({
      message: "Offer updated successfully.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("❌ Error editing offer:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const deleteOffer = async (req, res) => {
  try {
    // Authorization check
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You are not authorized to access this route." });
    }

    const { offerId } = req.query;

    if (!offerId || !mongoose.Types.ObjectId.isValid(offerId)) {
      return res
        .status(400)
        .json({ message: "A valid offerId query parameter is required." });
    }

    const offer = await Offer.findByIdAndDelete(offerId);

    if (!offer) {
      return res.status(404).json({ message: "Offer not found." });
    }

    return res.status(200).json({ message: "Offer successfully deleted." });
  } catch (error) {
    console.error("❌ Error deleting offer:", error);
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

const insertNewFields = async (req, res) => {
  try {
    const allOffers = await Offer.find({});

    const bulkOps = allOffers.map((offer) => ({
      updateOne: {
        filter: { _id: offer._id },
        update: {
          $set: {
            uid: "696f491a0bfc89b35dc62326",
            universeMetaData: {
              location: "Punjab, India",
              logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
              logoKey: "public/universes/lpu_logo-removebg-preview.png",
              name: "Lovely Professional University",
              callSign: "LPU",
              lat: 31.25361,
              lng: 75.70361
            },
          },
        },
      }
    }));

    const result = await Offer.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} Offers`);

    res.status(StatusCodes.OK).json({
      message: "Offers updated successfully.",
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.log("Error updating offer:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
}

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
  insertNewFields
};
