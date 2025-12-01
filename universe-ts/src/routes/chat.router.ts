import { Router } from 'express';
import {
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
} from '../controllers/chat.controller';

const router: Router = Router();

router.route('/').post(createNewChatRoom);

router.get('/get-all-chat-rooms', getAllChatRooms);
router.get('/get-unread-rooms', getUnreadRooms);
router.get('/check-blockage', checkBlockage);
router.get('/online', isOnline);
router.put('/metadata', metaDataChatRoom);
router.patch('/mark-unread', markAsUnread);
router.patch('/mark-read', markAsRead);
router.patch('/offline', gotOffline);
router.patch('/accept', acceptMessage);
router.delete('/decline', declineMessage);
router.delete('/:doc_id', deleteChatRoom);

export default router;
