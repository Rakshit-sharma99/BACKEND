const { StatusCodes } = require("http-status-codes");
const docusign = require("../config/docusign");
const crypto = require("crypto");
const { uploadMOUToS3 } = require("../config/s3");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const MOU = require("../models/mou");

// POST /mou/api/v1/webhook/docusign
const handleDocuSignWebhook = async (req, res) => {
  try {
    // 1. Verify HMAC Signature
    const signature = req.headers['x-docusign-signature-1'];
    const hmacSecret = process.env.DOCUSIGN_WEBHOOK_SECRET;

    if (signature && hmacSecret) {
      const hmac = crypto.createHmac('sha256', hmacSecret);
      hmac.update(JSON.stringify(req.body));
      const calculatedHash = hmac.digest('base64');
      
      if (calculatedHash !== signature) {
        console.warn("Invalid DocuSign webhook signature");
        return res.status(StatusCodes.UNAUTHORIZED).send("Invalid signature");
      }
    }

    const payload = req.body;
    
    // We are looking for envelope-completed events
    if (payload.event === "envelope-completed") {
       const envelopeId = payload.data.envelopeId;
       
       const mou = await MOU.findOne({ "docusign.envelopeId": envelopeId });
       if (!mou) {
          console.warn(`MOU not found for envelope ${envelopeId}`);
          return res.status(StatusCodes.OK).send();
       }

       if (mou.status === "signed") {
          return res.status(StatusCodes.OK).send(); // Already processed
       }

       mou.status = "signed";
       mou.signedAt = new Date();
       mou.history.push({
         action: "signed",
         actorRole: "docusign",
         timestamp: new Date()
       });

       // Download the completed PDF and upload to S3
       try {
           const pdfBuffer = await docusign.getSignedDocument(envelopeId);
           const s3Key = `mou/${mou.eventId}_${Date.now()}.pdf`;
           await uploadMOUToS3(pdfBuffer, s3Key);
           mou.docusign.documentS3Key = s3Key;
       } catch(s3Err) {
           console.error("Error uploading to S3, will proceed anyway", s3Err);
       }

       await mou.save();

       // notify event service
       try {
           const internalToken = jwt.sign(
               { role: "internal", service: "mou" },
               process.env.ACCESS_TOKEN_SECRET,
               { expiresIn: "5m" }
           );
           
           // Assuming event service is at http://event:5060 (from docker-compose)
           await axios.patch("http://event:5060/event/api/v1/internal/mou-status", {
               eventId: mou.eventId,
               mouStatus: "signed",
               mouId: mou._id
           }, {
               headers: {
                   Authorization: `Bearer ${internalToken}`
               }
           });
           console.log(`📡 Event service notified about MOU signed for event ${mou.eventId}`);
       } catch(notifyErr) {
           console.error("Error notifying event service about MOU signed", notifyErr);
       }

       console.log(`✅ MOU ${mou._id} marked as signed from webhook`);
    } else if (payload.event === "envelope-voided" || payload.event === "envelope-declined") {
       const envelopeId = payload.data.envelopeId;
       const mou = await MOU.findOne({ "docusign.envelopeId": envelopeId });
       if (mou) {
           mou.status = payload.event === "envelope-declined" ? "declined" : "voided";
           mou.history.push({
             action: mou.status,
             actorRole: "docusign",
             timestamp: new Date()
           });
           await mou.save();
           console.log(`🚫 MOU ${mou._id} marked as ${mou.status} from webhook`);
       }
    }

    res.status(StatusCodes.OK).send("Acknowledged");
  } catch (error) {
    console.error("Error handling DocuSign webhook", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Error processing webhook");
  }
};

module.exports = {
    handleDocuSignWebhook
};
