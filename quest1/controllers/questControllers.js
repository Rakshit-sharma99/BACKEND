const { StatusCodes } = require("http-status-codes");
const { Quest, QUEST_METRICS, ENTITY_TYPES } = require("../models/quest");

const createQuest = async (req, res) => {
    try {
        const user = req.user;

        const {
            title,
            description,
            logo,
            ip,
            metric,
            target,
            isRepeatable = false,
        } = req.body;

        if(user.role !== "admin") {
            return res.status(StatusCodes.FORBIDDEN).json({
                message: "You do not have permission to create quests.",
            });
        }
        
        // Basic required field validation
        if (!title || !description || !logo || ip === undefined || !metric || !target || !universeMetaData) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: "Missing required fields.",
            });
        }

        // Metric validation
        if (!QUEST_METRICS.includes(metric)) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: `Invalid metric. Allowed metrics: ${QUEST_METRICS.join(", ")}`,
            });
        }

        // Target validation
        if (!target.entities || !target.entity) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: "Target must include 'entities' and 'entity'.",
            });
        }

        if (!ENTITY_TYPES.includes(target.entity)) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: `Invalid target entity. Allowed types: ${ENTITY_TYPES.join(", ")}`,
            });
        }

        if (typeof target.entities !== "number" || target.entities < 1) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: "Target.entities must be a number greater than 0.",
            });
        }

        // Config sanitization
        const config = target.config || {};

        const quest = new Quest({
            title,
            description,
            logo,
            ip,
            metric,
            target: {
                entities: target.entities,
                entity: target.entity,
                config: {
                    minMembers: config.minMembers ?? null,
                    minEvents: config.minEvents ?? null,
                    minPosts: config.minPosts ?? null,
                    minLikes: config.minLikes ?? null,
                    minComments: config.minComments ?? null,
                },
            },
            isRepeatable,
        });

        await quest.save();

        return res.status(StatusCodes.CREATED).json({
            message: "Quest created successfully!",
            quest,
        });

    } catch (error) {
        console.error("Create Quest Error:", error);

        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: "Failed to create quest.",
            error: error.message,
        });
    }
};

const updateQuest = async (req, res) => {
    try {
        res.status(StatusCodes.OK).json({
            message: "Quest updated successfully!"
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: "Failed to update quest.",
            error: error.message
        });
    }
};

const deleteQuest = async (req, res) => {
    try {
        res.status(StatusCodes.OK).json({
            message: "Quest deleted successfully!"
        });
    } catch (error) {

        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: "Failed to delete quest.",
            error: error.message
        });
    }

};

const getQuests = async (req, res) => {
    try {
        res.status(StatusCodes.OK).json({
            message: "Quests retrieved successfully!"
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: "Failed to retrieve quests.",
            error: error.message
        });
    }
};

const getQuestById = async (req, res) => {
    try {
        res.status(StatusCodes.OK).json({
            message: "Quest retrieved successfully!"
        });
    }
    catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: "Failed to retrieve quest.",
            error: error.message
        });
    }
};

module.exports = {
    createQuest,
    updateQuest,
    deleteQuest,
    getQuests,
    getQuestById
};