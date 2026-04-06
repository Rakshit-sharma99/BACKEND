const Club = require("../../../models/club");

const update_club_itineraries = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { clubId, eventId, itineraryId } = data;

    if (!clubId || !eventId || !itineraryId) {
      console.warn("⚠️ Missing required fields in update_club_itineraries payload");
      return;
    }

    const club = await Club.findById(clubId, { upcomingEvent: 1 });

    if (club && Array.isArray(club.upcomingEvent)) {
      club.upcomingEvent = club.upcomingEvent.map((obj) => {
        if (obj?.eventId && obj.eventId.toString() === eventId) {
          return {
            ...obj,
            itineraries: [...(obj.itineraries || []), itineraryId],
          };
        }
        return obj;
      });

      await club.save();
      console.log(`✅ Successfully updated itineraries for club ${clubId} event ${eventId}`);
    }
  } catch (error) {
    console.error("❌ Failed to process update_club_itineraries topic", error);
  }
};

module.exports = { update_club_itineraries };
