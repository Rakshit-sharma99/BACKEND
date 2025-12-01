const express = require('express');
const router = express.Router();
const { verifyToken } = require('../controllers/frontendControllers');

router.route('/verifyToken').get(verifyToken);

module.exports = router;
