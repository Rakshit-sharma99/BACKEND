const Universe = require("../../models/universe");

const ALLOWED_FIELDS = ["clubs", "communities", "members"];

const update_universe_stats = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { universeId, field, delta } = data;

    if (!universeId || !ALLOWED_FIELDS.includes(field) || typeof delta !== "number") {
      console.error("❌ Invalid stats update payload:", data);
      return;
    }

    const result = await Universe.findByIdAndUpdate(
      universeId,
      { $inc: { [field]: delta } },
      { new: true },
    );

    if (!result) {
      console.warn(`⚠️ Universe not found for stats update: ${universeId}`);
      return;
    }

    console.log(
      `✅ Universe stats updated: ${result.name} → ${field} is now ${result[field]}`,
    );
  } catch (error) {
    console.error("❌ Failed to process universe stats update:", error);
  }
};

module.exports = { update_universe_stats };
