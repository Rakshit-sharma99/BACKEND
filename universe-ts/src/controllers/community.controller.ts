import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Community from '../models/community.model';
import Admin from '../models/admin.model';
import User from '../models/user.model';
import Content from '../models/content.model';
import Club from '../models/club.model';
import Bag from '../models/bag.model';
import Card from '../models/card.model';
import schedule from 'node-schedule';
import mongoose from 'mongoose';
import { io } from '../server';
import {
  scheduleNotification,
  updateDynamicIsland,
  scheduleNotification2,
  generateUri,
} from './utils.controller';

/**
 * @desc    Create a new community
 * @route   POST /community
 * @access  User, Admin
 */
const createCommunity = async (req: Request, res: Response) => {
  try {
    const { role, id: creatorId } = req.user;
    if (!['admin', 'user'].includes(role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to create a community.' });
    }

    const { title, cover, secondaryCover, label, tag } = req.body;
    const createdOn = new Date();
    const communityData = {
      title,
      cover,
      secondaryCover,
      label,
      creatorId,
      creatorPos: role,
      createdOn,
      tag,
      members: [creatorId],
      admins: [creatorId],
    };

    // Create community
    const community = await Community.create(communityData);
    if (!community) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ message: 'Failed to create community' });
    }

    const communityId = (community as any)._id.toString();

    const shortCut = {
      type: 'community',
      id: communityId,
      name: title,
      secondary: secondaryCover,
      native: true,
      metaData: { posts: 0 },
    };

    const userUpdate = await User.findByIdAndUpdate(
      creatorId,
      {
        $push: {
          shortCuts: shortCut,
          communitiesCreated: { communityId },
          communitiesPartOf: {
            communityId,
            bestStreak: 0,
            currentStreak: 0,
            lastPosted: createdOn,
            totalLikes: 0,
            totalPosts: 0,
            rating: 0,
            joined: createdOn,
          },
          notifications: {
            key: 'community',
            value: 'You have successfully created a community.',
            data: communityId,
          },
        },
      },
      { new: true },
    );

    if (!userUpdate) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ message: 'Failed to update user profile' });
    }

    return res.status(StatusCodes.CREATED).json(community);
  } catch (error) {
    console.error('Error creating community:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while creating the community.' });
  }
};

/**
 * @desc Deletes a community by ID
 * @route DELETE /delete-community
 * @access Admin
 */
const deleteCommunity = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'Unauthorized access' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Community ID is required' });
    }

    const community = await Community.findById(id);
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found' });
    }

    await community.deleteOne();

    return res
      .status(StatusCodes.OK)
      .json({ message: 'Community deleted successfully', deletedCommunity: community });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'Server error', details: error });
  }
};

/**
 * @desc Allows a user or admin to join a community
 * @route POST /join-as-member
 * @access User, Admin
 */
const joinAsMember = async (req: Request, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'user')) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'Unauthorized access' });
    }

    const { communityId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid community ID' });
    }

    const [community, user] = await Promise.all([
      Community.findById(communityId),
      req.user.role === 'user' ? User.findById(req.user.id) : null,
    ]);

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found' });
    }

    const userId = new mongoose.Types.ObjectId(req.user.id);
    if (community.members.map((member) => member.toString()).includes(userId.toString())) {
      return res.status(StatusCodes.CONFLICT).json({ message: 'You are already a member' });
    }

    community.members.push(userId.toString());
    community.activeMembers += 1;

    if (req.user.role === 'user' && user) {
      if (!user.communitiesPartOf) {
        user.communitiesPartOf = [];
      }
      user.communitiesPartOf.push({
        communityId,
        bestStreak: 0,
        currentStreak: 0,
        lastPosted: new Date(),
        totalLikes: 0,
        totalPosts: 0,
        rating: 0,
        joined: new Date(),
      });

      if (!user.notifications) {
        user.notifications = [];
      }
      user.notifications = user.notifications || [];
      user.notifications.push({
        key: 'community',
        value: 'You have joined the community.',
        data: communityId,
      });

      await user.save();
    }

    await community.save();
    return res
      .status(StatusCodes.OK)
      .json({ message: 'You have successfully joined the community' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'Server error', details: error });
  }
};

/**
 * @desc Allows a user or admin to leave a community
 * @route DELETE /leave-as-member
 * @access User, Admin
 */
const leaveAsMember = async (req: Request, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'user')) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'Unauthorized access' });
    }

    const { communityId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid community ID' });
    }

    const [community, user] = await Promise.all([
      Community.findById(communityId),
      req.user.role === 'user' ? User.findById(req.user.id) : null,
    ]);

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found' });
    }

    const userId = new mongoose.Types.ObjectId(req.user.id);
    if (!community.members.map((member) => member.toString()).includes(userId.toString())) {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ message: 'You are not a member of this community' });
    }

    community.members = community.members.filter((id) => id !== userId.toString());
    community.activeMembers = Math.max(0, community.activeMembers - 1);

    if (req.user.role === 'user' && user) {
      user.communitiesPartOf = (user.communitiesPartOf || []).filter(
        (item) => item.communityId.toString() !== communityId,
      );

      user?.notifications?.push({
        key: 'community',
        value: 'You have successfully left the community.',
        data: communityId,
      });

      await user.save();
    }

    await community.save();
    return res.status(StatusCodes.OK).json({ message: 'You have successfully left the community' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'Server error', details: error });
  }
};

/**
 * @desc Upload content to a community
 * @route POST /upload-content
 * @access User, Admin
 */
const uploadContent = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized action' });
    }

    const { contentId, communityId } = req.body;
    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found' });
    }

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    if (!community.members.includes(req.user.id)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'You must be a member to post' });
    }

    // Add content to the community
    community.content.push({
      contentId,
      irrelevanceVote: 0,
      flagSaturated: false,
      flaggedBy: [],
      timeStamp: new Date(),
      type: content.contentType,
    });
    await community.save();

    // Update user or admin contribution records
    const userOrAdmin = req.user.role === 'user' ? User : Admin;
    if (req.user.role === 'user') {
      await User.findByIdAndUpdate(req.user.id, {
        $push: { communityContribution: { contentId, communityId } },
      });
    } else if (req.user.role === 'admin') {
      await Admin.findByIdAndUpdate(req.user.id, {
        $push: { communityContribution: { contentId, communityId } },
      });
    }

    // Schedule job to update members' feeds
    const threeSec = new Date(Date.now() + 3000);
    schedule.scheduleJob(`feedCommunity_${req.user.id}_${Date.now()}`, threeSec, async () => {
      const members = await Community.findById(communityId, { members: 1 }).lean();
      if (!members) return;
      const point = { _id: content._id };
      await User.updateMany(
        { _id: { $in: members.members } },
        { $push: { feed: { $each: [point], $position: 0 } } },
      );
    });

    return res.status(StatusCodes.OK).json({ message: 'Successfully posted' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'An error occurred' });
  }
};

/**
 * @desc Delete content from a community
 * @route DELETE /delete-content
 * @access User, Admin
 */
const deleteContent = async (req: Request, res: Response) => {
  try {
    const { contentId, communityId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate content existence
    const content = await Content.findById(contentId);
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Content not found.' });
    }

    // Check authorization
    const isAdmin = userRole === 'admin';
    const isCreator = content.idOfSender.toString() === userId;
    if (!isAdmin && !isCreator) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error: 'You are not authorized to delete this content.',
      });
    }

    // Remove content from community
    const community = await Community.findByIdAndUpdate(
      communityId,
      { $pull: { content: { contentId: new mongoose.Types.ObjectId(contentId) } } },
      { new: true },
    );
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found.' });
    }

    // Remove content from user/admin contributions (if exists)
    const updateUserContribution = async (Model: any) => {
      await Model.findByIdAndUpdate(userId, { $pull: { communityContribution: { contentId } } });
    };

    if (userRole === 'user') await updateUserContribution(User);
    if (userRole === 'admin') await updateUserContribution(Admin);

    return res.status(StatusCodes.OK).json({ message: 'Content successfully deleted.' });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'An error occurred while deleting content.',
      details: error,
    });
  }
};

/**
 * @desc Flag content as irrelevant within a community
 * @route PATCH /flag
 * @access User, Admin
 */
const flag = async (req: Request, res: Response) => {
  try {
    const { communityId, contentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!['user', 'admin'].includes(userRole)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized to flag content' });
    }

    // Fetch community with specific content and check membership in a single query
    const community = await Community.findOne({ _id: communityId, 'content.contentId': contentId })
      .select('members creatorId content.$')
      .lean();

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community or content not found' });
    }

    const isMember = community.members.some((member) => member.toString() === userId);
    if (!isMember && userRole !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Must be a community member or admin to flag content' });
    }

    const content = community.content[0];
    if (content.flaggedBy.includes(userId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'You have already flagged this content' });
    }

    // Update content flags in a single query
    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, 'content.contentId': contentId },
      {
        $inc: { 'content.$.irrelevanceVote': 1 },
        $addToSet: { 'content.$.flaggedBy': userId },
        $set: {
          'content.$.flagSaturated': content.irrelevanceVote + 1 > 7 ? true : content.flagSaturated,
        },
      },
      { new: true, select: 'content.$' },
    ).lean();

    if (!updatedCommunity) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Failed to flag content' });
    }

    // Handle flag saturation notification
    if (updatedCommunity.content[0].flagSaturated && !content.flagSaturated) {
      const [creator, flaggedContent] = await Promise.all([
        User.findById(community.creatorId).select('notifications').lean(),
        Content.findById(contentId).select('idOfSender').lean(),
      ]);

      const notifications = {
        key: 'communityUrgent',
        value: 'Flag is saturated.',
        data: { communityId, contentId },
      };

      if (creator) {
        await User.updateOne({ _id: creator._id }, { $push: { notifications } });
      }

      if (flaggedContent) {
        await User.updateOne({ _id: flaggedContent.idOfSender }, { $push: { notifications } });
      }
    }

    // Notify user about the flag action
    await User.updateOne(
      { _id: userId },
      {
        $push: {
          notifications: {
            key: 'community',
            value: 'You have flagged a content.',
            data: { contentId, communityId },
          },
        },
      },
    );

    return res.status(StatusCodes.OK).json({ message: 'Successfully flagged the content' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

/**
 * @desc Take down community content
 * @route DELETE /take-down
 * @access User, Admin
 */
const takeDown = async (req: Request, res: Response) => {
  try {
    const { communityId, contentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!['user', 'admin'].includes(userRole)) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: 'Unauthorized to take down content' });
    }

    const community = await Community.findById(communityId)
      .select('creatorId members content')
      .lean();
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    if (community.creatorId.toString() !== userId && userRole !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to remove this content' });
    }

    const content = await Content.findById(contentId).select('idOfSender sendBy').lean();
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found' });
    }

    // Remove content from community
    await Community.updateOne({ _id: communityId }, { $pull: { content: { contentId } } });

    // Schedule feed cleanup for members
    const cleanupTime = new Date(Date.now() + 3 * 1000);
    schedule.scheduleJob(`cleanTakenDown_${userId}_${Date.now()}`, cleanupTime, async () => {
      await User.updateMany({ _id: { $in: community.members } }, { $pull: { feed: contentId } });
    });

    // Update sender's contributions and send notification
    const updateSender = content.sendBy === 'userCommunity' ? User : Admin;
    await updateSender.updateOne(
      { _id: content.idOfSender },
      {
        $pull: { communityContribution: { contentId } },
        $push: {
          notifications: {
            key: 'community',
            value: 'Your content has been taken down',
            data: { communityId },
          },
        },
      },
    );

    return res.status(StatusCodes.OK).json({ message: 'Content successfully taken down' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

/**
 * @desc Updates the user's posting streak within a community
 * @route PATCH /update-streak
 * @access User, Admin
 */
const updateStreak = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const { id: userId, role } = req.user;

    if (!['user', 'admin'].includes(role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to update streak' });
    }

    // Determine model based on role
    const Model = role === 'user' ? User : Admin;

    // Fetch user/admin document
    const user =
      role === 'user'
        ? await User.findById(userId).select('communitiesPartOf').lean()
        : await Admin.findById(userId).select('communitiesPartOf').lean();

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    const community = (user.communitiesPartOf ?? []).find((c) => c.communityId === communityId);

    if (!community) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Community not found in user data' });
    }

    // Calculate streak update
    const lastPosted = new Date(community.lastPosted);
    const today = new Date();
    const _MS_PER_DAY = 1000 * 60 * 60 * 24;
    const diff = Math.floor(
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(lastPosted.getFullYear(), lastPosted.getMonth(), lastPosted.getDate())) /
      _MS_PER_DAY,
    );

    if (diff === 1) {
      community.currentStreak += 1;
      community.bestStreak = Math.max(community.bestStreak, community.currentStreak);
    } else if (diff > 1) {
      community.bestStreak = Math.max(community.bestStreak, community.currentStreak);
      community.currentStreak = 1;
    }

    community.lastPosted = today;

    // Update the user/admin document
    await Model.updateOne(
      { _id: userId, 'communitiesPartOf.communityId': communityId },
      { $set: { 'communitiesPartOf.$': community } },
    );

    return res.status(StatusCodes.OK).json({
      message: 'Streak updated successfully',
      updatedStreak: community,
    });
  } catch (error) {
    console.error('Error updating streak:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

/**
 * @desc Updates the total likes and posts count for a user/admin in a community
 * @route PATCH /likes-and-posts
 * @access User, Admin
 */
const likesAndPosts = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const { id: userId, role } = req.user;

    if (!['user', 'admin'].includes(role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to update likes and posts' });
    }

    // Determine the model based on role
    const Model = role === 'user' ? User : Admin;

    // Fetch user/admin document
    const user = await (Model as typeof User)
      .findById(userId)
      .select('communityContribution communitiesPartOf')
      .lean();

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    const community = (user.communitiesPartOf ?? []).find((c) => c.communityId === communityId);

    if (!community) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Community not found in user data' });
    }

    // Calculate the number of posts in the community
    const posts = (user.communityContribution ?? []).filter(
      (item) => item.communityId === communityId,
    ).length;

    // Assuming likes should be counted separately, modify this logic if needed
    const likes = 0;

    // Update totalLikes and totalPosts in the community data
    community.totalLikes = likes;
    community.totalPosts = posts;

    // Update the user/admin document
    await Model.updateOne(
      { _id: userId, 'communitiesPartOf.communityId': communityId },
      { $set: { 'communitiesPartOf.$': community } },
    );

    return res.status(StatusCodes.OK).json({
      message: 'Likes and posts updated successfully',
      updatedCommunity: community,
    });
  } catch (error) {
    console.error('Error updating likes and posts:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

const calculateRating = (totalPosts: number, bestStreak: number, currentStreak: number) => {
  return Math.floor(totalPosts * 13.6 + bestStreak * 1.4 + currentStreak * 1.7);
};

/**
 * @desc Update user or admin rating based on community participation
 * @route PATCH /rating
 * @access User, Admin
 */
const rating = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.body;
    const { id, role } = req.user;

    if (!['user', 'admin'].includes(role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized access' });
    }

    const Model = role === 'user' ? User : Admin;

    const user = await (Model as typeof User).findById(id);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    const community = user.communitiesPartOf?.find((c: any) => c.communityId === communityId);
    if (!community) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Community not found in user profile' });
    }

    // Update rating
    community.rating = calculateRating(
      community.totalPosts,
      community.bestStreak,
      community.currentStreak,
    );

    // Save the updated document
    await user.save();
    return res
      .status(StatusCodes.OK)
      .json({ message: 'Rating updated successfully', rating: community.rating });
  } catch (error) {
    console.error('Error updating rating:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

/**
 * @desc Get all communities with member details and founder information
 * @route GET /communities
 * @access Public
 */
const getAllCommunities = async (req: Request, res: Response) => {
  try {
    const communities = await Community.aggregate([
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          membersCount: { $size: '$members' },
          top5Members: { $slice: ['$members', 5] },
          founderId: { $toObjectId: '$creatorId' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'top5Members',
          foreignField: '_id',
          as: 'top5Profiles',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'founderId',
          foreignField: '_id',
          as: 'foundersDetails',
        },
      },
      {
        $addFields: {
          top5Profiles: {
            $map: {
              input: '$top5Profiles',
              as: 'profile',
              in: {
                id: '$$profile._id',
                name: '$$profile.name',
                img: '$$profile.image',
                pushToken: '$$profile.pushToken',
              },
            },
          },
          founderDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: '$foundersDetails',
                  as: 'profile',
                  in: {
                    id: '$$profile._id',
                    name: '$$profile.name',
                    img: '$$profile.image',
                    pushToken: '$$profile.pushToken',
                    course: '$$profile.course',
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $project: {
          foundersDetails: 0, // Exclude unnecessary array after mapping
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(communities);
  } catch (error) {
    console.error('Error fetching communities:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the communities.' });
  }
};

/**
 * @desc Get community details by ID
 * @route GET /communities/:communityId
 * @access Public
 */
const getCommunityById = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    if (!communityId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID is required' });
    }

    const community = await Community.findById(communityId, { title: 1, secondaryCover: 1 });
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    return res.status(StatusCodes.OK).json(community);
  } catch (error) {
    console.error('Error fetching community:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the community' });
  }
};

/**
 * @desc Get communities by tag
 * @route GET /communities/tag/:tag
 * @access User, Admin
 */
const getCommunityByTag = async (req: Request, res: Response) => {
  try {
    const { tag } = req.params;
    if (!tag) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Tag is required' });
    }

    const communities = await Community.find(
      { tag: new RegExp(tag, 'i') },
      { secondaryCover: 1, title: 1, tag: 1, activeMembers: 1, label: 1 },
    );

    if (!communities.length) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'No communities found with this tag' });
    }

    const userRole = req.user?.role;
    if (userRole === 'user' || userRole === 'admin') {
      const Model = userRole === 'user' ? User : Admin;
      await (Model as typeof User).findByIdAndUpdate(req.user.id, { lastActive: new Date() });
    }

    return res.status(StatusCodes.OK).json(communities);
  } catch (error) {
    console.error('Error fetching communities by tag:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching communities' });
  }
};

/**
 * @desc Check if the user is a member of a community
 * @route GET /is-member
 * @access User, Admin
 */
const isMember = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.query;
    if (!communityId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID is required' });
    }

    const userRole = req.user?.role;
    if (userRole !== 'user' && userRole !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized access' });
    }

    const Model = userRole === 'user' ? User : Admin;
    const user = await (Model as typeof User).findById(req.user.id).select('communitiesPartOf');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    const isMember = (user.communitiesPartOf ?? []).some(
      (item) => item.communityId.toString() === communityId,
    );
    return res
      .status(StatusCodes.OK)
      .json({ message: isMember ? 'You are a member.' : 'You are not a member.' });
  } catch (error) {
    console.error('Error checking membership:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while checking membership' });
  }
};

/**
 * @desc Get content of a community
 * @route GET /get-content-of-a-community
 * @access User, Admin
 */
const getContentOfACommunity = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    if (!communityId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID is required' });
    }

    const community = await Community.findById(communityId).select('content');
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    return res.status(StatusCodes.OK).json(community.content);
  } catch (error) {
    console.error('Error fetching community content:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the community content' });
  }
};

/**
 * @desc Get communities and clubs a user or admin is part of
 * @route GET /communities/part-of
 * @access User, Admin
 */
const getCommunitiesPartOf = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    if (req.user.role === 'user') {
      const user = await User.findById(req.user.id, 'communitiesPartOf clubs');
      if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
      }

      const communityIds = (user.communitiesPartOf ?? []).map((c) => c.communityId);
      const communities = await Community.find(
        { _id: { $in: communityIds } },
        'secondaryCover title tag activeMembers',
      );
      const finalDataCommunity = (user.communitiesPartOf ?? []).map((c) => {
        const community = communities.find((comm) => (comm as any)._id.equals(c.communityId));
        return community ? { ...c.toObject(), ...community.toObject() } : c;
      });

      const clubIds = (user.clubs ?? []).map((c) => c.clubId);
      const clubs = await Club.find({ _id: { $in: clubIds } }, 'name secondaryImg motto tags');
      const finalDataClub = (user.clubs ?? []).map((c) => {
        const club = clubs.find((clb) => (clb._id as mongoose.Types.ObjectId).equals(c.clubId));
        return club ? { ...c.toObject(), ...club.toObject() } : c;
      });

      return res.status(StatusCodes.OK).json({ finalDataCommunity, finalDataClub });
    }

    if (req.user.role === 'admin') {
      const admin = await Admin.findById(req.user.id, 'communitiesPartOf');
      if (!admin) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Admin not found' });
      }
      return res.status(StatusCodes.OK).json(admin);
    }

    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied' });
  } catch (error) {
    console.error('Error fetching communities:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching communities' });
  }
};

/**
 * @desc Get latest content for a community based on user's last active timestamp
 * @route GET /communities/:communityId/latest-content
 * @access User, Admin
 */
const getLatestContent = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    if (!communityId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID is required' });
    }

    // Fetch user/admin and community in parallel
    const [userOrAdmin, community] = await Promise.all([
      role === 'user' ? User.findById(userId, 'lastActive') : Admin.findById(userId, 'lastActive'),
      Community.findById(communityId, 'content'),
    ]);

    if (!userOrAdmin) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User or Admin not found' });
    }
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    const lastActive = new Date(userOrAdmin.lastActive ?? 0);
    const latestContent = community.content.filter(
      (content) => new Date(content.timeStamp) > lastActive,
    );

    return res.status(StatusCodes.OK).json(latestContent);
  } catch (error) {
    console.error('Error fetching latest content:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching latest content' });
  }
};

/**
 * @desc Get community profile details
 * @route GET /communities/:communityId/profile
 * @access Public
 */
const getCommunityProfile = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    if (!communityId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID is required' });
    }

    const community = await Community.findById(communityId, {
      title: 1,
      secondaryCover: 1,
      cover: 1,
      label: 1,
      tag: 1,
    }).lean();

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    return res.status(StatusCodes.OK).json(community);
  } catch (error) {
    console.error('Error fetching community profile:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the community profile' });
  }
};

/**
 * @desc Get user profile by ID
 * @route GET /users/:userId
 * @access User, Admin
 */
const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'User ID is required' });
    }

    let user;
    if (req.user.role === 'user') {
      user = await User.findById(userId, 'image name pushToken deactivated');
    } else if (req.user.role === 'admin') {
      user = await Admin.findById(userId, 'image name');
    } else {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied' });
    }

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    return res.status(StatusCodes.OK).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the user profile' });
  }
};

/**
 * @desc Get like and flag status for a specific content
 * @route GET /content/:contentId/status
 * @access User, Admin
 */
const getLikeAndFlagStatus = async (req: Request, res: Response) => {
  try {
    const { contentId, communityId } = req.params;

    if (!contentId || !communityId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Content ID and Community ID are required' });
    }

    if (!['admin', 'user'].includes(req.user.role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to access this resource' });
    }

    // Fetch both content likes and community content in a single query
    const [content, community] = await Promise.all([
      Content.findById(contentId, 'likes'),
      Community.findById(communityId, 'content'),
    ]);

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found' });
    }

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    const liked = (content.likes ?? []).includes(req.user.id);

    const concernedData = community.content.find((item) => item.contentId === contentId);
    if (!concernedData) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Content not found in the specified community' });
    }

    const flagged = concernedData.flaggedBy.includes(req.user.id);

    return res.status(StatusCodes.OK).json({ liked, flagged });
  } catch (error) {
    console.error('Error fetching like and flag status:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the like and flag status' });
  }
};

/**
 * @desc Get Basic Community Data
 * @route GET /community/basic-data-from-id
 * @access Public
 */
const getBasicCommunityDataFromId = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.query;
    if (!communityId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID required' });

    const community = await Community.findById(communityId)
      .select('secondaryCover title tag activeMembers')
      .lean();
    if (!community)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });

    return res.status(StatusCodes.OK).json(community);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

//Controller 23
/**
 * @desc Get User Contribution Cover
 * @route GET /community/user/contribution/cover
 * @access User, Admin
 */
const getUserContributionCover = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.query;
    if (!communityId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID required' });

    if (req.user.role === 'user') {
      const partOf = await User.findById(req.user.id).select('communitiesPartOf name image').lean();
      const communityData = partOf?.communitiesPartOf?.find(
        (item) => item.communityId === communityId,
      );
      return res
        .status(StatusCodes.OK)
        .json({ communityData, name: partOf?.name, image: partOf?.image });
    } else if (req.user.role === 'admin') {
      const partOf = await Admin.findById(req.user.id).select('communitiesPartOf name image').lean();
      const user = partOf?.communitiesPartOf?.find((item) => item.communityId === communityId);
      return res.status(StatusCodes.OK).json({ user, name: partOf?.name, image: partOf?.image });
    }

    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

//Controller 24
/**
 * @desc Get User Contribution
 * @route GET /user/contribution
 * @access User
 */
const getContribution = async (req: Request, res: Response) => {
  try {
    const { communityId, batch } = req.query;
    if (!communityId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID required' });

    const user = await User.findById(req.user.id).select('communityContribution').lean();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    let contributions = user?.communityContribution?.filter(
      (item) => item.communityId === communityId,
    );
    if (batch) {
      const start = (Number(batch) - 1) * 50;
      contributions = contributions?.slice(start, start + 50);
    }

    const contentIds = contributions?.map((item) => new mongoose.Types.ObjectId(item.contentId));
    const contents = await Content.aggregate([
      { $match: { _id: { $in: contentIds } } },
      {
        $addFields: { commentsNum: { $size: '$comments' }, comments: { $slice: ['$comments', 6] } },
      },
    ]);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

//Controller 25
/**
 * @desc Get all community tags
 * @route GET /community/tags
 * @access Public
 */
const getAllTags = async (req: Request, res: Response) => {
  try {
    const tags = await Community.distinct('tag');
    return res.status(StatusCodes.OK).json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal Server Error' });
  }
};

//Controller 26
/**
 * @desc Get all liked posts of the user
 * @route GET /community/posts/liked
 * @access User
 */
const getLikedPosts = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, 'likedContents').lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    const likedPostIds = user?.likedContents
      ?.filter((liked) => liked.type === 'community')
      .map((liked) => liked.contentId);
    return res.status(StatusCodes.OK).json(likedPostIds ?? []);
  } catch (error) {
    console.error('Error fetching liked posts:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal Server Error' });
  }
};

//Controller 27
/**
 * @desc Get Fast Feed
 * @route GET /community/feed/fast
 * @access User
 */
const getFastFeed = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.user.id).select('communitiesPartOf lastActive').lean();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    const communityIds = user?.communitiesPartOf?.map((c) => c.communityId);
    const communities = await Community.find({ _id: { $in: communityIds } })
      .select('content title secondaryCover')
      .lean();

    const contentIds = communities.flatMap((c) => c.content.map((item) => item.contentId));
    const contents = await Content.find({ _id: { $in: contentIds } })
      .select('-vector')
      .lean();

    const userIds = contents.map((c) => c.idOfSender);
    const users = await User.find({ _id: { $in: userIds } })
      .select('name image')
      .lean();

    const communityMap = Object.fromEntries(communities.map((c) => [c._id.toString(), c]));
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    const finishedContent = contents.map((content) => ({
      ...content,
      userName: userMap[content.idOfSender]?.name || 'Unknown',
      userPic: userMap[content.idOfSender]?.image || '',
      communityTitle: communityMap[content.belongsTo]?.title || 'Unknown',
      communityCover: communityMap[content.belongsTo]?.secondaryCover || '',
    }));

    return res.status(StatusCodes.OK).json({ finishedContent, lastActive: user.lastActive });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

// Controller 28
/**
 * @desc Get the community feed with optimized queries
 * @route GET /community/native-feed/fast
 * @access User, Admin
 */
const getFastNativeFeed = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied' });
    }
    const { communityId } = req.query;
    if (!communityId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Community ID is required' });
    }
    const community = await Community.findById(communityId, {
      title: 1,
      secondaryCover: 1,
      content: 1,
      label: 1,
      createdOn: 1,
      activeMembers: 1,
      creatorId: 1,
      cover: 1,
      members: 1,
      onlineMembers: 1,
      admins: 1,
      postPermission: 1,
      shareLinkPermission: 1,
    }).lean();
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    }

    const [creatorDetail, userDetail, adminsDetails, actualContentDocs] = await Promise.all([
      User.findById(community.creatorId, 'name image pushToken').lean(),
      Promise.resolve(community.content.slice(0, 6)),
      User.findById(req.user.id, 'name image pushToken').lean(),
      User.find(
        { _id: { $in: community.admins } },
        'name image pushToken profession course',
      ).lean(),
      Content.find(
        { _id: { $in: community.content.slice(0, 6).map((c) => c.contentId) } },
        '-vector',
      ).lean(),
    ]);

    if (!community.onlineMembers.includes(req.user.id as unknown as mongoose.Types.ObjectId)) {
      community.onlineMembers.push(req.user.id as unknown as mongoose.Types.ObjectId);
      await community.save();
      io.emit(`communityOnlineStatusUpdated_${communityId}`, { status: 1, metaData: userDetail });
    }

    const formattedContent = actualContentDocs.map((doc) => {
      const matched = community.content.find((c) => c.contentId === doc._id.toString());
      return {
        ...doc,
        irrelevanceVote: matched?.irrelevanceVote,
        flaggedBy: matched?.flaggedBy,
        commentsNum: (doc as any).comments.length,
        comments: (doc as any).comments.slice(0, 6),
      };
    });

    return res.status(StatusCodes.OK).json({
      finishedContent: formattedContent.reverse(),
      creatorDetail,
      communityDetail: {
        createdOn: community.createdOn,
        label: community.label,
        members: community.members.length,
        cover: community.cover,
        name: community.title,
        logo: community.secondaryCover,
      },
      isMember: community.members.includes(req.user.id),
      isCreator: community.creatorId.toString() === req.user.id,
      onlineMembers: community.onlineMembers.length,
      adminsDetails,
      adminIds: community.admins,
      postPermission: community.postPermission,
      shareLinkPermission: community.shareLinkPermission,
    });
  } catch (error) {
    console.error('Error fetching community feed:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal Server Error' });
  }
};

/**
 * @desc Get batched content from a community
 * @route GET /community/content/batched
 * @access User, Admin
 */
const getBatchedContent = async (req: Request, res: Response) => {
  try {
    const { communityId, batch = 1, batchSize = 10, remedy = 0 } = req.query;

    const community = await Community.findById(communityId, { content: 1 }).lean();
    if (!community)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });

    const contentBatch = community.content.slice(
      (Number(batch) - 1) * Number(batchSize) + Number(remedy),
      Number(batch) * Number(batchSize),
    );
    const contentIds = contentBatch.map(({ contentId }) => new mongoose.Types.ObjectId(contentId));

    const contentData = await Content.find({ _id: { $in: contentIds } }).lean();
    const finalContent = contentData.map((doc) => ({
      ...doc,
      commentsNum: doc?.comments?.length,
      comments: doc?.comments?.slice(0, 6),
    }));

    return res.status(StatusCodes.OK).json({ finalContent });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong!' });
  }
};

// Controller 29
/**
 * @desc Handles posting content in a community
 * @route POST /community/post
 * @access User
 */
const post = async (req: Request, res: Response) => {
  try {
    const { contentId, communityId, contentType, actionHandled } = req.body;
    if (!contentId || !communityId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing required fields.' });
    }

    const [community, content, user] = await Promise.all([
      Community.findById(communityId).lean(),
      Content.findById(contentId, { contentType: 1, url: 1, text: 1 }).lean(),
      User.findById(req.user.id, {
        communityContribution: 1,
        communitiesPartOf: 1,
        name: 1,
      }).lean(),
    ]);

    if (!community)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });
    if (!community.members.includes(req.user.id)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You must join the community first.' });
    }

    const type = contentType || content?.contentType;
    if (!type)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid content type.' });

    community.content.unshift({
      contentId,
      irrelevanceVote: 0,
      flagSaturated: false,
      flaggedBy: [],
      timeStamp: new Date(),
      type,
    });
    await Community.updateOne({ _id: communityId }, { content: community.content });

    // Scheduling notification and feed update
    schedule.scheduleJob(`feedCommunity_${req.user.id}`, new Date(Date.now() + 5000), async () => {
      const updatedCommunity = await Community.findById(communityId, {
        members: 1,
        muted: 1,
        seeLessFeed: 1,
        title: 1,
        pinnedBy: 1,
        secondaryCover: 1,
      }).lean();
      if (!updatedCommunity) return;

      await updateDynamicIsland(updatedCommunity.pinnedBy, communityId, 'posts', true);

      const pushTokens = (
        await User.find(
          {
            _id: {
              $in: updatedCommunity.members.filter(
                (id) => !updatedCommunity.muted.includes(id as unknown as mongoose.Types.ObjectId),
              ),
            },
          },
          { pushToken: 1 },
        )
      ).map((u) => u.pushToken);

      if (type !== 'text') {
        await User.updateMany(
          {
            _id: {
              $in: updatedCommunity.members.filter(
                (id) =>
                  !updatedCommunity.seeLessFeed.includes(id as unknown as mongoose.Types.ObjectId),
              ),
            },
          },
          {
            $push: {
              feed: { $each: [{ _id: new mongoose.Types.ObjectId(contentId) }], $position: 0 },
            },
          },
        );
      }

      const imageUrl =
        type === 'image' && content && content.url
          ? await generateUri(content.url.split('@')[0])
          : null;
      if (!user || !content || !content.text) {
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'User or content data is missing.' });
      }

      const notificationData = {
        pushToken: pushTokens.filter((token): token is string => token !== undefined),
        title: `${user.name} posted in ${updatedCommunity.title}`,
        body: `${content.text.substring(0, 50)}...`,
        image: imageUrl || '',
        url: `https://macbease.com/app/community/${updatedCommunity._id}`,
      };
      actionHandled
        ? scheduleNotification2(notificationData)
        : scheduleNotification(notificationData);
    });

    // Update user streaks and rating efficiently
    const userCommunityData =
      user?.communitiesPartOf?.find((item) => item.communityId === communityId) || {};
    const lastPosted = new Date(userCommunityData.lastPosted || 0);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - lastPosted.getTime()) / (1000 * 60 * 60 * 24));

    userCommunityData.currentStreak =
      diffDays === 1 ? (userCommunityData.currentStreak || 0) + 1 : 1;
    userCommunityData.bestStreak = Math.max(
      userCommunityData.bestStreak || 0,
      userCommunityData.currentStreak,
    );
    userCommunityData.lastPosted = today;
    userCommunityData.totalPosts = (userCommunityData.totalPosts || 0) + 1;
    userCommunityData.rating = Math.floor(
      userCommunityData.totalPosts * 13.6 +
      userCommunityData.bestStreak * 1.4 +
      userCommunityData.currentStreak * 1.7,
    );

    await User.updateOne(
      { _id: req.user.id },
      { $set: { 'communitiesPartOf.$[elem]': userCommunityData } },
      { arrayFilters: [{ 'elem.communityId': communityId }] },
    );

    io.emit(`communityContentUpdated_${communityId}`, {
      communityId,
      content: { ...content, irrelevanceVote: 0, commentsNum: 0 },
    });
    return res.status(StatusCodes.OK).json({ message: 'Successfully posted.' });
  } catch (error) {
    console.error('Error in post controller:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while posting.' });
  }
};

// Controller 30
/**
 * @desc Edits community profile
 * @route PATCH /community/profile
 * @access Admin
 */
const editCommunityProfile = async (req: Request, res: Response) => {
  try {
    const { communityId, data } = req.body;
    const updatedCommunity = await Community.findByIdAndUpdate(
      communityId,
      { ...data },
      { new: true, runValidators: true },
    );
    if (!updatedCommunity) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found.' });
    }
    return res
      .status(StatusCodes.OK)
      .json({ message: 'Successfully updated!', community: updatedCommunity });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.' });
  }
};

// Controller 31
/**
 * @desc Get all contributions of a user with pagination
 * @route GET /community/contributions/all
 * @access User, Admin
 */
const getAllContributionOfUser = async (req: Request, res: Response) => {
  try {
    const { id, batch = 1, batchSize = 10 } = req.query;
    const skip = (Number(batch) - 1) * Number(batchSize);

    const user = await User.findById(id, 'communityContribution').lean();
    if (!user?.communityContribution?.length) {
      return res.status(StatusCodes.OK).json([]);
    }

    const contributionsBatch = user.communityContribution
      .slice()
      .reverse()
      .slice(skip, skip + Number(batchSize));

    if (!contributionsBatch.length) {
      return res.status(StatusCodes.OK).json([]);
    }

    const relevantIds = contributionsBatch.map((item) => item.contentId);
    const contributions = await Content.aggregate([
      { $match: { _id: { $in: relevantIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      {
        $addFields: { commentsNum: { $size: '$comments' }, comments: { $slice: ['$comments', 6] } },
      },
      { $sort: { timeStamp: -1 } },
    ]);

    return res.status(StatusCodes.OK).json(contributions);
  } catch (error) {
    console.error('Error fetching user contributions:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

// Controller 32
/**
 * @desc Get all members of a community
 * @route GET /community/members/all
 * @access User, Admin
 */
const getAllMembers = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Community ID is required' });
    }

    const community = await Community.findById(id, 'members').lean();
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found' });
    }
    if (!community.members.length) {
      return res.status(StatusCodes.OK).json([]);
    }

    const members = await User.find(
      { _id: { $in: community.members } },
      'name image course reg pushToken profession',
    ).lean();

    return res.status(StatusCodes.OK).json(members);
  } catch (error) {
    console.error('Error fetching community members:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

// Controller 33
/**
 * @desc Fetches related social groups (Communities, Clubs, and Cards) based on a search query.
 * @route GET /community/related-social-groups
 * @access User, Admin
 */
const getAllRelatedSocialGroups = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Query parameter is required.' });
    }

    // Fetch related keywords using text search
    const bags = await Bag.aggregate([
      {
        $search: {
          index: 'default',
          text: { query, path: 'keyWords' },
        },
      },
    ]).exec();

    const finalData = bags.flatMap((bag) => bag.keyWords) || [query];
    const regexPatterns = finalData.map((tag) => new RegExp(tag, 'i'));
    const queryRegex = new RegExp(query as string, 'i');
    // Fetch communities and clubs in parallel to reduce response time
    const [communities, clubs, cards] = await Promise.all([
      fetchCommunities(regexPatterns, queryRegex),
      fetchClubs(regexPatterns, queryRegex),
      fetchCards(finalData),
    ]);

    return res.status(StatusCodes.OK).json({ clubs, communities, cards });
  } catch (error) {
    console.error('Error fetching social groups:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to retrieve social groups.' });
  }
};

/**
 * @desc Fetches communities based on regex patterns
 * @param {RegExp[]} regexPatterns - Array of RegExp patterns
 * @param {RegExp[]} queryRegex - RegExp query
 * @route INTERNAL
 */
const fetchCommunities = async (regexPatterns: RegExp[], queryRegex: RegExp) => {
  return Community.aggregate([
    { $match: { $or: [{ tag: { $in: regexPatterns } }, { title: queryRegex }] } },
    {
      $project: {
        secondaryCover: 1,
        label: 1,
        activeMembers: 1,
        title: 1,
        tag: 1,
        membersCount: { $size: '$members' },
        top5Members: { $slice: ['$members', 5] },
        founderId: { $toObjectId: '$creatorId' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'top5Members',
        foreignField: '_id',
        as: 'top5Profiles',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'founderId',
        foreignField: '_id',
        as: 'foundersDetails',
      },
    },
    {
      $project: {
        secondaryCover: 1,
        label: 1,
        activeMembers: 1,
        title: 1,
        tag: 1,
        membersCount: 1,
        top5Profiles: formatUserProfiles('$top5Profiles'),
        foundersDetails: { $arrayElemAt: [formatUserProfiles('$foundersDetails'), 0] },
      },
    },
  ]).exec();
};

/**
 * @desc Fetches clubs based on regex patterns
 * @param {RegExp[]} regexPatterns - Array of RegExp patterns
 * @param {RegExp[]} queryRegex - RegExp query
 * @route INTERNAL
 */
const fetchClubs = async (regexPatterns: RegExp[], queryRegex: RegExp) => {
  return Club.aggregate([
    { $match: { $or: [{ tags: { $in: regexPatterns } }, { name: queryRegex }] } },
    {
      $project: {
        secondaryImg: 1,
        name: 1,
        tags: 1,
        motto: 1,
        membersCount: { $size: '$members' },
        top5Members: { $slice: ['$members', 5] },
        founderId: { $toObjectId: '$mainAdmin' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'top5Members',
        foreignField: '_id',
        as: 'top5Profiles',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'founderId',
        foreignField: '_id',
        as: 'foundersDetails',
      },
    },
    {
      $project: {
        secondaryImg: 1,
        name: 1,
        tags: 1,
        motto: 1,
        membersCount: 1,
        top5Profiles: formatUserProfiles('$top5Profiles'),
        foundersDetails: { $arrayElemAt: [formatUserProfiles('$foundersDetails'), 0] },
      },
    },
  ]).exec();
};

/**
 * @desc Fetches cards based on regex patterns
 * @param {RegExp[]} finalData - Date string to format
 * @route INTERNAL
 */
const fetchCards = async (finalData: RegExp[]) => {
  return Card.aggregate([
    { $match: { tags: { $in: finalData } } },
    { $project: { value: 1, creator: 1, tags: 1, likedBy: 1, time: 1, userMetaData: 1 } },
    { $limit: 50 },
  ]).exec();
};

/**
 * @desc Formats user profiles
 * @param {string} profileField - field to format
 * @route INTERNAL
 */
const formatUserProfiles = (profileField: string) => {
  return {
    $map: {
      input: profileField,
      as: 'profile',
      in: {
        id: '$$profile._id',
        name: '$$profile.name',
        img: '$$profile.image',
        pushToken: '$$profile.pushToken',
        course: '$$profile.course',
      },
    },
  };
};

// Controller 34
/**
 * @desc Get a user's contributions and other community covers
 * @route GET /community/contributions-cover
 * @access User, Admin
 */
const getOthersContributionCover = async (req: Request, res: Response) => {
  try {
    const { userId, communityId } = req.query;
    const user = await User.findById(userId, { passoutYear: 1, communitiesPartOf: 1 }).lean();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    const userCommunity = user?.communitiesPartOf?.find(
      ({ communityId: id }) => id === communityId,
    );
    const dataPoint = userCommunity
      ? {
        points: userCommunity.rating,
        contributions: userCommunity.totalPosts,
        joining: userCommunity.joined,
      }
      : { points: '', contributions: '', joining: '' };

    const otherCommunities = await Community.find(
      {
        _id: {
          $in: user?.communitiesPartOf
            ?.map(({ communityId }) => communityId)
            .filter((id) => id !== communityId),
        },
      },
      { cover: 1, title: 1 },
    ).lean();

    return res
      .status(StatusCodes.OK)
      .json({ passoutYear: user.passoutYear, stats: dataPoint, partOf: otherCommunities });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.', error });
  }
};

/* /**
 * @desc Formats a date to Month and Year
 * @param {string} dateString - Date string to format
 * @returns {string} - Formatted date
function formatDateToMonthYear(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', { year: 'numeric', month: 'short' });
}
*/

// Controller 35
/**
 * @desc Get media and documents from a community
 * @route GET /community/media-docs
 * @access User, Admin
 */
const getMediaAndDocs = async (req: Request, res: Response) => {
  try {
    const { communityId, key, processedPins = '0', lastProcessedTimeStamp } = req.query;

    if (!communityId || !key || !lastProcessedTimeStamp) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing required fields.' });
    }

    const keys = typeof key === 'string' && key.includes('%') ? key.split('%') : [key]; // Ensuring it's always an array
    const processedCount = Number(processedPins);

    const community = await Community.findById(communityId, { content: 1 }).lean();
    if (!community)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found' });

    const filteredContent = community.content
      .slice(processedCount) // Skip processed items
      .filter(
        ({ type, timeStamp }) =>
          keys.includes(type) && new Date(timeStamp) < new Date(lastProcessedTimeStamp as string),
      );
    // .slice(0, 20); // Fetch max 20 items for performance

    if (!filteredContent.length) {
      return res.status(StatusCodes.OK).json({ processedPins: processedCount, data: [] });
    }

    const contentIds = filteredContent.map(
      ({ contentId }) => new mongoose.Types.ObjectId(contentId),
    );

    const finalData = await Content.find(
      { _id: { $in: contentIds } },
      { url: 1, timeStamp: 1, metaData: 1, params: 1, contentType: 1 },
    ).lean();

    return res
      .status(StatusCodes.OK)
      .json({ processedPins: processedCount + contentIds.length, data: finalData });
  } catch (error) {
    console.error('Error in getMediaAndDocs:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.' });
  }
};

// Controller 36
/**
 * @desc Marks a user as offline in a community
 * @route PATCH /community/offline
 * @access User
 */
const gotOffline = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.query;
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const updateCommunity = Community.updateOne(
      { _id: communityId },
      { $pull: { onlineMembers: userId } },
    );

    const updateUser = User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
      shortCuts: 1,
    }).lean();

    const [userDetail] = await Promise.all([updateUser, updateCommunity]);

    if (userDetail) {
      const shortcuts = userDetail.shortCuts ?? [];
      const foundIndex =
        shortcuts.length > 0
          ? shortcuts.findIndex((item) => item.id.toString() === communityId)
          : -1;
      if (foundIndex !== -1 && shortcuts.length > 0) {
        shortcuts[foundIndex].metaData = shortcuts[foundIndex].metaData || {
          messages: 0,
          notifications: 0,
          posts: 0,
        };
        shortcuts[foundIndex].metaData.posts = 0;
        userDetail.markModified('shortCuts');
        await userDetail.save();
      }
    }

    io.emit(`communityOnlineStatusUpdated_${communityId}`, {
      status: 0,
      metaData: userDetail,
    });
    return res.status(StatusCodes.OK).json({ message: 'Marked Offline!' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.' });
  }
};

// Controller 37
/**
 * @desc Adds a user to a constraint list
 * @route PATCH /community/constraint
 * @access User
 */
const addToConstraintList = async (req: Request, res: Response) => {
  try {
    const { communityId, field } = req.body;
    const validFields = ['muted', 'seeLessFeed'];
    if (!validFields.includes(field)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid field.' });
    }

    await Community.findByIdAndUpdate(communityId, {
      $addToSet: { [field]: req.user.id },
    });

    return res.status(StatusCodes.OK).json({ message: `Added successfully to ${field} list.` });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.' });
  }
};

// Controller 38
/**
 * @desc Remove a user from constraint lists (muted, seeLessFeed)
 * @route DELETE /community/:communityId/constraint
 * @access User
 */
const removeFromConstraintList = async (req: Request, res: Response) => {
  try {
    const { communityId, field } = req.body;
    if (!['muted', 'seeLessFeed'].includes(field)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid field.' });
    }

    await Community.updateOne({ _id: communityId }, { $pull: { [field]: req.user.id } });

    return res.status(StatusCodes.OK).json({ message: `Removed successfully from ${field} list.` });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.', error });
  }
};

// Controller 39
/**
 * @desc Get user's constraint status (muted, seeLessFeed)
 * @route GET /community/:communityId/constraint-status
 * @access User
 */
const getConstraintStatus = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const userId = req.user.id;

    const result = await Community.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(communityId) } },
      {
        $project: {
          isMuted: { $in: [userId, { $ifNull: ['$muted', []] }] },
          isSeeingLessFeed: { $in: [userId, { $ifNull: ['$seeLessFeed', []] }] },
        },
      },
    ]);

    if (!result.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found.' });
    }

    const { isMuted, isSeeingLessFeed } = result[0];

    return res.status(StatusCodes.OK).json({ isMuted, isSeeingLessFeed });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.', error });
  }
};

// Controller 40
/**
 * @desc Update community boolean fields
 * @route PATCH /community/:communityId/settings
 * @access Admin
 */
const updateBooleanField = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const { fieldName, value } = req.body;
    const allowedFields = ['postPermission', 'shareLinkPermission', 'approveMembership'];

    if (!allowedFields.includes(fieldName) || typeof value !== 'boolean') {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid request parameters.' });
    }

    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, creatorId: req.user.id },
      { [fieldName]: value },
      { new: true, select: fieldName },
    );

    if (!updatedCommunity) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: 'Unauthorized or community not found.' });
    }

    return res
      .status(StatusCodes.OK)
      .json({
        message: 'Field updated successfully.',
        updatedField: updatedCommunity[fieldName as keyof typeof updatedCommunity],
      });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.' });
  }
};

// Controller 41
/**
 * @desc Add an admin to the community
 * @route POST /community/:communityId/admin
 * @access Admin
 */
const addAdmin = async (req: Request, res: Response) => {
  try {
    const { communityId, userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid User ID' });
    }

    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, creatorId: req.user.id, admins: { $ne: userId } },
      { $push: { admins: userId } },
      { new: true, select: 'admins' },
    );

    if (!updatedCommunity) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: 'Unauthorized, already an admin, or community not found.' });
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: 'User added as admin.', updatedAdmins: updatedCommunity.admins });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.' });
  }
};

// Controller 42
/**
 * @desc Remove an admin from the community
 * @route DELETE /community/:communityId/admin/:userId
 * @access Admin
 */
const removeAdmin = async (req: Request, res: Response) => {
  try {
    const { communityId, userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid User ID' });
    }

    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, creatorId: { $ne: userId }, admins: userId },
      { $pull: { admins: userId } },
      { new: true, select: 'admins' },
    );

    if (!updatedCommunity) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'User is not an admin or unauthorized action.' });
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: 'User removed from admins.', updatedAdmins: updatedCommunity.admins });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.' });
  }
};

// Controller 43
/**
 * @desc Search members of a community
 * @route GET /community/:communityId/members
 * @access User, Admin
 */
const searchCommunityMembers = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const { query } = req.query;
    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Query parameter is required' });
    }

    const community = await Community.findById(communityId).select('members admins');
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found' });
    }

    const regex = new RegExp(query as string, 'i');
    const members = await User.find(
      { _id: { $in: community.members }, name: regex },
      'name image pushToken',
    ).lean();

    const membersWithRole = members.map((member) => ({
      ...member,
      role: community.admins.includes(member._id as mongoose.Types.ObjectId) ? 'Admin' : 'Member',
    }));

    return res.status(StatusCodes.OK).json(membersWithRole);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

// Controller 44
/**
 * @desc Search content in a community
 * @route GET /community/:communityId/content
 * @access User, Admin
 */
const searchCommunityContent = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const { query } = req.query;
    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Query parameter is required' });
    }

    const community = await Community.findById(communityId).select('content').lean();
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found' });
    }

    const contentIds = community.content.slice(-100).map((p) => p.contentId);
    const regex = new RegExp(query as string, 'i');

    const contentResults = await Content.find(
      { _id: { $in: contentIds }, $or: [{ text: regex }, { tags: regex }, { contentType: regex }] },
      '-vector',
    )
      .sort({ createdAt: -1 })
      .lean();

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum: content.comments?.length || 0,
      comments: content.comments?.slice(0, 6) || [],
    }));

    return res.status(StatusCodes.OK).json(processedResults);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

// Controller 45
/**
 * @desc Search files in a community
 * @route GET /community/:communityId/files
 * @access User, Admin
 */
const searchCommunityFiles = async (req: Request, res: Response) => {
  try {
    const { communityId } = req.params;
    const { query } = req.query;
    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Query parameter is required' });
    }

    const community = await Community.findById(communityId).select('content').lean();
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Community not found' });
    }

    const contentIds = community.content.slice(-100).map((p) => p.contentId);
    const regex = new RegExp(query as string, 'i');

    const contentResults = await Content.find(
      { _id: { $in: contentIds }, contentType: 'doc', $or: [{ text: regex }, { tags: regex }] },
      '-vector',
    )
      .sort({ createdAt: -1 })
      .lean();

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum: content.comments?.length || 0,
      comments: content.comments?.slice(0, 6) || [],
    }));

    return res.status(StatusCodes.OK).json(processedResults);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

export {
  createCommunity,
  deleteCommunity,
  joinAsMember,
  leaveAsMember,
  uploadContent,
  deleteContent,
  flag,
  takeDown,
  updateStreak,
  likesAndPosts,
  rating,
  getAllCommunities,
  getCommunityById,
  getCommunityByTag,
  isMember,
  getContentOfACommunity,
  getCommunitiesPartOf,
  getLatestContent,
  getCommunityProfile,
  getUserProfile,
  getLikeAndFlagStatus,
  getBasicCommunityDataFromId,
  getUserContributionCover,
  getContribution,
  getAllTags,
  getLikedPosts,
  getFastFeed,
  getFastNativeFeed,
  post,
  editCommunityProfile,
  getAllContributionOfUser,
  getAllMembers,
  getAllRelatedSocialGroups,
  getBatchedContent,
  getOthersContributionCover,
  getMediaAndDocs,
  gotOffline,
  addToConstraintList,
  removeFromConstraintList,
  getConstraintStatus,
  updateBooleanField,
  addAdmin,
  removeAdmin,
  searchCommunityMembers,
  searchCommunityContent,
  searchCommunityFiles,
};
