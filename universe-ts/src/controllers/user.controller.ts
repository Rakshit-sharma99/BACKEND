import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import User from '../models/user.model';
import Admin from '../models/admin.model';
import bcrypt from 'bcryptjs';
import Community from '../models/community.model';
import Club from '../models/club.model';
import {
  securePassword,
  sendMail,
  scheduleNotification,
  scheduleNotification2,
} from './utils.controller';

// Controller 1
/**
 * @desc Search users by name (Users & Admins)
 * @route GET /users/search-name
 * @access User, Admin
 */
const searchUserByName = async (req: Request, res: Response) => {
  try {
    const { name } = req.query;
    if (!name || typeof name !== 'string') {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid name parameter' });
    }
    const regex = new RegExp(name, 'ig');

    const [users, adminUsers] = await Promise.all([
      User.find({ name: regex }, { name: 1, image: 1, _id: 1 }).lean(),
      Admin.find({ name: regex }, { name: 1, image: 1, _id: 1 }).lean(),
    ]);

    return res.status(StatusCodes.OK).json([...users, ...adminUsers]);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 2
/**
 * @desc Get user bio
 * @route GET /user/bio
 * @access User
 */
const getUserBio = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, {
      course: 1,
      role: 1,
      interests: 1,
      clubs: 1,
      communitiesCreated: 1,
      communitiesPartOf: 1,
      giftsSend: 1,
      name: 1,
      image: 1,
      chatRooms: 1,
      email: 1,
      unreadNotice: 1,
      level: 1,
      passoutYear: 1,
      field: 1,
      incompleteProfile: 1,
      notifications: { $slice: -30 },
      shortCuts: 1,
      incompleteFields: 1,
    }).lean();

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    return res.status(StatusCodes.OK).json({
      ...user,
      clubs: user.clubs?.length ?? 0,
      communitiesCreated: user.communitiesCreated?.length ?? 0,
      communitiesPartOf: user.communitiesPartOf?.length ?? 0,
      giftsSend: user.giftsSend?.length ?? 0,
      notices: user.unreadNotice?.length ?? 0,
    });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 3
/**
 * @desc Update user profile
 * @route PATCH /user/update
 * @access User
 */
const updateUser = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to update profile' });
    }
    const userID = req.user.id;
    await User.findByIdAndUpdate(userID, req.body, { new: true, runValidators: true }).lean();
    return res.status(StatusCodes.OK).json({ message: 'Updated successfully!' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 4
/**
 * @desc Get user profile by query params
 * @route GET /user?name=&reg=
 * @access User
 */
const getUser = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized' });
    }
    const { name, reg } = req.query;
    const query: any = {};
    if (name) query.name = { $regex: name as string, $options: 'i' };
    if (reg) query.reg = Number(reg);

    const users = await User.find(query).select('name reg image');
    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 5
/**
 * @desc Delete user
 * @route DELETE /user
 * @access User
 */
const deleteUser = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized' });
    }

    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    return res.status(StatusCodes.OK).json({ message: 'User deleted successfully' });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 6
/**
 * @desc Get user by token in the header of the request
 * @route GET /user/user-by-token
 * @access User
 */
const getUserByToken = async (req: Request, res: Response) => {
  if (req.user.role === 'user') {
    const userID = req.user.id;
    User.findById(userID, (err: Error, user: any) => {
      if (err) return console.error(err);
      return res.status(StatusCodes.OK).json(user);
    });
  }
};

// Controller 7
/**
 * @desc Advanced search for users based on filters
 * @route GET /user/advance-search
 * @access Public
 */
const advanceSearch = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { filter, query } = req.query;
    let searchQuery = {};

    switch (filter) {
      case 'name':
      case 'course':
        searchQuery = { [filter]: new RegExp(query as string, 'i') };
        break;
      case 'reg':
        searchQuery = { reg: query };
        break;
      case 'multipleClubs': {
        const clubIds = JSON.parse(Buffer.from(query as string, 'base64').toString());
        const clubs = await Club.find({ _id: { $in: clubIds } }, { members: 1 });
        const memberIds = clubs.flatMap((club) => club.members);
        searchQuery = { _id: { $in: memberIds } };
        break;
      }
      case 'organisation': {
        const { organisationType, organisationId } = req.query;

        let members: string[] = [];
        if (organisationType === 'Club') {
          const club = await Club.findById(organisationId, { members: 1 }).lean();
          members = club?.members ?? [];
        } else if (organisationType === 'Community') {
          const community = await Community.findById(organisationId, { members: 1 }).lean();
          members = community?.members ?? [];
        } else {
          return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid organisation type' });
        }

        searchQuery = {
          _id: { $in: members },
          name: new RegExp(query as string, 'i'),
        };
        break;
      }
      case 'all': {
        searchQuery = {
          $or: [
            { name: new RegExp(query as string, 'i') },
            { course: new RegExp(query as string, 'i') },
            { interests: { $in: [new RegExp(query as string, 'i')] } },
          ],
        };
        break;
      }
      default:
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid filter type' });
    }

    const users = await User.find(searchQuery, {
      name: 1,
      image: 1,
      _id: 1,
      course: 1,
      pushToken: 1,
      interests: 1,
      deactivated: 1,
      email: 1,
    });
    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 8
/**
 * @desc Get all users for chat application
 * @route GET /user/chat
 * @access User, Admin
 */
const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find(
      {},
      {
        name: 1,
        image: 1,
        _id: 1,
        pushToken: 1,
        course: 1,
        interests: 1,
        email: 1,
      },
    ).lean();
    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 9
/**
 * @desc Get 10 random users
 * @route GET /user/random-users
 * @access Public
 */
const getRandomUsers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const users = await User.aggregate([
      { $sample: { size: 10 } },
      { $project: { name: 1, image: 1, course: 1, _id: 1, interests: 1, pushToken: 1 } },
    ]);
    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 10
/**
 * @desc Change password using old password for authentication
 * @route PUT /user/change-password
 * @access User
 */
const changePassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { oldPass, newPass } = req.body;
    const user = await User.findById(req.user.id).select('password');
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(oldPass, user.password);
    if (!isMatch)
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Incorrect old password' });

    const hashedPassword = await securePassword(newPass);
    if (hashedPassword !== 'error') user.password = hashedPassword;
    await user.save();
    return res.status(StatusCodes.OK).json({ message: 'Password changed successfully' });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 11
/**
 * @desc Deactivate user account
 * @route PATCH /user/deactivate
 * @access User
 */
const deactivateAccount = async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Password is required.' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }

    const isPassCorrect = await bcrypt.compare(password, user.password);
    if (!isPassCorrect) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Incorrect password.' });
    }

    user.pushToken = undefined;
    user.deactivated = true;
    user.deactivationDate = new Date();
    await user.save();
    return res.status(StatusCodes.OK).json({ message: 'Account deactivated successfully.' });
  } catch (error) {
    console.error('Error deactivating account:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

// Controller 12
/**
 * @desc   Push a permanent notice to a user
 * @route  POST /user/notice/push
 * @access Private (Admin)
 */
const pushPermanentNotice = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const { value, img1, img2, action, params, key } = req.body;
    if (!userId || !value || !img1 || !img2 || !action || !params || !key) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Incomplete information to push a notice.' });
    }

    if (key === 'like') {
      return res
        .status(StatusCodes.OK)
        .json({ message: 'Like-based notices are disabled in this version.' });
    }
    //we have integrated in-app notice likeContent controller ,this call will be inactivated in next version, till then just a precautionary measure

    const user = await User.findById(userId).select('unreadNotice');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }

    const newNotice = {
      ...req.body,
      time: new Date(),
      uid: `${Date.now()}/${userId}/${req.user.id}`,
    };

    user.unreadNotice = user.unreadNotice ? [...user.unreadNotice, newNotice] : [newNotice];

    await user.save();
    return res.status(StatusCodes.OK).json({ message: 'Notice successfully pushed.' });
  } catch (error) {
    console.error('Error pushing notice:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

// Controller 13
/**
 * @desc Get user's permanent notices (both read and unread)
 * @route GET /user/notices/permanent
 * @access User
 */
const getPermanentNotices = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, 'unreadNotice notifications');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }
    if (!user.notifications || !user.unreadNotice) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User data is incomplete.' });
    }

    const data = {
      unread: user.unreadNotice,
      read: user.notifications.slice(0, 12 - user.unreadNotice.length),
    };
    user.unreadNotice = [];
    user.notifications = [...data.unread, ...user.notifications];
    await user.save();
    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

// Controller 14
/**
 * @desc Get permanent notices in paginated batches
 * @route GET /user/notices/permanent/batch
 * @access User
 */
const getPermanentNoticeInBatch = async (req: Request, res: Response) => {
  try {
    const batch = Number(req.query.batch) || 1;
    const batchSize = Number(req.query.batchSize) || 10;

    if (batch < 1 || batchSize < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid batch parameters.' });
    }

    const user = await User.findById(req.user.id, 'notifications');
    if (!user || !user.notifications) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'User or notifications not found.' });
    }

    const startIdx = (batch - 1) * batchSize;
    const notices = user.notifications.slice(startIdx, startIdx + batchSize);

    return res.status(StatusCodes.OK).json(notices);
  } catch (error) {
    console.error('Error fetching batched notices:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 15
/**
 * @desc Delete a specific notification by its UID
 * @route DELETE /user/notifications
 * @access User
 */
const deleteNotifications = async (req: Request, res: Response) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Notification UID is required.' });
    }

    const user = await User.findById(req.user.id, 'notifications');
    if (!user || !user.notifications) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'User or notifications not found.' });
    }

    const initialLength = user.notifications.length;
    user.notifications = user.notifications.filter((item) => item.uid !== uid);

    if (initialLength === user.notifications.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Notification not found.' });
    }

    await user.save();
    return res.status(StatusCodes.OK).json({ message: 'Notification deleted successfully.' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 16
/**
 * @desc Get communities user is part of
 * @route GET /user/communities-post
 * @access User
 */
const getCommunitiesForPost = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
    }).lean();

    if (!user || !user?.communitiesPartOf || user.communitiesPartOf.length === 0) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User or communities not found' });
    }

    const communityIds = user.communitiesPartOf
      .map(({ communityId }) => communityId)
      .filter(Boolean);
    const communities = await Community.find(
      { _id: { $in: communityIds } },
      { secondaryCover: 1, title: 1 },
    ).lean();

    return res.status(StatusCodes.OK).json(communities);
  } catch (error) {
    console.error('Error fetching communities:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 17
/**
 * @desc Send email to users
 * @route POST /user/mail/send
 * @access Admin
 */
const sendMailToUsers = async (req: Request, res: Response) => {
  const { destination, intro, outro, subject } = req.body;
  try {
    const name = 'there!';
    const { ses, params } = await sendMail(name, intro, outro, subject, destination);
    ses.sendEmail(params, (err) => {
      if (err) {
        console.error('Email Sending Error:', err);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'Failed to send email', err });
      }
      return res.status(StatusCodes.OK).json({ message: 'Email sent successfully' });
    });
  } catch (error) {
    console.error('Error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 18
/**
 * @desc Fetch basic user bio
 * @route GET /user/basic-user-bio
 * @access User, Admin
 */
const getBasicUserBio = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    if (!id || !mongoose.Types.ObjectId.isValid(id as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid user ID' });
    }

    // Fetch user with selected fields
    const user = await User.findById(id, {
      course: 1,
      passoutYear: 1,
      clubs: 1,
      role: 1,
      deactivated: 1,
      communitiesPartOf: 1,
      tunedIn_By: 1,
      macbeaseContentContribution: 1,
      creatorPost: 1,
      profession: 1,
      interests: 1,
      field: 1,
      incompleteProfile: 1,
      level: 1,
    }).lean();

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });
    }

    // Extract and convert IDs to ObjectId
    const communityIds = user.communitiesPartOf?.map((item) => item.communityId) || [];
    const clubIds = user.clubs?.map((item) => item.clubId) || [];
    const tunerIds = user.tunedIn_By?.slice(0, 3) || [];

    // Fetch related data in parallel
    const [communities, clubs, tunerGraphics] = await Promise.all([
      Community.find({ _id: { $in: communityIds } }, { title: 1, secondaryCover: 1 }).lean(),
      Club.find({ _id: { $in: clubIds } }, { name: 1, secondaryImg: 1 }).lean(),
      User.find({ _id: { $in: tunerIds } }, { name: 1, image: 1, pushToken: 1 }).lean(),
    ]);

    // Construct response object
    return res.status(StatusCodes.OK).json({
      course: user.course,
      tuned: user.tunedIn_By?.some((id) => id.toString() === req.user.id.toString()) || false,
      batch: user.passoutYear,
      role: user.role,
      creatorPost: user.creatorPost,
      posts: user.macbeaseContentContribution?.length || 0,
      tunedIn_By: user.tunedIn_By?.length || 0,
      tunerGraphics,
      organisationData: [...clubs, ...communities],
      deactivated: user.deactivated,
      profession: user.profession,
      interests: user.interests,
      field: user.field,
      incompleteProfile: user.incompleteProfile,
      level: user.level,
    });
  } catch (error) {
    console.error('Error fetching user bio:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

// Controller 19
/**
 * @desc  Utility function to retrieve push tokens based on user activity and groups
 * @route Internal
 * @access Internal
 */
const getPushTokens = async (query: string, exempt?: string) => {
  try {
    if (query === 'all-users') {
      return await User.find({ pushToken: { $ne: null } })
        .select('pushToken')
        .lean()
        .then((users) => users.map((u) => u.pushToken));
    }
    if (query.startsWith('Inactive-users')) {
      const days = Number(query.split('-')[2]);
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);

      return await User.find({ lastActive: { $lt: thresholdDate }, pushToken: { $ne: null } })
        .select('pushToken')
        .lean()
        .then((users) => users.map((u) => u.pushToken));
    }
    const [id, designation, type] = query.split('-');
    let members: string[] = [];

    if (type === 'club') {
      const club = await Club.findById(id).select('members adminId team').lean();
      if (club) {
        if (designation === 'All Members') {
          members.push(...club.members);
        } else if (designation === 'Admins') {
          members.push(...club.adminId);
        } else {
          members.push(...club.team.map((item) => item.id));
        }
      }
    } else if (type === 'community') {
      const community = await Community.findById(id).select('members').lean();
      if (community) {
        members = community.members;
      }
    }

    if (exempt) {
      members = members.filter((member) => member !== exempt);
    }

    return await User.find({ _id: { $in: members }, pushToken: { $ne: null } })
      .select('pushToken')
      .lean()
      .then((users) => users.map((u) => u.pushToken));
  } catch (error) {
    console.error('Error fetching push tokens:', error);
    return [];
  }
};

// Controller 20
/**
 * @desc Send push notification
 * @route POST /user/notifications/send
 * @access Admin, User
 */
const sendNotification = async (req: Request, res: Response) => {
  let { token } = req.body;
  const { title, body, query, url } = req.body;
  try {
    if (query) {
      token = await getPushTokens(query);
    }

    if (!token || (Array.isArray(token) && token.length === 0)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid push token' });
    }

    scheduleNotification({ pushToken: token, title, body, url });
    return res.status(StatusCodes.OK).json({ message: 'Notification dispatched' });
  } catch (error) {
    console.error('Notification Error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 21
/**
 * @desc Cleanup inactive users or unused data (testing crone jobs)
 * @route GET /user/cleanup
 * @access Admin
 */
const cleanUp = async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, { _id: 1 }).lean();
    const arr = users.map((user) => user._id);
    return res.status(StatusCodes.OK).json(arr);
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(StatusCodes.OK).json({ message: 'Something went wrong.' });
  }
};

// Controller 22
/**
 * @desc Search for a club, community, or user by name
 * @route GET /user/search
 * @access Public
 */
const search = async (req: Request, res: Response) => {
  const { query } = req.query;
  if (!query || typeof query !== 'string') {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: 'Query parameter is required and must be a string.' });
  }
  try {
    const regex = new RegExp(query, 'i');
    const [communities, clubs, users] = await Promise.all([
      Community.find({ title: regex }, { secondaryCover: 1, title: 1, _id: 1 }).lean(),
      Club.find({ name: regex }, { secondaryImg: 1, name: 1, _id: 1 }).lean(),
      User.find({ name: regex }, { image: 1, name: 1, _id: 1, course: 1, pushToken: 1 }).lean(),
    ]);

    return res.status(StatusCodes.OK).json({
      clubs: clubs.map((club) => ({ ...club, type: 'club' })),
      communities: communities.map((community) => ({ ...community, type: 'community' })),
      users: users.map((user) => ({ ...user, type: 'people' })),
    });
  } catch (e) {
    console.error('Search error:', e);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong!', e });
  }
};

// Controller 23
/**
 * @desc Fetch user bios from an array of IDs
 * @route POST /users/fetch-profiles
 * @access User, Admin
 */
const fetchMultipleProfiles = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Valid array of user IDs is required.' });
    }

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const users = await User.aggregate([
      { $match: { _id: { $in: objectIds } } },
      { $project: { name: 1, image: 1, course: 1, _id: 1, interests: 1, pushToken: 1 } },
    ]);

    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    console.error('Fetch profiles error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 24
/**
 * @desc   Allows a user to tune in to a creator
 * @route  POST /user/tunein
 * @access Authenticated Users
 */
const tuneIn = async (req: Request, res: Response) => {
  const { creatorId } = req.query;
  const tunerId = req.user.id;

  if (!creatorId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Creator ID is required.' });
  }

  if (!tunerId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized request.' });
  }

  try {
    // Fetch users in parallel
    const [creator, tuner] = await Promise.all([
      User.findById(creatorId).select('role pushToken').lean(),
      User.findById(tunerId).select('name pushToken image').lean(),
    ]);

    if (!creator || creator.role !== 'Creator') {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'Content creator not found or invalid.' });
    }

    if (!tuner) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Tuning user not found.' });
    }

    // Update relationships efficiently
    await User.bulkWrite([
      {
        updateOne: {
          filter: { _id: creatorId },
          update: { $addToSet: { tunedIn_By: tunerId } },
        },
      },
      {
        updateOne: {
          filter: { _id: tunerId },
          update: { $addToSet: { hasTunedTo: creatorId } },
        },
      },
    ]);

    // Send push notification asynchronously
    if (creator.pushToken) {
      scheduleNotification2({
        pushToken: [creator.pushToken],
        title: `${tuner.name} Just Tuned In! 🎉`,
        body: `Your content is gaining fans! ${tuner.name} is now following your journey.`,
        url: `https://macbease.com/app/profile/${tunerId}/${tuner.name}/${tuner.pushToken}/${tuner.image}`,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Successfully tuned in!' });
  } catch (error) {
    console.error('TuneIn Error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while tuning in.', error });
  }
};

// Controller 25
/**
 * @desc   Allows a user to untune (unfollow) a creator
 * @route  DELETE /user/untune
 * @access Authenticated Users
 */
const untune = async (req: Request, res: Response) => {
  const { creatorId } = req.query;
  const tunerId = req.user.id;

  if (!creatorId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Creator ID is required.' });
  }

  if (!tunerId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized request.' });
  }

  try {
    // Fetch creator details
    const creator = await User.findById(creatorId).select('role').lean();

    if (!creator || creator.role !== 'Creator') {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'Content creator not found or invalid.' });
    }

    // Perform efficient updates
    await User.bulkWrite([
      {
        updateOne: {
          filter: { _id: creatorId },
          update: { $pull: { tunedIn_By: tunerId } },
        },
      },
      {
        updateOne: {
          filter: { _id: tunerId },
          update: { $pull: { hasTunedTo: creatorId } },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({ message: 'Successfully untuned!' });
  } catch (error) {
    console.error('Untune Error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while untuning.', error });
  }
};

// Controller 26
/**
 * @desc Get recommended professors
 * @route GET /user/professors/recommendations
 * @access Public
 */
const getProfessorRecommendations = async (req: Request, res: Response) => {
  try {
    const professors = await User.find(
      { profession: 'Professor' },
      'name image pushToken course field',
    )
      // .limit(limit)
      .lean();
    return res.status(StatusCodes.OK).json(professors);
  } catch (error) {
    console.error('Error fetching professor recommendations:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching recommendations', error });
  }
};

// Controller 27
/**
 * @desc Search professors by course or field
 * @route GET /user/professors/search
 * @access Public
 */
const searchFromAllProfessors = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Valid search query is required' });
    }

    const regex = new RegExp(query, 'i');
    const professors = await User.find(
      {
        profession: 'Professor',
        $or: [{ course: regex }, { field: regex }, { name: regex }, { interests: regex }],
      },
      'name image pushToken course field',
    ).lean();

    return res.status(StatusCodes.OK).json(professors);
  } catch (error) {
    console.error('Error searching professors:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error searching professors', error });
  }
};

// Controller 28
/**
 * @desc Send email verification
 * @route POST /user/send-mail-verification
 * @access Public
 */
const sendMailVerification = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Email is required' });
  if (!email.endsWith('@gmail.com'))
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid university email' });

  try {
    const verificationUrl = `https://macbease.com/app/verifyEmail?${encodeURIComponent(email)}`;

    const action = {
      instructions: 'Click the button below to verify your email:',
      color: '#1ea1ed',
      text: 'Verify Email',
      url: verificationUrl,
    };

    const { ses, params } = await sendMail(
      'Macbease',
      ['Welcome to Macbease! Please verify your email.'],
      'Thank you for signing up. Let us know if you have questions!',
      'Verify Your Email',
      email,
      action,
    );

    await ses.sendEmail(params).promise();
    return res.status(StatusCodes.OK).json({ message: 'Verification email sent' });
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to send email', err });
  }
};

// Controller 29
/**
 * @desc Verify user email
 * @route PUT /users/verify-email
 * @access User
 */
const verifyEmail = async (req: Request, res: Response): Promise<Response> => {
  const { email } = req.body;
  if (!email) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Email is required' });
  }

  try {
    const updatedUser = await User.updateOne(
      { _id: new mongoose.Types.ObjectId(req.user.id) },
      {
        $set: { professionalEmail: email },
      },
      { new: true },
    );

    if (!updatedUser) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });
    }

    return res.status(StatusCodes.OK).json({ message: 'Email verified', user: updatedUser });
  } catch (error) {
    console.error('Error verifying email:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 30
/**
 * @desc Complete user profile
 * @route PATCH /users/complete-profile
 * @access User
 */
const completeProfile = async (req: Request, res: Response): Promise<Response> => {
  try {
    const fieldsToUpdate = req.body;

    if (!fieldsToUpdate || Object.keys(fieldsToUpdate).length === 0) {
      return res.status(StatusCodes.NO_CONTENT).json({ error: 'No fields provided for update' });
    }

    fieldsToUpdate.incompleteProfile = false;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: fieldsToUpdate },
      { new: true, runValidators: true },
    ).lean();

    if (!updatedUser) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: 'User profile completed', user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 31
/**
 * @desc Send batched push notifications to multiple users
 * @route POST /users/batch
 * @access Admin
 */
const sendBatchedNotifications = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { users, title, body, deepLink } = req.body;

    // Validate input
    if (!Array.isArray(users) || users.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Users must be a non-empty array' });
    }

    if (!title || !body) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Title and body are required' });
    }

    // Fetch user push tokens in a single optimized query
    const usersData = await User.find({ _id: { $in: users } }, { pushToken: 1 }).lean();

    if (usersData.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'No valid users with push tokens found' });
    }

    // Extract push tokens and remove any duplicates
    const tokens = [...new Set(usersData.map((u) => u.pushToken))];

    // Batch notifications to avoid performance bottlenecks
    const BATCH_SIZE = 500;
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batchTokens = tokens.slice(i, i + BATCH_SIZE);
      scheduleNotification2({
        pushToken: batchTokens.filter((token): token is string => token !== undefined),
        title,
        body,
        url: deepLink,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Notifications dispatched successfully' });
  } catch (error) {
    console.error('Error sending notifications:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error });
  }
};

// Controller 32
/**
 * @desc Get users inactive for a given number of days
 * @route GET /users/inactive
 * @access Admin
 */
const getInactiveUsers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const days = Number(req.query.days);
    if (isNaN(days) || days <= 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Valid number of days is required' });
    }

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);

    const inactiveUsers = await User.find(
      { lastActive: { $lt: thresholdDate } },
      'name email lastActive',
    ).lean();

    return res.status(StatusCodes.OK).json({ count: inactiveUsers.length, users: inactiveUsers });
  } catch (error) {
    console.error('Error fetching inactive users:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error });
  }
};

// Controller 33
/**
 * @desc Get user profile by id
 * @route GET /user/:id
 * @access User
 */
const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "id is required" });
    }

    const user = await User.findById(id, { name: 1, image: 1, pushToken: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.");
    }

    return res.status(StatusCodes.OK).json(user);

  } catch (err) {
    console.log("Error fetching user by id :", err)
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong!");
  }
}

export {
  getPushTokens,
  getUser,
  getUserById,
  updateUser,
  deleteUser,
  getUserByToken,
  searchUserByName,
  getUserBio,
  advanceSearch,
  getAllUsers,
  cleanUp,
  getRandomUsers,
  changePassword,
  pushPermanentNotice,
  getPermanentNotices,
  deleteNotifications,
  getCommunitiesForPost,
  getPermanentNoticeInBatch,
  sendMailToUsers,
  getBasicUserBio,
  sendNotification,
  deactivateAccount,
  search,
  fetchMultipleProfiles,
  tuneIn,
  untune,
  getProfessorRecommendations,
  searchFromAllProfessors,
  sendMailVerification,
  verifyEmail,
  completeProfile,
  sendBatchedNotifications,
  getInactiveUsers,
};
