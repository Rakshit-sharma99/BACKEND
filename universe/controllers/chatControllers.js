const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const { updateDynamicIsland, scheduleNotification2 } = require('./utils');
const {io} = require('../app');

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

    const updateChatRooms = async (myDoc, state,hisDoc,requestedBy) => {
      const chatRoomIndex = myDoc.chatRooms.findIndex(
        (room) => room.doc_id === doc_id
      );
      if (chatRoomIndex === -1) {
        myDoc.chatRooms.unshift({ doc_id, state,
          metaData:{
            name:hisDoc.name,
            image:hisDoc.image,
            pushToken:hisDoc.pushToken,
            deactivated:hisDoc.deactivated
          },
          status:"pending",
          requestedBy
         });
      } else {
        const [existingRoom] = myDoc.chatRooms.splice(chatRoomIndex, 1);
        myDoc.chatRooms.unshift(existingRoom);
      }
      await myDoc.save();
    };

    await updateChatRooms(myDoc, 'read',hisDoc,myId);
    await updateChatRooms(hisDoc, 'unread',myDoc,myId);

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
  if (req.user.role === 'user') {
    const user = await User.findById(req.user.id, { chatRooms: 1, status:1 });

    user.status="online";
    await user.save();

    io.emit(`chatOnlineStatus_${req.user.id}`, {
      status: "online"
    });

    return res.status(StatusCodes.OK).json(user.chatRooms);
  }
};

//Controller 3
const markAsUnread = async (req, res) => {
  try {
    const { doc_id, message } = req.query;
    let ids = doc_id.split('-');
    let myId = req.user.id;
    const senderDetails = await User.findById(myId, {
      name: 1,
      image: 1,
      pushToken: 1,
    });
    let hisId = ids[0] === myId ? ids[1] : ids[0];
    if (!hisId) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send('Invalid user id.');
    }
    const user = await User.findById(hisId, {
      chatRooms: 1,
      shortCuts: 1,
      pushToken: 1,
    });
    let chatRooms = user.chatRooms;
    let index = chatRooms.findIndex((item) => item.doc_id === doc_id);
    let matchedItem = chatRooms[index];
    if (matchedItem) {
      matchedItem.state = 'unread';
      chatRooms = chatRooms.filter((item) => item.doc_id !== doc_id);
      chatRooms = [matchedItem, ...chatRooms];
    }
    user.chatRooms = [];
    user.chatRooms = chatRooms;
    await user.save();
    if (user.shortCuts.some((item) => item.id.toString() === myId)) {
      await updateDynamicIsland(
        [mongoose.Types.ObjectId(hisId)],
        myId,
        'messages',
        true
      );
    }
    if (message) {
      scheduleNotification2({
        pushToken: [user.pushToken],
        title: `Message from ${senderDetails.name}`,
        body: message,
        url: `https://macbease.com/app/chat/${senderDetails._id}`,
      });
    }
    return res
      .status(StatusCodes.OK)
      .send('The chat room has been marked unread.');
  } catch (error) {
    console.log('chat room error', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 4
const markAsRead = async (req, res) => {
  const { doc_id } = req.query;
  let myId = req.user.id;
  User.findById(myId, (err, user) => {
    if (err) return console.error(err);
    let chatRooms = user.chatRooms;
    let index = chatRooms.findIndex((item) => item.doc_id === doc_id);
    if (index !== -1) {
      let matchedItem = chatRooms[index];
      matchedItem.state = 'read';
      chatRooms = chatRooms.filter((item) => item.doc_id !== doc_id);
      chatRooms = [matchedItem, ...chatRooms];
      user.chatRooms = [];
      user.chatRooms = chatRooms;
    }
    user.save((err, update) => {
      if (err) return console.error(err);
      return res
        .status(StatusCodes.OK)
        .send('The chat room has been marked read.');
    });
  });
};

//Controller 5
const getUnreadRooms = async (req, res) => {
  const user = await User.findById(req.user.id, { chatRooms: 1, _id: 0 });
  if (user) {
    let chatRooms = user.chatRooms;
    chatRooms = chatRooms.filter((element) => element.state === 'unread');
    return res.status(StatusCodes.OK).json(chatRooms);
  } else {
    return res.status(StatusCodes.OK).send('User does not exist.');
  }
};

const checkBlockage = async (req, res) => {
  const { secondaryId } = req.query;
  try {
    const primary = await User.findById(req.user.id, { blockList: 1, _id: 0 });
    const secondary = await User.findById(secondaryId, {
      blockList: 1,
      _id: 0,
    });
    const primaryBlockList = primary.blockList;
    const secondaryBlockList = secondary.blockList;
    let youHaveBlocked = false;
    let receiverHasBlocked = false;
    for (let i = 0; i < primaryBlockList.length; i++) {
      const point = primaryBlockList[i];
      if (point.id === secondaryId) {
        youHaveBlocked = true;
      }
    }
    for (let i = 0; i < secondaryBlockList.length; i++) {
      const point = secondaryBlockList[i];
      if (point.id === req.user.id) {
        receiverHasBlocked = true;
      }
    }
    return res
      .status(StatusCodes.OK)
      .json({ youHaveBlocked, receiverHasBlocked });
  } catch (error) {
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

// Controller to manually store metadata in user's chatroom
const metaDataChatRoom = async(req,res) => {
  try{

    const users = await User.find({},{chatRooms:1});

    if (!users.length) {
      return res.status(StatusCodes.NO_CONTENT).send("No users with chatRooms found.");
    }

    for (const user of users) {
      const myId = user._id.toString();
      const updatedChatRooms = await Promise.all(
        user.chatRooms.map(async (chatRoom) => {

          if(!chatRoom){
            return chatRoom;
          }

          const { doc_id, state } = chatRoom;

          if(!doc_id || doc_id==="null"){
            return chatRoom;
          }
            
          if(doc_id.startsWith("project")){
            return chatRoom;
          }

          const [firstId, secondId] = doc_id.split('-');
          const hisId = firstId === myId ? secondId : firstId;

          if(hisId!=="null"){

          const docUser = await User.findById(hisId, { name: 1, image: 1,pushToken:1,deactivated:1 });

          if (!docUser) {
            console.warn(`No user found with docId: ${hisId}`);
            return chatRoom; 
          }

          return {
            doc_id,
            state,
            metaData:{
              name: docUser.name,
              image: docUser.image,
              pushToken:docUser.pushToken,
              deactivated:docUser.deactivated
            }
          };
        }
        })
      );

      user.chatRooms = updatedChatRooms;
      await user.save(); 
    }

    return res.status(StatusCodes.OK).send("Successful")

  }catch(err){
    console.log("Error while storing metadata in user's chatroom:",err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong");
  }
}

const isOnline = async(req,res) => {
  try{
    const { id } = req.query;

    const user = await User.findById(id,{status:1});
    if(!user){
      return res.status(StatusCodes.NOT_FOUND).send("User not found.")
    }

    return res.status(StatusCodes.OK).send(user.status);

  }catch(err){
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong.")
  }
}

const gotOffline = async(req,res) => {
  try{

    const { id } = req.query;

    const user = await User.findById(id,{status:1});
    if(!user){
      return res.status(StatusCodes.NOT_FOUND).send("User not found.")
    }

    user.status="offline";
    user.save();

    io.emit(`chatOnlineStatus_${req.user.id}`, {
      status: "offline"
    });

    return res.status(StatusCodes.OK).send("Successful");

  }catch(err){
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong");
  }
}

const acceptMessage = async(req,res) => {

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
        room.doc_id === doc_id ? { ...room, status: "accepted" } : room
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

    myDoc.chatRooms = myDoc.chatRooms.filter((room) => room.doc_id !== doc_id);
    await myDoc.save();

    hisDoc.chatRooms = hisDoc.chatRooms.map((room) =>
      room.doc_id === doc_id ? { ...room, status: "declined" } : room
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
  declineMessage
};
