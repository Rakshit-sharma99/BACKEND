const Event = require("../../models/event");

const delete_event = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { eventId } = data;

    if (!eventId) {
      console.warn("Missing eventId in message");
      return;
    }

    await Event.findByIdAndDelete(eventId);
    console.log(`✅ Successfully deleted event with ID: ${eventId}`);
  } catch (error) {
    console.error("❌ Failed to process delete event topic", error);
  }
};

module.exports = { delete_event };
