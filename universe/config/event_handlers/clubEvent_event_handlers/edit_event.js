const Club = require('../../../models/club');

const edit_event = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { clubId, eventId, newData } = data;

    if (!clubId || !eventId || !newData) {
      console.warn('Missing essential data in message payload');
      return;
    }

    // Find the club
    const club = await Club.findById(clubId);
    if (!club) {
      console.warn(`Club with ID ${clubId} not found`);
      return;
    }

    let updated = false;

    if (Array.isArray(club.upcomingEvent) && club.upcomingEvent.length > 0) {
      club.upcomingEvent = club.upcomingEvent.map((e) => {
        if (e?.eventId?.toString() === eventId) {
          updated = true;
          return {
            ...e,
            ...(newData.url !== undefined && { url: newData.url }),
            ...(newData.description !== undefined && {
              description: newData.description,
            }),
            ...(newData.ticketTypes !== undefined && {
              ticketTypes: newData.ticketTypes,
            }),
          };
        }
        return e;
      });

      if (updated) {
        await club.save();
      } else {
        console.warn(`Event ${eventId} not found in club's upcoming events.`);
      }
    } else {
      console.warn(`Club ${clubId} has no upcoming events.`);
    }
  } catch (error) {
    console.error('❌ edit_event failed:', error.message);
  }
};

module.exports = { edit_event };
