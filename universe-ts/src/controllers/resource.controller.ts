import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import User from '../models/user.model';
import Resource from '../models/resource.model';
import { Request, Response } from 'express';
import { scheduleNotification2 } from './utils.controller';
import schedule from 'node-schedule';

/**
 * @desc    Create a new resource
 * @route   POST /resource
 * @access  User
 */
const createResource = async (req: Request, res: Response) => {
  try {
    const { title, description, url, metaData } = req.body;
    const userId = req.user.id;

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
        .json({ error: 'Incomplete data for creating a resource.' });
    }

    // Fetch user and ensure they exist
    const user = await User.findById(userId, { name: 1, image: 1, pushToken: 1, resources: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });
    }

    // Create new resource
    const resource = new Resource({
      title,
      description,
      url,
      metaData,
      submittedBy: new mongoose.Types.ObjectId(userId),
      publisherMetaData: {
        name: user.name,
        image: user.image,
        pushToken: user.pushToken,
      },
    });

    await resource.save();

    // Update user's resource list efficiently
    await User.updateOne({ _id: userId }, { $push: { resources: resource._id } });

    return res.status(StatusCodes.CREATED).json(resource);
  } catch (error) {
    console.error('Error creating resource:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot create resource. Please try again later.', error });
  }
};

/**
 * @desc Fetch paginated resources for a user
 * @route GET /resource
 * @access User, Admin
 */
const getResources = async (req: Request, res: Response) => {
  try {
    const { id, batch = '1', batchSize = '10' } = req.query;
    if (!mongoose.Types.ObjectId.isValid(id as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid user ID' });
    }

    const batchNumber = Math.max(parseInt(batch as string, 10), 1);
    const batchSizeNumber = Math.max(parseInt(batchSize as string, 10), 1);

    const user = await User.findById(id, {
      resources: { $slice: -batchSizeNumber * batchNumber },
    }).lean();
    if (!user || !user.resources?.length) {
      return res.status(StatusCodes.OK).json([]);
    }

    const paginatedResources = user.resources.slice(-batchSizeNumber).reverse();
    const resources = await Resource.aggregate([
      { $match: { _id: { $in: paginatedResources } } },
      {
        $addFields: {
          totalReviews: { $size: '$reviews' },
          reviews: { $slice: ['$reviews', 6] },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(StatusCodes.OK).json(resources);
  } catch (error) {
    console.error('Error fetching resources:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot fetch resources.', error });
  }
};

/**
 * @desc Submit a review for a resource
 * @route POST /resource/reviews/submit
 * @access User
 */
const submitReview = async (req: Request, res: Response) => {
  const { msg, star, resourceId } = req.body;

  if (!msg?.trim() || !star || !resourceId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Incomplete fields for review.' });
  }

  const starRating = Number(star);
  if (!Number.isInteger(starRating) || starRating < 1 || starRating > 5) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: 'Star rating must be an integer between 1 and 5.' });
  }

  if (!mongoose.Types.ObjectId.isValid(resourceId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid resource ID format.' });
  }

  const review = {
    reviewId: `${Date.now()}_${req.user.id}`,
    userId: req.user.id,
    msg: msg.trim(),
    star: starRating,
    timeStamp: new Date(),
  };

  try {
    const resource = await Resource.findById(resourceId, '_id title submittedBy');
    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Resource not found.' });
    }

    await Resource.updateOne(
      { _id: resourceId },
      { $push: { reviews: { $each: [review], $position: 0 } } },
    );

    secondaryActionForReviewSubmission(req, res, resource);
    return res.status(StatusCodes.CREATED).json(review);
  } catch (error) {
    console.error('Error submitting review:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Unable to submit review. Please try again later.', error });
  }
};

/**
 * @desc Handles secondary actions like notifications
 * @route Utility Function
 * @access Internal
 */
const secondaryActionForReviewSubmission = async (req: Request, res: Response, resource: any) => {
  try {
    const jobId = `review_${req.user.id}_${resource._id}`;
    const scheduleTime = new Date(Date.now() + 1000);
    schedule.scheduleJob(jobId, scheduleTime, async () => {
      const [publisher, reader] = await Promise.all([
        User.findById(resource.submittedBy, 'unreadNotice name pushToken image'),
        User.findById(req.user.id, 'name image pushToken'),
      ]);

      if (!publisher || !reader) {
        console.error('Publisher or reader not found.');
        return;
      }

      const notice = {
        value: `${reader.name} reviewed your resource titled ${resource.title}`,
        img1: publisher.image || null,
        img2: reader.image || null,
        key: 'read',
        action: 'profile2',
        params: {
          img: publisher.image || '',
          name: publisher.name,
          id: publisher._id as mongoose.Types.ObjectId,
          userPushToken: publisher.pushToken || '',
          secondaryImg: reader.image || '',
          active: 'Resources',
        },
        time: new Date(),
        uid: `${new Date()}/${resource._id}/${req.user.id}`,
      };
      publisher.unreadNotice = [notice, ...(publisher.unreadNotice || [])];
      await publisher.save();

      const safeEncode = (value: string | undefined) => encodeURIComponent(value || '');
      const secureUrl =
        `https://macbease.com/app/resources/${safeEncode(resource._id)}
        /${safeEncode(resource.submittedBy)}
        /${safeEncode(publisher.name)}
        /${safeEncode(publisher.pushToken)}
        /${safeEncode(publisher.image)}`.replace(/\s+/g, '');

      scheduleNotification2({
        pushToken: publisher.pushToken ? [publisher.pushToken] : [],
        title: 'Resource reviewed',
        body: `${reader.name} reviewed your resource titled ${resource.title}`,
        url: secureUrl,
      });
    });
  } catch (error) {
    console.error('Error in secondary action for review submission:', error);
  }
};

/**
 * @desc Fetch paginated reviews for a resource
 * @route GET /resource/reviews
 * @access User, Admin
 */
const getReviews = async (req: Request, res: Response) => {
  try {
    const { resourceId, batch = '1', batchSize = '10', remainder = '0' } = req.query;
    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid resource ID' });
    }

    const skip =
      (parseInt(batch as string, 10) - 1) * parseInt(batchSize as string, 10) +
      parseInt(remainder as string, 10);
    const limit = parseInt(batchSize as string, 10);

    const resource = await Resource.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(resourceId as string) } },
      { $project: { reviews: { $slice: ['$reviews', skip, limit] } } },
      { $unwind: { path: '$reviews', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'reviews.userId',
          foreignField: '_id',
          as: 'userMetaData',
        },
      },
      {
        $addFields: {
          'reviews.userMetaData': {
            $arrayElemAt: [
              {
                $map: {
                  input: '$userMetaData',
                  as: 'meta',
                  in: {
                    id: '$$meta._id',
                    name: '$$meta.name',
                    img: '$$meta.image',
                    pushToken: '$$meta.pushToken',
                  },
                },
              },
              0,
            ],
          },
        },
      },
      { $group: { _id: '$_id', reviews: { $push: '$reviews' } } },
    ]);

    const reviews =
      resource?.[0]?.reviews?.filter((review: any) => Object.keys(review).length) || [];
    return res.status(StatusCodes.OK).json(reviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Unable to fetch reviews', error });
  }
};

/**
 * @desc Fetches a specific resource with limited review details
 * @route GET /resource/:resourceId
 * @access Public
 */
const getResource = async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid resource ID' });
    }

    const resource = await Resource.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(resourceId) } },
      { $addFields: { totalReviews: { $size: '$reviews' }, reviews: { $slice: ['$reviews', 2] } } },
    ]);

    if (!resource.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Resource not found' });
    }

    return res.status(StatusCodes.OK).json(resource[0]);
  } catch (error) {
    console.error('Error fetching resource:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot fetch resource.', error });
  }
};

/**
 * @desc Logs a resource download and notifies the publisher
 * @route GET /resource/log-resource-download
 * @access User, Admin
 */
const logResourceDownload = async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.query;
    const userId = req.user.id;

    if (!resourceId || !mongoose.isValidObjectId(resourceId) || !mongoose.isValidObjectId(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid resource or user ID.' });
    }

    // Update resource downloads
    const resource = await Resource.findByIdAndUpdate(
      resourceId,
      { $addToSet: { downloads: new mongoose.Types.ObjectId(userId) } },
      { new: true, projection: { submittedBy: 1, title: 1 } },
    );

    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Resource not found.' });
    }

    // Fetch publisher and reader in a single query
    const users = await User.find(
      { _id: { $in: [resource.submittedBy, userId] } },
      { pushToken: 1, name: 1, image: 1 },
    ).lean();

    const publisher = users.find((user) => user._id.toString() === resource.submittedBy.toString());
    const reader = users.find((user) => user._id.toString() === userId.toString());

    if (!publisher || !reader) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'User data not found.' });
    }

    // Send notification only if publisher has a pushToken
    if (publisher.pushToken) {
      scheduleNotification2({
        pushToken: [publisher.pushToken],
        title: 'Resource Downloaded!',
        body: `${reader.name} downloaded your resource titled "${resource.title}"`,
        url: `https://macbease.com/app/resources/${resourceId}/${resource.submittedBy}/${encodeURIComponent(publisher.name)}/${encodeURIComponent(publisher.pushToken)}/${encodeURIComponent(publisher.image || '')}`,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Resource download logged successfully.' });
  } catch (error) {
    console.error('Error logging resource download:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot log resource download.', error });
  }
};

/**
 * @desc Search resources based on query and publisher ID
 * @route GET /resource/search
 * @access User, Admin
 */
const searchResources = async (req: Request, res: Response) => {
  try {
    const { publisherId, query } = req.query;

    // Validate required parameters
    if (!publisherId || !query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing query or publisherId' });
    }

    // Ensure publisherId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(publisherId as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid publisherId format' });
    }

    const words = (query as string).trim().split(/\s+/);
    if (words.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid search query' });
    }

    // Construct regex search pattern efficiently
    const regex = new RegExp(words.map((word) => `(?=.*${word})`).join(''), 'i');

    // Execute efficient query with indexed fields
    const resources = await Resource.aggregate([
      {
        $match: {
          submittedBy: new mongoose.Types.ObjectId(publisherId as string),
          $or: [{ title: { $regex: regex } }, { description: { $regex: regex } }],
        },
      },
      {
        $project: {
          title: 1,
          description: 1,
          submittedBy: 1,
          totalReviews: { $size: '$reviews' },
          reviews: { $slice: ['$reviews', 6] },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({ resources, count: resources.length });
  } catch (error) {
    console.error('Error searching resources:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot search resources', error });
  }
};

//Controller 7
/**
 * @desc Delete a resource
 * @route DELETE /resource/:resourceId
 * @access User, Admin
 */
const deleteResource = async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.params;

    // Validate resource ID
    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid resource ID.' });
    }

    // Find and delete resource in one step
    const resource = await Resource.findOneAndDelete({ _id: resourceId, submittedBy: req.user.id });

    if (!resource) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Resource not found or unauthorized.' });
    }

    // Remove resource reference from the user's list
    await User.findByIdAndUpdate(req.user.id, { $pull: { resources: resourceId } });

    return res.status(StatusCodes.OK).json({ message: 'Resource successfully deleted.' });
  } catch (error) {
    console.error('Error deleting resource:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Fetches 12 random recommended notes
 * @route GET /resource/notes/recommended
 * @access Public
 */
const getRecommendedNotes = async (req: Request, res: Response) => {
  try {
    const resources = await Resource.aggregate([{ $sample: { size: 12 } }]);
    return res.status(StatusCodes.OK).json(resources);
  } catch (error) {
    console.error('Error finding recommended notes', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error finding recommended notes', error });
  }
};

/**
 * @desc Searches resources by title, description, or publisher name
 * @route GET /resource/search-all
 * @access Public
 */
const searchFromAllResources = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Query parameter is required and must be a non-empty string' });
    }

    const regex = new RegExp(query, 'i');
    const resources = await Resource.find(
      { $or: [{ title: regex }, { description: regex }, { 'publisherMetaData.name': regex }] },
      'title description publisherMetaData',
    );

    return res.status(StatusCodes.OK).json(resources);
  } catch (error) {
    console.error('Error searching resources', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error searching resources', error });
  }
};

/**
 * @desc Get resources by ID
 * @route GET /resource/:id
 * @access Public
 */
const getResourceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Invalid resource ID." });
    }

    const resource = await Resource.findById(id, { submittedBy: 1, publisherMetaData: 1 });
    if (!resource) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Resource not found." });
    }

    return res.status(StatusCodes.OK).json(resource);
  } catch (err) {
    console.log("Error fetching resource by id:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong.", error: err });
  }
}

export {
  createResource,
  getResources,
  getResourceById,
  submitReview,
  getReviews,
  getResource,
  logResourceDownload,
  searchResources,
  deleteResource,
  getRecommendedNotes,
  searchFromAllResources,
};
