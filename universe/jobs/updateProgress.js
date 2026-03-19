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
        const leaders = await ChapterLeader.find({ isActive: true, isVerified: true });
        console.log(`[ProgressSync] Found ${leaders.length} verified active leaders.`);

        for (const leader of leaders) {
            console.log(`[ProgressSync] Updating progress for: ${leader.name} (${leader.uid})`);

            if (!leader.progress || leader.progress.length === 0) continue;

            const questIds = leader.progress.map(p => p.questId.toString());
            const quests = await getQuests(questIds);

            for (const quest of quests) {
                const nEntities = quest.numOfEntities || 1;
                const newValues = await resolveMetricValue(quest.metric, leader.uid, nEntities);
                const pIndex = leader.progress.findIndex(p => p.questId.toString() === quest._id.toString());

                if (pIndex !== -1) {
                    const progress = leader.progress[pIndex];
                    let completedEntities = 0;

                    // Ensure progress arrays are initialized
                    if (!progress.current || progress.current.length === 0) {
                        progress.current = Array.from({ length: nEntities }, () => ({
                            value: 0,
                            isStarted: false,
                            isCompleted: false
                        }));
                    }
                    if (!progress.target || progress.target.length === 0) {
                        progress.target = Array.from({ length: nEntities }, () => quest.target);
                    }

                    for (let i = 0; i < nEntities; i++) {
                        const val = newValues[i] || 0;
                        const targetVal = progress.target[i] || quest.target;

                        progress.current[i] = {
                            value: val,
                            isStarted: val > 0,
                            isCompleted: val >= targetVal
                        };

                        if (progress.current[i].isCompleted) {
                            completedEntities++;
                        }
                    }

                    progress.overallProgress = (completedEntities / nEntities) * 100;
                    const wasCompleted = progress.isCompleted;
                    progress.isCompleted = completedEntities === nEntities;

                    if (progress.isCompleted && !wasCompleted) {
                        progress.completedAt = new Date();
                        console.log(`[ProgressSync] Quest Completed! ${quest.title} for ${leader.name}`);
                    }
                    progress.lastUpdatedAt = new Date();
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

// Run a job every 10 minutes
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
