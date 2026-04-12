const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const { updateDynamicIsland, scheduleNotification2 } = require('./utils');
const { io } = require('../app');

//Controller 1
const createNewChatRoom = async (req, res) => {
  try {
    const { doc_id } = req.body;
    const [firstId, secondId] = doc_id.split('-');
    const myId = req.user.id;
    const hisId = firstId === myId ? secondId : firstId;

    const [myDoc, hisDoc] = await Promise.all([
      User.findById(myId),
      User.findById(hisId),
    ]);

    if (!myDoc) throw new Error(`User with ID ${myId} not found.`);
    if (!hisDoc) throw new Error(`User with ID ${hisId} not found.`);

    const updateChatRooms = async (myDoc, state, hisDoc, requestedBy) => {
      const chatRoomIndex = myDoc.chatRooms.findIndex(
        (room) => room.doc_id === doc_id
      );
      if (chatRoomIndex === -1) {
        myDoc.chatRooms.unshift({
          doc_id, state,
          metaData: {
            name: hisDoc.name,
            image: hisDoc.image,
            pushToken: hisDoc.pushToken,
            deactivated: hisDoc.deactivated
          },
          status: "pending",
          requestedBy
        });
      } else {
        const [existingRoom] = myDoc.chatRooms.splice(chatRoomIndex, 1);
        myDoc.chatRooms.unshift(existingRoom);
      }
      await myDoc.save();
    };

    await updateChatRooms(myDoc, 'read', hisDoc, myId);
    await updateChatRooms(hisDoc, 'unread', myDoc, myId);

    return res
      .status(StatusCodes.OK)
      .send(myDoc.chatRooms);
  } catch (error) {
    console.error('Error creating chat room:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Failed to create new chat room.');
  }
};

//Controller 2
const getAllChatRooms = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "Access denied. Only users can access chat rooms.",
      });
    }

    const userId = req.user.id;

    // Update status + fetch chatRooms in one go
    const user = await User.findByIdAndUpdate(
      userId,
      { status: "online" },
      { new: true, projection: { chatRooms: 1 }, lean: true }
    );

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "User not found.",
      });
    }

    // Emit socket event (non-blocking)
    io.emit(`chatOnlineStatus_${userId}`, {
      status: "online",
    });

    return res.status(StatusCodes.OK).json(user.chatRooms || []);
  } catch (error) {
    console.error("Error fetching chat rooms:", error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch chat rooms. Please try again later.",
    });
  }
};

//Controller 3
const markAsUnread = async (req, res) => {
  try {
    const { doc_id, message } = req.query;
    const myId = req.user.id;

    // ✅ Validate input
    if (!doc_id || typeof doc_id !== "string") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Invalid or missing doc_id.");
    }

    const ids = doc_id.split("-");
    if (ids.length !== 2) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Invalid doc_id format.");
    }

    const hisId = ids[0] === myId ? ids[1] : ids[0];

    if (!hisId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Invalid user id.");
    }

    // ✅ Fetch both users in parallel
    const [senderDetails, user] = await Promise.all([
      User.findById(myId, {
        name: 1,
        image: 1,
        pushToken: 1,
      }).lean(),
      User.findById(hisId, {
        chatRooms: 1,
        shortCuts: 1,
        pushToken: 1,
      }),
    ]);

    if (!senderDetails) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Sender not found.");
    }

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Recipient not found.");
    }

    let chatRooms = user.chatRooms || [];

    const index = chatRooms.findIndex(
      (item) => item.doc_id === doc_id
    );

    if (index === -1) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Chat room not found.");
    }

    // ✅ Update + reorder efficiently
    const [matchedItem] = chatRooms.splice(index, 1);
    matchedItem.state = "unread";
    chatRooms.unshift(matchedItem);

    // ✅ Minimal mutation instead of reset
    user.markModified("chatRooms");
    user.chatRooms = chatRooms;

    await user.save();

    // ✅ Dynamic Island update (safe check)
    if (
      Array.isArray(user.shortCuts) &&
      user.shortCuts.some(
        (item) => item.id?.toString() === myId
      )
    ) {
      await updateDynamicIsland(
        [mongoose.Types.ObjectId(hisId)],
        myId,
        "messages",
        true
      );
    }

    // ✅ Notification (safe)
    if (message && user.pushToken) {
      scheduleNotification2({
        pushToken: [user.pushToken],
        title: `Message from ${senderDetails.name}`,
        body: message,
        url: `https://macbease.com/app/chat/${senderDetails._id}`,
      });
    }

    return res
      .status(StatusCodes.OK)
      .send("The chat room has been marked unread.");
  } catch (error) {
    console.error("markAsUnread error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while marking chat as unread.");
  }
};

//Controller 4
const markAsRead = async (req, res) => {
  try {
    const { doc_id } = req.query;
    const myId = req.user.id;

    // ✅ Validate input
    if (!doc_id || typeof doc_id !== "string") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Invalid or missing doc_id.");
    }

    // ✅ Fetch user
    const user = await User.findById(myId);

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("User not found.");
    }

    let chatRooms = user.chatRooms || [];

    const index = chatRooms.findIndex(
      (item) => item.doc_id === doc_id
    );

    if (index === -1) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Chat room not found.");
    }

    // ✅ Efficient reorder
    const [matchedItem] = chatRooms.splice(index, 1);
    matchedItem.state = "read";
    chatRooms.unshift(matchedItem);

    // ✅ Minimal mutation
    user.chatRooms = chatRooms;
    user.markModified("chatRooms");

    await user.save();

    return res
      .status(StatusCodes.OK)
      .send("The chat room has been marked read.");
  } catch (error) {
    console.error("markAsRead error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while marking chat as read.");
  }
};

//Controller 5
const getUnreadRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(
      userId,
      { chatRooms: 1, _id: 0 }
    ).lean();

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("User does not exist.");
    }

    const chatRooms = (user.chatRooms || []).filter(
      (room) => room.state === "unread"
    );

    return res.status(StatusCodes.OK).json(chatRooms);
  } catch (error) {
    console.error("getUnreadRooms error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch unread chat rooms.");
  }
};

const checkBlockage = async (req, res) => {
  try {
    const { secondaryId } = req.query;
    const primaryId = req.user.id;

    // ✅ Validate input
    if (!secondaryId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("secondaryId is required.");
    }

    // ✅ Fetch both users in parallel
    const [primary, secondary] = await Promise.all([
      User.findById(primaryId, { blockList: 1 }).lean(),
      User.findById(secondaryId, { blockList: 1 }).lean(),
    ]);

    if (!primary || !secondary) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("One or both users not found.");
    }

    const primaryBlockList = primary.blockList || [];
    const secondaryBlockList = secondary.blockList || [];

    // ✅ Efficient checks
    const youHaveBlocked = primaryBlockList.some(
      (item) => item.id?.toString() === secondaryId
    );

    const receiverHasBlocked = secondaryBlockList.some(
      (item) => item.id?.toString() === primaryId
    );

    return res.status(StatusCodes.OK).json({
      youHaveBlocked,
      receiverHasBlocked,
    });
  } catch (error) {
    console.error("checkBlockage error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to check blockage status.");
  }
};

// Controller to manually store metadata in user's chatroom
const metaDataChatRoom = async (req, res) => {
  try {

    const users = await User.find({}, { chatRooms: 1 });

    if (!users.length) {
      return res.status(StatusCodes.NO_CONTENT).send("No users with chatRooms found.");
    }

    for (const user of users) {
      const myId = user._id.toString();
      const updatedChatRooms = await Promise.all(
        user.chatRooms.map(async (chatRoom) => {

          if (!chatRoom) {
            return chatRoom;
          }

          const { doc_id, state } = chatRoom;

          if (!doc_id || doc_id === "null") {
            return chatRoom;
          }

          if (doc_id.startsWith("project")) {
            return chatRoom;
          }

          const [firstId, secondId] = doc_id.split('-');
          const hisId = firstId === myId ? secondId : firstId;

          if (hisId !== "null") {

            const docUser = await User.findById(hisId, { name: 1, image: 1, pushToken: 1, deactivated: 1 });

            if (!docUser) {
              console.warn(`No user found with docId: ${hisId}`);
              return chatRoom;
            }

            return {
              doc_id,
              state,
              metaData: {
                name: docUser.name,
                image: docUser.image,
                pushToken: docUser.pushToken,
                deactivated: docUser.deactivated
              }
            };
          }
        })
      );

      user.chatRooms = updatedChatRooms;
      await user.save();
    }

    return res.status(StatusCodes.OK).send("Successful")

  } catch (err) {
    console.log("Error while storing metadata in user's chatroom:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong");
  }
}

const isOnline = async (req, res) => {
  try {
    const { id } = req.query;

    const user = await User.findById(id, { status: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.")
    }

    return res.status(StatusCodes.OK).send(user.status);

  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong.")
  }
}

const gotOffline = async (req, res) => {
  try {

    const { id } = req.query;

    const user = await User.findById(id, { status: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.")
    }

    user.status = "offline";
    user.save();

    io.emit(`chatOnlineStatus_${req.user.id}`, {
      status: "offline"
    });

    return res.status(StatusCodes.OK).send("Successful");

  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong");
  }
}

const acceptMessage = async (req, res) => {

  try {
    const { doc_id } = req.body;
    const [firstId, secondId] = doc_id.split('-');
    const myId = req.user.id;
    const hisId = firstId === myId ? secondId : firstId;

    const [myDoc, hisDoc] = await Promise.all([
      User.findById(myId),
      User.findById(hisId),
    ]);

    if (!myDoc) throw new Error(`User with ID ${myId} not found.`);
    if (!hisDoc) throw new Error(`User with ID ${hisId} not found.`);

    const updateChatRoomStatus = (userDoc) => {
      const updatedChatRooms = userDoc.chatRooms.map((room) =>
        room && room.doc_id === doc_id ? { ...room, status: "accepted" } : room
      );
      userDoc.chatRooms = updatedChatRooms;
      return userDoc.save();
    };

    await Promise.all([
      updateChatRoomStatus(myDoc),
      updateChatRoomStatus(hisDoc),
    ]);

    return res.status(StatusCodes.OK).send("Chat room status updated to accepted for both users.");

  } catch (error) {
    console.error('Error updating chat room status:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Failed to update chat room status.');
  }

}

const declineMessage = async (req, res) => {
  try {
    const { doc_id } = req.body;
    const [firstId, secondId] = doc_id.split('-');
    const myId = req.user.id;
    const hisId = firstId === myId ? secondId : firstId;

    const [myDoc, hisDoc] = await Promise.all([
      User.findById(myId),
      User.findById(hisId),
    ]);

    if (!myDoc) throw new Error(`User with ID ${myId} not found.`);
    if (!hisDoc) throw new Error(`User with ID ${hisId} not found.`);

    myDoc.chatRooms = myDoc.chatRooms.filter((room) => room && room.doc_id !== doc_id);
    await myDoc.save();

    hisDoc.chatRooms = hisDoc.chatRooms.map((room) =>
      room && room.doc_id === doc_id ? { ...room, status: "declined" } : room
    );
    await hisDoc.save();

    return res.status(StatusCodes.OK).send("Chat room request declined successfully.");
  } catch (error) {
    console.error("Error declining chat room request:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to decline chat room request. Please try again later.");
  }
};

const sendBulkMessage = async (req, res) => {
  try {
    const { recipientIds, message } = req.body;
    const senderId = req.user.id;

    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'recipientIds must be a non-empty array.' });
    }
    if (!message || !message.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'message is required.' });
    }

    const axios = require('axios');
    const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL || 'https://macbeasechat-default-rtdb.asia-southeast1.firebasedatabase.app';

    const senderDoc = await User.findById(senderId, { name: 1, image: 1, pushToken: 1 });
    if (!senderDoc) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Sender not found.' });
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const recipientId of recipientIds) {
      try {
        if (recipientId === senderId) continue; // Can't message yourself

        const recipientDoc = await User.findById(recipientId, {
          name: 1, image: 1, pushToken: 1, chatRooms: 1, deactivated: 1, blockList: 1,
        });
        if (!recipientDoc) {
          console.error(`sendBulkMessage error: Recipient ${recipientId} not found in DB.`);
          failedCount++;
          continue;
        }

        // Check if the recipient has blocked the sender
        const isBlocked = (recipientDoc.blockList || []).some(
          (b) => b.id === senderId || b.id?.toString() === senderId
        );
        if (isBlocked) {
          console.error(`sendBulkMessage error: Sender ${senderId} is blocked by ${recipientId}.`);
          failedCount++;
          continue;
        }

        // Build the deterministic doc_id (larger ID first)
        const doc_id = senderId > recipientId
          ? `${senderId}-${recipientId}`
          : `${recipientId}-${senderId}`;

        // 1. Write message to Firebase RTDB via REST API
        const msgId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const firebaseMsg = {
          _id: msgId,
          text: message,
          createdAt: Date.now(),
          user: {
            _id: senderId,
            name: senderDoc.name,
            avatar: senderDoc.image,
          },
          sentTo: recipientId,
          sendBy: senderId,
          messageKey: null,
        };

        // POST to Firebase REST API generates a push key automatically
        const fbRes = await axios.post(
          `${FIREBASE_DB_URL}/chatRooms/${doc_id}.json`,
          firebaseMsg,
        );
        // fbRes.data.name is the generated push key
        const pushKey = fbRes.data?.name;
        if (pushKey) {
          // Update messageKey in the written record
          await axios.patch(
            `${FIREBASE_DB_URL}/chatRooms/${doc_id}/${pushKey}.json`,
            { messageKey: pushKey },
          );
        }

        // 2. Ensure chatRoom entries exist in both users' MongoDB docs
        const ensureChatRoom = async (userDoc, otherDoc, state, requestedBy) => {
          const existingIdx = userDoc.chatRooms.findIndex((r) => r.doc_id === doc_id);
          if (existingIdx === -1) {
            userDoc.chatRooms.unshift({
              doc_id,
              state,
              metaData: {
                name: otherDoc.name,
                image: otherDoc.image,
                pushToken: otherDoc.pushToken,
                deactivated: otherDoc.deactivated || false,
              },
              status: 'accepted', // Starman-sent messages are auto-accepted
              requestedBy,
            });
          } else {
            // Move to top and update state
            const [existing] = userDoc.chatRooms.splice(existingIdx, 1);
            existing.state = state;
            userDoc.chatRooms.unshift(existing);
          }
          await User.updateOne({ _id: userDoc._id }, { $set: { chatRooms: userDoc.chatRooms } });
        };

        // Reload sender doc for each iteration (chatRooms might have changed)
        const freshSenderDoc = await User.findById(senderId);
        await ensureChatRoom(freshSenderDoc, recipientDoc, 'read', senderId);
        await ensureChatRoom(recipientDoc, senderDoc, 'unread', senderId);

        // 3. Send push notification to the recipient
        if (recipientDoc.pushToken) {
          scheduleNotification2({
            pushToken: [recipientDoc.pushToken],
            title: `Message from ${senderDoc.name}`,
            body: message.length > 100 ? message.substring(0, 100) + '…' : message,
            url: `https://macbease.com/app/chat/${senderId}`,
          });
        }

        sentCount++;
      } catch (perUserErr) {
        console.error(`sendBulkMessage error for recipient ${recipientId}:`, perUserErr.message);
        failedCount++;
      }
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      sentCount,
      failedCount,
      totalRecipients: recipientIds.length,
    });
  } catch (error) {
    console.error('sendBulkMessage error:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: true,
      message: 'Failed to send bulk messages.',
    });
  }
};

module.exports = {
  createNewChatRoom,
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
  sendBulkMessage,
};
