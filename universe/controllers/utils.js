const Mailgen = require("mailgen");
const AWS = require("aws-sdk");
const { getMessaging } = require("firebase-admin/messaging");
const schedule = require("node-schedule");
const moment = require("moment-timezone");
const User = require("../models/user");
const Admin = require("../models/admin");
const kafka = require("../config/kafka_producer");
const { io } = require("../app");
const { default: mongoose } = require("mongoose");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const PDFDocument = require("pdfkit");
const { v4: uuidv4 } = require("uuid");
const stream = require("stream");
const path = require("path");
const Club = require("../models/club");
const logoPath = path.resolve(__dirname, "../assets/logo_1024x1024.png");

function getCurrentISTDate() {
  const istDate = moment().tz("Asia/Kolkata");
  return istDate.format("YYYY-MM-DD HH:mm:ss");
}

const sendMail = async (
  name,
  intro,
  outro,
  subject,
  destination,
  action,
  emailHTML,
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

const scheduleNotification = (pushTokens, title, body, image) => {
  if (!Array.isArray(pushTokens) || !title || !body) {
    console.log("Missing title, body, or pushTokens array!");
    return;
  }

  const fireTime = new Date(Date.now() + 3 * 1000); // 3 seconds delay

  schedule.scheduleJob(`notification_${Date.now()}`, fireTime, () => {
    pushTokens.forEach((token) => {
      if (!token || token === "undefined" || token.length < 10) {
        return;
      }

      const message = {
        notification: {
          title,
          body,
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
                title,
                body,
              },
              sound: "default",
              "mutable-content": 1,
            },
          },
          fcm_options: {
            image,
          },
        },
        data: {
          url: typeof image === "string" ? image : JSON.stringify(image ?? ""),
        },
        token: token,
      };

      getMessaging()
        .send(message)
        .then((response) => {
          console.log("✅ Successfully sent message:", response);
        })
        .catch((error) => {
          console.error("❌ Error sending message:", error);
        });
    });
  });
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

const updateDynamicIsland = async (ids, id, metaDataKey, increase) => {
  try {
    const users = await User.find({ _id: { $in: ids } }, { shortCuts: 1 });
    const bulkOps = users.map((user) => {
      const updatedShortcuts = user.shortCuts.map((item) => {
        if (item.id.toString() === id) {
          const obj = { ...item };
          if (!obj.metaData) {
            if (item.type === "club") {
              obj.metaData = { posts: 0, messages: 0, notifications: 0 };
            } else if (item.type === "community") {
              obj.metaData = { posts: 0, notifications: 0 };
            } else if (item.type === "people") {
              obj.metaData = { messages: 0 };
            }
          }
          if (increase) {
            obj.metaData[metaDataKey] = (obj.metaData[metaDataKey] || 0) + 1;
          } else {
            obj.metaData[metaDataKey] = 0;
          }
          return obj;
        }
        return item;
      });
      return {
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { shortCuts: updatedShortcuts } },
        },
      };
    });
    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }
    console.log("Successfully populated dynamic island~");
  } catch (error) {
    console.log(error);
  }
};

const generateUri = async (url) => {
  const URLa = "https://d5e1vvp3vh274.cloudfront.net/";
  const bucket = "s3userdata25136-dev";
  const UriRequest = JSON.stringify({
    bucket,
    key: url,
    edits: {
      resize: {
        width: 500,
        height: 500,
      },
    },
  });
  const encoded = Buffer.from(UriRequest).toString("base64");
  return URLa + encoded;
};

const pingAdmins = async ({ role, ids, pingLevel, notification, email }) => {
  try {
    const targetAdmins = role
      ? await Admin.find(
        { role },
        { _id: 1, email: 1, pushToken: 1, unreadNotice: 1 },
      )
      : await Admin.aggregate([
        { $match: { _id: { $in: ids } } },
        { $project: { _id: 1, email: 1, pushToken: 1, unreadNotice: 1 } },
      ]);
    const targetPushTokens = targetAdmins
      .map((item) => item.pushToken)
      .filter((token) => token);
    if (notification?.title && notification?.body) {
      const notificationPayload = {
        pushToken: targetPushTokens,
        title: notification.title,
        body: notification.body,
        ...(notification.url && { url: notification.url }),
      };
      notification.url
        ? scheduleNotification2(notificationPayload)
        : scheduleNotification(
          notificationPayload.pushToken,
          notificationPayload.title,
          notificationPayload.body,
        );
    }
    if (pingLevel === 1 || pingLevel === 2) {
      const notice = {
        value: notification.body,
        img1: notification?.img1,
        img2: notification?.img2,
        key: notification?.key,
        action: notification?.action,
        params: notification?.params,
        time: new Date(),
        uid: `${new Date().toISOString()}`,
      };
      const updateOps = targetAdmins.map((admin) => ({
        updateOne: {
          filter: { _id: admin._id },
          update: {
            $push: { unreadNotice: { $each: [notice], $position: 0 } },
          },
        },
      }));
      await Admin.bulkWrite(updateOps);
    }
    if (pingLevel === 2) {
      const targetMailIds = targetAdmins.map((item) => item.email);
      if (targetMailIds.length > 0) {
        const { ses, params } = await sendMail(
          `${role ? role : "Macbease Admin"}`,
          email.intro,
          email.outro,
          email.subject,
          targetMailIds,
          email?.action,
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          }
        });
      }
    }
  } catch (error) {
    console.log(error);
  }
};

const pingUsers = async ({ role, ids, pingLevel, notification, email }) => {
  try {
    let processedIds = [];
    if (ids) {
      processedIds = ids.map((id) => mongoose.Types.ObjectId(id));
    }
    const targetUsers = role
      ? await User.find(
        { role },
        { _id: 1, email: 1, pushToken: 1, unreadNotice: 1 },
      )
      : await User.aggregate([
        { $match: { _id: { $in: processedIds } } },
        { $project: { _id: 1, email: 1, pushToken: 1, unreadNotice: 1 } },
      ]);
    const targetPushTokens = targetUsers
      .map((item) => item.pushToken)
      .filter((token) => token);
    if (notification?.title && notification?.body) {
      const notificationPayload = {
        pushToken: targetPushTokens,
        title: notification.title,
        body: notification.body,
        ...(notification.url && { url: notification.url }),
      };
      notification.url
        ? scheduleNotification2(notificationPayload)
        : scheduleNotification(
          notificationPayload.pushToken,
          notificationPayload.title,
          notificationPayload.body,
        );
    }
    if (pingLevel === 1 || pingLevel === 2) {
      const notice = {
        value: notification.body,
        img1: notification?.img1,
        img2: notification?.img2,
        key: notification?.key,
        action: notification?.action,
        params: notification?.params,
        time: new Date(),
        uid: `${new Date().toISOString()}`,
      };
      const updateOps = targetUsers.map((user) => ({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $push: { unreadNotice: { $each: [notice], $position: 0 } },
          },
        },
      }));
      await User.bulkWrite(updateOps);
    }
    if (pingLevel === 2) {
      const targetMailIds = targetUsers.map((item) => item.email);
      if (targetMailIds.length > 0) {
        const { ses, params } = await sendMail(
          email.name,
          email.intro,
          email.outro,
          email.subject,
          targetMailIds,
          email?.action,
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          }
        });
      }
    }
  } catch (error) {
    console.log(error);
  }
};

// Function to add Project chatroom to user's chatroom. (Called when the users are alloted to particular project)
const allotProjectChatroom = async (userIds, projectId) => {
  try {
    const chatDoc = {
      doc_id: projectId,
      state: "unread",
    };

    await User.updateMany(
      { _id: { $in: userIds } },
      { $addToSet: { chatRooms: chatDoc } },
    );

    console.log("Successfully added chatRoom.");
  } catch (error) {
    console.log("Error while alloting chatroom to users:", error);
  }
};

//Function to update IP of the user
const updateUserIP = async ({
  userId,
  ipChange,
  c_source,
  d_source,
  c_ref,
  d_ref,
  description,
  noEmissions,
}) => {
  try {
    if (!userId || !ipChange || !c_source || !d_source) {
      throw new Error("Missing required fields");
    }

    const user = await User.findById(userId, { ip: 1 });
    if (!user) {
      throw new Error("User not found");
    }

    user.ip += ipChange;
    await user.save();

    if (!noEmissions) {
      io.emit(`ipUpdated_${userId}`, {
        ipChange,
        description,
        totalIp: user.ip,
      });
    }

    const logEvent = {
      c_source,
      d_source,
      c_ref,
      d_ref,
      description,
      ip: ipChange,
      status: 1,
      timestamp: new Date(),
    };

    if (kafka.producer) {
      await kafka.producer.send({
        topic: "ip-transaction-log",
        messages: [{ value: JSON.stringify(logEvent) }],
      });
    } else {
      console.error("Kafka producer is not connected.");
    }
  } catch (error) {
    console.error("Error updating IP:", error);
    throw error; // Let `availOffer` handle the error
  }
};

const fieldsEnum = [
  "Animation and Design",
  "Arts, Humanities, and Social Sciences",
  "Commerce",
  "Computer Applications and IT",
  "Education",
  "Engineering and Architecture",
  "Hospitality and Tourism",
  "Law",
  "Management and Business Administration",
  "Media, Mass Communication, and Journalism",
  "Medicine and Allied Sciences",
  "Pharmacy",
  "Sciences",
  "Agriculture",
  "Startup",
];

const levelEnum = ["UG", "PG", "PhD"];

const generateEmailReportHtml = ({
  event,
  totalRevenue,
  ticketsSold,
  revenueRows,
  reportURL,
}) => {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Event Summary: ${event.name}</title>
      <style>
        /* Reset styles for email clients */
        body, html {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Arial, sans-serif;
          line-height: 1.6;
          color: #333333;
          background-color: #f5f7fa;
        }
        
        /* Wrapper for Outlook */
        .wrapper {
          width: 100%;
          table-layout: fixed;
          background-color: #f5f7fa;
          padding-bottom: 40px;
        }
        
        /* Main container */
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        
        /* Header styles */
        .header {
          background-color: #1a1a2e;
          color: #ffffff;
          padding: 30px 20px;
          text-align: center;
          margin-top: 12px;
          border-top-left-radius: 12px;
          border-top-right-radius: 12px;
        }
        
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        /* Content styles */
        .content {
          padding: 30px 20px;
        }
        
        /* Summary box */
        .summary-box {
          display: flex;
          flex-wrap: wrap;
          margin: 20px 0;
          border: 1px solid #e1e5eb;
          border-radius: 6px;
          overflow: hidden;
        }
        
        .summary-item {
          flex: 1;
          min-width: 200px;
          padding: 20px;
          box-sizing: border-box;
          text-align: center;
          border-right: 1px solid #e1e5eb;
          border-bottom: 1px solid #e1e5eb;
        }
        
        .summary-item:nth-child(2n) {
          border-right: none;
        }
        
        .summary-item h3 {
          margin: 0;
          color: #666;
          font-size: 14px;
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .summary-item p {
          margin: 10px 0 0;
          font-size: 24px;
          font-weight: 600;
          color: #1a1a2e;
        }
        
        /* Stats table */
        .stats-section {
          margin: 30px 0;
        }
        
        .stats-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .stats-table th {
          background-color: #f5f7fa;
          color: #4a4a4a;
          font-weight: 600;
          padding: 12px;
          text-align: left;
          border-bottom: 2px solid #e1e5eb;
        }
        
        .stats-table td {
          padding: 12px;
          border-bottom: 1px solid #e1e5eb;
        }
        
        /* CTA button */
        .cta-button {
          display: inline-block;
          background-color: #4d61fc;
          color: #ffffff;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          font-weight: 600;
          margin: 20px 0;
        }
        
        /* Footer */
        .footer {
          background-color: #f5f7fa;
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 12px;
        }
        
        /* Mobile responsive */
        @media screen and (max-width: 600px) {
          .summary-item {
            flex: 100%;
            border-right: none;
          }
          
          .header h1 {
            font-size: 24px;
          }
          
          .stats-table {
            font-size: 14px;
          }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <!-- Header -->
          <div class="header">
            <h1>${event.name}</h1>
            <!-- <h2>Sales report</h2> -->
          </div>
          
          <!-- Content -->
          <div class="content">
            <p>Here's a summary of your event's performance:</p>
            
            <!-- Summary boxes -->
           <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #e1e5eb; border-radius: 6px; overflow: hidden;">
                <tr>
                  <td align="center" valign="top" style="padding: 20px; border-right: 1px solid #e1e5eb;">
                    <h3 style="margin: 0; color: #666; font-size: 14px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.5px;">Revenue Generated</h3>
                    <p style="margin: 10px 0 0; font-size: 24px; font-weight: 600; color: #1a1a2e;">₹${totalRevenue.toLocaleString()}</p>
                  </td>
                  <td align="center" valign="top" style="padding: 20px;">
                    <h3 style="margin: 0; color: #666; font-size: 14px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.5px;">Tickets Sold</h3>
                     <p style="margin: 10px 0 0; font-size: 24px; font-weight: 600; color: #1a1a2e;">${ticketsSold}</p>
                  </td>
                </tr>
              </table>
            
            <!-- Daily Stats -->
            <div class="stats-section">
              <h2>Daily Performance</h2>
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                ${revenueRows}
                </tbody>
              </table>
            </div>
            
            <!-- CTA -->
            <div style="text-align: center;">
              <a href=${reportURL} class="cta-button">Download Full Report</a>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="footer">
            <p>©️ 2025 Macbease. All rights reserved.</p>
            <p>This email was sent to you because you are the organizer of Spardha Literary Event.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
};

const generateTicketPDFAndUpload = async ({
  tickets,
  eventName,
  totalTicketsSold,
  totalRevenue,
  graphData,
  clubName,
}) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const passThroughStream = new stream.PassThrough();

    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    });

    const fileKey = `reports/${eventName.replace(/\s+/g, "_")}-${uuidv4()}.pdf`;

    const uploadParams = {
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: passThroughStream,
      ContentType: "application/pdf",
    };

    // Start upload
    s3.upload(uploadParams, (err, data) => {
      if (err) reject(err);
      else resolve(`${process.env.S3_OBJECT_URL}${fileKey}`);
    });

    // Pipe PDF to S3
    doc.pipe(passThroughStream);

    // Draw Header
    const logoSize = 50;
    doc
      .image(logoPath, 50, 40, { width: logoSize }) // placeholder image
      .fontSize(20)
      .fillColor("#1a1a1a")
      .text("Macbease", 110, 45)
      .fontSize(12)
      .fillColor("#555555")
      .text("Event Ticket Sales Report", 110, 70);

    doc.moveTo(40, 100).lineTo(555, 100).strokeColor("#cccccc").stroke();
    doc.moveDown(4);

    // Title
    doc.fontSize(18).text(`${eventName} - Ticket Sales Report`, {
      align: "center",
    });
    doc.moveDown();

    // Total tickets and revenue section
    doc
      .fontSize(14)
      .text(`Total Tickets Sold: ${totalTicketsSold}`, { align: "left" });
    doc.text(`Total Revenue Generated: INR ${totalRevenue.toLocaleString()}`, {
      align: "left",
    });
    doc.moveDown(2);

    // Display Summary Data
    doc.fontSize(14).text("Daily Sales:", { align: "left" });
    doc.moveDown(2);

    // Calculate maximum label width for alignment
    let maxLabelWidth = 0;
    graphData.forEach((item) => {
      const labelWidth = doc.widthOfString(item.label);
      if (labelWidth > maxLabelWidth) {
        maxLabelWidth = labelWidth;
      }
    });

    const salesX = 50;
    const valueX = 300;
    const valueWidth = 100;

    graphData.forEach((item, idx) => {
      const yPosition = doc.y + (idx > 0 ? 20 : 0);
      doc.text(item.label, salesX, yPosition, {
        width: maxLabelWidth,
        align: "left",
      });
      doc.text(`INR ${item.value.toLocaleString()}`, valueX, yPosition, {
        width: valueWidth,
        align: "right",
      });
    });
    doc.moveDown(2);

    // Table headers
    const headers = [
      { label: "Name", x: 50, width: 90 },
      { label: "Reg. No", x: 140, width: 90 },
      { label: "Course", x: 230, width: 50 },
      { label: "Type", x: 280, width: 50 },
      { label: "Amount", x: 330, width: 60 },
      { label: "Timestamp", x: 400, width: 150 },
    ];

    const startY = doc.y;
    const rowHeight = 60;

    // Draw table header
    doc.font("Helvetica-Bold").fontSize(11);
    headers.forEach((h) => {
      doc.text(h.label, h.x, startY, { width: h.width });
    });

    // Draw table rows
    doc.font("Helvetica").fontSize(10);
    let y = startY + rowHeight;

    tickets.forEach((t, i) => {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      const row = [
        t.userMetaData[0].name,
        t.userMetaData[0].reg,
        t.userMetaData[0].course,
        t.type,
        `INR ${t.amtPaid}`,
        new Date(t.generatedAt).toLocaleString(),
      ];

      row.forEach((text, idx) => {
        const { x, width } = headers[idx];
        doc.text(text, x, y, { width });
      });

      y += rowHeight;
    });

    // Add report creation timestamp and event manager
    const reportTimestamp = new Date().toLocaleString();
    doc.moveDown(2);
    doc
      .fontSize(10)
      .text(`Report Generated At: ${reportTimestamp}`, { align: "left" });
    if (clubName) {
      doc.text(`Reported To: ${clubName}`, { align: "left" });
    }

    doc.end(); // Finish writing
  });
};

const generateOfferPDFAndUpload = async ({
  offerName,
  offerDescription,
  couponCodes,
}) => {
  console.log(offerName, offerDescription, couponCodes);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const passThroughStream = new stream.PassThrough();

    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    });

    const fileKey = `offers/${offerName.replace(/\s+/g, "_")}-${uuidv4()}.pdf`;

    const uploadParams = {
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: passThroughStream,
      ContentType: "application/pdf",
    };

    // Upload PDF to S3
    s3.upload(uploadParams, (err, data) => {
      if (err) reject(err);
      else resolve(`${process.env.S3_OBJECT_URL}${fileKey}`);
    });

    doc.pipe(passThroughStream);

    // Header
    const logoSize = 50;
    doc
      .image(logoPath, 50, 40, { width: logoSize })
      .fontSize(20)
      .fillColor("#1a1a1a")
      .text("Macbease", 110, 45)
      .fontSize(12)
      .fillColor("#555555")
      .text("Offer Coupon Report", 110, 70);

    doc.moveTo(40, 100).lineTo(555, 100).strokeColor("#cccccc").stroke();
    doc.moveDown(3);

    // Offer Title and Description
    doc
      .fontSize(16)
      .fillColor("#000000")
      .text(`Offer: ${offerName}`, { align: "left" })
      .moveDown()
      .fontSize(12)
      .fillColor("#333333")
      .text(offerDescription, { align: "left" });

    doc.moveDown(2);

    // Coupon Code List
    doc
      .fontSize(14)
      .fillColor("#000000")
      .text("Coupon Codes:", { underline: true });
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#111111");

    couponCodes.forEach((code, index) => {
      doc.text(`${index + 1}. ${code}`, {
        indent: 20,
      });
    });

    doc.moveDown(2);

    // Footer Timestamp
    const reportTimestamp = new Date().toLocaleString();
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(`Report Generated At: ${reportTimestamp}`, { align: "left" });

    doc.end();
  });
};

const secondaryInvitationActions = async ({
  sentBy,
  sentTo,
  sentByModal,
  sentToModal,
  pingLevel,
  senderNotification,
  receiverNotification,
  senderEmail,
  receiverEmail,
}) => {
  try {
    let oneSec = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `${sentBy}_${sentTo}_${new Date().toISOString()}`,
      oneSec,
      async () => {
        // Helper function to fetch user/admin details
        const fetchUserOrAdmin = async (id, model) => {
          const fields = {
            unreadNotice: 1,
            name: 1,
            image: 1,
            pushToken: 1,
            email: 1,
          };
          return model === "User"
            ? await User.findById(id, fields)
            : await Admin.findById(id, fields);
        };

        const sender = await fetchUserOrAdmin(sentBy, sentByModal);
        const receiver = await fetchUserOrAdmin(sentTo, sentToModal);

        if (!sender || !receiver) {
          console.error("Sender or receiver not found.");
          return;
        }

        // Helper function to send notifications
        const sendNotification = (target, notificationPayload, model) => {
          if (!notificationPayload?.title || !notificationPayload?.body) return;

          const notificationData = {
            pushToken: [target.pushToken],
            title: notificationPayload.title,
            body: notificationPayload.body,
            ...(notificationPayload.url && { url: notificationPayload.url }),
          };

          if (model === "User") {
            notificationPayload.url
              ? scheduleNotification2(notificationData)
              : scheduleNotification(
                [target.pushToken],
                notificationData.title,
                notificationData.body,
              );
          } else {
            // Function to dispatch notification to admin
          }
        };

        // Send notifications
        sendNotification(sender, senderNotification, sentByModal);
        sendNotification(receiver, receiverNotification, sentToModal);

        // Handle pingLevel actions
        if (pingLevel === 1 || pingLevel === 2) {
          const createNotice = (title, img1, img2) => ({
            value: title,
            img1,
            img2,
            key: "read",
            time: new Date(),
            uid: `${new Date()}/${sender._id}/${receiver._id}`,
          });

          const noticeSender = createNotice(
            senderNotification?.title,
            receiver.image,
            sender.image,
          );
          const noticeReceiver = createNotice(
            receiverNotification?.title,
            sender.image,
            receiver.image,
          );

          sender.unreadNotice.unshift(noticeSender);
          receiver.unreadNotice.unshift(noticeReceiver);

          await Promise.all([sender.save(), receiver.save()]);
        }

        // Send emails if pingLevel is 2
        if (pingLevel === 2) {
          const sendEmailToUser = async (target, emailData) => {
            if (!emailData) return;
            const { ses, params } = await sendMail(
              `${target.name}`,
              emailData.intro,
              emailData.outro,
              emailData.subject,
              [target.email],
            );
            ses.sendEmail(params, (err) => {
              if (err) console.error(err, err.stack);
            });
          };

          await Promise.all([
            sendEmailToUser(sender, senderEmail),
            sendEmailToUser(receiver, receiverEmail),
          ]);
        }
      },
    );
  } catch (error) {
    console.error(error);
  }
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "universe",
      role: "internal",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
};

const fetchOrgData = async (query) => {
  try {
    const config = generateServiceToken();
    const orgData = await axios.post(
      "http://org:6080/org/api/v1/findOrg",
      query,
      config,
    );
    return orgData.data.org;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};

const createNewOrg = async (query) => {
  try {
    const config = generateServiceToken();
    const orgData = await axios.post(
      "http://org:6080/org/api/v1/createOrg",
      query,
      config,
    );
    return orgData.data.org;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};

const fetchContentFromIds = async (query) => {
  try {
    const config = generateServiceToken();
    const contents = await axios.post(
      "http://content:5000/content/api/v1/searchContentFromIds",
      query,
      config,
    );
    return contents.data;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};
const fetchMacbeaseContentFromIds = async (query) => {
  try {
    const config = generateServiceToken();
    const macbeaseContents = await axios.post(
      "http://macbeaseContent:5070/macbeaseContent/api/v1/getMacbeaseContentByIds",
      query,
      config,
    );
    return macbeaseContents.data;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};
const fetchItineraryFromIds = async (query) => {
  try {
    const config = generateServiceToken();
    const itineraries = await axios.post(
      "http://itinerary:6050/itinerary/api/v1/getItinerariesByIds",
      query,
      config,
    );
    return itineraries.data.itineraries;
  } catch (error) {
    console.log(error);
    return null;
  }
};
const fetchInvitationById = async (query) => {
  try {
    const config = generateServiceToken();
    const invitation = await axios.post(
      "http://invitation:6030/invitation/api/v1/getInvitationById",
      query,
      config,
    );
    return invitation.data;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};
const fetchJoinLinkById = async (query) => {
  try {
    const config = generateServiceToken();
    const joinLink = await axios.post(
      "http://join-link:6060/joinLink/api/v1/getJoinLinkById",
      query,
      config,
    );
    return joinLink.data;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};
const fetchBags = async (query) => {
  try {
    const config = generateServiceToken();
    const bags = await axios.post(
      "http://bag:5090/bag/api/v1/fetchBags",
      query,
      config,
    );
    return bags.data;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};

const fetchRightSequence = async (events) => {
  try {
    const now = new Date();

    // Separate featured and old events
    const featuredEvents = events.filter((e) => e.status === "featured");
    const oldEvents = events.filter((e) => e.status !== "featured");

    // Get all club IDs from featured events
    const clubIds = featuredEvents.map((e) => e.belongsTo.id);

    // Fetch clubs with ratings
    const clubs = await Club.find(
      { _id: { $in: clubIds } },
      { rating: 1 },
    ).lean();

    // Create lookup for club ratings
    const clubRatings = {};
    clubs.forEach((club) => {
      clubRatings[club._id.toString()] = club.rating || 0;
    });

    // Sort featured events:
    // 1. Active promoted events first (promotionExpiry > now, isPromoted = true)
    // 2. Sort promoted by promotionLevel DESC, then clubRating DESC
    // 3. Then non-promoted events by clubRating DESC
    const sortedFeaturedEvents = featuredEvents.sort((a, b) => {
      const ratingA = clubRatings[a.belongsTo.id] || 0;
      const ratingB = clubRatings[b.belongsTo.id] || 0;

      const aIsActivePromotion =
        a.isPromoted && a.promotionExpiry && new Date(a.promotionExpiry) > now;
      const bIsActivePromotion =
        b.isPromoted && b.promotionExpiry && new Date(b.promotionExpiry) > now;

      if (aIsActivePromotion && !bIsActivePromotion) return -1; // a first
      if (!aIsActivePromotion && bIsActivePromotion) return 1; // b first

      if (aIsActivePromotion && bIsActivePromotion) {
        // Compare promotionLevel first
        if (b.promotionLevel !== a.promotionLevel) {
          return b.promotionLevel - a.promotionLevel;
        }
        // If promotionLevel equal → fallback to rating
        return ratingB - ratingA;
      }

      // If neither promoted → fallback to rating
      return ratingB - ratingA;
    });

    // Final sequence: featured (sorted) first, then old events (untouched)

    return [...sortedFeaturedEvents, ...oldEvents];
  } catch (error) {
    console.log(error);
    return [];
  }
};

const sendOnboardingMail = async (user) => {
  try {
    const scheduleTimeForEmail = new Date(Date.now() + 3 * 1000);
    schedule.scheduleJob(
      `sendMailOnSignUp_${user._id}`,
      scheduleTimeForEmail,
      async () => {
        const name = user.name;
        const action = {};
        const intro = [
          "We are so delighted to have you onboard Macbease.",
          `We look forward to making your college experience a delightful one.`,
        ];
        const outro = "Let us begin this journey together!";
        const subject = "Macbease Confirmation";
        const htmlContent =
          "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>MacbeaseSpaceMail</title><meta name='viewport' content='width=device-width,initial-scale=1.0'><style>body, table, td, p { margin:0; padding:0; } img { border:0; display:block; line-height:0; } @media only screen and (max-width:600px) { table[class='container'] { width:100%!important; } td[class='responsive-column'] { display:block!important; width:100%!important; text-align:center!important; } img[class='responsive-img'] { width:100%!important; height:auto!important; } h1, h2, p { text-align:center!important; } }</style></head><body style='margin:0;padding:0;background-color:#000;font-family:Arial,sans-serif;color:#fff;'><table role='presentation' width='100%' cellspacing='0' cellpadding='0' border='0' style='background-repeat:no-repeat;background-size:cover;background-position:center;background-color:#02021c;'><tr><td align='center' valign='top'><table role='presentation' class='container' width='600' cellspacing='0' cellpadding='0' border='0' style='width:100%;max-width:600px;margin:auto;'><tr><td align='center'><img src='https://s3userdata25136-dev.s3.ap-northeast-1.amazonaws.com/public/certificates/astro3-removebg-preview.png' alt='' width='240' style='margin-bottom:1px;'></td></tr><tr><td align='center' style='padding:30px 20px;background:rgba(28,9,67,.8);border-radius:20px;'><h1 style='font-size:35px;margin:0;'>Welcome to Macbease 🚀</h1><p style='color:#cfcfcf;margin-top:10px;font-size:14px;'>All the Clubs. Infinite Communities. So many memories.</p></td></tr><tr><td style='height:25px;'></td></tr><tr><td style='background-color:#0b0d29;border-radius:20px;padding:30px;'><table width='100%' cellpadding='0' cellspacing='0'><tr><td class='responsive-column' width='50%' align='center'><img src='https://cdn3d.iconscout.com/3d/premium/thumb/creative-writer-storytelling-process-3d-icon-png-download-13174809.png' width='260' class='responsive-img' style='border-radius:10px;'></td><td class='responsive-column' width='50%' align='left' style='padding-left:10px;'><h2 style='margin:0;'>Find Your Club</h2><p style='color:#d1d1d1;margin:10px 0;'>College life means crazy clubs. Join clubs where everyone vibes like you.</p><a href='https://app.macbease.com/explore' style='background:#6A5ACD;color:#fff;margin-top:12px;margin-right:12px;margin-bottom:12px;padding:12px 20px;text-decoration:none;border-radius:10px;display:inline-block;'>Explore</a></td></tr></table></td></tr><tr><td style='height:20px;'></td></tr><tr><td style='background-color:#0b0d29;border-radius:20px;padding:30px;'><table width='100%' cellpadding='0' cellspacing='0'><tr><td class='responsive-column' width='50%' align='left' style='padding-right:10px;'><h2 style='margin:0;'>Communities for every hobby</h2><p style='color:#d1d1d1;margin:10px 0;'>From coding, dancing, music, to anything you love, we got campus community for all.</p><a href='https://app.macbease.com/explore' style='background:#6A5ACD;color:#fff;margin-top:12px;margin-right:12px;margin-bottom:12px;padding:12px 20px;text-decoration:none;border-radius:10px;display:inline-block;'>Explore</a></td><td class='responsive-column' width='50%' align='center'><img src='https://cdn3d.iconscout.com/3d/premium/thumb/people-joining-plug-connection-3d-icon-png-download-9685045.png' width='230' class='responsive-img' style='border-radius:10px;'></td></tr></table></td></tr><tr><td style='height:20px;'></td></tr><tr><td style='background-color:#0b0d29;border-radius:20px;padding:30px;'><table width='100%' cellpadding='0' cellspacing='0'><tr><td class='responsive-column' width='50%' align='center'><img src='https://static.vecteezy.com/system/resources/thumbnails/011/665/522/small/3d-render-hand-carrying-megaphone-and-smartphone-digital-marketing-png.png' width='270' class='responsive-img' style='border-radius:10px;'></td><td class='responsive-column' width='50%' align='left' style='padding-left:10px;'><h2 style='margin:0;'>One place for all events</h2><p style='color:#d1d1d1;margin:10px 0;'>Fests, concerts, workshops — stay updated and avoid FOMO.</p><a href='https://app.macbease.com/explore' style='background:#6A5ACD;color:#fff;margin-top:12px;margin-right:12px;margin-bottom:12px;padding:12px 20px;text-decoration:none;border-radius:10px;display:inline-block;'>Explore</a></td></tr></table></td></tr><tr><td style='height:20px;'></td></tr><tr><td style='background-color:#0b0d29;border-radius:20px;padding:30px;'><table width='100%' cellpadding='0' cellspacing='0'><tr><td class='responsive-column' width='50%' align='left' style='padding-right:10px;'><h2 style='margin:0;'>Make your Memory Lane</h2><p style='color:#d1d1d1;margin:10px 0;'>Capture your college life in memories, you will cherish even the small ones later.</p><a href='https://app.macbease.com/explore' style='background:#6A5ACD;color:#fff;margin-top:12px;margin-right:12px;margin-bottom:12px;padding:12px 20px;text-decoration:none;border-radius:10px;display:inline-block;'>Explore</a></td><td class='responsive-column' width='50%' align='center'><img src='https://cdn3d.iconscout.com/3d/premium/thumb/people-taking-selfie-group-using-mobile-3d-icon-png-download-13170181.png' width='230' class='responsive-img' style='border-radius:10px;'></td></tr></table></td></tr><tr><td style='height:20px;'></td></tr><tr><td align='center' style='padding:20px;color:#aaa;font-size:12px;'><p>© 2025 Macbease. All Rights Reserved.</p></td></tr></table></td></tr></table></body></html>";
        const destination = [user.email];
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination,
          action,
          htmlContent,
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          }
        });
      },
    );
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  sendMail,
  getCurrentISTDate,
  scheduleNotification,
  scheduleNotification2,
  updateDynamicIsland,
  generateUri,
  pingAdmins,
  pingUsers,
  allotProjectChatroom,
  updateUserIP,
  fieldsEnum,
  levelEnum,
  generateEmailReportHtml,
  generateTicketPDFAndUpload,
  generateOfferPDFAndUpload,
  secondaryInvitationActions,
  fetchOrgData,
  createNewOrg,
  fetchContentFromIds,
  fetchMacbeaseContentFromIds,
  fetchItineraryFromIds,
  fetchInvitationById,
  fetchJoinLinkById,
  fetchBags,
  fetchRightSequence,
  sendOnboardingMail,
};
