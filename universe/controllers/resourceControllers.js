const { StatusCodes } = require("http-status-codes");
const User = require("../models/user");
const Resource = require("../models/resource");
const { scheduleNotification2 } = require("./utils");
const { default: mongoose } = require("mongoose");
const schedule = require("node-schedule");

//Controller 1
const createResource = async (req, res) => {
  try {
    const { title, description, url, metaData } = req.body;
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
    const publisherMetaData = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
      _id: 0,
    });
    const resource = await Resource.create({
      ...req.body,
      submittedBy: mongoose.Types.ObjectId(req.user.id),
      publisherMetaData,
    });
    const user = await User.findById(req.user.id, { resources: 1 });
    user.resources.push(resource._id);
    await user.save();
    return res.status(StatusCodes.CREATED).json(resource);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot create resource.");
  }
};

//Controller 2
const getResources = async (req, res) => {
  const { id, batch, batchSize } = req.query;
  const skip = (batch - 1) * batchSize;
  try {
    const user = await User.findById(id, { resources: 1 }).lean();
    if (!user || !user.resources) {
      return res.status(StatusCodes.OK).json([]);
    }
    const reversedResources = [...user.resources].reverse();
    const paginatedResources = reversedResources.slice(
      skip,
      skip + parseInt(batchSize, 10)
    );
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
      {
        $sort: { createdAt: -1 },
      },
    ]);
    return res.status(StatusCodes.OK).json(resources);
  } catch (error) {
    console.log("Error fetching resources:", error.message);
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
      star,
      timeStamp: new Date(),
    };
    const resource = await Resource.findByIdAndUpdate(
      resourceId,
      { $push: { reviews: { $each: [review], $position: 0 } } },
      { new: true, projection: { _id: 1, title: 1, submittedBy: 1 } }
    );
    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).send("Resource not found.");
    }
    secondaryActionForReviewSubmission(req, resource);
    return res.status(StatusCodes.OK).json(review);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot submit review.");
  }
};

//secondary actions for review submission
const secondaryActionForReviewSubmission = async (req, resource) => {
  try {
    const scheduleTime = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `review_${req.user.id}_${resource._id}`,
      scheduleTime,
      async () => {
        const publisher = await User.findById(resource.submittedBy, {
          unreadNotice: 1,
          name: 1,
          pushToken: 1,
          image: 1,
        });
        const reader = await User.findById(req.user.id, {
          name: 1,
          image: 1,
          pushToken: 1,
        });
        if (!publisher || !reader) {
          console.error("Publisher or reader not found.");
          return;
        }
        const notice = {
          value: `${reader.name} reviewed your resource titled ${resource.title}`,
          img1: publisher.image,
          img2: reader.image,
          key: "read",
          action: "profile2",
          params: {
            img: publisher.image,
            name: publisher.name,
            id: publisher._id,
            userPushToken: publisher.pushToken,
            active: "Resources",
          },
          time: new Date(),
          uid: `${new Date()}/${resource._id}/${req.user.id}`,
        };
        publisher.unreadNotice = [notice, ...publisher.unreadNotice];
        await publisher.save();
        scheduleNotification2({
          pushToken: [publisher.pushToken],
          title: "Resource reviewed",
          body: `${reader.name} reviewed your resource titled ${resource.title}`,
          url: `https://macbease.com/app/resources/${resource._id}`,
        });
      }
    );
  } catch (error) {
    console.error("Error in secondary action for review submission:", error);
  }
};

//Controller 4
const getReviews = async (req, res) => {
  const { resourceId, batch = 1, batchSize = 1, remainder = 0 } = req.query;
  const skip = (batch - 1) * parseInt(batchSize, 10) + parseInt(remainder);
  try {
    const [resource] = await Resource.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(resourceId) } },
      {
        $project: {
          reviews: { $slice: ["$reviews", skip, parseInt(batchSize, 10)] },
        },
      },
      { $unwind: { path: "$reviews", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "reviews.userId",
          foreignField: "_id",
          as: "userMetaData",
        },
      },
      {
        $addFields: {
          "reviews.userMetaData": {
            $arrayElemAt: [
              {
                $map: {
                  input: "$userMetaData",
                  as: "meta",
                  in: {
                    id: "$$meta._id",
                    name: "$$meta.name",
                    img: "$$meta.image",
                    pushToken: "$$meta.pushToken",
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          reviews: { $push: "$reviews" },
        },
      },
    ]);
    if (
      !resource ||
      !resource.reviews ||
      resource.reviews.length === 0 ||
      resource.reviews.every((review) => Object.keys(review).length === 0)
    ) {
      return res.status(StatusCodes.OK).json([]);
    }
    return res.status(StatusCodes.OK).json(resource.reviews);
  } catch (error) {
    console.log("Error fetching resources:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot fetch resources.");
  }
};

//Controller 5
const getResource = async (req, res) => {
  try {
    const { resourceId } = req.query;
    const resources = await Resource.aggregate([
      {
        $match: {
          _id: mongoose.Types.ObjectId(resourceId),
        },
      },
      {
        $addFields: {
          totalReviews: { $size: "$reviews" },
          reviews: { $slice: ["$reviews", 2] },
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(resources[0]);
  } catch (error) {
    console.log("Error fetching resource:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot fetch resources.");
  }
};

//Controller 5
const logResourceDownload = async (req, res) => {
  try {
    const { resourceId } = req.query;
    const resource = await Resource.findByIdAndUpdate(
      resourceId,
      {
        $addToSet: { downloads: mongoose.Types.ObjectId(req.user.id) },
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
      User.findById(resource.submittedBy, {
        pushToken: 1,
        name: 1,
        image: 1,
      }).lean(),
      User.findById(req.user.id, {
        name: 1,
      }).lean(),
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
      .send("Resource download successfully logged.");
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
    await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { resources: mongoose.Types.ObjectId(resourceId) } },
      { new: true }
    );
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
    const resources = await Resource.aggregate([{ $sample: { size: 12 } }]);
    return res.status(200).json(resources);
  } catch (error) {
    console.error("Error finding recommended notes", error.message);
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
