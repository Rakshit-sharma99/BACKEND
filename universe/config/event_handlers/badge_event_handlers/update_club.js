const club = require("../../../models/club");

const update_club = async(messageValue) => {
    try{
        const { newBadgeIds, organisationId } = JSON.parse(messageValue);

        const clubData = await club.findById(organisationId, { unusedBadges: 1 });

        if (clubData) {
            clubData.unusedBadges = [...newBadgeIds, ...clubData.unusedBadges];
            await clubData.save();
        } else {
            console.warn(`Club with ID ${organisationId} not found.`);
        }
    }catch(error){
        console.error("❌ Failed to process update club topic:", error);
    }
}

module.exports = { update_club };