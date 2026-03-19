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
        const response = await axios.get(`${process.env.QUEST_SERVICE_URL}/quest/api/v1/getQuestsByIds`, {
            params: { questIds: questIds.join(",") },
            ...config
        });
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
                // Determine if it's discrete (array) or continuous (scalar)
                const isDiscrete = quest.type === 'discrete' && quest.numOfEntities > 1;
                const nEntities = isDiscrete ? quest.numOfEntities : 1;

                let startDate = null;
                const now = require("moment-timezone")().tz("Asia/Kolkata");

                if (quest.frequency === 'daily') {
                    startDate = now.startOf('day').toDate();
                } else if (quest.frequency === 'weekly') {
                    startDate = now.startOf('isoWeek').toDate();
                } else if (quest.frequency === 'monthly') {
                    startDate = now.startOf('month').toDate();
                }

                const pIndex = leader.progress.findIndex(p => p.questId.toString() === quest._id.toString());
                if (pIndex !== -1) {
                    const progress = leader.progress[pIndex];

                    // Reset logic for repeatable quests
                    if (quest.isRepeatable && progress.isCompleted && progress.completedAt) {
                        if (startDate && require("moment-timezone")(progress.completedAt).isBefore(startDate)) {
                            progress.isCompleted = false;
                            progress.completedAt = null;
                            progress.overallProgress = 0;
                            if (isDiscrete) {
                                progress.current = Array.from({ length: nEntities }, () => ({
                                    value: 0,
                                    isStarted: false,
                                    isCompleted: false
                                }));
                            } else {
                                progress.current = 0;
                            }
                            progress.isRewardClaimed = false;
                            progress.rewardClaimedAt = null;
                            console.log(`[ProgressSync] Reset repeatable quest ${quest.title} for ${leader.name}`);
                        }
                    }

                    const newValues = await resolveMetricValue(quest.metric, leader.uid, nEntities, startDate);

                    if (isDiscrete) {
                        // ARRAY-BASED PROGRESS (Discrete)
                        let completedEntities = 0;
                        if (!Array.isArray(progress.current)) {
                            progress.current = Array.from({ length: nEntities }, () => ({
                                value: 0,
                                isStarted: false,
                                isCompleted: false
                            }));
                        }
                        if (!Array.isArray(progress.target)) {
                            progress.target = Array.from({ length: nEntities }, () => quest.target);
                        }

                        for (let i = 0; i < nEntities; i++) {
                            const val = newValues[i] || 0;
                            const targetVal = progress.target[i] || quest.target;
                            progress.current[i] = {
                                value: val < targetVal ? val : targetVal,
                                isStarted: val > 0,
                                isCompleted: val >= targetVal
                            };
                            if (progress.current[i].isCompleted) {
                                completedEntities++;
                            }
                        }
                        console.log(progress.current);
                        progress.overallProgress = (completedEntities / nEntities) * 100;
                        const wasCompleted = progress.isCompleted;
                        progress.isCompleted = completedEntities === nEntities;
                        
                        if (progress.isCompleted && !wasCompleted) {
                            progress.completedAt = new Date();
                            console.log(`[ProgressSync] Quest Completed! ${quest.title} for ${leader.name}`);
                        }
                    } else {
                        // SCALAR-BASED PROGRESS (Continuous or Single-Entity Discrete)
                        const val = newValues[0] || 0;
                        const targetVal = typeof progress.target === 'number' ? progress.target : quest.target;

                        progress.current = val < targetVal ? val : targetVal;
                        progress.target = targetVal;
                        progress.overallProgress = (progress.current / targetVal) * 100;

                        const wasCompleted = progress.isCompleted;
                        progress.isCompleted = progress.current >= targetVal;

                        if (progress.isCompleted && !wasCompleted) {
                            progress.completedAt = new Date();
                            console.log(`[ProgressSync] Quest Completed! ${quest.title} for ${leader.name}`);
                        }
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
