const express = require("express");
const multer = require("multer");
const { uploadFiles, submitEventRegistration, registerEsportsEvent, registerTechnicalEvent, storeVerifiedTicket, checkTicketVerification } = require("../controllers/eventRegistration");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.array("files", 2), uploadFiles);
router.post("/submit", submitEventRegistration);
router.post("/register-esports", registerEsportsEvent);
router.post("/register-technical", registerTechnicalEvent);
router.post("/verify", storeVerifiedTicket);
router.get("/check/:ticketId", checkTicketVerification);

module.exports = router;