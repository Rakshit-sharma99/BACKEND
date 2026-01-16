const Event = require("../../models/event");

const update_event_stats = async (messageValue) => {
    try {
        const { eventId, amtPaid, userField } = messageValue;
        const event = await Event.findById(eventId, {
            ticketSellingDays: 1,
            cumulativeRevenue: 1,
            courseAnalytics: 1,
        });

        if (!event) {
            console.error("Event not found for stats update:", eventId);
            return;
        }

        const currentDate = new Date();
        const formattedDate = currentDate.toISOString().split("T")[0];
        const amount = Number(amtPaid) || 0;

        let dayIndex = event.ticketSellingDays.findIndex(
            (d) => d === formattedDate
        );
        if (dayIndex === -1) {
            event.ticketSellingDays.push(formattedDate);
            event.cumulativeRevenue.push(Number(amount));
        } else {
            const currentVal = Number(event.cumulativeRevenue[dayIndex]) || 0;
            event.cumulativeRevenue[dayIndex] = currentVal + amount;
        }

        if (userField) {
            let courseIndex = event.courseAnalytics.findIndex(
                (entry) => entry.course === userField
            );

            if (courseIndex === -1) {
                event.courseAnalytics.push({ course: userField, count: 1 });
            } else {
                event.courseAnalytics[courseIndex].count += 1;
            }
        }

        await event.save();
        console.log(`Event stats updated successfully for event: ${eventId}`);
    } catch (error) {
        console.error("Error updating event stats:", error);
    }
};

module.exports = { update_event_stats };
