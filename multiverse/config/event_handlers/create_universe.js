const Universe = require("../../models/universe");
const { sendKafkaMessage } = require("../utils/sendKafkaMessage")
const create_universe = async (messageValue) => {
    try {
        const data = JSON.parse(messageValue);

        const existing = await Universe.findOne({ callSign: data.callSign });
        if (existing) {
            console.log("Universe with this callSign already exists");
            return;
        }

        const universe = await Universe.create(data);

        await sendKafkaMessage(
            "UNIVERSE_CREATED",
            "universe",
            {
                chapterLeaderId: data.chapterLeaderId,
                universeId: universe._id,
                universeMetaData : {
                    name : universe.name,
                    logo : universe.logo,
                    logoKey : universe.logoKey,
                    callSign : universe.callSign,
                    location : universe.location,
                    lat: universe.lat,
                    lng : universe.lng
                }
            }
        )
        console.log("✅ Universe created successfully");
    } catch (error) {
        console.log(error);
        console.log("📩 Failed to process create universe topic");
    }
}

module.exports = { create_universe };