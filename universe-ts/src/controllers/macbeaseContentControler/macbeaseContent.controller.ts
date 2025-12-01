import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import MacbeaseContent from '../../models/macbeaseContent.model';
import Project from '../../models/project.model';
import Admin from '../../models/admin.model';
import User from '../../models/user.model';
import schedule from 'node-schedule';
import mongoose from 'mongoose';
import {
  sendMail,
  scheduleNotification,
  scheduleNotification2,
  generateUri,
} from '../utils.controller';
import { IMacbeaseContent, UserDocument } from './interface';

/**
 * @desc Create new content for Macbease
 * @route POST /macbease-content
 * @access User
 */
const createContent = async (req: Request, res: Response) => {
  try {
    const {
      contentType,
      sendBy,
      url,
      text,
      key,
      peopleTagged = [],
      project,
    }: {
      contentType: 'text' | 'image' | 'video' | 'doc';
      sendBy: 'Macbease';
      url?: string;
      text?: string;
      key: string;
      peopleTagged: { _id: string }[];
      project?: string;
    } = req.body;

    if (!contentType || sendBy !== 'Macbease' || (contentType !== 'text' && !url)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid request data' });
    }

    const idOfSender = (req.user as { id?: string })?.id;
    if (!idOfSender) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'User not authenticated' });
    }

    const timestamp = key === 'normal' ? new Date() : new Date(key);

    const user = await User.findById(idOfSender, {
      name: 1,
      image: 1,
      pushToken: 1,
      macbeaseContentContribution: 1,
      tunedIn_By: 1,
    }).lean();

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });
    }

    const content = await MacbeaseContent.create({ ...req.body, idOfSender, timeStamp: timestamp });

    if (project) {
      await Project.findByIdAndUpdate(project, { $addToSet: { media: content._id } });
    }

    if (peopleTagged.length > 0) {
      const notifications = peopleTagged.map(({ _id }) => ({
        value: `${user.name} tagged you in their post!`,
        img1: user.image,
        img2: url || '',
        expandType: 'Macbease',
        expandData: content,
        key: 'tag',
        time: new Date(),
        uid: `${Date.now()}/${_id}/${idOfSender}`,
      }));

      await User.updateMany(
        { _id: { $in: peopleTagged.map(({ _id }) => _id) } },
        {
          $addToSet: { taggedContents: { type: 'macbease', contentId: content._id } },
          $push: { unreadNotice: { $each: notifications, $position: 0 } },
        },
      );
    }

    await User.findByIdAndUpdate(idOfSender, {
      $push: { macbeaseContentContribution: { $each: [content._id], $position: 0 } },
    });

    schedule.scheduleJob(
      `macbeaseContent_${idOfSender}_${Date.now() + 3000}`,
      new Date(Date.now() + 3000),
      async () => {
        const tokens = (await User.find({ _id: { $in: user.tunedIn_By } }, { pushToken: 1 }).lean())
          .map((item) => item.pushToken)
          .filter(Boolean);

        const notificationPayload: {
          pushToken: string[];
          title: string;
          body: string;
          url: string;
          image?: string;
        } = {
          pushToken: tokens.filter((token): token is string => token !== undefined),
          title: `Don't Miss Out! ${user.name} Just Posted Something New!`,
          body: text ? `${text.substring(0, 50)}...` : 'Check it out now!',
          url: `https://macbease.com/app/content/${content._id}/Macbease`,
        };

        if (contentType === 'image' && url) {
          notificationPayload.image = await generateUri(url.split('@')[0]);
        }

        scheduleNotification2(notificationPayload);
      },
    );

    return res.status(StatusCodes.CREATED).json({
      contentId: content._id,
      message: 'Content successfully created!',
    });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong!', error });
  }
};

/**
 * @desc Handles liking a content item
 * @route POST /macbease-content/like
 * @access User
 */
const likeContent = async (req: Request, res: Response) => {
  const { contentId, type } = req.body;
  if (!req.user)
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'User not authenticated.' });

  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid content ID.' });
  }

  try {
    const user = await User.findById(userId, 'likedContents pushToken');
    const content = await MacbeaseContent.findById(contentId, 'likes idOfSender contentType');

    if (!user || !content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User or content not found.' });
    }

    // Avoid duplicate likes
    if (content.likes && content.likes.includes(userId)) {
      return res.status(StatusCodes.CONFLICT).json({ message: 'Content already liked.' });
    }

    if (user.likedContents) {
      user.likedContents.push({ contentId, type });
    } else {
      user.likedContents = [{ contentId, type }];
    }
    if (!content.likes) {
      content.likes = [];
    }
    content.likes.push(userId);
    await Promise.all([user.save(), content.save()]);

    // Perform secondary actions asynchronously
    secondaryActionsForLike(
      contentId,
      userId,
      content.idOfSender,
      user as UserDocument,
      content as mongoose.Document & {
        likes: string[];
        url?: string;
        text?: string;
        contentType: 'text' | 'image' | 'video' | 'doc';
        comments: any[];
        toObject: () => any;
      },
    );

    return res.status(StatusCodes.OK).json({ message: 'Content liked successfully.' });
  } catch (error) {
    console.error('Error liking content:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

interface ContentDocument extends mongoose.Document {
  likes: string[];
  url?: string;
  text?: string;
  contentType: 'text' | 'image' | 'video' | 'doc';
  comments: any[];
  toObject: () => any;
}

const secondaryActionsForLike = async (
  contentId: string,
  userId: string,
  publisherId: string,
  userInfo: UserDocument,
  contentInfo: ContentDocument,
): Promise<void> => {
  try {
    if (!contentId || !userId || !publisherId || !userInfo || !contentInfo) {
      throw new Error('Missing required parameters');
    }

    const scheduleTime = new Date(Date.now() + 1000);
    schedule.scheduleJob(`like_${contentId}_${userId}`, scheduleTime, async () => {
      try {
        const contributorInfo = await User.findById(publisherId, {
          pushToken: 1,
          unreadNotice: 1,
          notifications: 1,
        }).lean();

        if (!contributorInfo) {
          console.error(`Publisher ${publisherId} not found.`);
          return;
        }

        const { likes, url, text, contentType, comments } = contentInfo.toObject();
        const noticeId = `like_${contentId}`;
        const likeCount = likes.length - 1;

        const noticeText =
          likeCount === 0
            ? `${userInfo.name} liked your post!`
            : `${userInfo.name} and ${likeCount} others liked your post!`;

        const notice = {
          value: noticeText,
          img1: userInfo.image,
          img2: url,
          action: 'profile2',
          key: 'like',
          params: {
            img: userInfo.image,
            name: userInfo.name,
            id: userInfo._id,
            userPushToken: userInfo.pushToken,
          },
          contentMetaData: {
            likes,
            url,
            text,
            contentType,
            comments: comments.slice(0, 6),
            commentsNum: comments.length,
          },
          uid: noticeId,
        };

        const updatedNotices = (list: any[]) => list.filter((n) => n.uid !== noticeId);
        const unreadNotice = contributorInfo.unreadNotice || [];
        const notifications = contributorInfo.notifications || [];
        unreadNotice.unshift(notice);

        await User.updateOne(
          { _id: publisherId },
          {
            unreadNotice: updatedNotices(unreadNotice),
            notifications: updatedNotices(notifications),
          },
        );

        const notificationData: any = {
          pushToken: [contributorInfo.pushToken],
          title: `${userInfo.name} liked your post!`,
          body: text ? `${text.substring(0, 50)}...` : '',
          url: `https://macbease.com/app/content/${contentId}/Macbease`,
        };

        if (contentType === 'image' && url) {
          notificationData.image = await generateUri(url.split('@')[0]);
        }

        scheduleNotification2(notificationData);
      } catch (error) {
        console.error('Error processing like notification:', error);
      }
    });
  } catch (error) {
    console.error('Error in secondary action after content liking:', error);
  }
};

/**
 * @desc Add a comment to a content post
 * @route POST /macbease-content/comments
 * @access User
 */
const comment = async (req: Request, res: Response) => {
  const { contentId, type, text, peopleTagged, actionHandled } = req.body;

  try {
    // Fetch user and content in parallel
    const [user, content] = await Promise.all([
      User.findById(req.user.id).select('name image pushToken commentedContents'),
      MacbeaseContent.findById(contentId).select('comments contentType url text idOfSender'),
    ]);

    if (!user || !content) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User or content not found' });
    }

    const contributor = await User.findById(content.idOfSender).select('pushToken');
    if (!contributor) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Contributor not found' });
    }

    // Create new comment object
    const newComment = {
      cid: content.comments?.length ? content.comments.length + 1 : 1,
      text,
      peopleTagged,
      likes: [],
      name: user.name,
      img: user.image,
      pushToken: user.pushToken,
      _id: user._id,
      msg: text,
      id: (user._id as string).toString(),
      replies: [],
    };

    // Add comment to content
    content.comments = [newComment, ...(content.comments || [])];
    user.commentedContents = [
      { cid: newComment.cid, contentId, type },
      ...(user.commentedContents || []),
    ];

    // Save changes
    await Promise.all([content.save(), user.save()]);

    // Notification logic
    const pushToken = contributor.pushToken ? [contributor.pushToken] : [];
    const notificationPayload: {
      pushToken: string[];
      title: string;
      body: string;
      url: string;
      image?: string;
    } = {
      pushToken,
      title: `${user.name} commented on your post!`,
      body: `${(content.text || '').substring(0, 50)}...`,
      url: `https://macbease.com/app/content/${contentId}/Macbease`,
    };

    if (content.contentType === 'image') {
      notificationPayload.image = content.url
        ? await generateUri(content.url.split('@')[0])
        : undefined;
    }

    actionHandled
      ? scheduleNotification2(notificationPayload)
      : scheduleNotification(notificationPayload);

    return res.status(StatusCodes.OK).json({ message: 'Comment posted successfully!' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong!', error });
  }
};

/**
 * @desc    Unlike a content item
 * @route   DELETE /macbease-content/unlike
 * @access  User, Admin
 */
const unlikeContent = async (req: Request, res: Response) => {
  const { contentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid content ID' });
  }

  const userId = req.user.id;

  try {
    // Use atomic operations to update both documents in a single step
    const [userUpdate, contentUpdate] = await Promise.all([
      User.findByIdAndUpdate(
        userId,
        { $pull: { likedContents: contentId } },
        { new: true, select: '_id' },
      ),
      MacbeaseContent.findByIdAndUpdate(
        contentId,
        { $pull: { likes: userId } },
        { new: true, select: '_id' },
      ),
    ]);

    if (!userUpdate || !contentUpdate) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User or Content not found' });
    }

    return res.status(StatusCodes.OK).json({ message: 'Successfully unliked the content' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Delete content and move its URL to admin's thrash list
 * @route DELETE /macbease-content/delete
 * @access User, Admin
 */
const deleteContent = async (req: Request, res: Response) => {
  const { contentId } = req.params; // Get contentId from URL parameter
  const { adminId } = req.body; // Get adminId from request body

  try {
    // Ensure user is authorized (either admin or creator)
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        message:
          'You are not authorized to delete this content as you are neither creator nor admin.',
      });
    }

    // Fetch content to delete and ensure it exists
    const deletedContent = await MacbeaseContent.findById(contentId);
    if (!deletedContent) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
    }

    // Delete the content
    await MacbeaseContent.findByIdAndDelete(contentId);

    // Fetch the admin and ensure they exist
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Admin not found.' });
    }

    // If content has a URL, push it to the admin's thrashUrls list
    if (deletedContent.url) {
      if (!admin.thrashUrls) {
        admin.thrashUrls = [];
      }
      admin.thrashUrls.push(deletedContent.url);
      await admin.save();
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: 'The content has been successfully deleted.' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Fetch content by its ID along with the number of comments and limited comment preview
 * @route GET /macbease-content
 * @access Public
 */
const getContent = async (req: Request, res: Response) => {
  const { contentId } = req.params; // use params for URL-based routing

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid content ID format.' });
  }

  try {
    // Aggregation pipeline optimized to minimize data processing
    const content = await MacbeaseContent.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(contentId) },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          commentsNum: { $size: '$comments' }, // count of comments
          comments: { $slice: ['$comments', 6] }, // only first 6 comments
        },
      },
    ]).exec(); // `.exec()` added to ensure proper handling of the aggregation query

    if (!content.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
    }

    return res.status(StatusCodes.OK).json(content[0]);
  } catch (error) {
    console.error('Error fetching content:', error);

    // Handle edge cases, like DB connection issues
    if (error instanceof mongoose.Error) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ message: 'Database error while fetching content.' });
    }

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching content.', error });
  }
};

/**
 * @desc Retrieve comments for a specific content ID with pagination and remainder adjustment.
 * @route GET /macbease-content/comments
 * @access User, Admin
 */
const getComments = async (req: Request, res: Response) => {
  const { contentId, batch, batchSize, remainder } = req.query;

  // Validate input
  if (!contentId || !mongoose.isValidObjectId(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid or missing contentId' });
  }

  // Parse and validate pagination parameters
  const batchNum = parseInt(batch as string, 10) || 1;
  const size = parseInt(batchSize as string, 10) || 10;
  const remainderCount = parseInt(remainder as string, 10) || 0;

  if (batchNum <= 0 || size <= 0 || remainderCount < 0) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid pagination parameters' });
  }

  try {
    // Fetch comments and total count in a single DB call
    const content = await MacbeaseContent.findById(contentId, {
      comments: { $slice: [(batchNum - 1) * size + remainderCount, size] },
    }).lean();

    const totalComments = await MacbeaseContent.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(contentId as string) } },
      { $project: { total: { $size: '$comments' } } },
    ]);

    const finalComments = content?.comments || [];
    const total = totalComments.length > 0 ? totalComments[0].total : 0;

    return res.status(StatusCodes.OK).json({
      finalComments,
      total,
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Something went wrong while fetching comments.',
    });
  }
};

interface Comment {
  id: string;
  msg: string;
  likes: string[];
  peopleTagged?: any[];
}

// Define a simplified structure for the response
interface PopularComment {
  id: string;
  msg: string;
  likesCount: number;
  peopleTagged?: any[];
}

/**
 * @desc Get popular comments for a specific content
 * @route GET /macbease-content/comments/popular
 * @access Public
 */
const getPopularComments = async (req: Request, res: Response): Promise<Response> => {
  const { contentId, batch } = req.query;

  // Validate input parameters
  if (!contentId || typeof contentId !== 'string') {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: 'Content ID is required and must be a valid string.' });
  }

  try {
    // Retrieve only the required fields (comments) for the specified content
    const content = await MacbeaseContent.findById(contentId, {
      comments: 1,
    }).lean(); // .lean() returns plain JavaScript objects

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Content not found.' });
    }

    // Extract comments or default to an empty array
    let comments: Comment[] = (content.comments || []).map((comment) => ({
      ...comment,
      likes: (comment as any).likes || [],
    }));
    const batchNumber = parseInt(batch as string, 10) || 1;
    const batchSize = 100;

    // Slice the batch and map only necessary fields
    comments = comments.slice((batchNumber - 1) * batchSize, batchNumber * batchSize);

    const popularComments: PopularComment[] = comments
      .map(({ id, msg, likes, peopleTagged }) => ({
        id,
        msg,
        likesCount: likes.length,
        peopleTagged,
      }))
      .sort((a, b) => b.likesCount - a.likesCount) // Sort by likes in descending order
      .slice(0, 6); // Get top 6 comments

    // Send the response
    return res.status(StatusCodes.OK).json({ popularComments });
  } catch (error) {
    console.error('Error fetching popular comments:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An unexpected error occurred.' });
  }
};

/**
 * @desc    Get content by span (today, week, or all)
 * @route   GET /macbease-content/content-by-span
 * @access  User, Admin
 */
const getContentBySpan = async (req: Request, res: Response): Promise<Response> => {
  const { span } = req.query;

  // Validate query parameter
  if (typeof span !== 'string' || !['today', 'week', 'all'].includes(span)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid or missing span parameter' });
  }

  try {
    const date = new Date();

    // Use MongoDB aggregation to minimize processing in Node.js
    const filter: Record<string, unknown> = {};
    if (span === 'today') {
      filter.timeStamp = { $gte: new Date(date.getTime() - 86_400_000) }; // 24 hours in milliseconds
    } else if (span === 'week') {
      filter.timeStamp = { $gte: new Date(date.getTime() - 604_800_000) }; // 7 days in milliseconds
    }

    // Fetch data in one query based on the filter
    const contents = await MacbeaseContent.find(filter).lean<IMacbeaseContent>().exec();

    // Response formatting
    return res.status(StatusCodes.OK).json({
      success: true,
      data: span === 'all' ? contents : contents,
      message: `Content retrieved for span: ${span}`,
    });
  } catch (error) {
    console.error(`Error fetching content: ${error}`);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to fetch content', error });
  }
};

/**
 * @desc Get the like status of a specific content
 * @route GET /macbease-content/like-status
 * @access User, Admin
 */
const getLikeStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Ensure the request is coming from an authorized role
    const { role, id: userId } = req.user;
    if (role !== 'admin' && role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: 'You are not authorized to get the like status.',
      });
    }

    // Validate query parameters
    const { contentId } = req.query;
    if (!contentId || typeof contentId !== 'string') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid content ID provided.',
      });
    }

    // Fetch only the required fields to minimize DB call overhead
    const content = await MacbeaseContent.findById(contentId).select('likes').lean();

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: 'Content not found.',
      });
    }

    // Check if the user has liked the content
    const liked = content.likes?.includes(userId) ?? false;

    return res.status(StatusCodes.OK).json({ liked });
  } catch (error) {
    console.error('Error fetching like status:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while fetching the like status.',
    });
  }
};

/**
 * @desc Fetches a user's Macbease content contributions with pagination
 * @route GET /macbease-content/contributions
 * @access User, Admin
 */
const getMacbeaseContribution = async (req: Request, res: Response) => {
  try {
    const { id, batch = '1', batchSize = '10' } = req.query;
    if (!id || !mongoose.Types.ObjectId.isValid(id as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid or missing user ID' });
    }

    const parsedBatch = Math.max(1, parseInt(batch as string, 10));
    const parsedBatchSize = Math.max(1, parseInt(batchSize as string, 10));
    const skip = (parsedBatch - 1) * parsedBatchSize;

    // Fetch user contributions in a single query
    const user = await User.findById(id, 'macbeaseContentContribution')
      .slice('macbeaseContentContribution', [skip, parsedBatchSize])
      .lean();

    if (!user?.macbeaseContentContribution?.length) {
      return res.status(StatusCodes.OK).json([]);
    }

    // Fetch contributions efficiently with necessary fields
    const contents = await MacbeaseContent.aggregate([
      { $match: { _id: { $in: user.macbeaseContentContribution } } },
      {
        $addFields: { commentsNum: { $size: '$comments' }, comments: { $slice: ['$comments', 6] } },
      },
      { $sort: { timeStamp: -1 } },
      { $project: { title: 1, content: 1, commentsNum: 1, comments: 1, timeStamp: 1 } },
    ]);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error('Error fetching contributions:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching contributions', error });
  }
};

/**
 * @desc Add a user to the content team by changing their role to 'Creator'
 * @route PATCH /add-to-content-team
 * @access Admin
 */
const addToContentTeam = async (req: Request, res: Response) => {
  const { id } = req.query;

  // Validate required query parameter
  if (!id) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'User ID is required.' });
  }

  // Ensure only admins can perform this action
  if (req.user.role !== 'admin') {
    return res
      .status(StatusCodes.FORBIDDEN)
      .json({ message: 'You are not authorized to perform this action.' });
  }

  try {
    // Find user by ID and update their role to 'Creator'
    const user = await User.findOneAndUpdate(
      { _id: id },
      { $set: { role: 'Creator' } },
      { new: true, fields: { name: 1, email: 1 } },
    );

    // If user does not exist, return a 404 response
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }

    // Send confirmation email
    const name = user.name;
    const intro = [
      'We are so delighted to have you onboard Macbease Content Team.',
      'We look forward to having wonderful working experiences with you.',
    ];
    const outro = 'Let us begin this journey together!';
    const subject = 'Macbease Confirmation';
    const destination = [user.email];

    try {
      const { ses, params } = await sendMail(name, intro, outro, subject, destination);
      await ses.sendEmail(params).promise();
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ message: 'Failed to send confirmation email. Please contact support.' });
    }

    // Respond with success message
    return res
      .status(StatusCodes.OK)
      .json({ message: 'Successfully added to Macbease content team!' });
  } catch (error) {
    // Log the error and return an appropriate response
    console.error('Error in addToContentTeam:', error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc Retrieve the list of content team members with specific fields
 * @route GET /macbease-content/content-team
 * @access Admin
 */
const readContentTeam = async (req: Request, res: Response) => {
  // Ensure only admins can perform this action
  if (req.user.role !== 'admin') {
    return res
      .status(StatusCodes.FORBIDDEN)
      .json({ message: 'You are not authorized to view the content team.' });
  }

  try {
    // Retrieve content team members with specific fields
    const users = await User.find(
      { role: 'Creator' },
      'name image course email _id reg pushToken', // Projection for only required fields
    );

    // If no users are found, return an appropriate response
    if (!users || users.length === 0) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'No content team members found.' });
    }

    // Return the list of users
    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    // Log the error and send a generic error message
    console.error('Error in readContentTeam:', error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc Remove a user from the Macbease Content Team
 * @route PATCH /remove-from-team
 * @access Admin
 */

const removeFromTeam = async (req: Request, res: Response) => {
  // Ensure only admins can perform this action
  if (req.user.role !== 'admin') {
    return res
      .status(StatusCodes.FORBIDDEN)
      .json({ message: 'You are not authorized to remove users from the content team.' });
  }

  try {
    const { id } = req.query;

    // Validate that the id parameter exists
    if (!id) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'User ID is required.' });
    }

    // Find the user and check if they are part of the content team
    const user = await User.findById(id, 'role email name');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }

    if (user.role !== 'Creator') {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'User is not part of the content team.' });
    }

    // Update the user's role
    user.role = 'Normal';
    await user.save();

    // Send an email to notify the user
    const name = user.name;
    const intro = [
      'We are so sorry to let you go from the Macbease Content Team.',
      'It was a great experience working with you. All the best for your future endeavors.',
    ];
    const outro =
      'This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.';
    const subject = 'Macbease Confirmation';
    const destination = [user.email];

    const { ses, params } = await sendMail(name, intro, outro, subject, destination);
    ses.sendEmail(params, function (err) {
      if (err) {
        console.error('Email sending failed:', err);
      }
    });

    return res
      .status(StatusCodes.OK)
      .json({ message: 'Successfully removed from the Macbease content team!' });
  } catch (error) {
    // Log the error and return a server error response
    console.error('Error in removeFromTeam:', error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc Updates content details
 * @route PATCH /edit-content
 * @access User (Owner) or Admin
 */
const editContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;

    // Validate contentId
    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid content ID.' });
    }

    // Fetch the content with necessary fields
    const content = await MacbeaseContent.findById(contentId);

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
    }

    // Check authorization
    const isAuthorized = content.idOfSender === req.user.id || req.user.role === 'admin';

    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to edit this content.' });
    }

    // Update the content
    Object.assign(content, req.body);
    await content.save();

    return res.status(StatusCodes.OK).json({ message: 'Content successfully updated.', content });
  } catch (error) {
    console.error('Error updating content:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Like a comment for a given content
 * @route PATCH /macbease-content/comment/like
 * @access User, Admin
 */
const likeAComment = async (req: Request, res: Response): Promise<Response> => {
  const { contentId, cid } = req.params;

  if (!contentId || !cid) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: 'Content ID and Comment ID are required.' });
  }

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid content ID.' });
  }

  try {
    // Fetch the content with only required fields and check existence
    const content = await MacbeaseContent.findOne(
      { _id: contentId, 'comments._id': cid },
      { comments: { $elemMatch: { _id: cid } } },
    );

    if (!content || !content.comments || content.comments.length === 0) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Comment not found.' });
    }

    const targetComment = content.comments[0];

    // Ensure the user is not liking their own comment multiple times
    if (targetComment.likes.includes(req.user.id)) {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ error: 'You have already liked this comment.' });
    }

    // Update likes without transaction
    await MacbeaseContent.updateOne(
      { _id: contentId, 'comments._id': cid },
      { $addToSet: { 'comments.$.likes': req.user.id } },
    );

    return res.status(StatusCodes.OK).json({ message: 'Successfully liked the comment.' });
  } catch (error) {
    console.error('Error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An unexpected error occurred.', error });
  }
};

/**
 * @desc Unlike a comment on a content item
 * @route DELETE /macbease-content/comment/unlike
 * @access User, Admin
 */
const unLikeAComment = async (req: Request, res: Response) => {
  const { contentId, cid } = req.params;
  const userId = req.user.id;

  try {
    // Validate input
    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid content ID.' });
    }
    if (!cid || isNaN(Number(cid)) || Number(cid) < 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid comment ID.' });
    }

    // Atomic update to ensure consistency and reduce DB calls
    const result = await MacbeaseContent.findOneAndUpdate(
      { _id: contentId, [`comments.${Number(cid)}.likes`]: userId },
      { $pull: { [`comments.${Number(cid)}.likes`]: userId } },
      { new: true, projection: { comments: { $slice: [-1, Number(cid) + 1] } } }, // Fetch only required comments for efficiency
    );

    if (!result) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Content or comment not found, or user did not like the comment.' });
    }

    return res.status(StatusCodes.OK).json({ message: 'Successfully unliked the comment.' });
  } catch (error) {
    console.error('Error in unliking a comment:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An unexpected error occurred. Please try again later.', error });
  }
};

/**
 * @desc Get paginated content with aggregated fields like comments count and top comments
 * @route GET /macbease-content/batched-content
 * @access User, Admin
 */
const getBatchedContent = async (req: Request, res: Response) => {
  const { batch = '1', batchSize = '6' } = req.query;

  try {
    // Parse and validate query parameters
    const batchNum = Math.max(parseInt(batch as string, 10), 1); // Default to 1, no negative or zero values
    const size = Math.max(parseInt(batchSize as string, 10), 1); // Default to 6, no negative or zero values

    // Calculate documents to skip
    const skip = (batchNum - 1) * size;

    // Aggregation pipeline for efficient processing
    const contents = await MacbeaseContent.aggregate([
      { $sort: { _id: -1 } }, // Sort by newest first
      { $skip: skip }, // Skip documents for pagination
      { $limit: size }, // Limit the number of documents returned
      {
        $project: {
          title: 1, // Include only necessary fields
          description: 1,
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] }, // Include top 6 comments
        },
      },
    ]);

    // Check if no contents found (edge case)
    if (!contents.length) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: 'No content found for the specified batch.',
      });
    }

    // Send the response
    return res.status(StatusCodes.OK).json({
      batch: batchNum,
      batchSize: size,
      totalItems: contents.length,
      data: contents,
    });
  } catch (error: unknown) {
    // Proper error logging and handling
    console.error('Error fetching batched content:', error);

    if (error instanceof mongoose.Error) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Database error occurred while fetching content.',
      });
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
};

/**
 * @desc Get date-wise content with batching, pagination, and limited comments
 * @route GET /macbease-content/date-wise-content
 * @access User, Admin
 */
const getDateWiseContent = async (req: Request, res: Response): Promise<Response> => {
  const { date, batch = 1, batchSize = 10 } = req.query;

  try {
    // Validate and parse query parameters
    if (!date) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Date parameter is required.' });
    }

    const parsedDate = new Date(date as string);
    if (isNaN(parsedDate.getTime())) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid date format.' });
    }

    const parsedBatch = parseInt(batch as string, 10);
    const parsedBatchSize = parseInt(batchSize as string, 10);

    if (parsedBatch <= 0 || parsedBatchSize <= 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Batch and batchSize must be positive integers.' });
    }

    // MongoDB aggregation pipeline for optimized querying
    const content = await MacbeaseContent.aggregate([
      {
        $match: {
          timeStamp: { $gte: parsedDate },
        },
      },
      {
        $sort: { timeStamp: -1 },
      },
      {
        $skip: (parsedBatch - 1) * parsedBatchSize,
      },
      {
        $limit: parsedBatchSize,
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          timeStamp: 1,
          commentNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
        },
      },
    ]);

    // Return response with proper status code
    return res.status(StatusCodes.OK).json({
      success: true,
      data: content,
    });
  } catch (error) {
    console.error('Error fetching content:', error);

    // Proper error handling for unexpected issues
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Something went wrong while fetching the content.',
    });
  }
};

/**
 * @desc Search content by tags
 * @route GET /tag-search-content
 * @access User, Admin
 */
const tagSearchContent = async (req: Request, res: Response) => {
  const { query } = req.query;

  // Check if query is provided
  if (!query || typeof query !== 'string') {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Query parameter is required.' });
  }

  try {
    // Using a lean query for better performance
    const contents = await MacbeaseContent.aggregate([
      {
        $match: {
          tags: { $regex: new RegExp(query, 'i') }, // Case-insensitive search
        },
      },
      {
        $project: {
          _id: 1, // Adjust fields to minimize data transfer
          title: 1,
          description: 1,
          tags: 1,
        },
      },
    ]).exec();

    // Handle no matching results
    if (contents.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'No content found for the given tags.' });
    }

    // Return found content
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error('Error while searching content by tags:', error);

    // Handle known MongoDB-specific errors
    if (error instanceof mongoose.Error) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ message: 'Database error occurred.' });
    }

    // General error handling
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong, please try again later.' });
  }
};

/**
 * @desc Reply to a comment on specific content
 * @route POST /macbease-content/comment/reply
 * @access User, Admin
 */
const replyToComment = async (req: Request, res: Response) => {
  const { contentId, cid } = req.params; // Changed to params for a more RESTful design
  const { name, text } = req.body;

  if (!contentId || !cid || !name || !text) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: 'Incomplete or invalid input.',
    });
  }

  if (!mongoose.isValidObjectId(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: 'Invalid contentId.',
    });
  }

  try {
    // Find the content with only the required fields
    const content = await MacbeaseContent.findById(contentId, { comments: 1 });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: 'Content not found.',
      });
    }

    const { comments } = content;

    // Check if comments exist and the cid is valid
    if (!comments || comments.length === 0 || Number(cid) < 1 || Number(cid) > comments.length) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: 'Comment not found.',
      });
    }

    const targetCommentIndex = comments.length - Number(cid); // Calculate index
    const targetComment = comments[targetCommentIndex];

    if (!targetComment || !targetComment.replies) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: 'Target comment or replies not found.',
      });
    }

    // Push the new reply into the replies array
    const newReply = {
      name,
      text,
      createdAt: new Date(), // Add timestamp for the reply
    };
    targetComment.replies.push(newReply);

    // Update the comment in the database
    comments[targetCommentIndex] = targetComment;
    content.comments = comments;

    await content.save();

    // Send notification (async operation)
    const commentUser = await User.findById(targetComment.id).select('pushToken').lean();
    scheduleNotification2({
      pushToken: [commentUser?.pushToken as string],
      title: `${name} replied to your comment!`,
      body: `${text.substring(0, 50)}...`,
      url: `https://macbease.com/app/content/${contentId}/Macbease`,
    });

    return res.status(StatusCodes.OK).json({
      message: 'Successfully replied to the comment.',
      reply: newReply,
    });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Something went wrong.',
      error: error || 'Internal server error',
    });
  }
};

/**
 * @desc Get Content Team Admins' IDs
 * @route GET /macbease-content/team-admins
 * @access User, Admin
 */
const getContentTeamAdmins = async (req: Request, res: Response) => {
  try {
    let team = await Admin.find({ role: 'Content Team' }).select('_id').lean();

    if (!team.length) {
      team = await Admin.find().select('_id').lean();
    }

    return res.status(StatusCodes.OK).json({ adminIds: team.map((item) => item._id) });
  } catch (error) {
    console.error('Error fetching content team admins:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

export {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getLikeStatus,
  getMacbeaseContribution,
  addToContentTeam,
  readContentTeam,
  removeFromTeam,
  getPopularComments,
  likeAComment,
  unLikeAComment,
  getBatchedContent,
  getDateWiseContent,
  tagSearchContent,
  editContent,
  replyToComment,
  getContentTeamAdmins,
};
