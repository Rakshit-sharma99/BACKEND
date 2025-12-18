const jwt = require("jsonwebtoken");
const axios = require("axios");
const { getMessaging } = require("firebase-admin/messaging");
const schedule = require("node-schedule");
const PDFDocument = require("pdfkit");
const stream = require("stream");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const logoPath = path.resolve(__dirname, "../assets/logo_1024x1024.png");

const services = {
  universe: "universe:5050",
  quest: "quest:6010"
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "macbeaseContent",
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
      "http://multiverse:5020/multiverse/api/v1/user/getUserFieldsById",
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchNativeUserData = async (query) => {
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
    const userData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/user/getUserFieldsById`,
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchNativeQuestData = async(query) => {
  try {
    if (
      !query ||
      typeof query !== "object" ||
      !query.id ||
      !query.callSign ||
      typeof query.callSign !== "string"
    ) {
      throw new Error("Invalid query: 'id' and 'callSign' are required.");
    }

    const service = services[query.callSign];
    if (!service) {
      throw new Error(`Service for callSign '${query.callSign}' not found.`);
    }

    const config = generateServiceToken();

    const response = await axios.get(
      `http://${service}/${query.callSign}/api/v1/fetchQuests?userId=${query.id}`,
      config
    );

    return response.data?.data;
  } catch (error) {
    console.error("❌ Error fetching native quest data:", error);
    return null;
  }
}

const scheduleNotification2 = ({ pushToken, title, body, image, url }) => {
  if (!title || !body || !pushToken) {
    console.log("Title,body or push token missing!");
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  // schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
  //   pushToken.forEach((token) => {
  //     if (
  //       typeof token !== "string" ||
  //       token.length <= 80 ||
  //       token === "undefined"
  //     ) {
  //       return;
  //     }

  //     const message = {
  //       notification: {
  //         title: title,
  //         body: body,
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
  //               title: title,
  //               body: body,
  //             },
  //             sound: "default",
  //             "mutable-content": 1,
  //           },
  //         },
  //         fcm_options: {
  //           image: image,
  //         },
  //       },
  //       data: {
  //         url: url,
  //       },
  //       token: token,
  //     };
  //     getMessaging()
  //       .send(message)
  //       .then((response) => {
  //         console.log("Successfully sent message:", response);
  //       })
  //       .catch((error) => {
  //         console.log("Error sending message:", error);
  //       });
  //   });
  // });
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


module.exports = {fetchNativeUserData,fetchUserData,fetchNativeQuestData,scheduleNotification2,generateOfferPDFAndUpload}