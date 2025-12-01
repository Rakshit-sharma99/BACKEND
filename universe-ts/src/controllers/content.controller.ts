import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Content from '../models/content.model';
import Admin from '../models/admin.model';
import User from '../models/user.model';
import Club from '../models/club.model';
import Community from '../models/community.model';
import MacbeaseContent from '../models/macbeaseContent.model';
import Card from '../models/card.model';
import schedule from 'node-schedule';
import { OpenAI } from 'openai';

import mongoose, { PipelineStage } from 'mongoose';
import { scheduleNotification, scheduleNotification2, generateUri } from './utils.controller';
import { lemmatize, getRelatedTags } from './common.controller';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * @desc    Create new content and notify tagged users
 * @route   POST /content
 * @access  User
 */
const createContent = async (req: Request, res: Response) => {
  try {
    const { contentType, sendBy, url, text, key, peopleTagged, belongsTo } = req.body;

    // Validate required fields
    if (
      !contentType ||
      !sendBy ||
      (contentType !== 'text' && !url) ||
      !peopleTagged ||
      !belongsTo
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Incomplete data.' });
    }

    let processedUrl = url;
    if (url && url.includes('#')) {
      processedUrl = url.replace(/(^|[^@])#/g, '$1@#');
    }

    const idOfSender = req.user.id;

    // Find the sender
    const sender = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
    }).lean();

    if (!sender) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Sender not found.' });
    }

    let params: any;

    // Handle "sendBy" cases (club or userCommunity)
    if (sendBy === 'club') {
      const group = await Club.findById(belongsTo, {
        name: 1,
        secondaryImg: 1,
        _id: 0,
      }).lean();

      if (!group) {
        return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found.' });
      }

      params = {
        userName: sender.name,
        userPic: sender.image,
        clubTitle: group.name,
        clubCover: group.secondaryImg,
        userPushToken: sender.pushToken,
      };
    } else if (sendBy === 'userCommunity') {
      const group = await Community.findById(belongsTo, {
        title: 1,
        secondaryCover: 1,
        content: 1,
        _id: 0,
      }).lean();

      if (!group) {
        return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found.' });
      }

      params = {
        userName: sender.name,
        userPic: sender.image,
        communityTitle: group.title,
        communityCover: group.secondaryCover,
        userPushToken: sender.pushToken,
      };
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid sendBy value.' });
    }

    // Create content data
    const contentData = {
      ...req.body,
      url: processedUrl,
      idOfSender,
      timeStamp: key === 'normal' ? new Date() : key,
      params,
    };

    const content = await Content.create(contentData);

    // Validate "peopleTagged" is an array
    if (!Array.isArray(peopleTagged)) {
      console.error('peopleTagged is not an array:', peopleTagged);
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid peopleTagged data.' });
    }

    // Notify tagged users
    for (const taggedInfo of peopleTagged) {
      if (!taggedInfo || !taggedInfo._id) {
        console.warn('Invalid taggedInfo:', taggedInfo);
        continue;
      }

      const taggedUser = await User.findById(taggedInfo._id);

      if (taggedUser) {
        const notice: {
          value: string;
          img1: string | null;
          img2: any;
          key: string;
          time: Date;
          uid: string;
          action: string;
          expandType?: string;
          expandData?: any;
        } = {
          value: `${sender.name} tagged you in their post!`,
          img1: sender.image || null,
          img2: processedUrl || null,
          key: 'tag',
          time: new Date(),
          uid: `${new Date().toISOString()}/${taggedInfo._id}/${req.user.id}`,
          action: 'tag', // Required 'action' property
        };

        // Add expandType and expandData based on "sendBy"
        if (sendBy === 'club') {
          notice.expandType = 'Club';
          notice.expandData = { ...content.toObject() };
          taggedUser.taggedContents = [
            ...(taggedUser.taggedContents || []),
            { type: 'club', contentId: content._id },
          ];
        } else if (sendBy === 'userCommunity') {
          notice.expandType = 'Community';
          notice.expandData = { ...content.toObject() };
          taggedUser.taggedContents = [
            ...(taggedUser.taggedContents || []),
            { type: 'community', contentId: content._id },
          ];
        }

        // Update user's unread notices
        taggedUser.unreadNotice = [notice, ...(taggedUser.unreadNotice || [])];
        await taggedUser.save();
      }
    }

    // Respond with created content ID
    return res.status(StatusCodes.OK).json({ contentId: content._id });
  } catch (error) {
    console.error('Error creating content:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Something went wrong.' });
  }
};

/**
 * @desc Like a content item
 * @route POST /content/like
 * @access User
 */
const likeContent = async (req: Request, res: Response) => {
  const { contentId, type } = req.body;
  const MAX_RETRIES = 3;
  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const userId = req.user.id;
      const [userInfo, contentInfo] = await Promise.all([
        User.findById(userId, {
          name: 1,
          image: 1,
          likedContents: 1,
          pushToken: 1,
        }).session(session),
        Content.findById(contentId).select('-vector').session(session),
      ]);
      if (!userInfo || !contentInfo) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'User or content not found' });
      }
      if (!userInfo.likedContents) {
        userInfo.likedContents = [];
      }
      userInfo.likedContents.push({ contentId, type });
      if (!contentInfo.likes) {
        contentInfo.likes = [];
      }
      contentInfo.likes.push(userId);
      await Promise.all([userInfo.save({ session }), contentInfo.save({ session })]);
      await session.commitTransaction();
      session.endSession();
      if (userInfo && contentInfo) {
        secondaryActionsForLike(contentId, userId, contentInfo.idOfSender, userInfo, contentInfo);
      }
      return res
        .status(StatusCodes.OK)
        .json({ message: 'You have successfully liked the content.' });
    } catch (error: any) {
      await session.abortTransaction();
      session.endSession();
      console.log(error);
      if (error?.hasErrorLabel('TransientTransactionError')) {
        retryCount++;
        console.log(`Retrying transaction... attempt ${retryCount}`);
      } else {
        console.log(error);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'Something went wrong.', error });
      }
    }
  }
  return res
    .status(StatusCodes.INTERNAL_SERVER_ERROR)
    .json({ message: 'Something went wrong after multiple retries.' });
};

/**
 * @desc Handles secondary actions after a like event, including notifications.
 * @route
 * @access User, Admin
 */
const secondaryActionsForLike = async (
  contentId: string,
  userId: string,
  publisherId: string,
  userInfo: any,
  contentInfo: any,
) => {
  try {
    const scheduleTime = new Date(Date.now() + 1000);

    schedule.scheduleJob(`like_${contentId}_${userId}`, scheduleTime, async () => {
      const contributorInfo = await User.findById(publisherId, {
        pushToken: 1,
        unreadNotice: 1,
        notifications: 1,
      }).lean();

      if (!contributorInfo) {
        console.error(`User not found: publisherId=${publisherId}`);
        return;
      }

      const contentObj = contentInfo.toObject();
      const noticeId = `like_${contentId}`;

      // Generate like notification message
      const likeCount = contentObj.likes?.length - 1 || 0;
      const noticeText =
        likeCount === 0
          ? `${userInfo.name} liked your post!`
          : `${userInfo.name} and ${likeCount} other${likeCount > 1 ? 's' : ''} liked your post!`;

      const notice = {
        value: noticeText,
        img1: userInfo.image,
        img2: contentInfo.url,
        action: 'profile2',
        key: 'like',
        params: {
          img: userInfo.image,
          name: userInfo.name,
          id: userInfo._id,
          userPushToken: userInfo.pushToken,
        },
        contentMetaData: {
          ...contentObj,
          comments: contentObj.comments?.slice(0, 6) || [],
          commentsNum: contentObj.comments?.length || 0,
        },
        uid: noticeId,
      };

      // Remove duplicate notices
      const updatedUnreadNotices =
        contributorInfo.unreadNotice?.filter((n) => n.uid !== noticeId) || [];
      updatedUnreadNotices.unshift(notice);

      // Atomic update for consistency
      await User.updateOne({ _id: publisherId }, { $set: { unreadNotice: updatedUnreadNotices } });

      // Prepare push notification
      const notificationData: any = {
        pushToken: [contributorInfo.pushToken],
        title: noticeText,
        body: `${contentInfo.text.substring(0, 50)}...`,
        url: `https://macbease.com/app/content/${contentId}/normal`,
      };

      if (contentInfo.contentType === 'image') {
        notificationData.image = await generateUri(contentInfo.url.split('@')[0]);
      }

      scheduleNotification2(notificationData);
    });
  } catch (error) {
    console.error('Error in secondaryActionsForLike:', error);
  }
};

/**
 * @desc     Add a comment to a content post
 * @route    POST /comment
 * @access   User
 */
const comment = async (req: Request, res: Response) => {
  const { contentId, type, text, peopleTagged = [], actionHandled } = req.body;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(contentId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid user or content ID' });
  }

  try {
    const [user, content] = await Promise.all([
      User.findById(userId).select('name image pushToken').lean(),
      Content.findById(contentId).select('comments contentType url text idOfSender').lean(),
    ]);

    if (!user || !content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User or content not found' });
    }

    const contributor = await User.findById(content.idOfSender).select('pushToken').lean();
    if (!contributor) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Contributor not found' });
    }

    const commentId = new mongoose.Types.ObjectId().toString();
    const newComment = {
      cid: Number(new mongoose.Types.ObjectId()),
      text: text,
      id: new mongoose.Types.ObjectId().toString(),
      name: user.name,
      peopleTagged,
      img: user.image || '',
      pushToken: user.pushToken || '',
      likes: [],
      replies: [],
    };

    await Promise.all([
      Content.updateOne(
        { _id: contentId },
        { $push: { comments: { $each: [newComment], $position: 0 } } },
      ),
      User.updateOne(
        { _id: userId },
        { $push: { commentedContents: { cid: commentId, contentId, type } } },
      ),
    ]);

    const notificationPayload: {
      pushToken: string[];
      title: string;
      body: string;
      image?: string;
    } = {
      pushToken: contributor.pushToken ? [contributor.pushToken] : [],
      title: `${user.name} commented on your post!`,
      body: `${content.text?.substring(0, 50)}...`,
    };

    if (content.contentType === 'image' && content.url) {
      notificationPayload.image = await generateUri(content.url.split('@')[0]);
    }

    actionHandled
      ? scheduleNotification2(notificationPayload)
      : scheduleNotification(notificationPayload);

    return res.status(StatusCodes.OK).json({ message: 'Comment posted successfully!' });
  } catch (error) {
    console.error('Error posting comment:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong!' });
  }
};

/**
 * @desc Unlike content
 * @route DELETE /content/unlike
 * @access User, Admin
 */
const unlikeContent = async (req: Request, res: Response) => {
  const { contentId } = req.params;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid content ID' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const content = await Content.findById(contentId).session(session);
    if (!content) {
      await session.abortTransaction();
      session.endSession();
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Content not found' });
    }

    const updateUser = User.findByIdAndUpdate(
      userId,
      { $pull: { likedContents: contentId } },
      { new: true, session },
    );

    const updateContent = Content.findByIdAndUpdate(
      contentId,
      { $pull: { likes: userId } },
      { new: true, session },
    );

    await Promise.all([updateUser, updateContent]);

    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.OK).json({ message: 'Content unliked successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error unliking content:', error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Something went wrong, please try again later',
    });
  }
};

/**
 * @desc Delete a comment from a content item
 * @route DELETE /content/comment/delete
 * @access User, Admin
 */
const deleteComment = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!['admin', 'user'].includes(userRole)) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: 'Unauthorized to delete this comment' });
    }

    // Use findOneAndUpdate to minimize DB calls for content
    const content = await Content.findOneAndUpdate(
      { _id: contentId },
      { $pull: { comments: { id: userId } } }, // Efficiently remove the comment
      { new: true },
    );

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found' });
    }

    // Remove the content from user's commentedContents in parallel
    const userModel = userRole === 'user' ? User : Admin;
    const user = await (userModel as typeof User).findOneAndUpdate(
      { _id: userId },
      { $pull: { commentedContents: { contentId } } }, // Efficiently remove comment reference
      { new: true },
    );

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: `${userRole} not found` });
    }

    return res.status(StatusCodes.OK).json({ message: 'Comment successfully deleted' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

/**
 * @desc Delete content
 * @route DELETE /content/:contentId
 * @access User, Admin
 */
const deleteContent = async (req: Request, res: Response) => {
  const { contentId, adminId } = req.body;
  const content = await Content.findById(contentId);
  let isEligible = false;
  if (req.user.role === 'admin' || content?.idOfSender === req.user.id) isEligible = true;
  if (isEligible) {
    const deletedContent = await Content.findByIdAndDelete(contentId);
    Admin.findById(adminId, (err: any, admin: any) => {
      if (err) return console.error(err);
      admin.thrashUrls.push(deletedContent?.url);
      admin.save((err: any, update: any) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .json({ message: 'The content has been successfully deleted.' });
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .json({
        message:
          'You are not authorized to delete this content as you are neither creator nor admin.',
      });
  }
};

/**
 * @desc Fetches content by contentId, including a limited number of comments
 * @route GET /content
 * @access User, Admin
 */
const getContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.query;

    if (!contentId || typeof contentId !== 'string') {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid contentId.' });
    }

    const content = await Content.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(contentId) },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
        },
      },
    ]).exec();

    if (!content.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Content not found.' });
    }

    return res.status(StatusCodes.OK).json(content[0]);
  } catch (error) {
    console.error(`Error fetching content for contentId: ${req.query.contentId}`, error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Get paginated comments for content
 * @route GET /content/:contentId/comments
 * @access Public
 */
const getComments = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const { batch = 1, batchSize = 10, remainder = 0 } = req.query;

    const content = await Content.findById(contentId, { comments: 1, _id: 0 });
    if (!content) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found' });

    const start = (Number(batch) - 1) * Number(batchSize) + Number(remainder);
    const finalComments = content?.comments?.slice(start, start + Number(batchSize));

    return res
      .status(StatusCodes.OK)
      .json({ comments: finalComments, total: content?.comments?.length });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Get most popular comments
 * @route GET /content/:contentId/popular-comments
 * @access Public
 */
const getPopularComments = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const { batch = 1 } = req.query;

    const content = await Content.findById(contentId, { comments: 1 });
    if (!content) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found' });

    const start = (Number(batch) - 1) * 10;
    const sortedComments = content?.comments?.sort(
      (a, b) => (b.likes?.length || 0) - (a.likes?.length || 0),
    );
    const popularComments = sortedComments?.slice(start, start + 6);

    return res.status(StatusCodes.OK).json(popularComments);
  } catch (error) {
    console.error('Error fetching popular comments:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Like a comment on a content
 * @route PATCH /content/:contentId/comment/:commentId/like
 * @access User
 */
const likeComment = async (req: Request, res: Response) => {
  const { contentId, commentId } = req.params;
  try {
    const content = await Content.findOneAndUpdate(
      { _id: contentId, 'comments._id': commentId },
      { $addToSet: { 'comments.$.likes': req.user.id } },
      { new: true },
    );
    if (!content)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content or comment not found' });
    return res.status(StatusCodes.OK).json({ message: 'Comment liked successfully' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Unlike a comment on a content
 * @route PATCH /content/:contentId/comment/:commentId/unlike
 * @access User
 */
const unLikeComment = async (req: Request, res: Response) => {
  const { contentId, commentId } = req.params;
  try {
    const content = await Content.findOneAndUpdate(
      { _id: contentId, 'comments._id': commentId },
      { $pull: { 'comments.$.likes': req.user.id } },
      { new: true },
    );
    if (!content)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content or comment not found' });
    return res.status(StatusCodes.OK).json({ message: 'Comment unliked successfully' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Get content based on time span (today, week, all)
 * @route GET /content?span={today|week|all}
 * @access Public
 */
const getContentBySpan = async (req: Request, res: Response) => {
  const { span } = req.query;
  try {
    const timeFilters: Record<string, number> = {
      today: 86400000, // 1 day in ms
      week: 604800000, // 7 days in ms
    };

    const filter: any = { sendBy: 'Macbease' };
    if (span && span !== 'all') {
      filter.timeStamp = { $gte: new Date(Date.now() - (timeFilters[span as string] || 0)) };
    }

    const contents = await Content.find(filter);
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error('Error fetching content by span:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Fetches secondary feed content based on provided timestamp and clubs
 * @route GET
 * @access User, Admin
 */
const getSecondaryFeed = async (cachedEndTimeStamp: Date, clubs: { clubId: string }[]) => {
  try {
    if (!cachedEndTimeStamp || isNaN(cachedEndTimeStamp.getTime())) {
      throw new Error('Invalid timestamp provided');
    }

    const clubIds = clubs?.map((club) => club.clubId) || [];
    const oneMonthBefore = new Date(cachedEndTimeStamp);
    oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);

    // Helper function to create aggregation pipeline
    const createAggregationPipeline = (matchCriteria: Record<string, unknown>): PipelineStage[] => [
      {
        $match: {
          ...matchCriteria,
          timeStamp: { $gte: oneMonthBefore, $lt: cachedEndTimeStamp },
        },
      },
      {
        $addFields: {
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] }, // Limit comments to 6
        },
      },
      { $project: { vector: 0 } }, // Exclude vector field
      { $sample: { size: 3 } }, // Randomly sample 3 documents
    ];

    // Define query conditions
    const macbeaseMatch = {};
    const commContentsMatch = { contentType: 'image', sendBy: 'userCommunity' };
    const clubContentsMatch = { contentType: 'image', belongsTo: { $in: clubIds } };

    // Execute queries in parallel
    const [macbeaseContents, commContents, clubContents, cardContents] = await Promise.all([
      MacbeaseContent.aggregate(createAggregationPipeline(macbeaseMatch)),
      Content.aggregate(createAggregationPipeline(commContentsMatch)),
      Content.aggregate(createAggregationPipeline(clubContentsMatch)),
      Card.aggregate([
        {
          $match: {
            $expr: {
              $gt: [{ $size: { $split: [{ $ifNull: ['$value', ''] }, ' '] } }, 24],
            },
          },
        },
        { $sample: { size: 5 } },
        { $project: { vector: 0 } }, // Exclude vector field
      ]),
    ]);

    return [...macbeaseContents, ...commContents, ...clubContents, ...cardContents];
  } catch (error) {
    console.error('Error fetching secondary feed:', error);
    return null;
  }
};

/**
 * @desc Fetches landing page content based on user role and preferences.
 * @route GET /get-content-for-landing
 * @access User
 */
const getContentForLanding = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    }

    const { key, cachedStartTimeStamp, cachedEndTimeStamp, cachedFlagId } = req.query;
    let mode = 'primary';

    // Fetch user details with necessary fields only
    const user = await User.findById(req.user.id, {
      lastActive: 1,
      name: 1,
      image: 1,
      feed: 1,
      eventFeed: 1,
      course: 1,
      role: 1,
      interests: 1,
      clubs: 1,
      communitiesCreated: 1,
      communitiesPartOf: 1,
      giftsSend: 1,
      chatRooms: 1,
      email: 1,
      unreadNotice: 1,
      level: 1,
      passoutYear: 1,
      field: 1,
      incompleteProfile: 1,
      shortCuts: 1,
      incompleteFields: 1,
    }).lean();

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });
    }

    const { feed = [], eventFeed = [] } = user;
    let newFeed: any[] = [];

    // Fetch additional content if key is not 'all'
    if (key !== 'all') {
      const [randomCommunities, randomClubs] = await Promise.all([
        Community.aggregate([{ $sample: { size: 3 } }, { $project: { content: 1 } }]),
        Club.aggregate([{ $sample: { size: 3 } }, { $project: { content: 1 } }]),
      ]);

      const fetchContent = async (contentList: any[]) => {
        return (
          await Promise.all(
            contentList.map(async ({ content }) => {
              if (content.length > 0) {
                const randomContent = content[Math.floor(Math.random() * content.length)];
                const foundContent = await Content.findById(randomContent.contentId)
                  .select('-vector')
                  .lean();
                return foundContent
                  ? { ...foundContent, commentsNum: foundContent.comments?.length ?? 0 }
                  : null;
              }
              return null;
            }),
          )
        ).filter(Boolean);
      };

      newFeed = [
        ...newFeed,
        ...(await fetchContent(randomCommunities)),
        ...(await fetchContent(randomClubs)),
      ];
    }

    // Fetch content if key is 'all'
    if (key === 'all') {
      let contentIds = feed.slice(0, 12).map((item: any) => item._id.toString());
      if (cachedFlagId) {
        contentIds = contentIds.slice(0, contentIds.indexOf(cachedFlagId));
      }
      const contentDocs = await Content.find({ _id: { $in: contentIds } })
        .select('-vector')
        .lean();

      // Process content
      newFeed = contentDocs
        .map((doc) => ({
          ...doc,
          commentsNum: doc.comments?.length ?? 0,
          comments: (doc.comments ?? []).slice(0, 6),
        }))
        .filter(Boolean);

      const macbeaseQuery = cachedStartTimeStamp
        ? { timeStamp: { $gt: new Date(cachedStartTimeStamp as string) } }
        : {};
      const macbeaseContents = await MacbeaseContent.aggregate([
        { $match: macbeaseQuery },
        { $sort: { timeStamp: -1 } },
        { $limit: 12 },
        {
          $addFields: {
            commentsNum: { $size: '$comments' },
            comments: { $slice: ['$comments', 6] },
          },
        },
      ]);

      newFeed = [...newFeed, ...macbeaseContents];
    }

    // Sort by timeStamp
    newFeed.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());

    // Fetch additional feed if needed
    if (cachedEndTimeStamp && newFeed.length === 0) {
      mode = 'secondary';
      newFeed =
        (await getSecondaryFeed(new Date(cachedEndTimeStamp as string), user.clubs || [])) || [];
    }

    // Shuffle data for a balanced layout
    const randIndex = Math.ceil(Math.random() * newFeed.length);
    const [data1, data2, data3] = [
      newFeed.slice(0, randIndex),
      newFeed.slice(randIndex, Math.floor(newFeed.length / 2)),
      newFeed.slice(Math.floor(newFeed.length / 2)),
    ];

    // Fetch recommended clubs and communities
    const [clubs, communities] = await Promise.all([
      Club.aggregate([{ $match: { members: { $ne: req.user.id } } }, { $sample: { size: 6 } }]),
      Community.aggregate([
        { $match: { members: { $ne: req.user.id } } },
        { $sample: { size: 6 } },
      ]),
    ]);

    return res.status(StatusCodes.OK).json({
      data1,
      data2,
      data3,
      eventFeed,
      userProfile: {
        ...user,
        clubsCount: clubs.length,
        communitiesCreated: user.communitiesCreated?.length || 0,
        communitiesPartOf: user.communitiesPartOf?.length || 0,
      },
      clubRecommendations: clubs,
      communityRecommendations: communities,
      cache: mode === 'primary',
    });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'Server error', details: error });
  }
};

/**
 * @desc Fetches random content from communities and clubs
 * @route GET /get-random-content
 * @access User, Admin
 */
const getRandomContent = async (req: Request, res: Response) => {
  try {
    const size = req.query.size ? Number(req.query.size) : 0;

    if (isNaN(size) || size <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid size parameter. It must be a positive number.',
      });
    }

    // Fetch random communities and clubs in parallel
    const [communities, clubs] = await Promise.all([
      Community.aggregate([{ $sample: { size } }]),
      Club.aggregate([{ $sample: { size } }]),
    ]);

    const contentPromises: Promise<any>[] = [];

    for (let i = 0; i < size; i++) {
      // Selecting random content from clubs
      if (clubs[i]?.content?.length) {
        const randomIndex = Math.floor(Math.random() * clubs[i].content.length);
        contentPromises.push(
          fetchContentWithMetadata(clubs[i].content[randomIndex], 'club', clubs[i]),
        );
      }

      // Selecting random content from communities
      if (communities[i]?.content?.length) {
        const randomIndex = Math.floor(Math.random() * communities[i].content.length);
        contentPromises.push(
          fetchContentWithMetadata(
            communities[i].content[randomIndex],
            'community',
            communities[i],
          ),
        );
      }
    }

    // Resolve all content fetching in parallel
    const actualDataArr = (await Promise.all(contentPromises)).filter(Boolean);

    return res.status(StatusCodes.OK).json({ data: actualDataArr });
  } catch (error) {
    console.error('Error fetching random content:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Something went wrong while fetching content.',
      error: error,
    });
  }
};

/**
 * Fetches content details and appends relevant metadata.
 * @param contentData - Content object containing contentId.
 * @param type - Either 'club' or 'community'.
 * @param parentData - The parent object (club or community).
 * @returns A formatted content object or null if not found.
 */
const fetchContentWithMetadata = async (
  contentData: any,
  type: 'club' | 'community',
  parentData: any,
) => {
  try {
    const actualData = await Content.findById(contentData.contentId).lean();
    if (!actualData) return null;

    return {
      ...actualData,
      ...(type === 'community'
        ? {
            communityTitle: parentData.title,
            communityCover: parentData.secondaryCover,
            irrelevanceVote: contentData.irrelevanceVote,
          }
        : {
            clubTitle: parentData.name,
            clubCover: parentData.secondaryImg,
          }),
    };
  } catch (error) {
    console.error(`Error fetching content with ID ${contentData.contentId}:`, error);
    return null;
  }
};

/**
 * @desc    Edit content
 * @route   PATCH /content/:contentId
 * @access  Admin, Content Owner
 */
const editContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const updates = req.body;

    if (!contentId || !updates) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid request data.' });
    }

    // Find content with selected fields and check authorization
    const content = await Content.findById(contentId, 'idOfSender');
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
    }

    if (content.idOfSender.toString() !== req.user.id && req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to edit this content.' });
    }

    // Update content with minimal DB calls
    await Content.findByIdAndUpdate(contentId, updates, { new: true });

    return res.status(StatusCodes.OK).json({ message: 'Content successfully updated.' });
  } catch (error) {
    console.error('Error updating content:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc    Get latest Macbease content with contributor details
 * @route   GET /content/macb-content
 * @access  User
 */
const getMacbContent = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized' });
    }

    // Fetch latest Macbease content with user details in one query using `$lookup`
    const macbeaseContents = await MacbeaseContent.aggregate([
      { $sort: { timeStamp: -1 } },
      { $limit: 12 },
      {
        $lookup: {
          from: 'users',
          localField: 'belongsTo',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          timeStamp: 1,
          contributorName: '$userDetails.name',
          contributorPic: '$userDetails.image',
          userPushToken: '$userDetails.pushToken',
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(macbeaseContents);
  } catch (error) {
    console.error('Error fetching Macbease content:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 *
 * @desc Search content by tag (fetch related content based on tag query)
 * @route GET /content/search-by-tag
 * @access PUBLIC
 */
const searchContentByTag = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing query parameter' });
    }

    // Normalize and fetch related tags
    const lemmatizedTags = lemmatize([query as string]);
    const allTags = await getRelatedTags(lemmatizedTags);

    if (allTags.length === 0) {
      return res.status(StatusCodes.OK).json({ actualContent: [] });
    }

    // Fetch content in a single query using $in
    const regexTags = allTags.map((tag) => new RegExp(tag, 'i'));
    const [contentFound, macbeaseContentFound] = await Promise.all([
      Content.find({ tags: { $in: regexTags } })
        .limit(12)
        .lean(),
      MacbeaseContent.find({ tags: { $in: regexTags } })
        .limit(12)
        .lean(),
    ]);

    // Remove duplicates efficiently using a Set
    const uniqueContent = new Set();
    const relatedContent = [...contentFound, ...macbeaseContentFound].filter((item) => {
      if (!uniqueContent.has(item._id.toString())) {
        uniqueContent.add(item._id.toString());
        return true;
      }
      return false;
    });

    // Fetch additional user/club/community data in bulk
    const userIds = new Set<string>();
    const clubIds = new Set<string>();
    const communityIds = new Set<string>();

    relatedContent.forEach(({ sendBy, idOfSender, belongsTo }) => {
      if (sendBy === 'club') {
        userIds.add(idOfSender);
        clubIds.add(belongsTo);
      } else if (sendBy === 'Macbease' || sendBy === 'userCommunity') {
        userIds.add(belongsTo || idOfSender);
      } else if (sendBy === ('userCommunity' as string)) {
        communityIds.add(belongsTo);
      }
    });

    const [users, clubs, communities] = await Promise.all([
      User.find({ _id: { $in: [...userIds] } }, { name: 1, image: 1, pushToken: 1 }).lean(),
      Club.find({ _id: { $in: [...clubIds] } }, { name: 1, secondaryImg: 1 }).lean(),
      Community.find({ _id: { $in: [...communityIds] } }, { title: 1, secondaryCover: 1 }).lean(),
    ]);

    const userMap = Object.fromEntries(users.map((user) => [user._id.toString(), user]));
    const clubMap = Object.fromEntries(clubs.map((club) => [club._id.toString(), club]));
    const communityMap = Object.fromEntries(
      communities.map((community) => [community._id.toString(), community]),
    );

    // Enrich content with additional details
    const actualContent = relatedContent.map((dataPoint) => {
      const { sendBy, idOfSender, belongsTo } = dataPoint;
      if (sendBy === 'club' && clubMap[belongsTo] && userMap[idOfSender]) {
        return {
          ...dataPoint,
          userName: userMap[idOfSender]?.name,
          userPic: userMap[idOfSender]?.image,
          clubTitle: clubMap[belongsTo]?.name,
          clubCover: clubMap[belongsTo]?.secondaryImg,
          userPushToken: userMap[idOfSender]?.pushToken,
        };
      } else if (sendBy === 'Macbease' && userMap[belongsTo as string]) {
        return {
          ...dataPoint,
          contributorName: userMap[belongsTo as string]?.name,
          contributorPic: userMap[belongsTo as string]?.image,
          userPushToken: userMap[belongsTo as string]?.pushToken,
        };
      } else if (sendBy === 'userCommunity' && userMap[idOfSender] && communityMap[belongsTo]) {
        return {
          ...dataPoint,
          userName: userMap[idOfSender]?.name,
          userPic: userMap[idOfSender]?.image,
          communityTitle: communityMap[belongsTo]?.title,
          communityCover: communityMap[belongsTo]?.secondaryCover,
          irrelevanceVote: 0,
          userPushToken: userMap[idOfSender]?.pushToken,
        };
      }
      return dataPoint;
    });

    return res.status(StatusCodes.OK).json({ actualContent });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Sends a notification when a content post is made.
 * @route DELETE /card/:cardId
 * @access User, Admin
 */
const redundancy = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Fetch content and community details concurrently
    const [contentMetaData, community] = await Promise.all([
      Content.findById('657c5009f18136e2f6923acf', { url: 1 }).lean(),
      Community.findById('66ed18fe0c4142316f4c43f7', { title: 1, secondaryCover: 1 }).lean(),
    ]);

    // Handle missing data cases
    if (!contentMetaData || !community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content or Community not found' });
    }

    // Generate image URI if applicable
    const img = contentMetaData.url ? await generateUri(contentMetaData.url.split('@')[0]) : '';

    // Schedule push notification
    scheduleNotification({
      pushToken: [
        'fRI5zs8OTD2vtviWbWsKpP:APA91bE_nX-PyfaL1ir6PsneMhogaap4-QFIyMezdkVLumiJikYFCUKxvt2kcqGyQ4jV6K1a_YiAFfgBYb2w9SHzvkXGVdSrNqt0_hR-CVZtp5vQknWtSAw',
      ],
      title: `Amartya posted in ${community.title}.`,
      body: `Check out the latest post now!`,
      image: img,
    });

    console.log('Notification image:', img);

    return res.status(StatusCodes.OK).json({ message: 'Notification scheduled successfully' });
  } catch (error) {
    console.error('Error in redundancy controller:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error: error });
  }
};

/**
 * @desc Load more content for the user feed
 * @route GET /load-more-content
 * @access User, Admin
 */
const loadMoreContent = async (req: Request, res: Response) => {
  try {
    const { lastTimeStamp } = req.query;
    const parsedTimeStamp = lastTimeStamp ? new Date(lastTimeStamp as string) : new Date();

    // Fetch Macbease contents
    const macbeaseContents = await MacbeaseContent.aggregate([
      { $match: { timeStamp: { $lt: parsedTimeStamp } } },
      { $sort: { timeStamp: -1 } },
      { $limit: 12 },
      {
        $project: {
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
          timeStamp: 1,
          belongsTo: 1,
        },
      },
    ]);

    if (!macbeaseContents.length) {
      return res.status(StatusCodes.OK).json([]);
    }

    const [startRange, endRange] = [
      macbeaseContents[0].timeStamp,
      macbeaseContents[macbeaseContents.length - 1].timeStamp,
    ];

    // Fetch user communities and clubs in a single query
    const userInfo = await User.findById(req.user.id, 'communitiesPartOf clubs').lean();
    const belongsTo = [
      ...(userInfo?.communitiesPartOf || []).map((c: any) => c.communityId),
      ...(userInfo?.clubs || []).map((c: any) => c.clubId),
    ];

    // Fetch other clubs and communities in a single call
    const additionalGroups = await Promise.all([
      Club.find({ _id: { $nin: belongsTo } })
        .limit(2)
        .lean(),
      Community.find({ _id: { $nin: belongsTo } })
        .limit(2)
        .lean(),
    ]);

    belongsTo.push(
      ...additionalGroups[0].map((c: any) => c._id.toString()),
      ...additionalGroups[1].map((c: any) => c._id.toString()),
    );

    // Fetch additional content in a single call
    const additionalContents = await Content.find({
      belongsTo: { $in: belongsTo },
      timeStamp: { $lt: startRange, $gte: endRange },
    })
      .sort({ timeStamp: -1 })
      .limit(24)
      .select('timeStamp comments belongsTo')
      .lean();

    // Optimize transformation
    const formattedContents = additionalContents.map((content) => ({
      ...content,
      commentsNum: content.comments?.length ?? 0,
      comments: (content.comments ?? []).slice(0, 6),
    }));

    // Combine and sort
    const combinedFeed = [...macbeaseContents, ...formattedContents].sort(
      (a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime(),
    );

    return res.status(StatusCodes.OK).json(combinedFeed);
  } catch (error) {
    console.error('Error fetching older content:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to retrieve content.',
      details: error,
    });
  }
};

interface IReply {
  name: string;
  text: string;
  pushToken?: string;
}

/**
 * @desc    Reply to a comment on content
 * @route   POST /content/:contentId/comment/:commentIndex/reply
 * @access  User
 */
const replyToComment = async (req: Request, res: Response) => {
  try {
    const { contentId, commentIndex } = req.params;
    const reply: IReply = req.body;

    if (!contentId || !reply || typeof reply !== 'object') {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid request data.' });
    }

    // Find and update the content in one operation
    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
    }

    const index = parseInt(commentIndex, 10);
    if (!content.comments || isNaN(index) || index < 0 || index >= content.comments.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Comment not found.' });
    }

    // Update comment replies efficiently
    if (!content.comments[index].replies) {
      content.comments[index].replies = [];
    }
    content.comments[index].replies.push(reply);
    await content.save();

    // Send push notification if applicable
    if (content.comments[index].pushToken) {
      scheduleNotification2({
        pushToken: [content.comments[index].pushToken],
        title: `${reply.name} replied to your comment!`,
        body: `${reply.text.substring(0, 50)}...`,
        url: `https://macbease.com/app/content/${contentId}/normal`,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Successfully replied to comment.' });
  } catch (error) {
    console.error('Error replying to comment:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc    Generate and store embeddings for content
 * @route   POST /content/embeddings
 * @access  Admin
 */
const contentEmbedding = async (req: Request, res: Response) => {
  try {
    const contents = await Content.find({ 'vector.0': { $exists: false } }, 'text tags');

    if (contents.length === 0) {
      return res.status(StatusCodes.OK).json({ message: 'All embeddings are already generated.' });
    }

    for (const content of contents) {
      const combinedInput = `${content.text} ${content.tags?.join(', ') || ''}`;
      try {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: combinedInput,
          encoding_format: 'float',
        });

        content.vector = embedding.data[0].embedding;
        await content.save();

        console.log(`Embedding generated and saved for content ID: ${content._id}`);
      } catch (err: any) {
        console.error(`Failed to process content ID: ${content._id}`, err.message);
      }

      // Delay for API rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return res.status(StatusCodes.OK).json({ message: 'Embeddings successfully generated.' });
  } catch (error) {
    console.error('Error generating embeddings:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc    Search content using vector embeddings
 * @route   POST /content/search
 * @access  User, Admin
 */
const searchContent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Query is required.' });
    }

    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    });

    const embeddingData = embeddingResponse?.data?.[0]?.embedding;
    if (!embeddingData) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to generate embeddings.' });
    }

    // Query database using vector search
    const contents = await Content.aggregate([
      {
        $vectorSearch: {
          queryVector: embeddingData,
          path: 'vector',
          numCandidates: 50, // Optimized from 100 to reduce unnecessary processing
          limit: 5,
          index: 'vector_index',
        },
      },
      {
        $project: { vector: 0 }, // Exclude vector from response to minimize payload size
      },
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      results: contents.length,
      data: contents,
    });
  } catch (error) {
    console.error('SearchContent Error:', error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Something went wrong. Please try again later.',
    });
  }
};

/**
 * @desc    Search content within a community using vector embeddings
 * @route   POST /search-by-community
 * @access  User, Admin
 */
const searchByCommunity = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.query;
    const { query } = req.body;

    if (!id || !query) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Community ID and query are required.' });
    }

    // Fetch community with projection to minimize DB load
    const community = await Community.findById(id).select('_id');

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found.' });
    }

    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    });

    const queryVector = embeddingResponse?.data?.[0]?.embedding;
    if (!queryVector) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to generate embeddings.' });
    }

    // Search for content in the community using vector search
    const contents = await Content.aggregate([
      {
        $match: { belongsTo: community._id }, // Filtering first to optimize performance
      },
      {
        $vectorSearch: {
          queryVector,
          path: 'vector',
          numCandidates: 50, // Reduced to improve performance
          limit: 5,
          index: 'vector_index',
        },
      },
      {
        $project: { vector: 0 }, // Exclude unnecessary data
      },
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      results: contents.length,
      data: contents,
    });
  } catch (error) {
    console.error('SearchByCommunity Error:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Something went wrong. Please try again later.',
    });
  }
};

/**
 * @desc    Generate hashtags from text
 * @route   POST /content/hashtags/generate
 * @access  Public
 */
const generateHashTags = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Valid text is required.' });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Generate an array of one-word hashtags for the text - ${text}. Separate hashtags by white space. Do not include "#" symbol.`,
        },
      ],
      max_tokens: 100,
    });

    const generatedHashTags = response?.choices[0]?.message?.content?.trim().split(/\s+/);
    return res.status(StatusCodes.OK).json({ hashtags: generatedHashTags });
  } catch (error) {
    console.error('Error generating hashtags:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to generate hashtags.', error });
  }
};

export {
  redundancy,
  getPopularComments,
  likeComment,
  unLikeComment,
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteComment,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getContentForLanding,
  getRandomContent,
  getMacbContent,
  searchContentByTag,
  editContent,
  replyToComment,
  loadMoreContent,
  contentEmbedding,
  searchContent,
  searchByCommunity,
  generateHashTags,
};
