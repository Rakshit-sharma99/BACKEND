// Template generation for Imperial Crest
const AWS = require("aws-sdk");
const PDFDocument = require("pdfkit");
const { v4: uuidv4 } = require("uuid");
const stream = require("stream");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_AWS_SECRET_ACCESS_KEY,
  region: process.env.S3_AWS_REGION,
});

const bg1 = path.resolve(__dirname, "../assets/template1.png");

/**
 * Generate Certificate PDF and Upload to S3 (2000x1414 size)
 * @param {Object} cert
 * @param {String} cert.name - Recipient name
 * @param {String} cert.title - Certificate title
 * @param {String} cert.description - Certificate body text
 * @param {String} cert.date - Presentation date
 * @param {String} cert.signature1 - Signature 1 text
 * @param {String} cert.signature2 - Signature 2 text
 * @param {String} cert.topLogo - Path or URL of top logo (transparent preferred)
 * @param {String} [cert.qrData] - Optional QR data (for authenticity or event)
 * @returns {Promise<String>} - S3 URL of uploaded PDF
 */
const generateCertificatePreview1 = async (cert) => {
  return new Promise(async (resolve, reject) => {
    const width = 2000;
    const height = 1414;

    const doc = new PDFDocument({ size: [width, height], margin: 0 });
    const passThroughStream = new stream.PassThrough();

    const fileKey = `certificates/${cert.name.replace(
      /\s+/g,
      "_"
    )}-${uuidv4()}.pdf`;

    const uploadParams = {
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: passThroughStream,
      ContentType: "application/pdf",
    };

    // Start uploading to S3 while writing the PDF
    s3.upload(uploadParams, (err) => {
      if (err) return reject(err);

      return resolve({
        url: `${process.env.S3_OBJECT_URL}${fileKey}`,
        key: fileKey,
      });
    });

    doc.pipe(passThroughStream);

    const centerX = width / 2;

    // ========================
    // 🖼 Background Image
    // ========================
    if (bg1) {
      doc.image(bg1, 0, 0, { width, height });
    }

    // ========================
    // 🏛️ Top Logo (URL-based)
    // ========================
    if (cert.topLogo) {
      try {
        const response = await axios.get(cert.topLogo, {
          responseType: "arraybuffer",
        });
        const logoBuffer = await sharp(response.data).png().toBuffer(); // re-encode cleanly
        console.log("logo buffer", logoBuffer);

        const logoWidth = 250;
        const logoHeight = 250;
        const logoX = centerX - logoWidth / 2;
        const logoY = 120;

        doc.image(logoBuffer, logoX, logoY, {
          width: logoWidth,
          height: logoHeight,
        });
      } catch (err) {
        console.error("Logo download/render failed:", err.message);
      }
    }

    // ========================
    // 🏅 Title & Text
    // ========================
    doc
      .fontSize(90)
      .fillColor("#000")
      .font("Helvetica-Bold")
      .text(cert.title || "Certificate of Appreciation", 0, 420, {
        align: "center",
      });

    doc
      .fontSize(36)
      .font("Helvetica")
      .fillColor("#333")
      .text("This certificate is proudly presented to", 0, 520, {
        align: "center",
      });

    doc
      .fontSize(90)
      .fillColor("#111")
      .font("Helvetica-Oblique")
      .text(cert.name || "Recipient Name", 0, 590, {
        align: "center",
      });

    doc
      .fontSize(32)
      .fillColor("#444")
      .font("Helvetica")
      .text(
        cert.description ||
          "For outstanding performance and contribution in the field of excellence.",
        300,
        740,
        { align: "center", width: width - 600 }
      );

    doc
      .fontSize(24)
      .fillColor("#333")
      .font("Helvetica")
      .text(
        `Presented this: ${cert.date || new Date().toLocaleDateString()}`,
        0,
        920,
        { align: "center" }
      );

    // ========================
    // ✍️ Signatures (with cursive name above line)
    // ========================
    const signY = 1120;
    const signatureFont = "Times-Italic"; // Or register custom signature font

    function renderSignature(text, x, widthBox) {
      const [name, title] = text.split(",").map((s) => s.trim());
      const lineY = signY - 10;

      // Cursive handwritten name
      doc
        .font(signatureFont)
        .fontSize(42)
        .fillColor("#000")
        .text(name, x, lineY - 55, { width: widthBox, align: "center" });

      // Line
      doc
        .moveTo(x, lineY)
        .lineTo(x + widthBox, lineY)
        .strokeColor("#333")
        .stroke();

      // Title
      if (title) {
        doc
          .font("Helvetica")
          .fontSize(24)
          .fillColor("#333")
          .text(title, x, signY + 5, { width: widthBox, align: "center" });
      }
    }

    // ✅ Final perfect positioning
    const widthBox = 400;

    // Left signature → 200px from left
    renderSignature(cert.signature1 || "John Smith, President", 200, widthBox);

    // Right signature → 200px from right
    renderSignature(
      cert.signature2 || "Mark Barker, Secretary",
      width - 200 - widthBox,
      widthBox
    );

    // ========================
    // 🪙 QR Code
    // ========================
    if (cert.qrData) {
      try {
        const qrDataUrl = await QRCode.toDataURL(cert.qrData);
        doc.image(qrDataUrl, centerX - 60, 1240, { width: 120 });
      } catch (err) {
        console.error("QR generation failed:", err.message);
      }
    }

    doc.end();
  });
};

module.exports = { generateCertificatePreview1 };
