const community = require("../../../models/community");

const update_community = async(messageValue) => {
    try {
        const { newBadgeIds, organisationId } = JSON.parse(messageValue);

        const communityData = await community.findById(organisationId, { unusedBadges: 1 });

        if (communityData) {
            communityData.unusedBadges = [...newBadgeIds, ...communityData.unusedBadges];
            await communityData.save();
        } else {
            console.warn(`Community with ID ${organisationId} not found.`);
        }
    } catch (error) {
        console.error("❌ Failed to process update community topic:", error);
    }
}

module.exports = { update_community };