const express = require('express');
const router = express.Router();

const {
  bookALetter,
  setInLocker,
  receiveLetter,
  getAllLetters,
  blockUser,
  getBlockedusers,
  unblockUser,
  markAsExpired,
} = require('../controllers/letterControllers');

router.post('/bookALetter', bookALetter);
router.post('/setInLocker', setInLocker);
router.post('/receiveLetter', receiveLetter);
router.get('/getAllLetters', getAllLetters);
router.post('/blockUser', blockUser);
router.get('/getBlockedUsers', getBlockedusers);
router.post('/unblockuser', unblockUser);
router.post('/markAsExpired', markAsExpired);

module.exports = router;
