import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import User from '../models/user.model';
import Card from '../models/card.model';
import Resource from '../models/resource.model';
import Club from '../models/club.model';
import Community from '../models/community.model';
import Event from '../models/event.model';
import schedule from 'node-schedule';
import { OpenAI } from 'openai';
import { lemmatize, getRelatedTags } from './common.controller';
import macbeaseContent from '../models/macbeaseContent.model';
import content from '../models/content.model';
import dotenv from 'dotenv';
dotenv.config();
/**
 * @desc Get users with related interests
 * @route Utility Function
 * @access Internal
 */
async function getRelatedUsersForFeed(query: string[]) {
  const finalData = await getRelatedTags(query);
  const pipeline = [
    {
      $match: {
        interests: { $in: finalData.map((interest) => new RegExp(interest, 'i')) },
      },
    },
    {
      $group: {
        _id: null,
        uniqueUsers: { $addToSet: '$_id' },
      },
    },
    {
      $project: { _id: 0, uniqueUsers: 1 },
    },
  ];

  const result = await User.aggregate(pipeline);
  return result.length ? result[0].uniqueUsers : [];
}

// Controller 1
/**
 *
 * @desc Create a new Card
 * @route POST /card
 * @access Users
 */
const createCard = async (req: Request, res: Response) => {
  if (req.user.role !== 'user') {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to create cards.' });
  }

  const { value, tags } = req.body;
  if (!value || !tags || !Array.isArray(tags)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid input data.' });
  }

  try {
    const lemmatizedTags = lemmatize(tags);
    const userInfo = await User.findById(req.user.id, 'name image pushToken course');

    if (!userInfo) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }

    const card = await Card.create([
      {
        value,
        tags: lemmatizedTags,
        creator: req.user.id,
        time: new Date(),
        userMetaData: userInfo,
      },
    ]);
    await User.findByIdAndUpdate(req.user.id, { $push: { cards: card[0]._id } });

    // Schedule feed update asynchronously
    schedule.scheduleJob(`feedCard_${req.user.id}`, new Date(Date.now() + 3000), async () => {
      const relatedUsers = await getRelatedUsersForFeed(lemmatizedTags);
      const users = await User.find({ _id: { $in: relatedUsers } }, 'cardFeed');

      const bulkOperations = users.map((user) => ({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              cardFeed: [
                {
                  ...card[0].toObject(),
                  creatorName: userInfo.name,
                  creatorPic: userInfo.image,
                  userPushToken: userInfo.pushToken,
                },
                ...(user.cardFeed?.slice(-6) || []),
              ],
            },
          },
        },
      }));

      if (bulkOperations.length > 0) {
        await User.bulkWrite(bulkOperations);
      }
    });

    return res
      .status(StatusCodes.CREATED)
      .json({ message: 'Card created successfully.', card: card[0] });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error creating card.', error });
  }
};

// Controller 2
/**
 * @desc Delete a card (Only users and admins can delete)
 * @route DELETE /card/:cardId
 * @access User, Admin
 */
const deleteCard = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'user')) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to delete cards.' });
    }

    const { cardId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid card ID.' });
    }

    await Card.findByIdAndDelete(cardId);
    await User.findByIdAndUpdate(req.user.id, { $pull: { cards: cardId } });

    return res.status(StatusCodes.OK).json({ message: 'Card successfully deleted.' });
  } catch (error) {
    console.error('Error deleting card:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Server error while deleting the card.', error });
  }
};

// Controller 3
/**
 * @desc Like a card (Users only)
 * @route PATCH /card/like-card
 * @access User
 */
const likeACard = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to like a card.' });
    }

    const { cardId, creatorId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(cardId) || !mongoose.Types.ObjectId.isValid(creatorId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Invalid card ID or creator ID.' });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { likedCards: cardId },
      $push: {
        notifications: {
          key: 'likedACard',
          value: 'You liked a card.',
          data: { cardId, creatorId },
        },
      },
    });

    await User.findByIdAndUpdate(creatorId, {
      $push: {
        notifications: {
          key: 'likedACard',
          value: 'Someone liked your card.',
          data: { cardId, userId: req.user.id },
        },
      },
    });

    await Card.findByIdAndUpdate(cardId, { $addToSet: { likedBy: req.user.id } });

    return res.status(StatusCodes.OK).json({ message: 'Card liked successfully.' });
  } catch (error) {
    console.error('Error liking card:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error liking the card.', error });
  }
};

// Controller 4
/**
 * @desc Get liked cards (Users only)
 * @route GET /card/liked?key=detail&batch=3&batchSize=10
 * @access User
 */
const getLikedCards = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'user') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to view liked cards.' });
    }

    const { key, batch = 1, batchSize = 12 } = req.query;
    const batchNumber = Math.max(Number(batch), 1);
    const batchSizeNumber = Math.max(Number(batchSize), 1);

    const user = await User.findById(req.user.id).select('likedCards').lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }

    if (key === 'detail') {
      const cardIds = user.likedCards.slice(
        (batchNumber - 1) * batchSizeNumber,
        batchNumber * batchSizeNumber,
      );
      const cards = await Card.find({ _id: { $in: cardIds } })
        .select('-vector')
        .lean();
      return res.status(StatusCodes.OK).json(cards);
    }

    return res.status(StatusCodes.OK).json({ likedCards: user.likedCards });
  } catch (error) {
    console.error('Error fetching liked cards:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching liked cards.', error });
  }
};

// Controller 5
/**
 * @desc Get a card by ID
 * @route GET /card/:cardId
 * @access Public
 */
const getCardFromId = async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    if (!mongoose.isValidObjectId(cardId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid card ID.' });
    }

    const card = await Card.findById(cardId).lean();
    if (!card) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Card not found.' });
    }

    return res.status(StatusCodes.OK).json(card);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching card.', error });
  }
};

// Controller 6
/**
 * @desc    Get all cards of a specific user
 * @route   GET /card/user-cards
 * @access  User, Admin
 */
const getCardsOfUser = async (req: Request, res: Response) => {
  const { userId } = req.query;

  // Validate userId
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid user ID' });
  }

  // Fetch user with cards
  const user = await User.findById(userId).select('cards').lean();
  if (!user) {
    return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });
  }

  // Return early if user has no cards
  if (!user.cards?.length) {
    return res.status(StatusCodes.OK).json({ message: 'No cards found', cardData: [] });
  }

  // Fetch card details excluding 'vector' field
  const cardData = await Card.find({ _id: { $in: user.cards } })
    .select('-vector')
    .lean();

  return res.status(StatusCodes.OK).json({ cardData });
};

// Controller 7
/**
 * @desc Get all cards based on tag
 * @route GET /card/tag/:tag
 * @access Public
 */
const getCardsFromTag = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tag } = req.params;
    if (!tag) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Tag parameter is required.' });
    }

    const cards = await Card.find({ tags: new RegExp(tag, 'i') })
      .sort({ time: -1 })
      .lean();
    const finalData = await Promise.all(
      cards.map(async (card) => {
        const userInfo = await User.findById(card.creator, { name: 1, image: 1, _id: 0 }).lean();
        return { ...card.toObject(), creatorName: userInfo?.name, creatorPic: userInfo?.image };
      }),
    );

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching cards.', error });
  }
};

// Controller 8
/**
 * @desc Save user interests
 * @route PUT /card/interests
 * @access User
 */
const saveInterest = async (req: Request, res: Response): Promise<Response> => {
  if (req.user.role !== 'user') {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized action.' });
  }

  try {
    const { interests } = req.body;
    if (!interests || !Array.isArray(interests)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid interests format.' });
    }

    const lemmatizedInterests = lemmatize(interests);
    await User.findByIdAndUpdate(req.user.id, { interests: lemmatizedInterests }, { new: true });

    return res.status(StatusCodes.OK).json({ message: 'Successfully updated interests.' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error saving interests.', error });
  }
};

// Controller 9
/**
 * @desc Get user interests & associated cards
 * @route GET /card/interests
 * @access User
 */
const getYourInterests = async (req: Request, res: Response): Promise<Response> => {
  if (req.user.role !== 'user') {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized action.' });
  }

  try {
    const user = await User.findById(req.user.id, 'name image interests cards').lean();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });

    const cards = await Card.find({ _id: { $in: user.cards } }).lean();

    return res.status(StatusCodes.OK).json({ profile: user, cardData: cards });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error finding interests', error });
  }
};

// Controller 10
/**
 * @desc Get all cards
 * @route GET /card/all
 * @access Public
 */
const getAllCards = async (req: Request, res: Response): Promise<Response> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    if (limit < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Limit must be greater than 1.' });
    }

    const cards = await Card.find({}).limit(limit).lean();
    const finalData = await Promise.all(
      cards.map(async (card) => {
        const userInfo = await User.findById(card.creator, { name: 1, image: 1, _id: 0 }).lean();
        return { ...card, creatorName: userInfo?.name, creatorPic: userInfo?.image };
      }),
    );

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching all cards.', error });
  }
};

// Controller 11
/**
 * @desc Unlike a card (Users only)
 * @route PATCH /card/unlike-card/
 * @access User
 */
const unlikeACard = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to unlike a card.' });
    }

    const { cardId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid card ID.' });
    }

    await User.findByIdAndUpdate(req.user.id, { $pull: { likedCards: cardId } });
    await Card.findByIdAndUpdate(cardId, { $pull: { likedBy: req.user.id } });

    return res.status(StatusCodes.OK).json({ message: 'Card unliked successfully.' });
  } catch (error) {
    console.error('Error unliking card:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error unliking the card.', error });
  }
};

// Controller 12
/**
 * @desc Get user bio by ID
 * @route GET /card/bio/:userId
 * @access User, Admin
 */
const getUserBio = async (req: Request, res: Response): Promise<Response> => {
  if (!['user', 'admin'].includes(req.user.role ?? '')) {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized action.' });
  }

  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid user ID.' });
    }

    const user = await User.findById(userId, 'name image course communitiesPartOf').lean();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });

    return res.status(StatusCodes.OK).json({
      name: user.name,
      image: user.image,
      course: user.course,
      clubsNo: user.communitiesPartOf?.length || 0,
    });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error finding user bio', error });
  }
};

// Controller 13
/**
 * @desc Get people related to user based on interests
 * @route GET /card/related-people
 * @access User
 */
const getPeopleRelatedToYou = async (req: Request, res: Response): Promise<Response> => {
  try {
    let dataPoints: string[] = [];
    if (req.query.interests) {
      try {
        dataPoints = JSON.parse(req.query.interests as string);
        if (!Array.isArray(dataPoints)) throw new Error();
      } catch {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid interests format.' });
      }
    } else {
      const user = await User.findById(req.user.id, 'interests').lean();
      dataPoints = user?.interests || [];
    }

    if (dataPoints.length === 0) {
      return res.status(StatusCodes.OK).json({ message: 'No related users found.' });
    }

    const relatedTags = await getRelatedTags(dataPoints);
    const users = await User.find(
      { interests: { $in: relatedTags } },
      'name image _id pushToken course',
    ).lean();

    const uniqueUsers = Array.from(
      new Map(users.map((user) => [user._id.toString(), user])).values(),
    );
    const sampleUsers = await User.aggregate([
      { $sample: { size: 6 } },
      { $project: { name: 1, image: 1, _id: 1, pushToken: 1, course: 1 } },
    ]);

    return res.status(StatusCodes.OK).json([...sampleUsers, ...uniqueUsers]);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error finding related users.', error });
  }
};

// Controller 14
/**
 * @desc Fetch 15 random cards along with creator details
 * @route GET /card/random
 * @access Public
 */
const getRandomCards = async (req: Request, res: Response): Promise<Response> => {
  try {
    const cards = await Card.aggregate([
      {
        $match: {
          $and: [{ value: { $exists: true } }, { value: { $ne: null } }, { value: { $ne: '' } }],
        },
      },
      { $sample: { size: 15 } },
      {
        $lookup: {
          from: 'users',
          localField: 'creator',
          foreignField: '_id',
          as: 'creatorDetails',
        },
      },
      {
        $project: {
          vector: 0,
          value: 1,
          creator: 1,
          'creatorDetails.name': 1,
          'creatorDetails.image': 1,
          'creatorDetails.pushToken': 1,
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching random cards', error });
  }
};

// Controller 15
/**
 * @desc Fetches personalized indexed feed for users based on query and mode.
 * @route POST /card/indexed-return
 * @access User
 */
const indexedReturn = async (req: Request, res: Response) => {
  try {
    const { query, mode, updatedVersion } = req.body;
    const userId = req.user.id;
    if (!query || !userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing required fields' });
    }

    // Fetch user data in parallel
    const [user, lemmatizedTags] = await Promise.all([
      User.findById(userId, { cardFeed: 1 }).lean(),
      lemmatize(query),
    ]);

    const cardFeed = user?.cardFeed || [];
    let allTags = await getRelatedTags(lemmatizedTags);
    if (allTags.length > 12) {
      allTags = allTags.sort(() => Math.random() - 0.5).slice(0, 12);
    }
    const regexPatterns = allTags.map((str) => new RegExp(str, 'i'));

    // Fetch related data in parallel
    const fetchPromises = [
      Card.aggregate([
        {
          $match: {
            tags: { $in: allTags },
            $and: [{ value: { $exists: true } }, { value: { $ne: null } }, { value: { $ne: '' } }],
          },
        },
        { $project: { vector: 0 } },
        { $limit: 30 },
      ]),
      Card.aggregate([
        {
          $match: {
            $and: [{ value: { $exists: true } }, { value: { $ne: null } }, { value: { $ne: '' } }],
          },
        },
        { $sample: { size: 12 } },
        { $project: { vector: 0 } },
      ]),
      Resource.find({
        $or: [{ title: { $in: regexPatterns } }, { description: { $in: regexPatterns } }],
      }).lean(),
      Resource.aggregate([{ $sample: { size: 6 } }]),
      User.find(
        { profession: 'Professor', course: { $in: regexPatterns } },
        { name: 1, image: 1, pushToken: 1, course: 1 },
      ),
      User.aggregate([
        { $match: { profession: 'Professor' } },
        { $sample: { size: 6 } },
        { $project: { name: 1, image: 1, pushToken: 1, course: 1 } },
      ]),
      Event.aggregate([
        { $sort: { eventDate: -1 } },
        { $limit: 6 },
        {
          $lookup: {
            from: 'itineraries',
            localField: '_id',
            foreignField: 'eventId',
            as: 'itineraries',
          },
        },
        { $project: { bookedBy: 0 } },
      ]),
      Club.aggregate([
        { $match: { members: { $ne: userId } } },
        { $project: { secondaryImg: 1, name: 1, tags: 1, motto: 1, _id: 1 } },
        { $sample: { size: 6 } },
      ]),
      Community.aggregate([
        { $match: { members: { $ne: userId } } },
        { $project: { secondaryCover: 1, title: 1, tag: 1, activeMembers: 1, label: 1, _id: 1 } },
        { $sample: { size: 6 } },
      ]),
    ];

    const [
      relatedCards,
      randomCards,
      resources,
      randomResources,
      professors,
      randomProfessors,
      events,
      clubs,
      communities,
    ] = await Promise.all(fetchPromises);

    // Process cards efficiently
    const uniqueCardIds = new Set(cardFeed.map((card) => card._id.toString()));
    const transformedCards = relatedCards.filter((card) => !uniqueCardIds.has(card._id.toString()));
    transformedCards.forEach((card) => uniqueCardIds.add(card._id.toString()));
    let cards = [...cardFeed, ...transformedCards];

    if (mode !== 'search' && cards.length < 12) {
      cards = [...cards, ...randomCards.slice(0, 12 - cards.length)];
    }

    // Ensure minimum count for resources and professors
    const fillCollection = (collection: any[], randomCollection: any[], minSize: number) => {
      const uniqueIds = new Set(collection.map((item) => item._id.toString()));
      randomCollection.forEach((item) => {
        if (!uniqueIds.has(item._id.toString()) && collection.length < minSize) {
          collection.push(item);
        }
      });
      return collection.slice(0, Math.max(minSize, 9));
    };

    const finalResources = fillCollection(resources, randomResources, 6);
    const finalProfessors = fillCollection(professors, randomProfessors, 6);

    return res
      .status(StatusCodes.OK)
      .json(
        updatedVersion
          ? {
              cards,
              resources: finalResources,
              professors: finalProfessors,
              events,
              clubs,
              communities,
            }
          : cards,
      );
  } catch (error) {
    console.error('Error in indexedReturn:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

console.log('openai', process.env.OPENAI_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Controller 16
/**
 * @desc Generate vector embeddings for all cards
 * @route POST /card/vectorize
 * @access Admin
 */
const vectorEmbedding = async (req: Request, res: Response): Promise<Response> => {
  try {
    const cards = await Card.find({}, '_id value');
    const operations = [];

    for (const card of cards) {
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: card.value,
        encoding_format: 'float',
      });

      operations.push({
        updateOne: {
          filter: { _id: card._id },
          update: { $set: { vector: embedding.data[0].embedding } },
        },
      });
    }
    await Card.bulkWrite(operations);
    return res.status(StatusCodes.OK).json({ message: 'Vector embeddings updated successfully.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error generating embeddings.', error });
  }
};

// Controller 17
/**
 * @desc Perform vector search for cards based on query
 * @route GET /card/vector-search
 * @access Public
 */
const vectorQuery = async (req: Request, res: Response): Promise<Response> => {
  try {
    const query = req.query.query as string;
    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Query parameter is required.' });
    }

    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    });

    const cards = await Card.aggregate([
      {
        $vectorSearch: {
          queryVector: embedding.data[0].embedding,
          path: 'vector',
          numCandidates: 100,
          limit: 5,
          index: 'vector',
        },
      },
      { $project: { value: 1 } },
    ]);

    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 18
/**
 * @desc Fetch random video content from different collections
 * @route GET /card/content/videos
 * @access Public
 */
const getRandomVideos = async (req: Request, res: Response): Promise<Response> => {
  try {
    const [macbContent, normalContent] = await Promise.all([
      macbeaseContent.find({ contentType: 'video' }, { url: 1, _id: 0 }).lean(),
      content.find({ contentType: 'video' }, { url: 1, _id: 0 }).lean(),
    ]);

    return res.status(StatusCodes.OK).json({ macbContent, normalContent });
  } catch (error) {
    console.error('Error fetching videos:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Replaced with the above given function "getRandomVideos"
/* const redundant = async (req: Request, res: Response) => {
  try {
    const macbContent = await macbeaseContent.find(
      { contentType: 'video' },
      { url: 1, _id: 0 }
    );
    const normalContent = await content.find(
      { contentType: 'video' },
      { url: 1, _id: 0 }
    );
    return res.status(StatusCodes.OK).json({ macbContent, normalContent });
  } catch (error) {
    console.error('Error updating user professions:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Something went wrong.',
      error: error,
    });
  }
}; */

// Controller 19
/**
 * @desc Fetch query-related data from multiple collections
 * @route GET /card/search
 * @access Public
 */
const queryReturn = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query)
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Query parameter is required' });

    const lemmatizedTags = lemmatize([query as string]);
    const allTags = await getRelatedTags(lemmatizedTags);
    const regexPatterns = allTags.map((str) => new RegExp(str, 'i'));

    const [relatedCards, resources, professors, events, clubs, communities] = await Promise.all([
      // Fetch related cards
      Card.aggregate([
        {
          $match: {
            tags: { $in: allTags },
            $and: [{ value: { $exists: true } }, { value: { $ne: null } }, { value: { $ne: '' } }],
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'creator',
            foreignField: '_id',
            as: 'creatorDetails',
          },
        },
        {
          $project: {
            vector: 0,
            'creatorDetails.name': 1,
            'creatorDetails.image': 1,
            'creatorDetails.pushToken': 1,
          },
        },
        { $limit: 30 },
      ]),

      // Fetch resources
      Resource.find({
        $or: [{ title: { $in: regexPatterns } }, { description: { $in: regexPatterns } }],
      }).lean(),

      // Fetch professors
      User.find(
        {
          profession: 'Professor',
          $or: [{ course: { $in: regexPatterns } }, { field: { $in: regexPatterns } }],
        },
        { name: 1, image: 1, pushToken: 1, course: 1 },
      ).lean(),

      // Fetch events
      Event.find(
        {
          $or: [{ name: { $in: regexPatterns } }, { description: { $in: regexPatterns } }],
        },
        { faq: 0, bookedBy: 0 },
      ).lean(),

      // Fetch clubs
      Club.find(
        {
          $or: [
            { name: { $in: regexPatterns } },
            { motto: { $in: regexPatterns } },
            { tags: { $in: regexPatterns } },
          ],
        },
        { secondaryImg: 1, name: 1, tags: 1, motto: 1, _id: 1 },
      ).lean(),

      // Fetch communities
      Community.find(
        {
          $or: [
            { title: { $in: regexPatterns } },
            { label: { $in: regexPatterns } },
            { tag: { $in: regexPatterns } },
          ],
        },
        { secondaryCover: 1, title: 1, tag: 1, activeMembers: 1, label: 1, _id: 1 },
      ).lean(),
    ]);

    return res.status(StatusCodes.OK).json({
      cards: relatedCards,
      resources,
      professors,
      events,
      clubs,
      communities,
    });
  } catch (error) {
    console.error('Error fetching query data:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 20
/**
 * @desc Update cards to replace placeholders with creator names
 * @route PATCH /card/modify
 * @access Admin
 */
const modifyCard = async (req: Request, res: Response) => {
  try {
    const cards = await Card.find({}, 'value userMetaData');
    const bulkOperations = cards.map((card) => {
      const name = card.userMetaData?.name || '';
      const updatedValue = card.value
        .replace(/\b(?:a null|a null user|a null enthusiast)\b/gi, name)
        .replace(/\[user\]/gi, name)
        .replace(/\[name\]/gi, name);

      return {
        updateOne: {
          filter: { _id: card._id },
          update: { $set: { value: updatedValue } },
        },
      };
    });

    if (bulkOperations.length > 0) {
      await Card.bulkWrite(bulkOperations);
    }

    return res.status(StatusCodes.OK).json({ message: 'Cards updated successfully' });
  } catch (error) {
    console.error('Error modifying cards:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error updating cards', error });
  }
};

export {
  getRandomVideos,
  vectorQuery,
  vectorEmbedding,
  createCard,
  deleteCard,
  likeACard,
  getLikedCards,
  getCardFromId,
  getCardsOfUser,
  getCardsFromTag,
  saveInterest,
  getYourInterests,
  getAllCards,
  unlikeACard,
  getUserBio,
  getPeopleRelatedToYou,
  getRandomCards,
  indexedReturn,
  queryReturn,
  modifyCard,
};
