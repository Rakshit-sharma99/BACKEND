import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import Badge from '../../models/badge.model';
import Club from '../../models/club.model';
import Community from '../../models/community.model';
import User from '../../models/user.model';
import { Request, Response } from 'express';
import { sendMail } from '../utils.controller';
import { AuthRequest, BadgeBody, GetUnusedBadgesQuery } from './interface';

// Utility Functions
function getBody(
  n: number,
  organisationId: string,
  organisationType: 'Club' | 'Community' | 'Macbease',
  organisationInfo: any,
): BadgeBody[] {
  return Array(n).fill({
    title: 'Stellar Performer',
    url: 'public/Macbease/SunApr07202410:14:32GMT+0530+0}',
    organisationId,
    organisationType,
    organisationInfo,
  });
}

async function checkAuthorization(
  organisationId: string,
  organisationType: 'Club' | 'Community' | 'Macbease',
  concernedId: string,
): Promise<boolean> {
  try {
    if (organisationType === 'Club') {
      const club = await Club.findById(organisationId).select('mainAdmin');
      return club?.mainAdmin === concernedId;
    } else if (organisationType === 'Community') {
      const community = await Community.findById(organisationId).select('creatorId');
      return community?.creatorId === concernedId;
    }
    return false;
  } catch (error) {
    console.error('Authorization check failed:', error);
    return false;
  }
}

/**
 * @desc Generate badges for an organization, ensuring a monthly limit of 5.
 * @route POST /badges/generate
 * @access Admin
 */
const generateBadges = async (req: Request, res: Response): Promise<Response> => {
  const { organisationId, organisationType, organisationInfo } = req.body;

  try {
    const startOfMonth = new Date(new Date().setDate(1));
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const allotedBadges = await Badge.countDocuments({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      organisationId,
    });

    if (allotedBadges >= 5) {
      return res
        .status(StatusCodes.OK)
        .json({ message: 'You have already been granted all the badges for this month.' });
    }

    const bodyArray = getBody(
      5 - allotedBadges,
      organisationId,
      organisationType,
      organisationInfo,
    );

    const badges = await Badge.insertMany(bodyArray);
    const badgeIds = badges.map((badge) => badge._id);

    const updateQuery = { $push: { unusedBadges: { $each: badgeIds, $position: 0 } } };
    if (organisationType === 'Club') {
      await Club.findByIdAndUpdate(organisationId, updateQuery);
    } else if (organisationType === 'Community') {
      await Community.findByIdAndUpdate(organisationId, updateQuery);
    }

    return res.status(StatusCodes.OK).json(badges);
  } catch (error) {
    console.error('Generate badges error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Grant additional badges to an organization
 * @route POST /badges/additional
 * @access Admin
 */
const giveAdditionalBadges = async (req: Request, res: Response): Promise<Response> => {
  const { organisationId, number, organisationType, organisationInfo } = req.body;

  if ((req as unknown as AuthRequest).user.role !== 'admin') {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized action.' });
  }

  try {
    const bodyArray = getBody(number, organisationId, organisationType, organisationInfo);
    const badges = await Badge.insertMany(bodyArray);
    const badgeIds = badges.map((badge) => badge._id);

    const updateQuery = { $push: { unusedBadges: { $each: badgeIds, $position: 0 } } };

    if (organisationType === 'Club') {
      await Club.findByIdAndUpdate(organisationId, updateQuery);
    } else if (organisationType === 'Community') {
      await Community.findByIdAndUpdate(organisationId, updateQuery);
    }

    return res.status(StatusCodes.OK).json(badges);
  } catch (error) {
    console.error('Give additional badges error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Fetch unused badges for an organization
 * @route GET /badges/unused
 * @access Admin, User
 */
const getUnusedBadges = async (req: Request<"", "", "", GetUnusedBadgesQuery>, res: Response) => {
  const { organisationType, organisationId } = req.query;

  if (!['Club', 'Community'].includes(organisationType)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid organisation type.' });
  }

  try {
    if (organisationType === 'Club') {
      const club = await Club.findById(organisationId, { unusedBadges: 1 });
      if (!club) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
      }
      const unusedBadges = club.unusedBadges;
      let arr = [];
      try {
        const badgePromises = unusedBadges.map((badgeId) => Badge.findById(badgeId));
        arr = await Promise.all(badgePromises);
        return res.status(StatusCodes.OK).json(arr);
      } catch (error) {
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'Failed to fetch badge', error });
      }
    } else if (organisationType === 'Community') {
      const community = await Community.findById(organisationId, { unusedBadges: 1 });
      if (!community) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found.' });
      }
      const unusedBadges = community.unusedBadges;
      let arr = [];
      try {
        const badgePromises = unusedBadges.map((badgeId) => Badge.findById(badgeId));
        arr = await Promise.all(badgePromises);
        return res.status(StatusCodes.OK).json(arr);
      } catch (error) {
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'Failed to fetch badges', error });
      }
    }
  } catch (error) {
    console.error('Get unused badges error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Assigns a badge to a user
 * @route POST /badges/give
 * @access Admin, Authorized Club/Community Managers
 */
const giveBadge = async (req: Request, res: Response): Promise<Response> => {
  const { badgeId, userId, description } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const badge = await Badge.findById(badgeId).session(session);
    if (!badge) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Invalid badge ID.' });

    const isAuthorized = await checkAuthorization(
      badge.organisationId,
      badge.organisationType,
      req.user.id,
    );
    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to give this badge.' });
    }

    badge.description = description;
    badge.ownedBy = userId;
    badge.givenOn = new Date();
    await badge.save({ session });

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $push: { badges: { $each: [badge._id], $position: 0 } },
        $inc: { unreadNotifications: 1 },
      },
      { new: true, session, projection: { email: 1, image: 1, name: 1, pushToken: 1 } },
    );
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });

    if (badge.organisationType === 'Club') {
      await Club.findByIdAndUpdate(
        badge.organisationId,
        {
          $pull: { unusedBadges: badge._id },
          $push: { usedBadges: { $each: [badge._id], $position: 0 } },
        },
        { session },
      );
    } else if (badge.organisationType === 'Community') {
      await Community.findByIdAndUpdate(
        badge.organisationId,
        {
          $pull: { unusedBadges: badge._id },
          $push: { usedBadges: { $each: [badge._id], $position: 0 } },
        },
        { session },
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Sending email to the user
    const name = user.name;
    const intro = [
      `We are so delighted to inform you that you have earned the Stellar Performer badge from ${badge.organisationInfo.name}.`,
      'We look forward to seeing marvelous work from your side.',
    ];
    const outro = 'It is a milestone!';
    const subject = 'Macbease Badge';
    const destination = [user.email];
    const { ses, params } = await sendMail(name, intro, outro, subject, destination);
    ses.sendEmail(params, (err: Error) => {
      if (err) {
        console.error('Email sending error:', err);
      }
    });

    return res.status(StatusCodes.OK).json({ message: 'Badge sent successfully.' });
  } catch (error) {
    console.error('Give badge error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Updates user profile images in bulk(Batch update)
 * @route PATCH /users/update-images
 * @access Admin
 */
const updateUserImages = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ids }: { ids: string[] } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Invalid or empty user ID array.' });
    }

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const updateResult = await User.updateMany(
      { _id: { $in: objectIds } },
      { $set: { image: 'public/users/Preview-1re.png' } },
    );

    return res.status(StatusCodes.OK).json({
      message: 'User images updated successfully.',
      modifiedCount: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error('Update user images error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

// replaced with 'updateUserImages' function written above
/* const redundant = async (req: Request, res: Response) => {
    try {
        const arrs: string[] = [];
        const ids = arrs.map((item: string) => new mongoose.Types.ObjectId(item));
        await User.updateMany({ _id: { $in: ids } }, { $set: { image: 'public/users/Preview-1re.png' } });
        return res.status(StatusCodes.OK).json({ message: 'Update successful.' });
    } catch (error) {
        console.error('Redundant function error:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.', error });
    }
}; */

export {
  giveAdditionalBadges,
  generateBadges,
  getUnusedBadges,
  giveBadge,
  updateUserImages,
  // redundant,
};
