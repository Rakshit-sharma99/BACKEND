const ChapterLeader = require("../../../models/chapterLeader");

const universe_created = async (messageValue) => {
    const data = JSON.parse(messageValue);
    const { chapterLeaderId, universeId, universeMetaData } = data;
    if (!chapterLeaderId || !universeId) {
        console.warn("Missing data to assign universe to chapterleader");
        return;
    }
    const chapterLeader = await ChapterLeader.findById(chapterLeaderId);
    if (!chapterLeader) {
        console.log("Chapter leader not found");
        return;
    }
    chapterLeader.uid = universeId;
    chapterLeader.universeMetaData = universeMetaData;
    await chapterLeader.save();
    console.log("✅ Universe added to chapter leader");
}

module.exports = {
    universe_created
};
