const jwt = require("jsonwebtoken");
const axios = require("axios");
const AWS = require("aws-sdk");
const { getMessaging } = require("firebase-admin/messaging");
const path = require("path");
const stream = require("stream");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_AWS_SECRET_ACCESS_KEY,
  region: process.env.S3_AWS_REGION,
});

const logoPath = path.resolve(__dirname, "../assets/logo_1024x1024.png");
const graffitiPath = path.resolve(__dirname, "../assets/graffit.jpeg");

const services = {
  universe: "universe:5050",
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "ticket",
      role: "internal",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
};

const fetchEventData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const eventData = await axios.post(
      "http://event:5060/event/api/v1/getEventFieldsById",
      query,
      config
    );
    return eventData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchLayoutById = async (layoutId) => {
  try {
    if (!layoutId) {
      return null;
    }

    const config = generateServiceToken();
    const response = await axios.get(
      `http://universe:5050/universe/api/v1/layout/getLayoutById?layoutId=${layoutId}`,
      config
    );

    return response.data.data || null;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const verifyTicketPurchaseAccess = async ({
  eventId,
  ticketType,
  privateCode,
  uid,
  userId,
}) => {
  try {
    if (!eventId || !ticketType || !userId) {
      return {
        success: false,
        canBuy: false,
        message: "Missing eventId, ticketType or userId",
      };
    }

    const config = generateServiceToken();
    const response = await axios.post(
      "http://event:5060/event/api/v1/canBuyTicket",
      {
        eventId,
        ticketType,
        privateCode,
        uid,
        userId,
      },
      config
    );

    return response.data;
  } catch (error) {
    return (
      error.response?.data || {
        success: false,
        canBuy: false,
        message: "Unable to verify ticket access",
      }
    );
  }
};

const fetchUserData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const userData = await axios.post(
      "http://universe:5050/universe/api/v1/user/getUserFieldsById",
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchNativeClubData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0 ||
      !query.callSign
    ) {
      return;
    }
    const service = services[query.callSign];
    const config = generateServiceToken();
    if (!service) return;
    const clubData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/club/getClubFieldsById`,
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const scheduleNotification = (pushTokens, title, body, image) => {
  if (!Array.isArray(pushTokens) || !title || !body) {
    console.log("Missing title, body, or pushTokens array!");
    return;
  }

  const fireTime = new Date(Date.now() + 3 * 1000); // 3 seconds delay

  // schedule.scheduleJob(`notification_${Date.now()}`, fireTime, () => {
  //   pushTokens.forEach((token) => {
  //     if (!token || token === "undefined" || token.length < 10) {
  //       return;
  //     }

  //     const message = {
  //       notification: {
  //         title,
  //         body,
  //       },
  //       android: {
  //         notification: {
  //           imageUrl: image,
  //         },
  //       },
  //       apns: {
  //         payload: {
  //           aps: {
  //             alert: {
  //               title,
  //               body,
  //             },
  //             sound: "default",
  //             "mutable-content": 1,
  //           },
  //         },
  //         fcm_options: {
  //           image,
  //         },
  //       },
  //       data: {
  //         url: typeof image === "string" ? image : JSON.stringify(image ?? ""),
  //       },
  //       token: token,
  //     };

  //     getMessaging()
  //       .send(message)
  //       .then((response) => {
  //         console.log("✅ Successfully sent message:", response);
  //       })
  //       .catch((error) => {
  //         console.error("❌ Error sending message:", error);
  //       });
  //   });
  // });
};

const getUserMetaMap = async (userIds, fields) => {
  try {
    if (!Array.isArray(userIds) || !Array.isArray(fields)) {
      return;
    }
    const config = generateServiceToken();
    const { data } = await axios.post(
      "http://universe:5050/universe/api/v1/user/fetchBulkUsers",
      {
        userIds,
        fields,
      },
      config
    );

    return data.reduce((acc, user) => {
      acc[user._id] = user;
      return acc;
    }, {});
  } catch (err) {
    console.error("❌ Failed to fetch user metadata:", err.message);
    return {};
  }
};

const fetchItineraries = async (query) => {
  try {
    if (!Array.isArray(query.itineraryIds) || query.itineraryIds.length === 0) {
      return [];
    }
    const config = generateServiceToken();
    const itineraryData = await axios.post(
      `http://itinerary:6050/itinerary/api/v1/getItinerariesByIds`,
      query,
      config
    );
    return itineraryData.data.itineraries;
  } catch (error) {
    console.log(error);
  }
};

const fetchItinerary = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const itineraryData = await axios.post(
      `http://itinerary:6050/itinerary/api/v1/getItineraryFieldsById`,
      query,
      config
    );
    return itineraryData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const sendMail = async (
  name,
  intro,
  outro,
  subject,
  destination,
  action,
  emailHTML
) => {
  const mailGenerator = new Mailgen({
    theme: "cerberus",
    product: {
      name: "Macbease Team",
      link: "https://macbease.com/",
      logo: "https://mailgen.js/img/logo.png",
    },
  });

  const email = {
    body: {
      name: name,
      intro: intro,
      action: action
        ? {
          instructions:
            action.instructions || "Click the button below to proceed:",
          button: {
            color: action.color || "#1ea1ed",
            text: action.text || "View Details",
            link: action.url,
          },
        }
        : undefined,
      outro: outro,
    },
  };

  if (!Array.isArray(destination)) {
    destination = [destination];
  }

  const emailBody = emailHTML ? emailHTML : mailGenerator.generate(email);

  const params = {
    Source: '"Macbease" <support@macbease.com>',
    Destination: {
      ToAddresses: ["support@macbease.com"],
      BccAddresses: destination,
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: emailBody,
        },
      },
    },
  };

  AWS.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const ses = new AWS.SES();
  return { ses, params };
};

const scheduleNotification2 = ({ pushToken, title, body, image, url }) => {
  if (!title || !body || !pushToken) {
    console.log("Title,body or push token missing!");
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
    pushToken.forEach((token) => {
      if (
        typeof token !== "string" ||
        token.length <= 80 ||
        token === "undefined"
      ) {
        return;
      }

      const message = {
        notification: {
          title: title,
          body: body,
        },
        android: {
          notification: {
            imageUrl: image,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: title,
                body: body,
              },
              sound: "default",
              "mutable-content": 1,
            },
          },
          fcm_options: {
            image: image,
          },
        },
        data: {
          url: url,
        },
        token: token,
      };
      getMessaging()
        .send(message)
        .then((response) => {
          console.log("Successfully sent message:", response);
        })
        .catch((error) => {
          console.log("Error sending message:", error);
        });
    });
  });
};

function getFullDateInString(str) {
  const date = new Date(str);
  const formattedDate = date
    .toLocaleDateString("en-GB", {
      weekday: "short", // "Sun"
      day: "numeric", // "9"
      month: "short", // "Feb"
    })
    .replace(",", "");

  return formattedDate;
}

function getYear(str) {
  const date = new Date(str);
  const year = date.getFullYear();
  return year;
}

const formatEventDateRange = (start, end) => {
  const startDate = getFullDateInString(start);
  const endDate = getFullDateInString(end);
  const year = getYear(start);

  return `${startDate}${endDate !== startDate ? ` - ${endDate}` : ""} ${year}`;
};

const formatTimeStamp = (str, notShowDate) => {
  const date = new Date(str);
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  if (notShowDate) {
    return `${time}`;
  }
  return `${day} ${month} ${time}`;
};

const generateSingleTicketPDFAndUpload = async (ticket) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Fetch event banner image
      let imageBuffer = null;
      if (ticket.imageUrl) {
        try {
          let fetchUrl = ticket.imageUrl;
          if (!fetchUrl.startsWith('http')) {
            // Encode the S3 key properly to handle characters like '+' which cause 403 Forbidden
            const encodedKey = encodeURIComponent(fetchUrl).replace(/%2F/g, '/');
            fetchUrl = `${process.env.S3_OBJECT_URL}${encodedKey}`;
          }
          // Fetch with a 5-second timeout. If the image is 37MB+, it will timeout,
          // preventing the API from hanging and generating a 37MB PDF file.
          const response = await axios.get(fetchUrl, { 
            responseType: 'arraybuffer',
            timeout: 5000 
          });
          imageBuffer = Buffer.from(response.data);
        } catch (e) {
          console.error("Failed to fetch event image for PDF:", e.message);
        }
      }

      // A5 size is approximately 420 x 595 points
      const a5Width = 420;
      const a5Height = 595;
      const doc = new PDFDocument({ margin: 0, size: "A5" });
      const passThroughStream = new stream.PassThrough();

      const fileKey = `tickets/${ticket.eventName.replace(
        /\s+/g,
        "_"
      )}-${uuidv4()}.pdf`;

      const uploadParams = {
        Bucket: process.env.S3_BUCKET,
        Key: fileKey,
        Body: passThroughStream,
        ContentType: "application/pdf",
      };

      s3.upload(uploadParams, (err) => {
        if (err) reject(err);
        else resolve(`${process.env.S3_OBJECT_URL}${fileKey}`);
      });

      doc.pipe(passThroughStream);

      // ========================
      // 🎨 Layout Design
      // ========================

      // Background color for the whole page (light gray/off-white) to match mobile background
      doc.rect(0, 0, a5Width, a5Height).fill('#f7f8fa');

      // Ticket Card background
      const cardX = 30;
      const cardY = 40;
      const cardWidth = 360;
      const cardHeight = 500;
      const borderRadius = 12;

      // Draw subtle drop shadow manually
      doc.roundedRect(cardX + 2, cardY + 2, cardWidth, cardHeight, borderRadius).fill('#eaeaeb');
      
      // Draw main card
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, borderRadius).fill('#ffffff');

      // Add Macbease Logo Watermark inside the card
      if (logoPath) {
        doc.save();
        // Clip to card boundaries so watermark doesn't spill over
        doc.roundedRect(cardX, cardY, cardWidth, cardHeight, borderRadius).clip();
        const wmSize = 250;
        const wmX = cardX + (cardWidth - wmSize) / 2;
        const wmY = cardY + (cardHeight - wmSize) / 2 - 20;
        doc.opacity(0.06);
        try {
          doc.image(logoPath, wmX, wmY, { width: wmSize });
        } catch (e) {
          console.error("Watermark failed:", e.message);
        }
        doc.restore();
      }

      // Card content padding
      const padding = 20;
      const startX = cardX + padding;
      const startY = cardY + padding;

      // 1. Event Image (Top Left)
      const imgWidth = 140;
      const imgHeight = 90;
      if (imageBuffer) {
        doc.save();
        doc.roundedRect(startX, startY, imgWidth, imgHeight, 8).clip();
        try {
          doc.image(imageBuffer, startX, startY, { width: imgWidth, height: imgHeight, cover: [imgWidth, imgHeight] });
        } catch(e) {
          // Fallback if image format is unsupported by PDFKit (e.g. webp)
          doc.roundedRect(startX, startY, imgWidth, imgHeight, 8).fill('#eeeeee');
        }
        doc.restore();
      } else {
        // Placeholder gray box
        doc.roundedRect(startX, startY, imgWidth, imgHeight, 8).fill('#eeeeee');
      }

      // 2. Event Info (Top Right)
      const infoX = startX + imgWidth + 15;
      const infoWidth = cardWidth - (imgWidth + 15 + padding * 2);

      doc.font('Helvetica-Bold').fontSize(16).fillColor('#111111')
         .text(ticket.eventName, infoX, startY, { width: infoWidth, align: 'left' });

      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(10).fillColor('#777777')
         .text("Organized By", { width: infoWidth, align: 'left' });
      
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111')
         .text(ticket.organizer, { width: infoWidth, align: 'left' });

      // 3. Middle Section: 2x2 Grid
      const gridY = startY + imgHeight + 30;
      const col1X = startX;
      const col2X = startX + (cardWidth - padding * 2) / 2 + 10;

      const drawGridItem = (label, value, x, y) => {
        doc.font('Helvetica').fontSize(10).fillColor('#777777').text(label, x, y);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(value, x, y + 15);
      };

      // Row 1
      drawGridItem("Date", ticket.date, col1X, gridY);
      drawGridItem("Time", ticket.time, col2X, gridY);

      // Row 2
      const gridY2 = gridY + 45;
      drawGridItem("Type", ticket.type, col1X, gridY2);
      drawGridItem("Venue", ticket.venue, col2X, gridY2);

      // 4. Divider Line (Perforated)
      const dividerY = gridY2 + 50;
      const circleRadius = 12;
      
      // Semicircles (cutouts) on left and right
      doc.save();
      // Left Cutout
      doc.moveTo(cardX, dividerY - circleRadius)
         .path(`M ${cardX},${dividerY - circleRadius} A ${circleRadius},${circleRadius} 0 0,1 ${cardX},${dividerY + circleRadius}`)
         .fill('#f7f8fa');
      
      // Right Cutout
      doc.moveTo(cardX + cardWidth, dividerY - circleRadius)
         .path(`M ${cardX + cardWidth},${dividerY - circleRadius} A ${circleRadius},${circleRadius} 0 0,0 ${cardX + cardWidth},${dividerY + circleRadius}`)
         .fill('#f7f8fa');
      doc.restore();

      // Dashed line
      doc.save();
      doc.moveTo(cardX + circleRadius + 5, dividerY)
         .lineTo(cardX + cardWidth - circleRadius - 5, dividerY)
         .strokeColor('#dddddd')
         .dash(4, { space: 4 })
         .stroke();
      doc.undash();
      doc.restore();

      // 5. QR Code Section (Centered)
      const qrSize = 160;
      const qrY = dividerY + 30;
      const qrX = cardX + (cardWidth - qrSize) / 2;

      try {
        const qrDataUrl = await QRCode.toDataURL(ticket.id, { margin: 1 });
        doc.image(qrDataUrl, qrX, qrY, { width: qrSize });
      } catch (err) {
        console.error("Failed to generate QR code:", err);
      }

      // 6. Ticket ID at the bottom
      const idY = qrY + qrSize + 20;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111')
         .text(`TICKET ID - ${ticket.id}`, cardX, idY, { width: cardWidth, align: 'center' });

      // 7. Terms & Conditions
      const tcY = idY + 25;
      doc.font('Helvetica').fontSize(8).fillColor('#888888')
         .text("Terms & Conditions: This ticket is non-transferable. A valid ID may be required for entry.", cardX + padding, tcY, { width: cardWidth - padding * 2, align: 'center' });
      doc.text("Macbease and the organizer reserve the right to deny entry.", { width: cardWidth - padding * 2, align: 'center' });

      doc.end();
    } catch (fatalErr) {
      console.error("Fatal error generating PDF:", fatalErr);
      reject(fatalErr);
    }
  });
};

module.exports = {
  fetchLayoutById,
  fetchEventData,
  verifyTicketPurchaseAccess,
  fetchUserData,
  fetchNativeClubData,
  scheduleNotification,
  getUserMetaMap,
  fetchItineraries,
  fetchItinerary,
  sendMail,
  scheduleNotification2,
  formatEventDateRange,
  formatTimeStamp,
  generateSingleTicketPDFAndUpload
};
