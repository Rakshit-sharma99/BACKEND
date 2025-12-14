const { default: mongoose } = require("mongoose");
const User = require("../../../models/user");

const user_overlay_operation = async (messageValue) => {
  try {
    const { data } = JSON.parse(messageValue);
    const { operation, targetType, overlayId } = data;
    const overlayObjectId = new mongoose.Types.ObjectId(overlayId);

    const update =
        operation === "add"
        ? { $addToSet: { overlays: overlayObjectId } }
        : { $pull: { overlays: overlayObjectId } };

    if (targetType === "single") {
        await User.findByIdAndUpdate(data.userId, update);
    }

    if (targetType === "multiple") {
        await User.updateMany(
        { _id: { $in: data.userIds } },
        update
        );
    }

    if (targetType === "all") {
        await User.updateMany({}, update);
    }
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process user overlay operation topic");
  }
};

module.exports = { user_overlay_operation };
