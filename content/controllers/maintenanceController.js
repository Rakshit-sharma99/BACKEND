const Content = require("../models/content");

exports.bulkUpdateContentParams = async (req, res) => {
    try {
        const cursor = Content.find().cursor();
        let count = 0;
        let updatedCount = 0;

        for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
            let isUpdated = false;

            // Ensure params object exists
            if (!doc.params) {
                doc.params = {};
            }

            // Check and copy uid
            if (doc.uid && !doc.params.uid) {
                doc.params.uid = doc.uid;
                isUpdated = true;
            }

            // Check and copy universeMetaData
            if (doc.universeMetaData && !doc.params.universeMetaData) {
                doc.params.universeMetaData = doc.universeMetaData;
                isUpdated = true;
            }

            if (isUpdated) {
                // Use updateOne to bypass validation for other fields (e.g., missing required comments.text)
                await Content.updateOne({ _id: doc._id }, { $set: { params: doc.params } });
                updatedCount++;
            }
            count++;
        }

        res.status(200).json({
            success: true,
            message: "Bulk update completed.",
            totalProcessed: count,
            totalUpdated: updatedCount,
        });
    } catch (error) {
        console.error("Bulk update error:", error);
        res.status(500).json({
            success: false,
            message: "Bulk update failed.",
            error: error.message,
        });
    }
};

exports.manualUpdateContentParams = async (req, res) => {
    try {
        const { contentId } = req.query; // Or req.params depending on route setup
        const { uid, universeMetaData } = req.body;

        if (!contentId) {
            return res.status(400).json({
                success: false,
                message: "Please provide contentId query parameter.",
            });
        }

        const content = await Content.findOne({ _id: contentId });

        if (!content) {
            return res.status(404).json({
                success: false,
                message: "Content not found.",
            });
        }

        if (!content.params) {
            content.params = {};
        }

        if (uid) content.params.uid = uid;
        if (universeMetaData) content.params.universeMetaData = universeMetaData;

        // Use updateOne to bypass validation
        await Content.updateOne({ _id: content._id }, { $set: { params: content.params } });

        res.status(200).json({
            success: true,
            message: "Content params updated successfully.",
            data: content,
        });
    } catch (error) {
        console.error("Manual update error:", error);
        res.status(500).json({
            success: false,
            message: "Manual update failed.",
            error: error.message,
        });
    }
};
