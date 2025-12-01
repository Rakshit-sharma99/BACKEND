import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Club, { IClub } from '../models/club.model';
import Event from '../models/event.model';
import User, { IUser } from '../models/user.model';
import Admin from '../models/admin.model';
import Content from '../models/content.model';
import Itinerary from '../models/itinerary.model';
import Community from '../models/community.model';
import MacbeaseContent from '../models/macbeaseContent.model';
import Invitation from '../models/invitation.model';
import schedule from 'node-schedule';
import {
  sendMail,
  getCurrentISTDate,
  scheduleNotification,
  scheduleNotification2,
  updateDynamicIsland,
  generateUri,
} from './utils.controller';
import { getPushTokens } from './user.controller';

// Middleware
/**
 * @desc    Checks the authorization level of a user in a club
 * @route   Middleware
 * @access  Admin, Main Admin
 */
const checkAuthorization = async (clubId: string, userId: string): Promise<string> => {
  try {
    const club = await Club.findById(clubId).select('adminId mainAdmin').lean();
    if (!club) return 'Club not found';

    if (club.mainAdmin === userId) return 'Fully-authorized';
    return club.adminId.includes(userId) ? 'Authorized' : 'Not-authorized';
  } catch (error) {
    console.error('Error in checkAuthorization:', error);
    return 'Error occurred';
  }
};

/**
 * @desc    Checks if a user is part of a club's team
 * @route   Middleware
 * @access  Team Members, Admin
 */
const isInTeam = async (clubId: string, userId: string): Promise<string> => {
  try {
    const club = await Club.findById(clubId).select('team').lean();
    if (!club || !club.team) return 'Not Team Member';

    return club.team.some((member) => member.id === userId) ? 'Team Member' : 'Not Team Member';
  } catch (error) {
    console.error('Error in isInTeam:', error);
    return 'Error occurred';
  }
};

/**
 * @desc    Checks if a user is a member of the club
 * @route   Middleware
 * @access  User, Admin
 */
const checkIsMember = async (clubId: string, userId: string): Promise<string> => {
  try {
    const club = await Club.findById(clubId).select('members').lean();
    if (!club) return 'Club not found';

    return club.members.includes(userId) ? 'Is a member' : 'Not a member';
  } catch (error) {
    console.error('Error in checkIsMember:', error);
    return 'Error occurred';
  }
};

interface ClubRequestBody {
  name: string;
  motto: string;
  featuringImg: string;
  chiefImage: string;
  chiefMsg: string;
  tags: string[];
  secondaryImg: string;
}

/**
 * @desc    Validates the request body for creating or updating a club
 * @route   Middleware
 * @access  Admin
 */
const validateRequestBody = (body: ClubRequestBody): string[] => {
  const errors: string[] = [];
  const { name, motto, featuringImg, chiefImage, chiefMsg, tags, secondaryImg } = body;

  if (!name?.trim()) errors.push('Name is required and must be a non-empty string.');
  if (!motto?.trim()) errors.push('Motto is required and must be a non-empty string.');
  if (!featuringImg?.trim()) errors.push('Featuring image must be a valid URL.');
  if (!chiefImage?.trim()) errors.push('Chief image must be a valid URL.');
  if (!chiefMsg?.trim()) errors.push('Chief message is required and must be a non-empty string.');
  if (!Array.isArray(tags) || tags.length === 0 || tags.some((tag) => !tag.trim()))
    errors.push('Tags must be a non-empty array of non-empty strings.');
  if (!secondaryImg?.trim()) errors.push('Secondary image must be a valid URL.');

  return errors;
};

/**
 * @desc    Handles additional actions after club creation
 * @route   Internal function
 * @access  Private
 */
const secondaryActionsForClubCreation = async (
  req: Request,
  club: mongoose.Document<unknown, "", IClub> & IClub & Required<{ _id: unknown }>,
  founder: IUser,
) => {
  try {
    //sending an in-app notification
    const scheduleTime = new Date(Date.now() + 3000);
    const clubObj = club.toObject();
    const founderObj = (founder as unknown as mongoose.Document).toObject();
    schedule.scheduleJob(`clubCreation_${clubObj._id}`, scheduleTime, async () => {
      const noticeForFounder = {
        value: `Congratulations! ${founderObj.name} for starting the club ${clubObj.name}.`,
        img1: clubObj.secondaryImg,
        img2: founderObj.image,
        key: 'read',
        action: 'club',
        params: {
          name: clubObj.name,
          secondaryImg: clubObj.secondaryImg,
          id: clubObj._id,
        },
        time: new Date(),
        uid: `${new Date()}/${clubObj.mainAdmin}/${req.user.id}`,
      };

      const shortCut = {
        type: 'club',
        id: clubObj._id,
        name: clubObj.name,
        secondaryImg: clubObj.secondaryImg,
        native: true,
        metaData: { posts: 0, notifications: 0, messages: 0 },
      };

      founderObj.shortCuts = [shortCut, ...founderObj.shortCuts];
      founderObj.unreadNotice = [noticeForFounder, ...founderObj.unreadNotice];
      await founder.save();

      scheduleNotification2({
        pushToken: [founderObj.pushToken],
        title: `🎉 Hats Off, Founder Extraordinaire! 🎩`,
        body: `You've just birthed the legendary club "${clubObj.name}" into existence. The world (and your members) are waiting for your brilliance! 🌟`,
        url: `https://macbease.com/app/club/${clubObj._id}`,
      });

      // Send email
      const emailContent = {
        name: founder.name,
        intro: [
          `Congratulations, ${founder.name}, for starting the club ${club.name}.`,
          'Our team at Macbease will help you turn this club into a great organization.',
        ],
        outro:
          'This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.',
        subject: 'Club Creation',
        destination: [founder.email],
      };
      const { ses, params } = await sendMail(
        emailContent.name,
        emailContent.intro,
        emailContent.outro,
        emailContent.subject,
        emailContent.destination,
      );
      ses.sendEmail(params, (err: Error) => {
        if (err) console.log('Email error:', err);
      });
    });
  } catch (error) {
    console.error('Error in secondary action for club creation:', error);
  }
};

const scheduleMemberNotification = (user: IUser, club: IClub) => {
  const notice = {
    value: `Congratulations! ${club.name} accepted your membership application.`,
    img1: club.secondaryImg || null,
    img2: user.image,
    key: 'read',
    action: 'club',
    params: {
      name: club.name,
      secondaryImg: club.secondaryImg,
      id: club._id as mongoose.Types.ObjectId,
    },
    time: new Date(),
    uid: new Date().toISOString() + 'membership_accepted',
  };
  const scheduleTime = new Date(Date.now() + 3 * 1000);
  schedule.scheduleJob(`congratulateMember_${user.id}_${scheduleTime}`, scheduleTime, async () => {
    user?.unreadNotice?.unshift(notice);
    scheduleNotification2({
      pushToken: user.pushToken ? [user.pushToken] : [],
      title: `Congratulations🎊🥳🎉!`,
      body: `${club.name} accepted your membership application.`,
      url: `https://macbease.com/app/club/${club._id}`,
    });
    await user.save();
    await sendMemberEmail(user, club);
  });
};

// Function to send member email
const sendMemberEmail = async (user: { name: string; email: string }, club: { name: string }) => {
  const name = user.name;
  const intro = [
    `Congratulations! for becoming the member of the club ${club.name}.`,
    'As a member, you will have access to exclusive events, resources, and opportunities to connect with fellow members. We encourage you to participate actively and make the most of your membership.',
  ];
  const outro =
    'This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.';
  const subject = 'Great News';
  const destination = [user.email];

  const { ses, params } = await sendMail(name, intro, outro, subject, destination);
  ses.sendEmail(params, (err) => {
    if (err) {
      console.error('Error sending email:', err);
    }
  });
};

// Controller 1
/**
 * @desc    Creates a new club
 * @route   POST /club
 * @access  Admin
 */
const createClub = async (req: Request, res: Response) => {
  try {
    const errors = validateRequestBody(req.body);
    if (errors.length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ errors });
    }
    const club = new Club({
      ...req.body,
      adminId: [req.user.id],
      mainAdmin: req.user.id,
      team: [{ id: req.user.id, pos: 'Founder' }],
      members: [req.user.id],
      createdOn: new Date(),
    });

    // Fetch founder details in a single query
    const founder = await User.findById(req.user.id, {
      clubs: 1,
      unreadNotice: 1,
      email: 1,
      name: 1,
      pushToken: 1,
      image: 1,
      reg: 1,
      shortCuts: 1,
    });
    if (!founder) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });

    // Add club details to user's profile
    founder?.clubs?.push({
      clubId: club._id!.toString(),
      joinDate: new Date(),
      badges: [],
    });

    await club.save();
    await founder.save();

    // Perform secondary actions asynchronously
    secondaryActionsForClubCreation(req, club, founder);
    return res.status(StatusCodes.CREATED).json(club);
  } catch (error) {
    console.error('Error creating club:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 2
/**
 * @desc    Deletes a club by ID
 * @route   DELETE /club/:clubId
 * @access  Admin, Main Admin
 */
const deleteClub = async (req: Request, res: Response) => {
  const { clubId } = req.params;

  try {
    // Validate authorization
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized !== 'Fully-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to delete this club' });
    }

    const deletedClub = await Club.findByIdAndDelete(clubId);
    if (!deletedClub) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    // Remove club from user's profile
    const updateQuery =
      req.user.role === 'admin' ? { $pull: { clubs: clubId } } : { $pull: { clubs: { clubId } } };

    await User.findByIdAndUpdate(req.user.id, updateQuery);

    return res.status(StatusCodes.OK).json({ message: 'Club deleted successfully' });
  } catch (error) {
    console.error('Error deleting club:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 3
/**
 * @desc    Allows a user to join a club as a member
 * @route   POST /club/join
 * @access  User, Admin
 */
const joinAsMember = async (req: Request, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'user')) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized access' });
    }

    const { clubId } = req.body;
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    if (club.members.includes(req.user.id)) {
      return res.status(StatusCodes.OK).json({ message: 'Already a member' });
    }

    // Update user and club in a single transaction
    const userUpdate =
      req.user.role === 'user'
        ? User.findByIdAndUpdate(req.user.id, {
          $push: { clubs: { clubId, joinDate: new Date(), badges: [] } },
        })
        : Admin.findByIdAndUpdate(req.user.id, { $push: { clubs: { clubId } } });

    club.members.push(req.user.id);
    club.xAxisData.push((club.xAxisData.at(-1) ?? 0) + 1);
    club.yAxisData.push(new Date());
    await Promise.all([userUpdate, club.save()]);

    return res.status(StatusCodes.OK).json({ message: 'Successfully joined the club' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

// Controller 4
/**
 * @desc    Allows a user to leave a club
 * @route   DELETE /club/leave
 * @access  User, Admin
 */
const leaveAsMember = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.body;
    const club = await Club.findById(clubId).select(
      'members adminId team xAxisData yAxisData mainAdmin',
    );
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    if (req.user.id === club.mainAdmin) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Founder cannot leave without disbanding the club' });
    }

    await User.findByIdAndUpdate(req.user.id, { $pull: { clubs: { clubId } } });
    club.members = club.members.filter((id) => id !== req.user.id);
    club.adminId = club.adminId.filter((id) => id !== req.user.id);
    club.team = club.team.filter((member) => member.id !== req.user.id);
    club.xAxisData.push((club.xAxisData.at(-1) ?? 1) - 1);
    club.yAxisData.push(new Date());
    await club.save();

    return res.status(StatusCodes.OK).json({ message: 'Successfully left the club' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

// Controller 5
/**
 * @desc    Allows an admin to add a user as a member
 * @route   POST /club/add-member
 * @access  Admin
 */
const addAsMember = async (req: Request, res: Response) => {
  try {
    const { clubId, userId } = req.body;
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized' });
    }
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized !== 'Fully-authorized') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Not authorized to add members' });
    }

    const [club, user] = await Promise.all([
      Club.findById(clubId).select('name secondaryImg members xAxisData yAxisData'),
      User.findById(userId).select('name email clubs image unreadNotice pushToken'),
    ]);

    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    user?.clubs?.push({ clubId, joinDate: new Date(), badges: [] });
    club.members.push(userId);
    club.xAxisData.push((club.xAxisData.at(-1) ?? 0) + 1);
    club.yAxisData.push(new Date());
    await Promise.all([user.save(), club.save()]);

    scheduleMemberNotification(user, club);
    return res.status(StatusCodes.OK).json({ message: 'Member added successfully to the club' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

// Controller 6
/**
 * @desc Remove a member from a club
 * @route DELETE /club/member
 * @access Admin
 */
const removeAsMember = async (req: Request, res: Response) => {
  try {
    const { clubId, userId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);

    if (isAuthorized !== 'Fully-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to remove members.' });
    }
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
    }

    await User.findByIdAndUpdate(userId, { $pull: { clubs: clubId } });

    club.members = club.members.filter((member) => member.toString() !== userId);
    club.adminId = club.adminId.filter((admin) => admin.toString() !== userId);
    club.team = club.team.filter((teamMember) => teamMember.id.toString() !== userId);

    if (club.xAxisData.length) {
      if (club.xAxisData) {
        club.xAxisData.push((club.xAxisData.at(-1) ?? 1) - 1);
      }
      club.yAxisData.push(new Date());
    }

    await club.save();
    return res
      .status(StatusCodes.OK)
      .json({ message: 'Successfully removed the member of the club.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 7
/**
 * @desc Promote a user to admin
 * @route PATCH /club/admin
 * @access Admin
 */
const addAdmin = async (req: Request, res: Response) => {
  try {
    const { clubId, userId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, userId);
    if (isAuthorized === 'Club not found') {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'No such club is active.' });
    }
    if (isAuthorized !== 'Fully-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to add an admin to the club.' });
    }
    const isMember = await checkIsMember(clubId, userId);
    if (isMember !== 'Is a member') {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'The user must first become a member of the club.' });
    }
    const club = await Club.findByIdAndUpdate(
      clubId,
      { $addToSet: { adminId: userId } },
      { new: true, select: 'name secondaryImg' },
    );
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });

    const user = await User.findById(userId, 'pushToken');
    if (user?.pushToken) {
      scheduleNotification({
        pushToken: [user.pushToken],
        title: `Promoted to Admin`,
        body: `You're now an admin in ${club.name}.`,
      });
    }
    return res.status(StatusCodes.OK).json({ message: 'Admin successfully added.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error adding admin.', error });
  }
};

// Controller 8
/**
 * @desc Remove an admin from a club
 * @route DELETE /club/admin
 * @access Admin
 */
const removeAdmin = async (req: Request, res: Response) => {
  try {
    const { clubId, userId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);

    if (
      isAuthorized === 'Fully-authorized' ||
      (isAuthorized === 'Authorized' && userId === req.user.id)
    ) {
      const update = await Club.findByIdAndUpdate(
        clubId,
        { $pull: { adminId: userId } },
        { new: true },
      );
      if (!update) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
      return res.status(StatusCodes.OK).json({ message: 'Admin removed successfully.' });
    } else if (isAuthorized === 'Authorized' || isAuthorized === 'Not-authorized') {
      res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to remove an admin from the club.' });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error removing admin.', error });
  }
};

// Controller 9
const postEvent = async (req: Request, res: Response) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId } = req.body;
    let { event } = req.body;
    event = { ...event, postedBy: req.user.id };
    try {
      if (!clubId) {
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required.' });
      }
      const isAuthorized = await checkAuthorization(clubId, req.user.id);
      if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
        const club = await Club.findById(clubId, { upcomingEvent: 1, name: 1 });
        if (!club) {
          return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
        }
        club.upcomingEvent = [event, ...(club.upcomingEvent || [])];
        await club.save();

        //scheduling job for pushing notification,email and feed to the members
        // let threeSec = new Date(Date.now() + 1 * 3 * 1000);
        // schedule.scheduleJob(
        //   `pushNoticeOfEvent_${req.user.id}_${new Date()}`,
        //   threeSec,
        //   async () => {
        //     let membersDoc = await Club.findById(clubId, { members: 1, _id: 0 });
        //     if (!membersDoc || !membersDoc.members) {
        //       return console.error('Members not found.');
        //     }
        //     let members = membersDoc.members;
        //     let len = members.length;
        //     let club = await Club.findById(clubId, {
        //       name: 1,
        //       secondaryImg: 1,
        //       _id: 0,
        //       notifications: 1,
        //     });
        //     if (!club) {
        //       return console.error('Club not found.');
        //     }
        //     const notice = {
        //       value: `${club.name} is going to organize ${event.name}.`,
        //       img1: club.secondaryImg,
        //       img2: event.url,
        //       key: 'event',
        //       action: 'club',
        //       params: {
        //         name: club.name,
        //         secondaryImg: club.secondaryImg,
        //         id: clubId,
        //       },
        //       time: new Date(),
        //       uid: ' ',
        //     };
        //     let emails: string[] = [];

        //     //feeding club notification
        //     const clubName = club.name;
        //     const eventName = event.name;
        //     const eventDate = event.eventDate;
        //     const clubNotice = {
        //       id: new mongoose.Types.ObjectId().toString(),
        //       uid: new Date() + (req.user.id ?? 'unknown'),
        //       title: 'Upcoming event',
        //       msg: `We are going to organize ${eventName} on ${eventDate}!`,
        //       visibility: 'public',
        //       createdAt: new Date(),
        //     };
        //     club.notifications = [clubNotice, ...(club.notifications || [])];
        //     await club.save();

        //     //sending in-app notice and push notification and updating event feed of all the memebers
        //     for (let i = 0; i < len; i++) {
        //       let userId = members[i];
        //       let user = await User.findById(userId, {
        //         unreadNotice: 1,
        //         eventFeed: 1,
        //         email: 1,
        //         pushToken: 1,
        //       });
        //       if (!user) {
        //         continue;
        //       }
        //       scheduleNotification({
        //         pushToken: [user.pushToken as string],
        //         title: 'Upcoming Event',
        //         body: `${clubName} is going to organize ${eventName} on ${eventDate}`
        //       });
        //       notice.uid = `${new Date()}/${user._id}/${req.user.id}`;
        //       user.unreadNotice = [notice, ...user.unreadNotice ?? []];
        //       user.eventFeed = [
        //         {
        //           ...event,
        //           header: `${club.name} is going to organize ${event.name}`,
        //         },
        //       ];
        //       emails = [user.email, ...emails];
        //       await user.save();
        //     }

        //     //sending mail to memebers
        //     const emailBatchesOf50 = segregateIntoBatches(emails, 50);
        //     const intro = [
        //       `We are glad to inform you that ${club.name} is going to organize ${event.name}. Find out more on club's official page at Macbease.`,
        //       `We are expecting to see your active participation.`,
        //     ];
        //     const outro = 'This is good college life!';
        //     const subject = 'Upcoming Event';
        //     const name = 'there!';
        //     emailBatchesOf50.forEach(async function (element) {
        //       const destination = element;
        //       const { ses, params } = await sendMail(name, intro, outro, subject, destination);
        //       try {
        //         const result = await ses.sendEmail(params).promise();
        //       } catch (error) {
        //         console.error('Error sending email:', error);
        //       }
        //     });
        //   }
        // );

        return res.status(StatusCodes.OK).json({ message: 'Event posted successfully.' });
      } else {
        return res
          .status(StatusCodes.OK)
          .json({ message: 'You have to be admin to post an event.' });
      }
    } catch (error) {
      console.log(error);
      return res.status(StatusCodes.OK).json({ message: 'Something went wrong.' });
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .json({ error: 'You are not authorized to access this route of posting an event.' });
  }
};

// Controller 10
/**
 * @desc Remove an event from a club
 * @route DELETE /club/event
 * @access Admin, User
 */
const removeEvent = async (req: Request, res: Response) => {
  if (!['admin', 'user'].includes(req.user.role)) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
  }

  try {
    const { clubId, eventId } = req.body;
    if (!clubId || !eventId)
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Club ID and event details are required' });
    const isAuthorized = await checkAuthorization(clubId, req.user.id);

    if (!['Fully-authorized', 'Authorized'].includes(isAuthorized)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to remove events.' });
    }
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
    }

    const eventToRemove = club.upcomingEvent.find((event) => event.id === eventId);
    if (!eventToRemove) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    const concernedEvent = await Event.findById(eventId);
    if (!concernedEvent || ['featured', 'past and unclear'].includes(concernedEvent.status)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Cannot delete featured event.' });
    }

    await Event.findByIdAndDelete(eventId);

    club.upcomingEvent = club.upcomingEvent.filter((event) => event.id !== eventId);
    await club.save();

    return res.status(StatusCodes.OK).json({ message: 'Successfully removed event!' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 11
/**
 * @desc Post content to a club
 * @route POST /club/content
 * @access Admin, User
 */
const postContent = async (req: Request, res: Response) => {
  if (!['admin', 'user'].includes(req.user.role)) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
  }

  const { clubId, contentId } = req.body;
  if (!clubId || !contentId) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'Club ID and content ID are required' });
  }

  const isAuthorized = await checkAuthorization(clubId, req.user.id);
  if (!['Fully-authorized', 'Authorized'].includes(isAuthorized)) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .json({ message: 'You are not authorized to post content' });
  }

  try {
    const content = await Content.findById(contentId, { url: 1, contentType: 1, text: 1 });
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
    }

    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
    }

    const data = { contentId, postedBy: req.user.id, timeStamp: new Date() };
    club.content.push(data);
    if (content.contentType === 'video') {
      club.videos.push({
        id: contentId,
        url: content?.url as string,
      });
    }
    await club.save();

    await User.findByIdAndUpdate(req.user.id, { $push: { clubContributions: contentId } });

    // Schedule job for updating feed (pseudo-code)
    schedule.scheduleJob(
      `feedClub_${req.user.id}_${new Date()}`,
      new Date(Date.now() + 3000),
      async () => {
        try {
          //reproduce actual content to be pushed in the user's feed
          const club = await Club.findById(clubId, {
            members: 1,
            name: 1,
            secondaryImg: 1,
            pinnedBy: 1,
            _id: 0,
          });
          const point = {
            _id: contentId,
          };
          const noticeTemplate = {
            value: `${club?.name} posted a pin.`,
            img1: club?.secondaryImg || null,
            img2: content.url || null,
            contentType: content.contentType,
            key: 'content',
            action: 'club',
            params: {
              name: club?.name,
              secondaryImg: club?.secondaryImg,
              id: clubId,
            },
            time: new Date(),
          };
          const users = await User.find(
            { _id: { $in: club?.members } },
            { pushToken: 1, feed: 1, unreadNotice: 1 },
          );
          const tokens = users.map((item) => item.pushToken);
          const userUpdatePromise = users.map((user) => {
            const notice = {
              ...noticeTemplate,
              uid: `${new Date()}/${user._id}/${req.user.id}`,
            };
            user.feed = [point, ...(user.feed || [])];
            user.unreadNotice = [notice, ...(user.unreadNotice || [])];
            return user.save();
          });
          await Promise.all(userUpdatePromise);
          if (club && club.pinnedBy) {
            await updateDynamicIsland(club.pinnedBy, clubId, 'posts', true);
          }
          if (content.contentType === 'image') {
            const img = await generateUri((content.url ?? '').split('@')[0]);
            scheduleNotification2({
              pushToken: tokens.filter((token): token is string => token !== undefined),
              title: `${club?.name} posted a pin.`,
              body: `${(content.text ?? '').substring(0, 50)}...`,
              image: img,
              url: `https://macbease.com/app/club/${clubId}`,
            });
          } else {
            scheduleNotification2({
              pushToken: tokens.filter((token): token is string => token !== undefined),
              title: `${club?.name} posted a pin.`,
              body: `${(content.text ?? '').substring(0, 50)}...`,
              url: `https://macbease.com/app/club/${clubId}`,
            });
          }
        } catch (error) {
          console.error('Error in scheduled job:', error);
        }
      },
    );

    return res.status(StatusCodes.OK).json({ message: 'Successfully posted content!' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 12
/**
 * @desc Remove content from a club
 * @route DELETE /club/content
 * @access Admin, User
 */
const removeContent = async (req: Request, res: Response) => {
  if (!['admin', 'user'].includes(req.user.role)) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
  }

  const { clubId, contentId } = req.body;
  const isAuthorized = await checkAuthorization(clubId, req.user.id);

  if (!['Fully-authorized', 'Authorized'].includes(isAuthorized)) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .json({ message: 'You are not authorized to remove content.' });
  }

  try {
    const update = await Club.findByIdAndUpdate(
      clubId,
      { $pull: { content: { contentId }, videos: { id: contentId } } },
      { new: true },
    );

    if (!update) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
    return res.status(StatusCodes.OK).json({ message: 'Content removed successfully.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error removing content.', error });
  }
};

// Controller 13
/**
 * @desc Add an image to the club's gallery
 * @route POST /club/gallery
 * @access Authorized Users, Admins
 */
const postGallery = async (req: Request, res: Response) => {
  try {
    const { clubId, url, id, desc, date } = req.body;
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (!['Fully-authorized', 'Authorized'].includes(isAuthorized)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Not authorized to post in gallery.' });
    }

    const data = { url, id, postedBy: req.user.id, desc, date: new Date(date) };
    await Club.findByIdAndUpdate(clubId, { $push: { gallery: data } }, { new: true });
    return res.status(StatusCodes.OK).json({ message: 'Successfully posted in gallery!' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 14
/**
 * @desc Remove an image from the club's gallery
 * @route DELETE /club/gallery
 * @access Authorized Users, Admins
 */
const removeGallery = async (req: Request, res: Response) => {
  try {
    const { clubId, id } = req.body;
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (!['Fully-authorized', 'Authorized'].includes(isAuthorized)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Not authorized to remove from gallery.' });
    }

    await Club.findByIdAndUpdate(clubId, { $pull: { gallery: { id } } }, { new: true });
    return res.status(StatusCodes.OK).json({ message: 'Successfully removed from gallery!' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 15
/**
 * @desc Add a notification to a club
 * @route POST /club/notifications
 * @access Authorized Users, Admins
 */
const addNotifications = async (req: Request, res: Response) => {
  try {
    const { clubId, notification } = req.body;
    const user = await User.findById(req.user.id, { name: 1, image: 1 });
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    const newNotification = {
      ...notification,
      postedBy: req.user.id,
      createdAt: getCurrentISTDate(),
      name: user.name,
      image: user.image,
    };

    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (!['Fully-authorized', 'Authorized'].includes(isAuthorized)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Admin access required to add notifications.' });
    }

    const club = await Club.findByIdAndUpdate(
      clubId,
      { $push: { notifications: newNotification } },
      { new: true },
    );
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    schedule.scheduleJob(
      `addClubNotice_${req.user.id}_${Date.now()}`,
      new Date(Date.now() + 3000),
      async () => {
        if (club.pinnedBy) {
          await updateDynamicIsland(club.pinnedBy, clubId, 'notifications', true);
        }
      },
    );

    return res.status(StatusCodes.OK).json({ message: 'Notification successfully added.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error occurred while creating notification.', error });
  }
};

// Controller 16
/**
 * @desc Delete a notification from a club
 * @route DELETE /club/notifications/:uid
 * @access Authorized Users, Admins
 */
const deleteNotifications = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { clubId, uid } = req.body;
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (!['Fully-authorized', 'Authorized'].includes(isAuthorized)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Admin access required to delete notifications.' });
    }

    const club = await Club.findByIdAndUpdate(
      clubId,
      { $pull: { notifications: { uid } } },
      { new: true },
    );
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    return res.status(StatusCodes.OK).json({ message: 'Notification successfully deleted.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 17
/**
 * @desc Edit a club's profile
 * @route PATCH /club/:clubId
 * @access Admins Only
 */
const editProfile = async (req: Request, res: Response) => {
  try {
    const { clubId, data } = req.body;
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized !== 'Fully-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Only main admin can edit the profile.' });
    }

    const updatedClub = await Club.findByIdAndUpdate(clubId, data, { new: true });
    if (!updatedClub) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    return res.status(StatusCodes.OK).json({ message: 'Profile successfully updated!' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 18
/**
 * @desc Add a team member to a club
 * @route POST /club/team
 * @access Admin
 */
const addTeamMember = async (req: Request, res: Response) => {
  try {
    const { clubId, id, pos } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    const isUserAuthorized = await checkAuthorization(clubId, id);
    if (isUserAuthorized !== 'Authorized') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'User must be an admin first.' });
    }
    if (isAuthorized !== 'Fully-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Only main admin can edit the team.' });
    }
    const club = await Club.findByIdAndUpdate(
      clubId,
      { $push: { team: { id, pos } } },
      { new: true, projection: { name: 1, secondaryImg: 1 } },
    );

    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
    }

    const userInfo = await User.findById(id, { pushToken: 1 }).lean();
    if (userInfo?.pushToken) {
      scheduleNotification2({
        pushToken: [userInfo.pushToken],
        title: `Congratulations! 🎉`,
        body: `You were promoted to ${pos} in ${club.name}`,
        url: `https://macbease.com/app/club/${clubId}`,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Successfully added to the team!' });
  } catch (error) {
    console.error('Error adding team member:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred.', error });
  }
};

// Controller 19
/**
 * @desc Remove a team member from a club
 * @route DELETE /club/team
 * @access Admin, Team Member (self-removal)
 */
const removeTeamMember = async (req: Request, res: Response): Promise<Response> => {
  if (!['user', 'admin'].includes(req.user.role)) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized access.' });
  }

  try {
    const { clubId, id } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    const isPartOfTeam = await isInTeam(clubId, req.user.id);

    if (
      !(
        isAuthorized === 'Fully-authorized' ||
        (isPartOfTeam === 'Team Member' && id === req.user.id)
      )
    ) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Only main admin or self can remove from the team.' });
    }

    const result = await Club.findByIdAndUpdate(clubId, { $pull: { team: { id } } }, { new: true });

    if (!result) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    return res.status(StatusCodes.OK).json({ message: 'Successfully removed from team!' });
  } catch (error) {
    console.error('Error removing team member:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred.', error });
  }
};

// Controller 20
/**
 * @desc Get all events of a club
 * @route GET /club/events
 * @access Public
 */
const getAllEvents = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.query;
    if (!clubId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Club ID is required' });
    }

    const club = await Club.findById(clubId).select('upcomingEvent -_id').lean();
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    const eventData = await Itinerary.find({
      _id: { $in: club.upcomingEvent.map((e) => e.itineraries) },
    });
    return res.status(StatusCodes.OK).json(eventData);
  } catch (error) {
    console.error('Get all events error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 21
/**
 * @desc Get clubs by tag
 * @route GET /club/tag
 * @access User, Admin
 */
const getClubsByTag = async (req: Request, res: Response) => {
  try {
    const { tag } = req.query as { tag: string };
    if (!tag) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Tag is required' });
    }

    const clubs = await Club.find(
      { tags: new RegExp(tag, 'ig') },
      { secondaryImg: 1, name: 1, tags: 1, motto: 1 },
    ).lean();

    // Update last active status
    const updateLastActive = async (Model: typeof User | typeof Admin, id: string) => {
      if (Model === User) {
        await User.findByIdAndUpdate(id, { lastActive: new Date() });
      } else if (Model === Admin) {
        await Admin.findByIdAndUpdate(id, { lastActive: new Date() });
      }
    };

    if (req.user.role === 'user') {
      await updateLastActive(User, req.user.id);
    } else if (req.user.role === 'admin') {
      await updateLastActive(Admin, req.user.id);
    }

    return res.status(StatusCodes.OK).json(clubs);
  } catch (error) {
    console.error('Get clubs by tag error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 22
/**
 * @desc Get like status of content
 * @route GET /club/content/like-status
 * @access User, Admin
 */
const getLikeStatus = async (req: Request, res: Response) => {
  try {
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized' });
    }
    const { contentId } = req.query;
    if (!contentId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Content ID is required' });
    }
    const content = await Content.findById(contentId).select('likes -_id').lean();
    return res
      .status(StatusCodes.OK)
      .json({ liked: content?.likes?.includes(req.user.id) || false });
  } catch (error) {
    console.error('Get like status error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 23
/**
 * @desc Get latest content updates
 * @route GET /club/content/latest
 * @access User, Admin
 */
const getLatestContent = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }
    const { clubId } = req.query;
    if (!clubId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });
    }
    const user =
      req.user.role === 'user'
        ? await User.findById(req.user.id).select('lastActive')
        : await Admin.findById(req.user.id).select('lastActive');
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    const club = await Club.findById(clubId).select('content').lean();
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    const newContent = club.content.filter(
      (c) => user.lastActive && new Date(c.timeStamp) > new Date(user.lastActive),
    );
    return res.status(StatusCodes.OK).json(newContent);
  } catch (error) {
    console.error('Get latest content error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 24
/**
 * @desc Get clubs a user is part of
 * @route GET /club/user/clubs
 * @access User
 */
const getClubsPartOf = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'User ID is required' });
    }

    const userClubs = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId as string) } },
      { $unwind: '$clubs' },
      {
        $lookup: {
          from: 'clubs',
          localField: 'clubs.clubId',
          foreignField: '_id',
          as: 'clubDetails',
        },
      },
      { $unwind: '$clubDetails' },
      {
        $project: {
          clubId: '$clubs.clubId',
          joinDate: '$clubs.joinDate',
          badges: '$clubs.badges',
          name: '$clubDetails.name',
          secondaryImg: '$clubDetails.secondaryImg',
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(userClubs);
  } catch (error) {
    console.error('Get clubs part of error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching club details', error });
  }
};

// Controller 25
/**
 * @desc Get club profile
 * @route GET /club/profile
 * @access Public
 */
const getClubProfile = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.query;
    if (!clubId) return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Club ID is required' });

    const club = await Club.findById(clubId).select('name secondaryImg motto').lean();
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found' });

    return res.status(StatusCodes.OK).json(club);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong!', error });
  }
};

// Controller 26
/**
 * @desc Update club rating
 * @route PATCH /club/rating
 * @access User, Admin
 */
const updateRating = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }
    const { clubId } = req.query;
    if (!clubId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });

    const club = await Club.findById(clubId).select('members gallery upcomingEvent content rating');
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    club.rating = Math.floor(
      13.5 *
      (club.members.length +
        club.gallery.length +
        club.upcomingEvent.length +
        club.content.length),
    );
    await club.save();

    return res.status(StatusCodes.OK).json({ message: 'Updated rating!' });
  } catch (error) {
    console.error('Update rating error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 27
/**
 * @desc Get club bio
 * @route GET /club/bio
 * @access User, Admin
 */
const getClubBio = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    const { clubId } = req.query;
    if (!clubId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });

    const club = await Club.findById(clubId)
      .select('members upcomingEvent rating featuringImg motto tags createdOn team name')
      .lean();
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    const teamMembers = await User.find({ _id: { $in: club.team.map((member) => member.id) } })
      .select('name image -_id')
      .lean();
    const team = club.team.map((member) => ({
      ...member,
      ...teamMembers.find((user) => user._id.toString() === member.id),
    }));

    return res.status(StatusCodes.OK).json({
      name: club.name,
      featuringImg: club.featuringImg,
      motto: club.motto,
      createdOn: club.createdOn,
      totalMembers: club.members.length,
      totalEvents: club.upcomingEvent.length,
      ranking: club.rating,
      team,
      tag: club.tags,
    });
  } catch (error) {
    console.error('Get club bio error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching club bio', error });
  }
};

// Controller 28
/**
 * @desc Get club content
 * @route GET /club/content
 * @access User, Admin
 */
const getClubContent = async (req: Request, res: Response) => {
  try {
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }
    const { clubId } = req.query;
    if (!clubId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });

    const club = await Club.findById(clubId, { content: 1, _id: 0 });
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    return res.status(StatusCodes.OK).json(club);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching club content', error });
  }
};

// Controller 29
/**
 * @desc Get club gallery
 * @route GET /club/gallery
 * @access User, Admin
 */
const getClubGallery = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }
    const { clubId, mode, batch, batchSize } = req.query;
    if (!clubId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });

    const club = await Club.findById(clubId).select('gallery').lean();
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    const batchNum = Number(batch) || 1;
    const batchSizeNum = Number(batchSize) || 10;
    if (isNaN(batchNum) || isNaN(batchSizeNum)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Invalid batch or batchSize values' });
    }

    let data = club.gallery.slice((batchNum - 1) * batchSizeNum, batchNum * batchSizeNum);
    if (mode !== 'tiles') {
      const userIds = data.map((item) => item.postedBy);
      const users = await User.find({ _id: { $in: userIds } })
        .select('name image pushToken')
        .lean();
      data = data.map((item) => ({
        ...item,
        userInfo: users.find((user) => user._id.toString() === item.postedBy),
      }));
    }

    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.error('Error fetching club gallery:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// new controller added
/**
 * @desc Fetch videos from a club with user details
 * @route GET /club/videos
 * @access User, Admin
 */
const getClubVideos = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    const { clubId } = req.query;
    if (!clubId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });

    const club = await Club.findById(clubId, { videos: 1, _id: 0 }).lean();
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });

    const videos = (club.videos ?? []).slice(-12).reverse();
    const contentIds = videos.map((v) => v.id);
    const contentData = await Content.find({ _id: { $in: contentIds } }).lean();

    const userIds = contentData.map((c) => c.idOfSender);
    const users = await User.find({ _id: { $in: userIds } })
      .select('name image pushToken')
      .lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    const finishedContent = contentData.map((data) => ({
      ...data,
      userName: userMap[data.idOfSender]?.name || 'Unknown',
      userPic: userMap[data.idOfSender]?.image || null,
      userPushToken: userMap[data.idOfSender]?.pushToken || null,
    }));

    return res.status(StatusCodes.OK).json(finishedContent);
  } catch (error) {
    console.error('Error fetching club videos:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 30
/**
 * @desc Check if user is an admin of a club
 * @route GET /club/is-admin
 * @access User, Admin
 */
const isAdmin = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.query;
    if (!clubId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });
    }

    const club = await Club.findById(clubId, { adminId: 1 }).lean();
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    const isAdmin = club.adminId?.includes(req.user.id || '');
    return res.status(StatusCodes.OK).json({ isAdmin });
  } catch (error) {
    console.error('Error checking admin status:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 31
/**
 * @desc Check if user is an admin of a club
 * @route GET /club/is-member
 * @access User, Admin
 */
const isMember = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.query;
    if (!clubId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });
    }
    const club = await Club.findById(clubId, { members: 1 }).lean();
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    const isMember = club.members?.includes(req.user.id || '');
    return res.status(StatusCodes.OK).json({ isMember });
  } catch (error) {
    console.error('Error checking admin status:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 32
/**
 * @desc Get notifications from a club
 * @route GET /club/notifications
 * @access User, Admin
 */
const getClubNotifications = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }

    const { clubId, batch, batchSize } = req.query;
    if (!clubId || !batch || !batchSize) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Club ID, batch, and batchSize are required' });
    }

    const club = await Club.findById(clubId, { notifications: 1 }).lean();
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    const startIndex = (Number(batch) - 1) * Number(batchSize);
    const endIndex = Number(batch) * Number(batchSize);
    const notifications = club.notifications.slice(startIndex, endIndex);

    if (batch === '1') {
      const [isAuthorized, isTeamMember] = await Promise.all([
        checkAuthorization(clubId as string, req.user.id),
        isInTeam(clubId as string, req.user.id),
      ]);
      return res.status(StatusCodes.OK).json({ notifications, isAuthorized, isTeamMember });
    }

    return res.status(StatusCodes.OK).json(notifications);
  } catch (error) {
    console.error('Error fetching club notifications:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

// Controller 35
/**
 * @desc Get if the user is Main admin of club
 * @route GET /club/main-admin
 * @access User, Admin
 */
const isMainAdmin = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.query;
    if (!clubId) return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Club ID is required' });

    const isAuthorized = await checkAuthorization(clubId as string, req.user.id);
    if (isAuthorized === 'Fully-authorized') {
      return res.status(StatusCodes.OK).json({ message: true });
    }
    return res.status(StatusCodes.OK).json({ message: false });
  } catch (error) {
    console.error('Error checking main admin status:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

// Controller 36
/**
 * @desc Get the id of the creator
 * @route GET /club/creator-id
 * @access User, Admin
 */
const getCreatorId = async (req: Request, res: Response) => {
  try {
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }
    const { clubId } = req.query;
    if (!clubId) return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Club ID is required' });

    const club = await Club.findById(clubId, { mainAdmin: 1, _id: 0 }).lean();
    return res.status(StatusCodes.OK).json(club);
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong', error });
  }
};

// Controller 37
/**
 * @desc    Fetch personalized fast feed based on user activity and club membership
 * @route   GET /club/feed/fast
 * @access  User
 */
const getFastFeed = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'Unauthorized access.' });
    }

    const user = await User.findById(req.user.id, { clubs: 1, lastActive: 1 }).lean();
    if (!user || !user.clubs?.length || !user.lastActive) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Incomplete user data.' });
    }

    const clubIds = user.clubs.map((c) => c.clubId);
    const clubs = await Club.find({ _id: { $in: clubIds } }, { content: 1 }).lean();
    const contentIds = clubs.flatMap((club) => club.content.map((c) => c.contentId));

    const contents = await Content.find({ _id: { $in: contentIds } })
      .select('title description idOfSender belongsTo createdAt likes comments')
      .lean();

    const userIds = contents.map((c) => c.idOfSender);
    const clubOwnerIds = contents.map((c) => c.belongsTo);

    const [users, clubOwners] = await Promise.all([
      User.find({ _id: { $in: userIds } }, { _id: 1, name: 1, image: 1 }).lean(),
      Club.find({ _id: { $in: clubOwnerIds } }, { _id: 1, name: 1, secondaryImg: 1 }).lean(),
    ]);

    const userMap = Object.fromEntries(users.map((user) => [user._id.toString(), user]));
    const clubMap = Object.fromEntries(clubOwners.map((club) => [club._id.toString(), club]));

    const finishedContent = contents.map((content) => ({
      ...content,
      userName: userMap[content.idOfSender]?.name || 'Unknown',
      userPic: userMap[content.idOfSender]?.image || null,
      clubTitle: clubMap[content.belongsTo]?.name || 'Unknown',
      clubCover: clubMap[content.belongsTo]?.secondaryImg || null,
    }));

    return res.status(StatusCodes.OK).json({ finishedContent, lastActive: user.lastActive });
  } catch (error) {
    console.error('Error fetching fast feed:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching feed.', error });
  }
};

// Controller 38
/**
 * @desc    Get authorization & membership status for a user in a club
 * @route   GET /club/status
 * @access  User
 */
const getStatus = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.query;
    if (!clubId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing clubId.' });
    }

    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      members: 1,
      team: 1,
      undecidedProposals: 1,
    }).lean();

    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found.' });
    }

    const userId = req.user.id;
    const isAuthorized =
      club.mainAdmin === userId
        ? 'Fully-authorized'
        : club.adminId?.includes(userId)
          ? 'Authorized'
          : 'Not-authorized';

    return res.status(StatusCodes.OK).json({
      isAuthorized,
      isMember: club.members?.includes(userId) ? 'Is a member' : 'Not a member',
      isInTeam: club.team?.some((member) => member.id === userId)
        ? 'Team Member'
        : 'Not Team Member',
      undecidedProposals: club.undecidedProposals?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching club status:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching status.', error });
  }
};

// Controller 39
/**
 * @desc    Fetch paginated club content feed with optional filtering
 * @route   GET /club/feed/native/fast
 * @access  User
 */
const getFastNativeFeed = async (req: Request, res: Response) => {
  try {
    const { clubId, batch = 1, batchSize = 10, remedy = 0 } = req.query;

    if (!clubId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing clubId.' });
    }

    const club = await Club.findById(clubId, { content: 1 }).lean();
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found.' });
    }

    const batchNumber = parseInt(batch as string, 10);
    const batchSizeNumber = parseInt(batchSize as string, 10);
    const remedyNumber = parseInt(remedy as string, 10);

    let contentIds = (club.content ?? []).reverse();
    contentIds = contentIds.slice(
      (batchNumber - 1) * batchSizeNumber,
      batchNumber * batchSizeNumber,
    );
    const filterContentId = contentIds.slice(remedyNumber).map((c) => c.contentId);

    const contents = await Content.find({ _id: { $in: filterContentId } })
      .select('title description comments likes createdAt')
      .lean();

    const finishedContent = contents.map((content) => ({
      ...content,
      commentsNum: content.comments?.length || 0,
      comments: content.comments?.slice(0, 6) || [],
    }));

    return res.status(StatusCodes.OK).json({ finishedContent });
  } catch (error) {
    console.error('Error fetching club feed:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong!', error });
  }
};

// Controller 40
/**
 * @desc Get club by clubId
 * @route GET /club?clubId=
 * @access User, Admin
 */
const getClub = async (req: Request, res: Response) => {
  try {
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    }
    const { clubId } = req.query;
    if (!clubId)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Club ID is required' });

    const club = await Club.findById(clubId, { name: 1, secondaryImg: 1 });
    if (!club)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Could not find the club.' });

    return res.status(StatusCodes.OK).json(club);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the club data.', error });
  }
};

// Controller 41
/**
 * @desc Get all clubs
 * @route GET /club/all
 * @access User, Admin
 */
const getAllClub = async (req: Request, res: Response) => {
  try {
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized access' });
    }
    const clubs = await Club.aggregate([
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
          founderDetails: { $arrayElemAt: ['$foundersDetails', 0] },
        },
      },
      {
        $project: {
          foundersDetails: 0,
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(clubs);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the club data.', error });
  }
};

// Controller 43
/**
 * @desc    Get all liked or tagged pins for a user
 * @route   GET /club/pins/liked
 * @access  User
 */
const getAllLikedPins = async (req: Request, res: Response) => {
  try {
    const { key, mode, batch = 1, batchSize = 10, id } = req.query;
    const skip = (Number(batch) - 1) * Number(batchSize);
    const limit = Number(batchSize);

    const user = await User.findById(id || req.user.id, 'likedContents taggedContents').lean();
    if (!user) return res.status(StatusCodes.OK).json({ likedSocialPins: [] });

    const likedContentsArray =
      mode === 'liked' ? user.likedContents?.reverse() : user.taggedContents?.reverse();
    const selectedBatch = likedContentsArray?.slice(skip, skip + limit) || [];

    const macbeaseIds = new Set(
      selectedBatch
        .filter((item) => item.type === 'macbease' && key === 'all')
        .map((item) => new mongoose.Types.ObjectId(item.contentId)),
    );

    const contentIds = new Set(
      selectedBatch
        .filter((item) => item.type !== 'macbease' || key !== 'all')
        .map((item) => new mongoose.Types.ObjectId(item.contentId)),
    );

    const [macbeaseData, contentData] = await Promise.all([
      MacbeaseContent.aggregate([
        { $match: { _id: { $in: [...macbeaseIds] } } },
        {
          $addFields: {
            commentsNum: { $size: '$comments' },
            comments: { $slice: ['$comments', 6] },
          },
        },
      ]),
      Content.aggregate([
        { $match: { _id: { $in: [...contentIds] } } },
        {
          $addFields: {
            commentsNum: { $size: '$comments' },
            comments: { $slice: ['$comments', 6] },
          },
        },
      ]),
    ]);

    const data = [...macbeaseData, ...contentData].sort((a, b) => b.timeStamp - a.timeStamp);
    return res.status(StatusCodes.OK).json({ likedSocialPins: data });
  } catch (error) {
    console.error('Error fetching liked pins:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching liked pins.', error });
  }
};

// Controller 44
/**
 * @desc    Get similar groups (clubs and communities) for a user
 * @route   GET /club/groups/similar
 * @access  User
 */
const getSimilarGroups = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, 'communitiesPartOf clubs').lean();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });

    const [clubs, communities] = await Promise.all([
      Club.find({}, 'secondaryImg name tags motto _id').lean(),
      Community.find({}, 'secondaryCover title tag activeMembers label _id').lean(),
    ]);

    const clubIds = new Set(user.clubs?.map((c) => c.clubId) || []);
    const communityIds = new Set(user.communitiesPartOf?.map((c) => c.communityId) || []);

    const finalCommunityData = communities.filter((c) => !communityIds.has(c._id.toString()));
    const finalClubData = clubs.filter((c) => !clubIds.has(c._id.toString()));

    return res.status(StatusCodes.OK).json({
      community: finalCommunityData,
      club: finalClubData,
      all: [...clubs, ...communities],
    });
  } catch (error) {
    console.error('Error fetching similar groups:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching similar groups.' });
  }
};

// Controller 45
/**
 * @desc    Get all members of a club
 * @route   GET /club/everyone
 * @access  Admin, User
 */
const getEveryoneOfClub = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, 'members adminId team mainAdmin unusedBadges').lean();
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found.' });

    const allUserIds = new Set([...club.members, ...club.team.map((t) => t.id)]);
    const users = await User.find(
      { _id: { $in: [...allUserIds] } },
      'name image pushToken course',
    ).lean();

    const userMap = Object.fromEntries(users.map((user) => [user._id.toString(), user]));

    const finalMembers: any[] = [],
      finalAdmins: any[] = [],
      finalTeam: any[] = [];

    club.members.forEach((id) => {
      if (userMap[id]) {
        if (club.adminId.includes(id)) finalAdmins.push(userMap[id]);
        else finalMembers.push(userMap[id]);
      }
    });

    club.team.forEach((teamMember) => {
      if (userMap[teamMember.id]) {
        finalTeam.push({ ...userMap[teamMember.id], pos: teamMember.pos });
      }
    });

    return res
      .status(StatusCodes.OK)
      .json({ finalMembers, finalAdmins, finalTeam, unusedBadges: club.unusedBadges });
  } catch (error) {
    console.error('Error fetching club members:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching club members.' });
  }
};

// Controller 46
/**
 * @desc Get all content of a club
 * @route GET /club/content/all
 * @access User, Admin
 */
const getAllContent = async (req: Request, res: Response) => {
  try {
    if (!['user', 'admin'].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied.' });
    }
    const { clubId } = req.query;
    const club = await Club.findById(clubId, { content: 1 }).lean();
    if (!club || !club.content.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'No content found.' });
    }

    const contentIds = club.content.map((item) => item.contentId);
    const contents = await Content.find({ _id: { $in: contentIds } }).lean();

    const userIds = contents.map((c) => c.idOfSender);
    const clubIds = contents.map((c) => c.belongsTo);

    const [users, clubs] = await Promise.all([
      User.find({ _id: { $in: userIds } }, { image: 1, name: 1 }).lean(),
      Club.find({ _id: { $in: clubIds } }, { name: 1, secondaryImg: 1 }).lean(),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
    const clubMap = Object.fromEntries(clubs.map((c) => [c._id.toString(), c]));

    const finishedContent = contents.map((data) => ({
      ...data,
      userName: userMap[data.idOfSender]?.name || 'Unknown',
      userPic: userMap[data.idOfSender]?.image || '',
      clubTitle: clubMap[data.belongsTo]?.name || 'Unknown',
      communityCover: clubMap[data.belongsTo]?.secondaryImg || '',
    }));

    return res.status(StatusCodes.OK).json({ finishedContent });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ errro: 'Error fetching content.' });
  }
};

// Controller 47
/**
 * @desc Get push tokens based on mode (all, admin, team)
 * @route GET /push-tokens-chunk
 * @access User, Admin
 */
const getPushTokenChunk = async (req: Request, res: Response) => {
  try {
    const { mode, clubId } = req.query;
    if (!['all', 'admin', 'team'].includes(mode as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid mode.' });
    }

    const fields = { all: 'members', admin: 'adminId', team: 'team' }[mode as string];
    const club = await Club.findById(clubId, { [fields as string]: 1 }).lean();
    if (!club) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });

    const memberIds =
      mode === 'team'
        ? club.team.map((t) => t.id)
        : (club[fields as keyof typeof club] as string[]);
    const users = await User.find({ _id: { $in: memberIds } }, { pushToken: 1 }).lean();

    return res.status(StatusCodes.OK).json(users.map((u) => u.pushToken));
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching push tokens.' });
  }
};

// Controller 48
/**
 * @desc Change club leader
 * @route PATCH /club/change-leader
 * @access User, Admin
 */
const changeLeader = async (req: Request, res: Response) => {
  try {
    const { clubId, leaderId, invitationId } = req.query;
    if (leaderId !== req.user.id) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized action.' });
    }

    const [club, invitation] = await Promise.all([
      Club.findById(clubId).lean(),
      Invitation.findById(invitationId).lean(),
    ]);

    if (!club || !invitation) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club or invitation not found.' });
    }

    if (
      invitation.type !== 'Leader Change' ||
      invitation.state !== 'undecided' ||
      invitation.sentBy.toString() !== club.mainAdmin ||
      invitation.sentTo.toString() !== req.user.id
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid invitation.' });
    }

    const [prevLeader, newLeader] = await Promise.all([
      User.findById(club.mainAdmin),
      User.findById(leaderId),
    ]);

    if (!prevLeader || !newLeader) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Leader data not found.' });
    }

    club.mainAdmin = leaderId;
    invitation.state = 'accepted';

    const notices = [
      {
        user: prevLeader,
        value: `Congratulations! ${newLeader.name} has accepted your proposal to lead ${club.name}.`,
      },
      {
        user: newLeader,
        value: `Congratulations! You are now the CEO of ${club.name}.`,
      },
    ];

    notices.forEach(({ user, value }) => {
      user.unreadNotice = [
        {
          value,
          img1: user.image,
          img2: club.featuringImg,
          key: 'read',
          action: 'club',
          params: {
            name: club.name,
            secondaryImg: club.secondaryImg,
            id: new mongoose.Types.ObjectId(clubId as string),
          },
          time: new Date(),
          uid: `${new Date()}/${club.mainAdmin}/${req.user.id}`,
        },
        ...(user.unreadNotice || []),
      ];
    });

    await Promise.all([prevLeader.save(), newLeader.save(), club.save(), invitation.save()]);

    return res.status(StatusCodes.OK).json({ message: 'Leader changed successfully.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error changing leader.' });
  }
};

// Controller 49
/**
 * @desc Get paginated club contributions of a user
 * @route GET /club/contributions
 * @access User, Admin
 */
const getClubContributions = async (req: Request, res: Response) => {
  try {
    // Extract and validate query parameters
    const { id, batch, batchSize } = req.query;
    if (!id || !mongoose.Types.ObjectId.isValid(id as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid user ID' });
    }

    const parsedBatch = Math.max(parseInt(batch as string, 10) || 1, 1);
    const parsedBatchSize = Math.max(parseInt(batchSize as string, 10) || 10, 1);
    const skip = (parsedBatch - 1) * parsedBatchSize;

    // Fetch user with paginated clubContributions using $slice
    const user = await User.findById(id, {
      clubContributions: { $slice: [skip, parsedBatchSize] },
    }).lean();
    if (!user?.clubContributions?.length) {
      return res.status(StatusCodes.OK).json([]); // No contributions found
    }

    // Fetch contributions using $lookup to avoid multiple DB calls
    const contributions = await Content.aggregate([
      {
        $match: {
          _id: { $in: user.clubContributions.map((item) => new mongoose.Types.ObjectId(item)) },
        },
      },
      {
        $addFields: {
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
        },
      },
      { $sort: { timeStamp: -1 } },
    ]);

    return res.status(StatusCodes.OK).json(contributions);
  } catch (error) {
    console.error('Error fetching club contributions:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

// Controller 50
/**
 * @desc Add a new proposal to a club's proposal history
 * @route POST /club/proposal
 * @access Admin, Club Members
 */
const addProposal = async (req: Request, res: Response) => {
  try {
    const { proposalId, clubId, visibility } = req.body;

    // Fetch both club and proposal in a single query
    const [club, proposal] = await Promise.all([
      Club.findById(clubId, 'undecidedProposals proposalHistory name'),
      Invitation.findById(proposalId, 'sentBy state subject sentTo cc'),
    ]);

    if (!club || !proposal) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club or Proposal not found' });
    }

    // Fetch sender metadata
    const senderMetaData = await User.findById(proposal.sentBy, 'name image pushToken');
    if (!senderMetaData) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Sender not found' });
    }

    // Prepare proposal object
    const proposalData: any = {
      id: proposalId as string,
      visibility,
      state: proposal.state,
      subject: proposal.subject,
      senderMetaData,
    };

    club.proposalHistory = club.proposalHistory || [];
    club.proposalHistory.push(proposalData);
    club.undecidedProposals = [...(club.undecidedProposals || []), proposalId];
    await club.save();

    // Schedule push notification
    schedule.scheduleJob(
      `proposal_notice_${proposal._id}`,
      new Date(Date.now() + 1000),
      async () => {
        const userIds = [proposal.sentTo, ...(proposal.cc || [])];
        const users = await User.find({ _id: { $in: userIds } }, 'pushToken');
        const tokens = users.map((user) => user.pushToken).filter(Boolean);

        if (tokens.length && tokens) {
          scheduleNotification({
            pushToken: tokens.filter((token): token is string => token !== undefined),
            title: club.name,
            body: `A proposal has been raised in ${club.name} for you to address.`,
          });
        }
      },
    );

    return res.status(StatusCodes.OK).json({ message: 'Proposal successfully submitted' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error setting proposal', error });
  }
};

// Controller 51
/**
 * @desc Fetch paginated proposals for a club
 * @route GET /club/proposal
 * @access Admin, Club Members
 */
const fetchProposals = async (req: Request, res: Response) => {
  try {
    const { clubId, batch = '1', batchSize = '10' } = req.query;
    const parsedBatch = parseInt(batch as string, 10);
    const parsedBatchSize = parseInt(batchSize as string, 10);

    if (!mongoose.Types.ObjectId.isValid(clubId as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid Club ID' });
    }

    const club = await Club.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(clubId as string) } },
      {
        $project: {
          proposalHistory: {
            $slice: ['$proposalHistory', -(parsedBatch * parsedBatchSize), parsedBatchSize],
          },
          undecidedProposals: 1,
        },
      },
    ]);

    if (!club.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found' });
    }

    const proposals = club[0].proposalHistory || [];
    if (!proposals.length) {
      return res
        .status(StatusCodes.OK)
        .json({ proposals: [], undecidedProposals: club[0].undecidedProposals || [] });
    }

    const proposalIds = proposals.map((p: any) => p.id);
    const proposalDocs = await Invitation.find(
      { _id: { $in: proposalIds } },
      'endorsedBy expiration',
    );

    const proposalDocMap = proposalDocs.reduce((acc: { [key: string]: any }, doc) => {
      acc[(doc._id as mongoose.Types.ObjectId).toString()] = doc;
      return acc;
    }, {});

    const finalData = proposals.map((proposal: any) => ({
      ...proposal,
      ...(proposalDocMap[proposal.id] || {}),
    }));

    return res.status(StatusCodes.OK).json({
      proposals: finalData,
      undecidedProposals: club[0].undecidedProposals || [],
    });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error fetching proposals' });
  }
};

// Controller 52
/**
 * @desc Change the status of a proposal (Accept/Reject)
 * @route PATCH /club/proposal/status
 * @access Club Admin, Core Team
 */
const changeProposalStatus = async (req: Request, res: Response) => {
  const { proposalId, clubId, status } = req.body;
  try {
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid status.' });
    }

    // Fetch proposal and club details in parallel
    const [proposal, club] = await Promise.all([
      Invitation.findById(proposalId, { sentTo: 1, cc: 1, subject: 1 }),
      Club.findById(clubId, { undecidedProposals: 1, proposalHistory: 1, notifications: 1 }),
    ]);

    if (!proposal || !club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Proposal or Club not found.' });
    }

    // Authorization Check
    const authorizedUsers = new Set([proposal.sentTo.toString(), ...(proposal.cc || [])]);
    if (!authorizedUsers.has(req.user.id)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: 'Unauthorized to modify this proposal.' });
    }

    // Remove from undecided proposals
    club.undecidedProposals = club.undecidedProposals?.filter((id) => id !== proposalId);

    // Update proposal status
    const proposalIndex = club.proposalHistory.findIndex((p) => p.id === proposalId);
    if (proposalIndex !== -1) {
      club.proposalHistory[proposalIndex].state = status;
    } else {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Proposal not found in history.' });
    }

    // Fetch user details
    const userDetails = await User.findById(req.user.id, { name: 1, image: 1 });
    if (!userDetails) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User details not found.' });
    }

    // Add notification
    club.notifications.unshift({
      // id: proposalId,
      uid: new Date().toISOString() + `${proposalId}`,
      title: 'Decision made',
      msg: `Proposal titled '${proposal.subject}' was reviewed and a decision was taken.`,
      visibility: club.proposalHistory[proposalIndex].visibility,
      createdAt: new Date().toISOString(),
      postedBy: req.user.id,
      name: userDetails.name,
      image: userDetails.image,
    });

    await club.save();
    return res.status(StatusCodes.OK).json({ message: 'Proposal status updated successfully.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error updating proposal status.', error });
  }
};

// Controller 53
/**
 * @desc Search club members by name
 * @route GET /club/members/search
 * @access Club Admin, Core Team
 */
const searchClubMembers = async (req: Request, res: Response) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Club ID and query are required.' });
    }

    // Fetch club members and roles
    const club = await Club.findById(clubId, { members: 1, adminId: 1, team: 1 });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found.' });
    }

    // Search members using regex
    const regex = new RegExp(query as string, 'i');
    const members = await User.find(
      { _id: { $in: club.members }, name: regex },
      { name: 1, image: 1, pushToken: 1 },
    ).lean();

    const teamIds = new Set(club.team.map((t) => t.id));
    const membersWithRole = members.map((member) => ({
      ...member,
      role: teamIds.has(member._id.toString())
        ? 'Core team'
        : club.adminId.includes(member._id.toString())
          ? 'Admin'
          : 'Member',
    }));

    return res.status(StatusCodes.OK).json(membersWithRole);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 54
/**
 * @desc Search club content by text or tags
 * @route GET /club/content/search
 * @access Public
 */
const searchClubContent = async (req: Request, res: Response) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Club ID and query are required.' });
    }

    // Fetch club content IDs
    const club = await Club.findById(clubId, { content: 1 });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found.' });
    }

    const contentIds = club.content.slice(-100).map((p) => p.contentId);
    const regex = new RegExp(query as string, 'i');

    // Fetch matching content
    const contentResults = await Content.find(
      { _id: { $in: contentIds }, $or: [{ text: regex }, { tags: regex }, { contentType: regex }] },
      { vector: 0 },
    )
      .sort({ createdAt: -1 })
      .lean();

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum: content?.comments?.length || 0,
      comments: content?.comments?.slice(0, 6) || [],
    }));

    return res.status(StatusCodes.OK).json(processedResults);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// Controller 55
/**
 * @desc Search club files based on query
 * @route GET /club/files
 * @access User, Admin
 */
const searchClubFiles = async (req: Request, res: Response) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Club ID and query are required' });
    }

    const club = await Club.findById(clubId).select('content');
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found' });
    }

    const contentIds = club.content.slice(-100).map((p) => p.contentId);
    const regex = new RegExp(query as string, 'i');

    const contentResults = await Content.find(
      { _id: { $in: contentIds }, contentType: 'doc', $or: [{ text: regex }, { tags: regex }] },
      { vector: 0 },
    )
      .sort({ createdAt: -1 })
      .lean();

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum: content?.comments?.length,
      comments: content?.comments?.slice(0, 6),
    }));

    return res.status(StatusCodes.OK).json(processedResults);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

// Controller 56
/**
 * @desc Search for a club event by name, description, or venue
 * @route GET /club/event/search
 * @access User, Admin
 */
const searchClubEvent = async (req: Request, res: Response) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Club ID and query are required' });
    }

    const regex = new RegExp(query as string, 'i');
    const club = await Club.findById(clubId, { upcomingEvent: 1 }).lean();
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found' });
    }

    const matchedEvents = club.upcomingEvent.filter(
      (event) => regex.test(event.name) || regex.test(event.description) || regex.test(event.place),
    );

    return res.status(StatusCodes.OK).json(matchedEvents);
  } catch (error) {
    console.error('Error searching club event:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
  }
};

// Controller 57
/**
 * @desc Search club proposals based on query and visibility
 * @route GET /club/proposals/search
 * @access User, Admin
 */
const searchClubProposals = async (req: Request, res: Response) => {
  try {
    const { clubId, query, visibility } = req.query;

    if (!clubId || !query || !visibility) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Club ID, query, and visibility are required' });
    }

    // Validate visibility value
    const allowedVisibility = ['all', 'admin', 'team'];
    if (!allowedVisibility.includes(visibility as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid visibility filter' });
    }

    // Create case-insensitive regex for searching
    const regex = new RegExp(query as string, 'i');

    // Find the club and get proposal history
    const club = await Club.findById(clubId).select('proposalHistory');
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found' });
    }

    const filteredProposals = club.proposalHistory.filter((proposal) => {
      if (
        !regex.test(proposal.subject) &&
        !regex.test(proposal.senderMetaData.name) &&
        !regex.test(proposal.state)
      ) {
        return false;
      }
      return (
        visibility === 'team' ||
        proposal.visibility === 'all' ||
        (visibility === 'admin' && proposal.visibility === 'admin')
      );
    });

    const proposalIds = filteredProposals.map((p) => p.id);
    const proposalsDoc = await Invitation.find({ _id: { $in: proposalIds } }).select(
      'endorsedBy expiration',
    );

    const proposalsMap = new Map(
      proposalsDoc.map((doc) => [(doc._id as mongoose.Types.ObjectId).toString(), doc]),
    );

    const finalData = filteredProposals.map((proposal) => ({
      ...proposal,
      ...(proposalsMap.get(proposal.id.toString()) || {}),
    }));

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal Server Error' });
  }
};

// Controller 58
const utilForGettingMonthlyContent = async (
  monthYear: string,
  contents: {
    timeStamp: string | number | Date;
    contentId: string;
    postedBy: string;
  }[],
) => {
  try {
    // Parse start and end of the given month
    const startDate = new Date(`${monthYear}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // Move to the next month

    // Reverse iterate to efficiently find content IDs for the given month
    const contentIds = [];
    for (let i = contents.length - 1; i >= 0; i--) {
      const { contentId, timeStamp } = contents[i];
      const itemDate = new Date(timeStamp);

      if (itemDate < startDate) break; // Stop when content is from an older month
      if (itemDate >= startDate && itemDate < endDate) {
        contentIds.push(new mongoose.Types.ObjectId(contentId));
      }
    }

    if (contentIds.length === 0) {
      return { content: [] };
    }

    // Aggregation Pipeline to optimize querying
    const contentDocs = await Content.aggregate([
      { $match: { _id: { $in: contentIds }, contentType: { $ne: 'text' } } },
      {
        $addFields: {
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
        },
      },
      {
        $project: { vector: 0 }, // Avoid sending vector data
      },
      { $sort: { timeStamp: -1 } },
    ]);

    return { content: contentDocs.reverse() };
  } catch (error) {
    console.error('Error in utilForGettingMonthlyContent:', error);
    throw new Error('Error fetching content');
  }
};

// Controller 59
/**
 * @desc Fetch monthly content for a club
 * @route GET /club/content/month
 * @access User, Admin
 */
const getClubContentByMonth = async (req: Request, res: Response) => {
  try {
    const { clubId, monthYear } = req.query;
    if (!clubId || !monthYear) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Club ID and monthYear (YYYY-MM) are required' });
    }

    const club = await Club.findById(clubId).select('content createdOn');
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found' });
    }

    const clubCreationTime = new Date(club.createdOn);
    const requestedTime = new Date(`${monthYear}-01`);
    if (requestedTime < clubCreationTime) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid date range' });
    }

    const contentIds = club.content
      .filter(({ timeStamp }) => {
        const itemDate = new Date(timeStamp);
        return (
          itemDate.getFullYear() === requestedTime.getFullYear() &&
          itemDate.getMonth() === requestedTime.getMonth()
        );
      })
      .map(({ contentId }) => new mongoose.Types.ObjectId(contentId));

    if (!contentIds.length) return res.status(StatusCodes.OK).json({ content: [] });

    const contentDocs = await Content.aggregate([
      { $match: { _id: { $in: contentIds }, contentType: { $ne: 'text' } } },
      {
        $addFields: { commentsNum: { $size: '$comments' }, comments: { $slice: ['$comments', 6] } },
      },
      { $project: { vector: 0 } },
      { $sort: { timeStamp: -1 } },
    ]);

    return res.status(StatusCodes.OK).json({ month: monthYear, content: contentDocs });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

// Controller 60
/**
 * @desc Nullifies a club's dynamic island for a user
 * @route GET /club/nullify-club-dynamic-island
 * @access User
 */
const nullifyClubDynamicIsland = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { type, clubId } = req.query;
    await updateDynamicIsland(
      [new mongoose.Types.ObjectId(req.user.id)],
      clubId as string,
      type as string,
      false,
    );
    return res.status(StatusCodes.OK).json({ message: `${type} nullified.` });
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot restore dynamic island.' });
  }
};

// Controller 61
/**
 * @desc Sends a new club message and triggers notifications
 * @route POST /club/:clubId/message
 * @access Authenticated Users
 */
const newClubMessage = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const { message, sender } = req.body;
    if (!clubId || !message || !sender) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing required fields.' });
    }

    // Fetch club details
    const clubInfo = await Club.findById(clubId, 'pinnedBy name secondaryImg');
    if (!clubInfo) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Club not found.' });
    }

    // Get push notification tokens
    const tokens = await getPushTokens(`${clubId}-All Members-club`, req.user.id);

    // Update pinned messages if applicable
    if (clubInfo.pinnedBy) {
      await updateDynamicIsland(clubInfo.pinnedBy, clubId, 'messages', true);
    }

    // Send notification
    if (tokens.length) {
      scheduleNotification2({
        pushToken: tokens.filter((token): token is string => token !== undefined),
        title: `${sender} messaged in ${clubInfo.name}.`,
        body: `${message.substring(0, 50)}...`,
        url: `https://macbease.com/app/club/${clubId}`,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Success' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot mark new club chat message.', error });
  }
};

// Controller 62
/**
 * @desc Fetch clubs where the user has posting rights
 * @route GET /club/posting-rights
 * @access Authenticated Users
 */
const clubsWithPostingRights = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, 'clubs');
    if (!user || !user.clubs?.length) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'User not found or no clubs available.' });
    }

    const clubIds = user.clubs.map((item) => item.clubId);
    const clubs = await Club.find({ _id: { $in: clubIds } }, 'adminId mainAdmin secondaryImg name');

    // Filter clubs where user has posting rights
    const authorizedClubs = clubs.filter(
      ({ mainAdmin, adminId }) => mainAdmin === req.user.id || adminId?.includes(req.user.id),
    );

    return res.status(StatusCodes.OK).json({
      clubs: authorizedClubs.map(({ _id, secondaryImg, name }) => ({ _id, secondaryImg, name })),
    });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Cannot fetch clubs with posting rights.', error });
  }
};

export {
  createClub,
  deleteClub,
  joinAsMember,
  leaveAsMember,
  addAsMember,
  removeAsMember,
  addAdmin,
  removeAdmin,
  addNotifications,
  deleteNotifications,
  getAllEvents,
  getClub,
  getAllClub,
  postEvent,
  removeEvent,
  postContent,
  removeContent,
  postGallery,
  removeGallery,
  editProfile,
  addTeamMember,
  removeTeamMember,
  getClubsByTag,
  getLikeStatus,
  getLatestContent,
  getClubsPartOf,
  getClubProfile,
  updateRating,
  getClubBio,
  getClubContent,
  getClubGallery,
  getClubVideos,
  isAdmin,
  isMember,
  getClubNotifications,
  isMainAdmin,
  getCreatorId,
  getFastFeed,
  getStatus,
  getFastNativeFeed,
  getAllLikedPins,
  getSimilarGroups,
  getEveryoneOfClub,
  getAllContent,
  getPushTokenChunk,
  changeLeader,
  getClubContributions,
  addProposal,
  fetchProposals,
  changeProposalStatus,
  searchClubMembers,
  searchClubContent,
  searchClubFiles,
  searchClubEvent,
  getClubContentByMonth,
  searchClubProposals,
  nullifyClubDynamicIsland,
  newClubMessage,
  clubsWithPostingRights,
};
