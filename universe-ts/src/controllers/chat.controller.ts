import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import User, { IUser } from '../models/user.model';
import { updateDynamicIsland, scheduleNotification2 } from './utils.controller';
import { io } from '../server';

/**
 * @desc Create or update a chat room
 * @route POST /
 * @access User (Authenticated)
 */
const createNewChatRoom = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { doc_id } = req.body;
    if (!doc_id) return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing doc_id' });

    const myId = req.user.id;
    if (!myId)
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'User not authenticated' });

    const [firstId, secondId] = doc_id.split('-');
    const hisId = firstId === myId ? secondId : firstId;

    const [myDoc, hisDoc] = await Promise.all([
      User.findById(myId, { chatRooms: 1 }).lean(),
      User.findById(hisId, { name: 1, image: 1, pushToken: 1, deactivated: 1 }).lean(),
    ]);

    if (!myDoc || !hisDoc)
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });

    const updateChatRoom = async (userId: string, targetDoc: any, state: string) => {
      await User.findByIdAndUpdate(
        userId,
        {
          $pull: { chatRooms: { doc_id } }, // Remove existing chat room (if any)
          $push: {
            chatRooms: {
              doc_id,
              state,
              metaData: {
                name: targetDoc.name,
                image: targetDoc.image,
                pushToken: targetDoc.pushToken,
                deactivated: targetDoc.deactivated,
              },
              status: 'pending',
              requestedBy: myId,
            },
          },
        },
        { new: true },
      );
    };

    await Promise.all([
      updateChatRoom(myId, hisDoc, 'read'),
      updateChatRoom(hisId, myDoc, 'unread'),
    ]);

    return res.status(StatusCodes.OK).json({ message: 'Chat room created/updated successfully' });
  } catch (error) {
    console.error('Error creating chat room:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to create chat room', error });
  }
};

/**
 * @desc Delete a chat room
 * @route DELETE /:doc_id
 * @access User (Authenticated)
 */
const deleteChatRoom = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { doc_id } = req.params;
    const myId = req.user.id;
    if (!myId) return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });

    await User.findByIdAndUpdate(myId, { $pull: { chatRooms: { doc_id } } });

    return res.status(StatusCodes.OK).json({ message: 'Chat room deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat room:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to delete chat room', error });
  }
};

/**
 * @desc Gets all chat rooms for the user
 * @route GET /chat/get-all-chat-rooms
 * @access User
 */
const getAllChatRooms = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'user')
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized' });

    // Use lean() since we only need chatRooms and status (no modifications required)
    const user = await User.findById(req.user.id, 'chatRooms status').lean().exec();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found' });

    if (user.status !== 'online') {
      await User.updateOne({ _id: req.user.id }, { status: 'online' }).exec();
      io.emit(`chatOnlineStatus_${req.user.id}`, { status: 'online' });
    }

    return res.status(StatusCodes.OK).json(user.chatRooms);
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Marks a chat room as unread
 * @route PATCH /chat/mark-unread
 * @access Authenticated Users
 */
const markAsUnread = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { doc_id, message } = req.body as { doc_id: string; message?: string };
    if (!doc_id) return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing doc_id' });

    const myId = req.user.id;
    if (!myId)
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'User not authenticated' });

    const ids = doc_id.split('-');
    const hisId = ids[0] === myId ? ids[1] : ids[0];
    if (!mongoose.Types.ObjectId.isValid(hisId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid user ID' });
    }

    // Fetch both users in a single query for efficiency
    const [user, sender] = await Promise.all([
      User.findById(hisId, { chatRooms: 1, shortCuts: 1, pushToken: 1 }).exec(),
      User.findById(myId, { name: 1, image: 1, pushToken: 1 }).exec(),
    ]);

    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });
    if (!sender) return res.status(StatusCodes.NOT_FOUND).json({ error: 'Sender not found' });

    const chatRoomIndex = user?.chatRooms?.findIndex((room) => room.doc_id === doc_id);
    if (chatRoomIndex === -1 || chatRoomIndex === undefined)
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Chat room not found' });

    // Update chat room state and reorder efficiently
    if (user && user.chatRooms && chatRoomIndex !== undefined) {
      user.chatRooms[chatRoomIndex].state = 'unread';
      user.chatRooms.unshift(user.chatRooms.splice(chatRoomIndex, 1)[0]);
    }

    await user.save();

    // Update notification dynamically if needed
    if (user.shortCuts?.some((item) => item.id.toString() === myId)) {
      await updateDynamicIsland([new mongoose.Types.ObjectId(hisId)], myId, 'messages', true);
    }

    // Send notification if applicable
    if (user.pushToken && message) {
      scheduleNotification2({
        pushToken: [user.pushToken],
        title: `Message from ${sender.name}`,
        body: message,
        url: `https://macbease.com/app/chat/${sender._id}`,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Chat room marked unread.' });
  } catch (error) {
    console.error('Error marking chat room unread:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Mark chat room as read
 * @route PATCH /chat/mark-read?doc_id=
 * @access User (Authenticated)
 */
const markAsRead = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { doc_id } = req.query as { doc_id: string };
    const myId = req.user.id;
    if (!myId) return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });

    const updatedUser = await User.findOneAndUpdate(
      { _id: myId, 'chatRooms.doc_id': doc_id },
      {
        $set: { 'chatRooms.$.state': 'read' },
      },
      { new: true },
    );

    if (!updatedUser)
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Chat room not found' });

    return res.status(StatusCodes.OK).json({ message: 'Chat room marked as read' });
  } catch (error) {
    console.error('Error marking chat room as read:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred', error });
  }
};

/**
 * @desc Gets unread chat rooms for the user
 * @route GET /chat/get-unread-rooms
 * @access User
 */
const getUnreadRooms = async (req: Request, res: Response): Promise<Response> => {
  try {
    const user = await User.findById(req.user.id, { chatRooms: 1 }).lean().exec();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: 'User does not exist' });

    const unreadRooms = user.chatRooms?.filter((room) => room.state === 'unread') || [];
    return res.status(StatusCodes.OK).json(unreadRooms);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred', error });
  }
};

/**
 * @desc Check if users have blocked each other
 * @route GET /chat/check-blockage?secondaryId=
 * @access User (Authenticated)
 */
const checkBlockage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { secondaryId } = req.query as { secondaryId: string };
    const primaryId = req.user.id;
    if (!primaryId) return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });

    const users = await User.find(
      { _id: { $in: [primaryId, secondaryId] } },
      { blockList: 1, _id: 1 },
    ).lean();

    if (users.length !== 2)
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });

    const [primary, secondary] = users;
    const youHaveBlocked = primary.blockList?.some((block) => block.id === secondaryId);
    const receiverHasBlocked = secondary.blockList?.some((block) => block.id === primaryId);

    return res.status(StatusCodes.OK).json({ youHaveBlocked, receiverHasBlocked });
  } catch (error) {
    console.error('Error checking blockage:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Store metadata in user's chatroom
 * @route PUT /chat/metadata
 * @access Admin
 */
const metaDataChatRoom = async (req: Request, res: Response): Promise<Response> => {
  try {
    const users = await User.find({ chatRooms: { $exists: true, $ne: [] } }, { chatRooms: 1 });

    if (!users.length) {
      return res.status(StatusCodes.NO_CONTENT).json({ message: 'No users with chatRooms found.' });
    }

    const bulkUpdates = users.map(async (user) => {
      const updatedChatRooms = await Promise.all(
        (user.chatRooms ?? []).map(async (chatRoom) => {
          if (!chatRoom) return chatRoom;
          const { doc_id, state } = chatRoom;
          if (!doc_id || doc_id == 'null') return chatRoom;
          if (doc_id.startsWith('project')) return chatRoom;

          const [firstId, secondId] = doc_id.split('-');
          const myId = user.id;
          const hisId = firstId === myId ? secondId : firstId;

          if (hisId !== 'null' && mongoose.Types.ObjectId.isValid(hisId)) {
            const docUser = await User.findById(hisId, {
              name: 1,
              image: 1,
              pushToken: 1,
              deactivated: 1,
            });
            if (!docUser) return chatRoom;

            return { doc_id, state, metaData: { ...docUser.toObject() } };
          }
          return chatRoom;
        }),
      );

      return {
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { chatRooms: updatedChatRooms } },
        },
      };
    });

    await User.bulkWrite(await Promise.all(bulkUpdates));

    return res.status(StatusCodes.OK).json({ message: 'Metadata updated successfully.' });
  } catch (error) {
    console.error("Error storing metadata in user's chatroom:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Check if a user is online
 * @route GET /chat/online?id=
 * @access Public
 */
const isOnline = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.query;

    const user = await User.findById(id, 'status').lean();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found' });

    return res.status(StatusCodes.OK).json({ status: user.status });
  } catch (error) {
    console.error('Error checking user status:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Updates user status to offline
 * @route PATCH /chat/offline?id=
 * @access User
 */
const gotOffline = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.query;

    if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ message: 'User ID is required' });

    // Use lean() to avoid Mongoose overhead since we only read status
    const user = await User.findById(id, 'status').lean().exec();
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });

    if (user.status !== 'offline') {
      await User.updateOne({ _id: id }, { status: 'offline' }).exec();
      io.emit(`chatOnlineStatus_${id}`, { status: 'offline' });
    }

    return res.status(StatusCodes.OK).json({ message: 'User status turned offline successfully.' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

/**
 * @desc Accept a chat request
 * @route PATCH /chat/accept
 * @access User
 */
const acceptMessage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { doc_id } = req.body;
    const [firstId, secondId] = doc_id.split('-');
    const myId = req.user.id;
    const hisId = firstId === myId ? secondId : firstId;

    if (!mongoose.Types.ObjectId.isValid(hisId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid chatroom ID.' });
    }

    const [myDoc, hisDoc] = await Promise.all([User.findById(myId), User.findById(hisId)]);

    if (!myDoc)
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: `User with ID ${myId} not found.` });
    if (!hisDoc)
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: `User with ID ${hisId} not found.` });

    const updateChatRoomStatus = (userDoc: IUser) => {
      userDoc.chatRooms = userDoc.chatRooms?.map((room) =>
        room.doc_id === doc_id ? { ...room, status: 'accepted' } : room,
      );
      return userDoc.save();
    };

    await Promise.all([updateChatRoomStatus(myDoc), updateChatRoomStatus(hisDoc)]);

    return res.status(StatusCodes.OK).json({ message: 'Chat request accepted successfully.' });
  } catch (error) {
    console.error('Error accepting chat request:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to accept chat request.', error });
  }
};

/**
 * @desc Decline a chat request
 * @route DELETE /chat/decline
 * @access User
 */
const declineMessage = async (req: Request, res: Response) => {
  try {
    const { doc_id } = req.body;
    const [firstId, secondId] = doc_id.split('-');
    const myId = req.user.id;
    const hisId = firstId === myId ? secondId : firstId;

    if (!mongoose.Types.ObjectId.isValid(hisId)) {
      throw new Error('Invalid chat room ID.');
    }

    const [myDoc, hisDoc] = await Promise.all([User.findById(myId), User.findById(hisId)]);

    if (!myDoc)
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: `User with ID ${myId} not found.` });
    if (!hisDoc)
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: `User with ID ${hisId} not found.` });

    myDoc.chatRooms = myDoc?.chatRooms?.filter((room) => room.doc_id !== doc_id);
    hisDoc.chatRooms = hisDoc?.chatRooms?.map((room) =>
      room.doc_id === doc_id ? { ...room, status: 'declined' } : room,
    );

    await Promise.all([myDoc.save(), hisDoc.save()]);

    return res.status(StatusCodes.OK).json({ message: 'Chat request declined successfully.' });
  } catch (error) {
    console.error('Error declining chat request:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to decline chat request.', error });
  }
};

export {
  createNewChatRoom,
  deleteChatRoom,
  getAllChatRooms,
  markAsUnread,
  markAsRead,
  getUnreadRooms,
  checkBlockage,
  metaDataChatRoom,
  isOnline,
  gotOffline,
  acceptMessage,
  declineMessage,
};
