const { addMemberToChannel } = require("../../controllers/channelControllers");

const add_member_to_channel = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { userId, ticketId } = data;

    if (!userId || !ticketId) {
      console.error("❌ add_member_to_channel: Missing userId or ticketId");
      return;
    }

    console.log(`📢 Adding member ${userId} to channel via ticket ${ticketId}`);

    // Retry with exponential backoff in case the ticket hasn't fully propagated yet
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await addMemberToChannel({ userId, ticketId });

      if (result?.success) {
        console.log(`✅ Member added to channel: ${result.message}`);
        return;
      }

      // If ticket not found and we have retries left, wait and retry
      if (
        result?.message === "User has not purchased ticket" &&
        attempt < maxRetries
      ) {
        const delay = 2000 * attempt; // 2s, 4s
        console.log(
          `⏳ Ticket not found yet, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error(`❌ Failed to add member to channel: ${result?.message}`);
      return;
    }
  } catch (error) {
    console.error("❌ Error in add_member_to_channel handler:", error);
  }
};

module.exports = { add_member_to_channel };
