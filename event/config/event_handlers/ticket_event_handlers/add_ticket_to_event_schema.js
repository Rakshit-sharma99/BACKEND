const {
  scheduleNotification2,
} = require("../../../controllers/utilControllers");
const Event = require("../../../models/event");
const mongoose = require("mongoose");

// Main Kafka-triggered handler
const add_ticket_to_event_schema = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { eventId, ticketId, amtPaid, userField, seatIds = [] } = data;

    if (
      !eventId ||
      !ticketId ||
      amtPaid === undefined ||
      amtPaid === null ||
      !userField
    ) {
      console.warn("⚠️ Missing required fields in message:", data);
      return;
    }

    // Add ticket reference to event
    await Event.findByIdAndUpdate(eventId, {
      $push: { bookedBy: new mongoose.Types.ObjectId(ticketId) },
      ...(Array.isArray(seatIds) &&
        seatIds.length > 0 && {
          $addToSet: { seatsBooked: { $each: seatIds } },
        }),
    });

    // Update event stats
    await updateEventStatsJob({ eventId, amtPaid, userField });
  } catch (error) {
    console.error("❌ Failed to process ticket-event schema:", error);
  }
};

// Helper to update event stats
const updateEventStatsJob = async ({ eventId, amtPaid, userField }) => {
  try {
    const event = await Event.findById(eventId, {
      ticketSellingDays: 1,
      cumulativeRevenue: 1,
      courseAnalytics: 1,
      authorizedPerson: 1,
      belongsTo: 1,
    });

    if (!event) {
      console.error("❌ Event not found for stats update:", eventId);
      return;
    }

    // Initialize arrays if missing
    event.ticketSellingDays = event.ticketSellingDays || [];
    event.cumulativeRevenue = event.cumulativeRevenue || [];
    event.courseAnalytics = event.courseAnalytics || [];

    const today = new Date().toISOString().split("T")[0];
    const amount = Number(amtPaid) || 0;

    // Update daily revenue
    const dayIndex = event.ticketSellingDays.findIndex((d) => d === today);
    if (dayIndex === -1) {
      event.ticketSellingDays.push(today);
      event.cumulativeRevenue.push(amount);
    } else {
      event.cumulativeRevenue[dayIndex] += amount;
    }

    // Update course-wise analytics
    const courseIndex = event.courseAnalytics.findIndex(
      (entry) => entry.course === userField
    );

    if (courseIndex === -1) {
      event.courseAnalytics.push({ course: userField, count: 1 });
    } else {
      event.courseAnalytics[courseIndex].count += 1;
    }

    if (event?.authorizedPerson?.pushToken) {
      scheduleNotification2({
        pushToken: [event.authorizedPerson.pushToken],
        title: "Congratulations! Ticket sold.",
        body: `To see live statistics please visit your ${event.name} event console.`,
        url: `https://macbease.com/app/club/${event.belongsTo}`,
      });
    }

    await event.save();
  } catch (error) {
    console.error("❌ Error updating event stats:", error);
  }
};

module.exports = { add_ticket_to_event_schema };
