const Resource = require("../models/resource");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const {
  fetchUserData,
  fetchNativeUserData,
  getUserMetaMap,
  scheduleNotification2,
} = require("./utilControllers");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");

//Controller 1
const createResource = async (req, res) => {
  try {
    const { title, description, url, metaData, universeMetaData } = req.body;

    // Validate required fields
    if (
      !title ||
      !description ||
      !url ||
      !metaData?.size ||
      !metaData?.uri ||
      !metaData?.mimeType
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Incomplete data for creating a resource.");
    }

    if (
      !universeMetaData ||
      !universeMetaData.name ||
      !universeMetaData.location ||
      !universeMetaData.logo ||
      !universeMetaData.callSign
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Incomplete universeMetaData provided.",
      });
    }

    // Fetch user metadata
    const publisherMetaData = await fetchUserData({
      id: req.user.id,
      fields: ["name", "image", "pushToken"],
    });

    // Create the resource
    const resource = await Resource.create({
      ...req.body,
      uid: req.user.uid,
      submittedBy: new mongoose.Types.ObjectId(req.user.id),
      publisherMetaData,
    });

    // Emit Kafka event
    await sendKafkaMessage("CREATE_RESOURCE", req.user.callSign, {
      userId: req.user.id,
      resourceId: resource._id.toString(),
    });

    return res.status(StatusCodes.CREATED).json(resource);
  } catch (error) {
    console.error("❌ Error in createResource:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot create resource.");
  }
};

//Controller 2
const getResources = async (req, res) => {
  try {
    const { id, batch = 1, batchSize = 10 } = req.query;
    const skip = (parseInt(batch) - 1) * parseInt(batchSize);

    const userMetaData = await fetchUserData({
      id: id,
      fields: ["universeMetaData"],
    });

    const user = await fetchNativeUserData({
      id,
      fields: ["resources"],
      callSign: userMetaData.universeMetaData.callSign,
    });

    if (!user || !user.resources || user.resources.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }

    // Reverse to prioritize recent ones
    const reversedResources = [...user.resources].reverse();

    // Apply pagination manually
    const paginatedResources = reversedResources
      .slice(skip, skip + parseInt(batchSize))
      .map((id) => new mongoose.Types.ObjectId(id));

    // Fetch corresponding resource data using aggregation
    const resources = await Resource.aggregate([
      {
        $match: {
          _id: { $in: paginatedResources },
        },
      },
      {
        $addFields: {
          totalReviews: { $size: "$reviews" },
          reviews: { $slice: ["$reviews", 6] },
        },
      },
    ]);

    // Optional: Reorder results to match paginatedResources order
    const resourcesMap = new Map(resources.map((r) => [r._id.toString(), r]));
    const orderedResources = paginatedResources.map((id) =>
      resourcesMap.get(id.toString())
    );

    return res.status(StatusCodes.OK).json(orderedResources);
  } catch (error) {
    console.error("Error fetching resources:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot fetch resources.");
  }
};

//Controller 3
const submitReview = async (req, res) => {
  const { msg, star, resourceId } = req.body;

  try {
    if (!msg || !star || !resourceId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Incomplete fields for review.");
    }

    const starRating = parseInt(star, 10);
    if (isNaN(starRating) || starRating < 1 || starRating > 5) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Star rating must be a number between 1 and 5.");
    }

    const review = {
      reviewId: `${new Date().toISOString()}_${req.user.id}`,
      userId: req.user.id,
      msg,
      star: starRating,
      timeStamp: new Date(),
    };

    const resource = await Resource.findByIdAndUpdate(
      resourceId,
      { $push: { reviews: { $each: [review], $position: 0 } } },
      { new: true }
    ).select("_id title submittedBy universeMetaData");

    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).send("Resource not found.");
    }

    const user_query = {
      id: req.user.id,
      fields: ["name", "image", "pushToken", "_id"],
    };
    const userInfo = await fetchUserData(user_query);

    await sendKafkaMessage(
      "RESOURCE_REVIEW_SECONDARY_ACTION",
      resource.universeMetaData.callSign,
      {
        resourceId,
        publisherId: resource.submittedBy.toString(),
        reviewerInfo: userInfo,
        resourceInfo: resource,
      }
    );

    return res.status(StatusCodes.OK).json(review);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot submit review.");
  }
};

//Controller 4
const getReviews = async (req, res) => {
  const { resourceId, batch = 1, batchSize = 1, remainder = 0 } = req.query;
  const skip = (batch - 1) * parseInt(batchSize, 10) + parseInt(remainder);

  try {
    const [resource] = await Resource.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(resourceId) } },
      {
        $project: {
          reviews: { $slice: ["$reviews", skip, parseInt(batchSize, 10)] },
        },
      },
    ]);

    if (
      !resource ||
      !Array.isArray(resource.reviews) ||
      resource.reviews.length === 0
    ) {
      return res.status(StatusCodes.OK).json([]);
    }

    const userIds = resource.reviews.map((r) => r.userId.toString());

    const userMetaMap = await getUserMetaMap(userIds, [
      "name",
      "image",
      "pushToken",
    ]);

    // Inject metadata into reviews
    const enrichedReviews = resource.reviews.map((review) => ({
      ...review,
      userMetaData: userMetaMap[review.userId.toString()] || null,
    }));

    return res.status(StatusCodes.OK).json(enrichedReviews);
  } catch (error) {
    console.error("Error fetching reviews:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot fetch reviews.");
  }
};

//Controller 5
const getResource = async (req, res) => {
  try {
    const { resourceId } = req.query;

    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid or missing resourceId.",
      });
    }

    const [resource] = await Resource.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(resourceId),
        },
      },
      {
        $addFields: {
          totalReviews: { $size: "$reviews" },
          reviews: { $slice: ["$reviews", 2] },
        },
      },
    ]);

    if (!resource) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Resource not found." });
    }

    return res.status(StatusCodes.OK).json(resource);
  } catch (error) {
    console.error("Error fetching resource:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot fetch resource.");
  }
};

//Controller 5
const logResourceDownload = async (req, res) => {
  try {
    const { resourceId } = req.query;
    const resource = await Resource.findByIdAndUpdate(
      resourceId,
      {
        $addToSet: { downloads: new mongoose.Types.ObjectId(req.user.id) },
      },
      {
        new: true,
        projection: { submittedBy: 1, title: 1 },
      }
    );
    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).send("Resource not found.");
    }
    const [publisher, reader] = await Promise.all([
      fetchUserData({
        id: resource.submittedBy,
        fields: ["name", "image", "pushToken"],
      }),
      fetchUserData({
        id: req.user.id,
        fields: ["name"],
      }),
    ]);
    if (!publisher || !reader) {
      console.error("Publisher or reader not found.");
      return res.status(StatusCodes.BAD_REQUEST).send("Invalid user data.");
    }
    scheduleNotification2({
      pushToken: [publisher.pushToken],
      title: "Resource downaloaded!",
      body: `${reader.name} downloaded your resource titled ${resource.title}`,
      url: `https://macbease.com/app/resources/${resourceId}`,
    });
    return res
      .status(StatusCodes.OK)
      .json({ msg: "Resource download successfully logged." });
  } catch (error) {
    console.error("Error logging resource download:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot log resource download.");
  }
};

//Controller 6
const searchResources = async (req, res) => {
  try {
    const { publisherId, query } = req.query;
    if (!publisherId || !query) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Missing query or publisherId.");
    }

    const words = query.split(/\s+/).filter(Boolean);
    const regexes = words.map((word) => new RegExp(word, "i"));

    const resources = await Resource.aggregate([
      {
        $match: {
          submittedBy: new mongoose.Types.ObjectId(publisherId),
          $or: [{ title: { $in: regexes } }, { description: { $in: regexes } }],
        },
      },
      {
        $addFields: {
          totalReviews: { $size: "$reviews" },
          reviews: { $slice: ["$reviews", 6] },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(resources);
  } catch (error) {
    console.error("Error searching resources:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot search resources.");
  }
};

//Controller 7
const deleteResource = async (req, res) => {
  try {
    const { resourceId } = req.query;
    const resource = await Resource.findById(resourceId, { submittedBy: 1 });
    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).send("Resource not found.");
    }
    if (resource.submittedBy.toString() !== req.user.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not allowed to delete this resource.");
    }
    await Resource.findByIdAndDelete(resourceId);

    // Emit Kafka event
    await sendKafkaMessage("DELETE_RESOURCE", req.user.callSign, {
      userId: req.user.id,
      resourceId: resource._id.toString(),
    });

    return res.status(StatusCodes.OK).send("Resource successfully deleted.");
  } catch (error) {
    console.error("Error deleting resource:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error deleting resource.");
  }
};

//Controller 8
const getRecommendedNotes = async (req, res) => {
  try {
    const resources = await Resource.aggregate([
      { $match: { access: "public" } }, // Only show public resources
      { $sample: { size: 12 } },
      {
        $addFields: {
          totalReviews: { $size: "$reviews" },
          reviews: { $slice: ["$reviews", 2] },
        },
      },
    ]);
    return res.status(200).json(resources);
  } catch (error) {
    console.error("Error finding recommended notes:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error finding recommended notes");
  }
};

//Controlelr 9
const searchFromAllResources = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== "string") {
      return res
        .status(400)
        .send("Query parameter is required and must be a string");
    }

    // Convert comma-separated string to array
    const keywords = query.split(",").map((word) => word.trim());

    // Build regex patterns
    const regexes = keywords.map((kw) => new RegExp(kw, "i"));

    // Now search using $or for fields, and $or within each field
    const resources = await Resource.find({
      $or: [
        { title: { $in: regexes } },
        { description: { $in: regexes } },
        { "publisherMetaData.name": { $in: regexes } },
      ],
    });
    return res.status(200).json(resources);
  } catch (error) {
    console.error("Error searching resources", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error searching resources");
  }
};

const getResourceById = async (req, res) => {
  try {
    const { id } = req.query;
    const resource = await Resource.findById(id, {
      submittedBy: 1,
      publisherMetaData: 1,
    });
    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).send("Resource not found.");
    }

    return res.status(StatusCodes.OK).json(resource);
  } catch (err) {
    console.log("Error fetching resource by id:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const getSampleResources = async (req, res) => {
  try {
    const resources = await Resource.aggregate([
      { $sample: { size: 6 } },
      { $project: { vector: 0 } }, // proper exclusion
    ]);

    return res.status(StatusCodes.OK).json(resources);
  } catch (error) {
    console.log("Error fetching sample resources", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

module.exports = {
  createResource,
  getResources,
  submitReview,
  getReviews,
  getResource,
  logResourceDownload,
  searchResources,
  deleteResource,
  getRecommendedNotes,
  searchFromAllResources,
  getResourceById,
  getSampleResources,
};
