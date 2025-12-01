import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Admin from '../models/admin.model';
import MacbeaseContent from '../models/macbeaseContent.model';
import Content from '../models/content.model';
import User from '../models/user.model';
import Community from '../models/community.model';
import { sendMail } from './utils.controller';

/**
 * @desc Submit content for review by the Content Moderator team
 * @route POST /contentModeration/submit-for-review
 * @access User
 */
const submitForReview = async (req: Request, res: Response) => {
  const { cid, type, reason } = req.body;

  try {
    // Fetch admin for content moderation
    const admin = await Admin.findOne(
      { role: 'Content Team' },
      { reviewContent: 1, unreadNotice: 1 },
    );

    if (!admin) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Content moderation team is unavailable. Please try again later.',
      });
    }

    // Fetch sender and content based on the type
    const sender = await User.findById(req.user.id, {
      email: 1,
      name: 1,
      image: 1,
      unreadNotice: 1,
    });
    if (!sender) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid user.' });
    }

    const content = await Content.findById(cid).exec();
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Content not found.' });
    }

    // Update content under review status
    content.underReview = true;
    await content.save();

    // Prepare notices for user and admin
    const commonNoticeData = {
      img1: sender.image || '',
      img2: content.url,
      expandData: content.toObject(),
      key: 'tag',
      time: new Date(),
      uid: `${Date.now()}/${admin._id}/${req.user.id}`,
    };

    const noticeForUser = {
      value: `Post is under review. We will keep you posted about actions we take.`,
      expandType: content.sendBy === 'club' ? 'Club' : 'Community',
      ...commonNoticeData,
    };

    const noticeForAdmin = {
      value: `Content marked for review.`,
      expandType: content.sendBy === 'club' ? 'Club' : 'Community',
      ...commonNoticeData,
    };

    // Update admin and user notifications
    admin.unreadNotice = [noticeForAdmin, ...(admin.unreadNotice || [])];
    sender.unreadNotice = [noticeForUser, ...(sender.unreadNotice || [])];

    // Update admin review content
    admin.reviewContent = [
      {
        cid,
        type,
        status: 0,
        userId: req.user.id,
        timeStamp: new Date(),
        reason,
      },
      ...(admin.reviewContent || []),
    ];

    // Save admin and sender
    await Promise.all([admin.save(), sender.save()]);

    return res.status(StatusCodes.OK).json({ message: 'Post successfully submitted for review.' });
  } catch (error) {
    console.error('Error in submitForReview:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'An error occurred while submitting for review.',
    });
  }
};

/**
 * @desc Handles fetching content for moderation with pagination and optimized performance
 * @route GET /contentModeration/read-content-for-moderation
 * @access Admin
 */
const readContentForModeration = async (req: Request, res: Response) => {
  try {
    const { user } = req;
    const { batch = 1, batchSize = 10 } = req.query;

    // Check if the user has the admin role
    if (user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: 'You are not authorized to access this route.' });
    }

    // Validate query parameters
    const batchNum = Number(batch);
    const batchSizeNum = Number(batchSize);

    if (isNaN(batchNum) || isNaN(batchSizeNum) || batchNum < 1 || batchSizeNum < 1) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Invalid batch or batchSize query parameter.' });
    }

    // Fetch admin's review content in a single DB call
    const admin = await Admin.findById(user.id, { reviewContent: 1 }).lean();

    if (!admin || !admin.reviewContent) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'Admin or review content not found.' });
    }

    // Paginate review content
    const paginatedContent = admin.reviewContent.slice(
      (batchNum - 1) * batchSizeNum,
      batchNum * batchSizeNum,
    );

    // Fetch all content in parallel to minimize DB calls
    const contentPromises = paginatedContent.map((dataPoint: any) =>
      dataPoint.type === 'normal'
        ? Content.findById(dataPoint.cid, { comments: { $slice: 6 } }).lean()
        : MacbeaseContent.findById(dataPoint.cid, { comments: { $slice: 6 } }).lean(),
    );

    const contentResults = await Promise.all(contentPromises);

    // Prepare final data
    const finalData = paginatedContent.map((dataPoint: any, index: number) => {
      const content = contentResults[index];
      return content
        ? { ...dataPoint, content }
        : { ...dataPoint, content: null, error: 'Content not found.' };
    });

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error('Error in readContentForModeration:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc Discards a content review claim.
 * @route DELETE /contentModeration/discard-review-claim
 * @access Admin only
 */
const discardReviewClaim = async (req: Request, res: Response) => {
  try {
    // Check if the user is an admin
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: 'You are not authorized to access this route.' });
    }

    const { cid, type } = req.body;

    // Validate request body
    if (!cid || !type) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Content ID and type are required.' });
    }

    // Determine the collection based on the type
    const ContentModel = type === 'normal' ? Content : type === 'macbease' ? MacbeaseContent : null;

    if (!ContentModel) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid content type provided.' });
    }

    // Update the content's underReview field
    const content = await (ContentModel as any).findByIdAndUpdate(
      cid,
      { $set: { underReview: false } },
      { new: true },
    );

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Content not found.' });
    }

    // Fetch and update the admin's review content list
    const admin = await Admin.findById(req.user.id, { reviewContent: 1 });

    if (!admin) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Admin not found.' });
    }

    let userId = '';
    const updatedReviewList = (admin.reviewContent ?? []).map((dataPoint) => {
      if (dataPoint.cid === cid) {
        dataPoint.status = 1; // Mark review as processed
        userId = dataPoint.userId;
      }
      return dataPoint;
    });

    admin.reviewContent = updatedReviewList;
    await admin.save();

    // If there's a user ID, send an email
    if (userId) {
      const user = await User.findById(userId, { email: 1, name: 1 });
      if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });
      }

      const intro = [
        'Thank you for taking out time to report content. This helps us to stick to rigorous community guidelines.',
        `After much consultation, the content has been declared fit for the platform.`,
      ];
      const outro = 'If you did not report a content, please avoid this email.';
      const subject = 'Content Review Action';

      try {
        const { ses, params } = await sendMail(user.name, intro, outro, subject, [user.email]);
        ses.sendEmail(params, (err) => {
          if (err) {
            console.error('Email sending failed:', err);
          }
        });
      } catch (emailError) {
        console.error('Email sending error:', emailError);
      }
    }

    return res.status(StatusCodes.OK).json({ message: 'Review discarded successfully.' });
  } catch (error) {
    console.error('Error in discardReviewClaim:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An error occurred while discarding the review.' });
  }
};

/**
 * @desc Add discretion to content or handle moderation
 * @route POST /contentModeration/add-discretion
 * @access Admin, Community Moderator
 */
const addDiscretion = async (req: Request, res: Response) => {
  try {
    const { cid, type, discretion, blur, mode } = req.body;

    // Authorization check
    if (req.user.role !== 'admin' && mode !== 'community_moderation') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to access this route.' });
    }

    // Common function to update content
    const updateContent = async (model: any, contentId: string) => {
      const content = await model.findById(contentId).select('discretion blur underReview');

      if (!content) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
      }

      content.underReview = false;
      content.discretion = discretion;
      content.blur = blur;
      await content.save();
    };

    if (mode === 'community_moderation') {
      // Community moderation flow
      const content = await Content.findById(cid).select('discretion blur underReview belongsTo');

      if (!content) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Content not found.' });
      }

      const community = await Community.findById(content.belongsTo).select('admins');

      if (!community) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found.' });
      }

      const isAdmin = community.admins.some((adminId) => adminId.toString() === req.user.id);

      if (!isAdmin) {
        return res
          .status(StatusCodes.FORBIDDEN)
          .json({ message: 'You are not authorized to moderate this community.' });
      }

      content.underReview = false;
      content.discretion = discretion;
      content.blur = blur;
      await content.save();

      return res
        .status(StatusCodes.OK)
        .json({ message: 'Discretion added successfully under community moderation.' });
    }

    // General flow: Update based on type
    if (type === 'normal') {
      await updateContent(Content, cid);
    } else if (type === 'macbease') {
      await updateContent(MacbeaseContent, cid);
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid content type.' });
    }

    // Admin review list update
    const admin = await Admin.findById(req.user.id).select('reviewContent');

    if (admin) {
      admin.reviewContent = (admin.reviewContent || []).map((dataPoint) =>
        dataPoint.cid === cid ? { ...dataPoint, status: 1 } : dataPoint,
      );
      await admin.save();
    }

    return res.status(StatusCodes.OK).json({ message: 'Discretion added successfully.' });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error in addDiscretion:', error.message);
    } else {
      console.error('Error in addDiscretion:', error);
    }
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while adding discretion.', error });
  }
};

export { submitForReview, readContentForModeration, discardReviewClaim, addDiscretion };
