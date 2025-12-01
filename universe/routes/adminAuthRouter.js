const express = require('express');
const router = express.Router();

const {
  registerAdmin,
  loginAdmin,
  regenerateAccessToken,
  setOtp,
  setNewPassword,
} = require('../controllers/adminAuthControllers');

router.post('/register', registerAdmin);
router.post('/login', loginAdmin);
router.post(
  '/regenerateAccessToken-72f8c571-2a36-11ec-8d3d-0242ac130003',
  regenerateAccessToken
);
router.post('/setOtp', setOtp);
router.post('/setNewPassword', setNewPassword);

module.exports = router;
