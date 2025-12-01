import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Invitation from '../models/invitation.model';
import User from '../models/user.model';
import Admin from '../models/admin.model';
import schedule from 'node-schedule';
import mongoose from 'mongoose';
import {
  scheduleNotification,
  scheduleNotification2,
  pingAdmins,
  sendMail,
} from './utils.controller';

/**
 * @desc Create a new invitation
 * @route POST /invitation
 * @access User, Admin
 */
const createInvitation = async (req: Request, res: Response) => {
  const { sentTo, action, text, img1, img2, type, subject } = req.body;

  if (!sentTo || !action || !text || !type) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Incomplete data.' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create invitation
    const newInvitation = await Invitation.create(
      [
        {
          ...req.body,
          sentBy: req.user.id,
          expiration,
        },
      ],
      { session },
    );

    if (!newInvitation.length) {
      throw new Error('Failed to create invitation');
    }

    const invitation = newInvitation[0];

    if (type === 'Content Team Application') {
      schedule.scheduleJob(
        `contentCreatorApplication_${invitation._id}`,
        new Date(Date.now() + 3000),
        async () => {
          await pingAdmins({
            role: 'Content Team',
            pingLevel: 2,
            notification: {
              title: 'Hello Macbease Content Team!',
              body: 'We have a new application for content creator!',
              img1,
              img2,
              key: 'invitation',
              action: 'invitation',
              params: { invitationId: invitation._id, action },
            },
            email: {
              intro: 'We have a new application for Content Creator. Please review.',
              outro: 'Our team is getting bigger and stronger.',
              subject: 'Content Creator Application',
            },
          });
        },
      );
    } else {
      const receiver = await User.findById(sentTo).select('unreadNotice').session(session);
      if (receiver) {
        receiver.unreadNotice?.unshift({
          value: subject || `Proposal - ${text}`,
          img1,
          img2,
          key: 'invitation',
          action: 'invitation',
          params: { invitationId: invitation._id as mongoose.Types.ObjectId, action },
          time: new Date(),
          uid: `${new Date().toISOString()}/${receiver._id}/${req.user.id}`,
        });
        await receiver.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res
      .status(StatusCodes.CREATED)
      .json({ message: 'Invitation created successfully.', id: invitation._id });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error('Error creating invitation:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Get invitation details along with sender information
 * @route GET /invitation/info
 * @access Private (Authenticated Users)
 */
const getInvitationInfo = async (req: Request, res: Response) => {
  try {
    const { invitationId } = req.query;
    if (!invitationId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invitation ID is required.' });
    }

    const invitation = await Invitation.findById(invitationId).lean();
    if (!invitation) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Invitation not found.' });
    }

    const userInfo = invitation.sentBy
      ? await User.findById(invitation.sentBy, { name: 1, image: 1, pushToken: 1 }).lean()
      : null;

    return res.status(StatusCodes.OK).json({ invitation, userInfo });
  } catch (error) {
    console.error('Error fetching invitation info:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Decline an invitation
 * @route PATCH /invitation/decline
 * @access Private (Authenticated Users)
 */
const declineInvitation = async (req: Request, res: Response) => {
  try {
    const { invitationId } = req.query;
    if (!invitationId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invitation ID is required.' });
    }

    const invitation = await Invitation.findById(invitationId, {
      sentBy: 1,
      sentTo: 1,
      expiration: 1,
      state: 1,
      subject: 1,
      cc: 1,
      sentByModel: 1,
      sentToModel: 1,
    }).lean();
    if (!invitation) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Invitation not found.' });
    }

    if (invitation.state !== 'undecided') {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ message: 'Proposal has already been nullified.' });
    }

    const userId = req.user.id;
    const isAuthorized = [...(invitation.cc || []), invitation.sentTo.toString()].includes(userId);

    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to reject this proposal.' });
    }

    await Invitation.findByIdAndUpdate(invitationId, { state: 'rejected' });

    secondaryActions({
      sentBy: invitation.sentBy.toString(),
      sentTo: invitation.sentTo.toString(),
      pingLevel: 2,
      receiverEmail: {
        intro: `Proposal titled - ${invitation.subject} was declined by you.`,
        outro: 'Thank you for reviewing the proposal.',
        subject: 'Proposal Declined',
      },
      senderEmail: {
        intro: `Your proposal titled - ${invitation.subject} was declined.`,
        outro: 'We are sorry for it. Hope so you try again with better proposal.',
        subject: 'Proposal Declined',
      },
      receiverNotification: {
        title: 'Proposal Declined',
        body: `Proposal titled - ${invitation.subject} was declined by you.`,
        img1: 'xyz',
        img2: 'xyz',
      },
      senderNotification: {
        title: 'Proposal Declined',
        body: `Your proposal titled - ${invitation.subject} was declined.`,
        img1: 'xyz',
        img2: 'xyz',
      },
      sentByModal: invitation.sentByModel,
      sentToModal: invitation.sentToModel,
    });

    return res.status(StatusCodes.OK).json({ message: 'Proposal has been successfully declined.' });
  } catch (error) {
    console.error('Error declining invitation:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Endorse an invitation
 * @route PATCH /invitation/endorse
 * @access Private (Authenticated Users)
 */
const endorseInvitation = async (req: Request, res: Response) => {
  try {
    const { invitationId } = req.body;
    if (!invitationId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invitation ID is required.' });
    }

    const result = await Invitation.findByIdAndUpdate(
      invitationId,
      { $addToSet: { endorsedBy: req.user.id } },
      { new: true, select: 'endorsedBy sentBy subject sentTo sentByModel sentToModel' },
    ).lean();

    if (!result) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Invitation not found.' });
    }

    secondaryActions({
      sentBy: result.sentBy.toString(),
      sentTo: result.sentTo.toString(),
      pingLevel: 0,
      receiverNotification: {
        title: 'Proposal Endorsed',
        body: `Thank you for endorsing proposal titled ${result.subject}`,
      },
      senderNotification: {
        title: 'Proposal Endorsed',
        body: `Your proposal titled - ${result.subject} was endorsed.`,
      },
      sentByModal: result.sentByModel,
      sentToModal: result.sentToModel,
      senderEmail: null,
      receiverEmail: null,
    });

    return res.status(StatusCodes.OK).json({ message: 'Successfully endorsed the proposal.' });
  } catch (error) {
    console.error('Error endorsing invitation:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error endorsing proposal.', error });
  }
};

/**
 * @desc Accept an invitation
 * @route PATCH /invitation/accept
 * @access Private (Authenticated Users)
 */
const acceptInvitation = async (req: Request, res: Response) => {
  try {
    const { invitationId } = req.query;
    if (!invitationId || !mongoose.isValidObjectId(invitationId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid invitation ID.' });
    }

    const invitation = await Invitation.findById(invitationId, {
      sentBy: 1,
      sentTo: 1,
      expiration: 1,
      state: 1,
      subject: 1,
      cc: 1,
      sentByModel: 1,
      sentToModel: 1,
    }).lean();
    if (!invitation) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Invitation not found.' });
    }

    if (invitation.state !== 'undecided') {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ message: 'Proposal has already been nullified.' });
    }

    const userId = req.user.id;
    const isAuthorized = [...(invitation.cc || []), invitation.sentTo.toString()].includes(userId);
    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to accept this proposal.' });
    }

    await Invitation.findByIdAndUpdate(invitationId, { state: 'accepted' });

    secondaryActions({
      sentBy: invitation.sentBy.toString(),
      sentTo: invitation.sentTo.toString(),
      pingLevel: 2,
      receiverEmail: {
        intro: `Proposal titled - ${invitation.subject} was accepted by you.`,
        outro: 'Thank you for reviewing the proposal.',
        subject: 'Proposal Accepted',
      },
      senderEmail: {
        intro: `Your proposal titled - ${invitation.subject} was accepted.`,
        outro: 'Congratulations! It is a remarkable achievement.',
        subject: 'Proposal Accepted',
      },
      receiverNotification: {
        title: 'Proposal Accepted',
        body: `Proposal titled - ${invitation.subject} was accepted by you.`,
        img1: 'xyz',
        img2: 'xyz',
      },
      senderNotification: {
        title: 'Proposal Accepted',
        body: `Your proposal titled - ${invitation.subject} was accepted.`,
        img1: 'xyz',
        img2: 'xyz',
      },
      sentByModal: invitation.sentByModel,
      sentToModal: invitation.sentToModel,
    });

    return res.status(StatusCodes.OK).json({ message: 'Proposal has been successfully accepted.' });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Get pending creator applications
 * @route GET /invitation/applications/pending
 * @access Admin
 */
const getPendingCreatorApplications = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to access this route.' });
    }

    const applications = await Invitation.find(
      { type: 'Content Team Application', state: 'undecided' },
      { sentBy: 1, subject: 1, createdAt: 1 },
    ).populate('sentBy', 'name image pushToken');

    const finalData = applications.map((application) => ({
      ...application.toObject(),
      senderMetaData: application.sentBy,
    }));
    return res.status(StatusCodes.OK).json({ finalData });
  } catch (error) {
    console.error('Error fetching pending applications:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

interface Notification {
  title: string;
  body: string;
  url?: string;
  img1?: string;
  img2?: string;
}

interface Email {
  intro: string;
  outro: string;
  subject: string;
}

/**
 * @desc Handles secondary actions like notifications and emails after an event.
 * @route Utility Function
 * @access Internal
 */
const secondaryActions = async ({
  sentBy,
  sentTo,
  sentByModal,
  sentToModal,
  pingLevel,
  senderNotification,
  receiverNotification,
  senderEmail,
  receiverEmail,
}: {
  sentBy: string;
  sentByModal: string;
  sentTo: string;
  sentToModal: string;
  pingLevel: number;
  senderNotification: Notification;
  receiverNotification: Notification;
  senderEmail: Email | null;
  receiverEmail: Email | null;
}) => {
  try {
    const jobId = `${sentBy}_${sentTo}_${Date.now()}`;
    const oneSecLater = new Date(Date.now() + 1000);
    schedule.scheduleJob(jobId, oneSecLater, async () => {
      try {
        // Helper function to fetch user/admin details
        const fetchUserOrAdmin = async (id: string, model: string) => {
          const fields = 'unreadNotice name image pushToken email';
          return model === 'User'
            ? User.findById(id, fields).lean()
            : Admin.findById(id, fields).lean();
        };

        const [sender, receiver] = await Promise.all([
          fetchUserOrAdmin(sentBy, sentByModal),
          fetchUserOrAdmin(sentTo, sentToModal),
        ]);

        if (!sender || !receiver) {
          console.error('Sender or receiver not found.');
          return;
        }

        // Helper function to send notifications
        const sendNotification = (
          target: any,
          notificationPayload: Notification,
          model: string,
        ) => {
          if (!notificationPayload?.title || !notificationPayload?.body) return;

          const payload = {
            pushToken: [target.pushToken],
            title: notificationPayload.title,
            body: notificationPayload.body,
            ...(notificationPayload.url && { url: notificationPayload.url }),
          };

          if (model === 'User') {
            notificationPayload.url
              ? scheduleNotification2(payload)
              : scheduleNotification(payload);
          }
        };

        await Promise.all([
          sendNotification(sender, senderNotification, sentByModal),
          sendNotification(receiver, receiverNotification, sentToModal),
        ]);

        // Handle pingLevel actions
        if (pingLevel === 1 || pingLevel === 2) {
          const createNotice = (title: string, img1: string, img2: string) => ({
            value: title,
            img1,
            img2,
            key: 'read',
            time: new Date(),
            uid: `${new Date()}/${sender._id}/${receiver._id}`,
          });

          const senderNotice = createNotice(
            senderNotification.title,
            receiver.image || '',
            sender.image || '',
          );
          const receiverNotice = createNotice(
            receiverNotification.title,
            sender.image || '',
            receiver.image || '',
          );

          // Update unread notices with a single DB call per user
          await Promise.all([
            User.updateOne({ _id: sender._id }, { $push: { unreadNotice: senderNotice } }),
            User.updateOne({ _id: receiver._id }, { $push: { unreadNotice: receiverNotice } }),
          ]);
        }

        // Send emails if pingLevel is 2
        if (pingLevel === 2) {
          const sendEmailToUser = async (target: any, emailData: Email | null) => {
            if (!emailData) return;

            try {
              const { ses, params } = await sendMail(
                target.name,
                emailData.intro,
                emailData.outro,
                emailData.subject,
                [target.email],
              );
              ses.sendEmail(
                params,
                (err) => err && console.error(`Email Error: ${err.message}`, err.stack),
              );
            } catch (error) {
              console.error(`Error sending email to ${target.name}:`, error);
            }
          };

          await Promise.all([
            sendEmailToUser(sender, senderEmail),
            sendEmailToUser(receiver, receiverEmail),
          ]);
        }
      } catch (error) {
        console.error(`Error executing scheduled job (${jobId}):`, error);
      }
    });
  } catch (error) {
    console.error('Error scheduling secondary actions:', error);
  }
};

export {
  createInvitation,
  getInvitationInfo,
  declineInvitation,
  endorseInvitation,
  acceptInvitation,
  getPendingCreatorApplications,
};
