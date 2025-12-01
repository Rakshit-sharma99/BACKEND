const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/chatControllers');

router.post('/createNewChatRoom', createNewChatRoom);
router.get('/getAllChatRooms', getAllChatRooms);
router.get('/markAsUnread', markAsUnread);
router.get('/markAsRead', markAsRead);
router.get('/getUnreadRooms', getUnreadRooms);
router.get('/checkBlockage', checkBlockage);
router.post("/storeMetadata",metaDataChatRoom);
router.post("/isOnline",isOnline);
router.post("/gotOffline",gotOffline);
router.post("/acceptMessage",acceptMessage);
router.post("/declineMessage",declineMessage);

module.exports = router;
