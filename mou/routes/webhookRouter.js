const express = require("express");
const router = express.Router();

const {
  handleDocuSignWebhook
} = require("../controllers/webhookControllers");

router.post("/docusign", handleDocuSignWebhook);

module.exports = router;
