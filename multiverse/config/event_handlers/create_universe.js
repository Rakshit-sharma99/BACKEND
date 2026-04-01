const Universe = require("../../models/universe");

const create_universe = async (messageValue) => {
    try {
        console.log("📩 Processing create universe topic");
        console.log(messageValue);
        const data = JSON.parse(messageValue);

        const existing = await Universe.findOne({ callSign: data.callSign });
        if (existing) {
            console.log("Universe with this callSign already exists");
            return;
        }

        await Universe.create(data);
        console.log("✅ Universe created successfully");
    } catch (error) {
        console.log(error);
        console.log("📩 Failed to process create universe topic");
    }
}

module.exports = { create_universe };