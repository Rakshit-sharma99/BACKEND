const Itinerary = require("../../models/itinerary");

const itinerary_update_operation = async (messageValue) => {
 try {
    const { data } = JSON.parse(messageValue);
    const {
      operation,
      targetType,
      field,
      value,
      itineraryId,
      itineraryIds,
    } = data;

    let update;

    switch (operation) {
      case "SET":
        update = { $set: { [field]: value } };
        break;

      case "PUSH":
        update = { $push: { [field]: value } }; // ✅ duplicates allowed
        break;

      case "PULL":
        update = { $pull: { [field]: value } };
        break;

      case "INC":
        update = { $inc: { [field]: value } };
        break;

      default:
        throw new Error("Unsupported operation");
    }

    if (targetType === "SINGLE") {
      await Itinerary.findByIdAndUpdate(itineraryId, update);
    }

    if (targetType === "MULTIPLE") {
      await Itinerary.updateMany(
        { _id: { $in: itineraryIds } },
        update
      );
    }
  } catch (error) {
    console.error("❌ Failed to process itinerary update operation topic:", error);
  }
};

module.exports = { itinerary_update_operation };
