const schedule = require("node-schedule")
const axios = require("axios")
const jwt = require("jsonwebtoken");
const ChapterLeader = require("../models/chapterLeader");
const { resolveMetricValue } = require("../controllers/utils");

const generateServiceToken = () => {
    const token = jwt.sign(
        {
            service: "universe",
            role: "internal",
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "5m" }
    );
    return {
        headers: {
            authorization: `Bearer ${token}`,
        },
    };
}

async function getQuests(questIds) {
    if (!questIds || questIds.length === 0) return [];

    const config = generateServiceToken();
    try {
        const response = await axios.post(`${process.env.QUEST_SERVICE_URL}/quest/api/v1/getQuestsByIds`, {
            questIds
        }, config);
        return response.data?.quests || [];
    } catch (error) {
        console.error("[ProgressSync] Error fetching quests:", error.message);
        return [];
    }
}

async function updateAllLeadersProgress() {
    try {
        console.log("[ProgressSync] Starting background progress update...");
        const leaders = await ChapterLeader.find({ isVerified: true });
        console.log(`[ProgressSync] Found ${leaders.length} verified active leaders.`);

        for (const leader of leaders) {
            console.log(`[ProgressSync] Updating progress for: ${leader.name} (${leader.uid})`);

            if (!leader.progress || leader.progress.length === 0) continue;

            const questIds = leader.progress.map(p => p.questId.toString());
            const quests = await getQuests(questIds);

            for (const quest of quests) {
                if(quest.entity !== "Club" && quest.entity !== "Community") continue;
                // Determine if it's discrete (array) or continuous (scalar)
                const isDiscrete = quest.type === 'discrete' && quest.entityLimit > 1;
                

                const pIndex = leader.progress.findIndex(p => p.questId.toString() === quest._id.toString());
                if (pIndex !== -1) {
                    const progress = leader.progress[pIndex];

                    // Case 1: (isDiscrete & entityLimit > 1)
                    // Case 2: (continuous and entityLimit = 0)
                    // Case 3: (continuous and entityLimit is 1)

                    const nEntities = quest.entityLimit > 1 ? quest.entityLimit : 1;
                    const newValues = await resolveMetricValue(quest.metric, leader.uid, nEntities);

                    const wasCompleted = progress.isCompleted;

                    if (quest.type === 'discrete' && quest.entityLimit > 1) {
                        // Case 1: Discrete Multiple
                        let completedEntities = 0;
                        for (let i = 0; i < nEntities; i++) {
                            const val = newValues[i] || 0;
                            const targetVal = quest.target;
                            if (val >= targetVal) {
                                completedEntities++;
                            }
                        }
                        progress.value = completedEntities;
                        progress.overallProgress = Math.min((completedEntities / nEntities) * 100, 100);
                        progress.isCompleted = completedEntities === nEntities;
                    } 
                    else if (quest.type === 'continuous' && quest.entityLimit === 0) {
                        // Case 2: Continuous Total (Limit 0)
                        const val = newValues[0] || 0;
                        const targetVal = quest.target;
                        progress.value = val >= targetVal ? targetVal : val;
                        progress.overallProgress = Math.min((progress.value / targetVal) * 100, 100);
                        progress.isCompleted = val >= targetVal;
                    }
                    else {
                        // Case 3: Continuous Single (Limit 1) or Discrete Single
                        const val = newValues[0] || 0;
                        const targetVal = quest.target;
                        progress.value = val >= targetVal ? targetVal : val;
                        progress.overallProgress = Math.min((progress.value / targetVal) * 100, 100);
                        progress.isCompleted = val >= targetVal;
                    }

                    if (progress.isCompleted && !wasCompleted) {
                        progress.completedAt = new Date();
                        console.log(`[ProgressSync] Quest Completed! ${quest.title} for ${leader.name}`);
                    }

                    progress.lastUpdatedAt = new Date();
                }
            }

            leader.markModified("progress");
            // Loop through progress to find if any quests were missing from the API
            for (const p of leader.progress) {
                if (!quests.some(q => q._id.toString() === p.questId.toString())) {
                    console.warn(`[ProgressSync] Quest ${p.questId} missing from API response for leader ${leader.name}`);
                }
            }

            await leader.save();
            console.log(`[ProgressSync] Saved progress for ${leader.name}`);
        }
        console.log("[ProgressSync] Finished background progress update.");
    } catch (error) {
        console.error("[ProgressSync] Error in updateAllLeadersProgress:", error);
    }
}

// Run a job every minute (as per user's current setting in the file)
schedule.scheduleJob('*/1 * * * *', async () => {
    const start = Date.now();
    try {
        // await updateAllLeadersProgress();
        const duration = Date.now() - start;
        console.log(`✅ Progress update completed in ${duration} ms (${(duration / 1000).toFixed(2)} sec)`);
    } catch (err) {
        const duration = Date.now() - start;
        console.error(`❌ Progress update failed after ${duration} ms`, err);
    }
});

module.exports = {
    schedule
}
