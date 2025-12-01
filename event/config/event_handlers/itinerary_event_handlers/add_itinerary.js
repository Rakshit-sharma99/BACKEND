const Event = require("../../../models/event");

const add_itinerary = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { eventId, itineraryId } = data;

    if (!eventId || !itineraryId) {
      console.warn("Missing eventId or itineraryId in message");
      return;
    }

    await Event.findByIdAndUpdate(
      eventId,
      { $addToSet: { itineraries: itineraryId } },
      { new: true }
    );
  } catch (error) {
    console.error("❌ Failed to process add itinerary topic", error);
  }
};

module.exports = { add_itinerary };
