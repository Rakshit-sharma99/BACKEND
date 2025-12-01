const { StatusCodes } = require('http-status-codes');
const Letter = require('../models/letter');
const User = require('../models/user');

//helper function
function isBlocked(blockList, id) {
  let isBlockedStatus = false;
  let matchedData = blockList.filter((element) => element.id === id);
  if (matchedData.length !== 0) {
    isBlockedStatus = true;
  }
  return isBlockedStatus;
}

//Controller 1
const bookALetter = async (req, res) => {
  const { receiverId, anonymity, replyToAnonymous } = req.body;
  const bookingId = Math.floor(Math.random() * (999999 - 100000 + 1) + 100000);
  const date = new Date();
  const dataPoint = {
    bookingId,
    receiverId,
    senderId: req.user.id,
    anonymity,
    date,
    replyToAnonymous,
  };
  try {
    const receiver = await User.findById(receiverId, {
      blockList: 1,
      _id: 0,
      name: 1,
      image: 1,
    });
    const blockList = receiver.blockList;
    const isBlockedStatus = isBlocked(blockList, req.user.id);
    if (!isBlockedStatus) {
      const letter = await Letter.create(dataPoint);
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let value = `You have booked a letter with bookingId ${bookingId}`;
        let img2 = '';
        if (!replyToAnonymous) {
          value = `You have booked a letter with bookingId ${bookingId} for ${receiver.name}`;
          img2 = receiver.image;
        }
        const notice = {
          value,
          img1: user.image,
          img2,
          key: 'letter',
          action: 'letter',
          params: {},
          time: new Date(),
          uid: `${new Date()}/${receiver._id}/${req.user.id}`,
        };
        let giftsSend = user.giftsSend;
        let notices = user.unreadNotice;
        giftsSend = [letter._id.toString(), ...giftsSend];
        notices = [notice, ...notices];
        user.unreadNotice = [];
        user.unreadNotice = notices;
        user.giftsSend = [];
        user.giftsSend = giftsSend;
        user.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .json({ msg: 'Letter successfully booked', bookingId: bookingId });
        });
      });
    } else {
      return res.status(StatusCodes.OK).send('You are blocked.');
    }
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 2
const setInLocker = async (req, res) => {
  const { bookingId, lockerId } = req.body;
  if (req.user.role === 'admin') {
    try {
      let letter = await Letter.findOne({ bookingId });
      if (!letter) {
        return res.status(StatusCodes.OK).send('Booking id is wrong.');
      }
      letter.status = 'setInLocker';
      letter.lockerId = lockerId;
      letter.save();
      let user = await User.findById(letter.receiverId);
      let sender = await User.findById(letter.senderId, { name: 1, image: 1 });
      let value = `You have received a letter.Tap to view`;
      let img2 = '';
      if (!letter.anonymity) {
        value = `You have received a letter from ${sender.name}!`;
        img2 = sender.image;
      }
      const notice = {
        value,
        img1: user.image,
        img2,
        key: 'letter',
        action: 'letter',
        params: {},
        time: new Date(),
        uid: `${new Date()}/${user._id}/${sender._id}`,
      };
      user.giftsReceived = [letter._id.toString(), ...user.giftsReceived];
      user.unreadNotice = [notice, ...user.unreadNotice];
      user.save();
      return res
        .status(StatusCodes.OK)
        .send('Letter successfully set in locker.');
    } catch (error) {
      console.error(error);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to set letters in locker.');
  }
};

//Controller 3
const receiveLetter = async (req, res) => {
  const { bookingId, lockerId } = req.body;
  try {
    let letter = await Letter.findOne({ bookingId, lockerId });
    if (!letter) {
      return res
        .status(StatusCodes.OK)
        .send('Booking id and locker id does not match.');
    }
    let sender = await User.findById(letter.senderId);
    let receiver = await User.findById(letter.receiverId);
    let senderValue = `Your letter was successfully delivered!`;
    let img2ForSender = '';
    let receiverValue = `Thank you for collecting your letter!`;
    let img2ForReceiver = '';
    if (!letter.replyToAnonymous) {
      senderValue = `Your letter was collected by ${receiver.name}!`;
      img2ForSender = receiver.image;
    }
    if (!letter.anonymity) {
      receiverValue = `Thank you for collecting your letter from ${sender.name}!`;
      img2ForReceiver = sender.image;
    }
    const senderNotice = {
      value: senderValue,
      img1: sender.image,
      img2: img2ForSender,
      key: 'letter',
      action: 'letter',
      params: {},
      time: new Date(),
      uid: `${new Date()}/${receiver._id}/${sender._id}`,
    };
    const receiverNotice = {
      value: receiverValue,
      img1: receiver.image,
      img2: img2ForReceiver,
      key: 'letter',
      action: 'letter',
      params: {},
      time: new Date(),
      uid: `${new Date()}/${receiver._id}/${sender._id}`,
    };
    sender.unreadNotice = [senderNotice, ...sender.unreadNotice];
    receiver.unreadNotice = [receiverNotice, ...receiver.unreadNotice];
    letter.status = 'received';
    sender.save();
    receiver.save();
    letter.save();
    return res.status(StatusCodes.OK).send('Letter successfully delivered.');
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 4
const getAllLetters = async (req, res) => {
  const { key, batch, batchSize } = req.query;
  try {
    const user = await User.findById(req.user.id);
    if (key === 'send') {
      let giftsSend = user.giftsSend;
      giftsSend = giftsSend.slice((batch - 1) * batchSize, batch * batchSize);
      const l1 = giftsSend.length;
      let lettersSend = [];
      for (let i = 0; i < l1; i++) {
        const letterId = giftsSend[i];
        let letter = await Letter.findById(letterId);
        letter = letter._doc;
        const receiverId = letter.receiverId;
        const user = await User.findById(receiverId, {
          name: 1,
          image: 1,
          deactivated: 1,
          _id: 0,
        });
        let dataPoint = {
          ...letter,
          name: user.name,
          image: user.image,
          deactivated: user.deactivated,
        };
        lettersSend = [...lettersSend, dataPoint];
        console.log(lettersSend);
      }
      return res.status(StatusCodes.OK).json({ lettersSend });
    } else if (key === 'received') {
      let giftsReceived = user.giftsReceived;
      giftsReceived = giftsReceived.slice(
        (batch - 1) * batchSize,
        batch * batchSize
      );
      const l2 = giftsReceived.length;
      let lettersReceived = [];
      for (let j = 0; j < l2; j++) {
        const letterId = giftsReceived[j];
        let letter = await Letter.findById(letterId);
        letter = letter._doc;
        const senderId = letter.senderId;
        const user = await User.findById(senderId, {
          name: 1,
          image: 1,
          deactivated: 1,
          _id: 0,
        });
        let dataPoint = {
          ...letter,
          name: user.name,
          image: user.image,
          deactivated: user.deactivated,
        };
        lettersReceived = [...lettersReceived, dataPoint];
      }
      return res.status(StatusCodes.OK).json({ lettersReceived });
    }
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 5
const blockUser = async (req, res) => {
  const { id, bookingId, anonymity } = req.body;
  if (req.user.role === 'user') {
    try {
      const dataPoint = { id, bookingId, anonymity };
      let user = await User.findById(req.user.id);
      user.blockList = [dataPoint, ...user.blockList];
      user.save();
      if (bookingId) {
        let letter = await Letter.findOne({ bookingId });
        letter.status = 'blocked';
        letter.save();
      }
      return res.status(StatusCodes.OK).send('User successfully blocked.');
    } catch (error) {
      console.error(error);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    }
  } else {
    return res.status(StatusCodes.OK).send('Unauthorized access.');
  }
};

//Controller 6
const getBlockedusers = async (req, res) => {
  if (req.user.role === 'user') {
    try {
      const user = await User.findById(req.user.id, { blockList: 1, _id: 0 });
      let blockList = user.blockList;
      let len = blockList.length;
      let finalData = [];
      for (let i = 0; i < len; i++) {
        let id = blockList[i].id;
        let details = await User.findById(id, { name: 1, image: 1 });
        details = details._doc;
        const dataPoint = {
          ...details,
          anonymity: blockList[i].anonymity,
          bookingId: blockList[i].bookingId,
        };
        finalData = [dataPoint, ...finalData];
      }
      return res.status(StatusCodes.OK).json(finalData);
    } catch (error) {
      console.error(error);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    }
  } else {
    return res.status(StatusCodes.OK).send('Unauthorized access.');
  }
};

//Controller 7
const unblockUser = async (req, res) => {
  const { id, bookingId } = req.body;
  if (req.user.role === 'user') {
    try {
      let user = await User.findById(req.user.id);
      user.blockList = user.blockList.filter((element) => element.id !== id);
      user.save();
      if (bookingId) {
        let letter = await Letter.findOne({ bookingId });
        letter.status = 'received';
        letter.save();
      }
      return res.status(StatusCodes.OK).send('User successfully unblocked.');
    } catch (error) {
      console.error(error);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    }
  } else {
    return res.status(StatusCodes.OK).send('Unauthorized access.');
  }
};

//Controller 8
const markAsExpired = async (req, res) => {
  const { letterId, lockerId } = req.body;
  if (req.user.role === 'admin') {
    let letter = await Letter.findOne({ bookingId: letterId, lockerId });
    letter.status = 'expired';
    letter.save();
    return res
      .status(StatusCodes.OK)
      .send('Letter successfully marked as expired.');
  } else {
    return res.status(StatusCodes.OK).send('Unauthorized access.');
  }
};

module.exports = {
  bookALetter,
  setInLocker,
  receiveLetter,
  getAllLetters,
  blockUser,
  getBlockedusers,
  unblockUser,
  markAsExpired,
};
