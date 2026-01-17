// Template generation for Imperial Crest
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

const QRCode = require("qrcode"); //change

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_AWS_SECRET_ACCESS_KEY,
  region: process.env.S3_AWS_REGION,
});

const template1 = path.resolve(__dirname, "../assets/template1.png");
const template2 = path.resolve(__dirname, "../assets/template2.png");
const template3 = path.resolve(__dirname, "../assets/template3.png");
const template4 = path.resolve(__dirname, "../assets/template4.png");
const template5 = path.resolve(__dirname, "../assets/template5.png");

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
  try {
    const width = 2000;
    const height = 1414;

    // ----------------------------------------------------
    // 1️⃣ Load/prepare assets BEFORE rendering
    // ----------------------------------------------------

    // Background (local file)
    const bg = await sharp(template1).resize(width, height).toBuffer();

    // Logo
    let logoBuf = null;
    if (cert.topLogo) {
      const resp = await axios.get(cert.topLogo, {
        responseType: "arraybuffer",
      });
      logoBuf = await sharp(resp.data).resize(250, 250).png().toBuffer();
    }

    // QR Code
    let qrBuf = null;
    if (cert.qrData) {
      const qr = await QRCode.toBuffer(cert.qrData, { width: 200 });
      qrBuf = qr;
    }

    // ----------------------------------------------------
    // 2️⃣ Generate text layers separately
    // ----------------------------------------------------

    function wrapText(text, maxChars = 60) {
      const words = text.split(" ");
      const lines = [];
      let current = "";

      words.forEach((word) => {
        if ((current + word).length > maxChars) {
          lines.push(current.trim());
          current = word + " ";
        } else {
          current += word + " ";
        }
      });

      if (current.trim() !== "") lines.push(current.trim());

      return lines;
    }

    const descriptionText =
      cert.description ||
      "For outstanding performance and contribution in the field of excellence.";

    const wrappedLines = wrapText(descriptionText, 60); // adjust width as needed

    let descSVG = "";
    wrappedLines.forEach((line, i) => {
      descSVG += `<text x="50%" y="${740 + i * 45}" text-anchor="middle"
              class="desc">${line}</text>`;
    });

    const svgText = `
  <svg width="${width}" height="${height}">
    <style>
      .title { font-size: 90px; font-weight: bold; fill: #000; font-family: Helvetica; }
      .sub { font-size: 36px; fill: #333; font-family: Helvetica; }
      .name { font-size: 90px; fill: #111; font-family: Helvetica; font-style: italic; }
      .desc { font-size: 32px; fill: #444; font-family: Helvetica; }
      .date { font-size: 24px; fill: #333; font-family: Helvetica; }
    </style>

    <text x="50%" y="420" text-anchor="middle" class="title">
      ${cert.title || "Certificate of Appreciation"}
    </text>

    <text x="50%" y="520" text-anchor="middle" class="sub">
      This certificate is proudly presented to
    </text>

    <text x="50%" y="610" text-anchor="middle" class="name">
      ${cert.name || "Recipient Name"}
    </text>

    ${descSVG}

    <text x="50%" y="920" text-anchor="middle" class="date">
      Presented this: ${cert.date || new Date().toLocaleDateString()}
    </text>
  </svg>
`;

    const svgSignatures = `
      <svg width="${width}" height="${height}">
        <style>
          .signName { font-size: 42px; fill: #000; font-family: 'Times New Roman'; font-style: italic; }
          .signTitle { font-size: 24px; fill: #333; font-family: Helvetica; }
        </style>

        <!-- Left Signature -->
        <text x="200" y="1100" class="signName">${
          (cert.signature1 || "John Smith, President").split(",")[0]
        }</text>
        <line x1="200" y1="1120" x2="600" y2="1120" stroke="#333" stroke-width="3" />
        <text x="200" y="1160" class="signTitle">${
          (cert.signature1 || "John Smith, President").split(",")[1] || ""
        }</text>

        <!-- Right Signature -->
        <text x="${width - 600}" y="1100" class="signName">${
      (cert.signature2 || "Mark Barker, Secretary").split(",")[0]
    }</text>
        <line x1="${width - 600}" y1="1120" x2="${
      width - 200
    }" y2="1120" stroke="#333" stroke-width="3" />
        <text x="${width - 600}" y="1160" class="signTitle">${
      (cert.signature2 || "Mark Barker, Secretary").split(",")[1] || ""
    }</text>
      </svg>
    `;

    // Convert SVGs to PNG buffers for composite()
    const textBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
    const signBuf = await sharp(Buffer.from(svgSignatures)).png().toBuffer();

    // ----------------------------------------------------
    // 3️⃣ Composite everything into a final JPEG image
    // ----------------------------------------------------

    const compositeLayers = [
      { input: bg },
      { input: textBuf },
      { input: signBuf },
    ];

    if (logoBuf) {
      compositeLayers.push({
        input: logoBuf,
        top: 120,
        left: width / 2 - 125,
      });
    }

    if (qrBuf) {
      compositeLayers.push({
        input: qrBuf,
        top: 1240,
        left: width / 2 - 60,
      });
    }

    const jpegBuffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite(compositeLayers)
      .jpeg({ quality: 90 })
      .toBuffer();

    // ----------------------------------------------------
    // 4️⃣ Upload JPEG to S3
    // ----------------------------------------------------
    const jpegKey = `certificates/${cert.name.replace(
      /\s+/g,
      "_"
    )}-${uuidv4()}.jpg`;

    await s3
      .upload({
        Bucket: process.env.S3_BUCKET,
        Key: jpegKey,
        Body: jpegBuffer,
        ContentType: "image/jpeg",
      })
      .promise();

    return {
      jpegUrl: `${process.env.S3_OBJECT_URL}${jpegKey}`,
      jpegKey,
    };
  } catch (err) {
    console.error("generateCertificatePreview Error:", err);
    throw err;
  }
};

// module.exports = { generateCertificatePreview1 };
const generateCertificatePreview2 = async (cert) => {
  try {
    console.log("2 called");
    const width = 2000;
    const height = 1414;

    const bg = await sharp(template2).resize(width, height).toBuffer();

    // ---------------- LOGO ----------------
    let logoBuf = null;
    if (cert.topLogo) {
      const resp = await axios.get(cert.topLogo, {
        responseType: "arraybuffer",
      });
      logoBuf = await sharp(resp.data).resize(250, 250).png().toBuffer();
    }

    // ---------------- QR ----------------
    let qrBuf = null;
    if (cert.qrData) {
      qrBuf = await QRCode.toBuffer(cert.qrData, { width: 200 });
    }

    // ---------------- AUTO-WRAP DESCRIPTION ----------------
    function wrapText(text, maxChars = 55) {
      const words = text.split(" ");
      const lines = [];
      let current = "";

      for (let w of words) {
        if ((current + w).length > maxChars) {
          lines.push(current.trim());
          current = w + " ";
        } else {
          current += w + " ";
        }
      }

      if (current.trim()) lines.push(current.trim());
      return lines;
    }

    const desc =
      cert.description ||
      "For outstanding work and dedication throughout the year.";
    const wrapped = wrapText(desc, 55);

    const descStartY = 710;
    const gap = 45;

    let descSVG = "";
    wrapped.forEach((line, i) => {
      descSVG += `
        <text x="50%" y="${descStartY + i * gap}" 
              text-anchor="middle" class="desc">
          ${line}
        </text>
      `;
    });

    // DATE auto adjust
    const dateY = descStartY + wrapped.length * gap + 60;

    // ---------------- TEXT SVG ----------------
    const svgText = `
    <svg width="${width}" height="${height}">
      <style>
        .title { font-size: 90px; fill: #16233A; font-weight: 700; font-family: 'Times New Roman', serif; }
        .subtitle { font-size: 40px; fill: #16233A; font-family: serif; }
        .name { font-size: 85px; fill: #16233A; font-family: 'Brush Script MT', cursive; }
        .desc { font-size: 32px; fill: #333; font-family: serif; }
        .date { font-size: 38px; fill: #16233A; font-family: serif; }
      </style>

      <!-- Main Title -->
      <text x="50%" y="430" text-anchor="middle" class="title">
        ${(cert.title || "CERTIFICATE OF ACHIEVEMENT").toUpperCase()}
      </text>

      <!-- Subtitle -->
      <text x="50%" y="520" text-anchor="middle" class="subtitle">
        This Is Presented To
      </text>

      <!-- Name -->
      <text x="50%" y="620" text-anchor="middle" class="name">
        ${cert.name || "Recipient Name"}
      </text>

      <!-- Wrapped Description -->
      ${descSVG}

      <!-- Auto Date -->
      <text x="50%" y="${dateY}" text-anchor="middle" class="date">
        ${cert.date || new Date().toISOString().split("T")[0]}
      </text>
    </svg>
    `;

    const textBuf = await sharp(Buffer.from(svgText)).png().toBuffer();

    // ---------------- SIGNATURES ----------------
    const svgSign = `
    <svg width="${width}" height="${height}">
      <style>
        .signName { font-size: 42px; fill: #16233A; font-family: 'Brush Script MT', cursive; }
        .signTitle { font-size: 24px; fill: #333; font-family: serif; }
      </style>

      <!-- Left Sign -->
      <text x="500" y="1020" text-anchor="middle" class="signName">
        ${(cert.signature1 || "John Doe, CEO").split(",")[0]}
      </text>
      <line x1="300" y1="1040" x2="700" y2="1040" stroke="#16233A" stroke-width="3" />
      <text x="500" y="1080" text-anchor="middle" class="signTitle">
        ${(cert.signature1 || "John Doe, CEO").split(",")[1] || ""}
      </text>

      <!-- Right Sign -->
      <text x="1500" y="1020" text-anchor="middle" class="signName">
        ${(cert.signature2 || "Jane Smith, Director").split(",")[0]}
      </text>
      <line x1="1300" y1="1040" x2="1700" y2="1040" stroke="#16233A" stroke-width="3" />
      <text x="1500" y="1080" text-anchor="middle" class="signTitle">
        ${(cert.signature2 || "Jane Smith, Director").split(",")[1] || ""}
      </text>
    </svg>
    `;

    const signBuf = await sharp(Buffer.from(svgSign)).png().toBuffer();

    // ---------------- LAYERS ----------------
    const layers = [{ input: bg }, { input: textBuf }, { input: signBuf }];

    // Logo placement
    if (logoBuf) {
      layers.push({
        input: logoBuf,
        top: 120, // adjust upwards/downwards
        left: width / 2 - 90,
      });
    }

    // QR placement
    if (qrBuf) {
      layers.push({
        input: qrBuf,
        top: 950, // improved placement
        left: width / 2 - 100,
      });
    }

    // ---------------- FINAL OUTPUT ----------------
    const jpegBuffer = await sharp({
      create: { width, height, channels: 3, background: "#ffffff" },
    })
      .composite(layers)
      .jpeg({ quality: 90 })
      .toBuffer();

    const jpegKey = `certificates/${cert.name.replace(
      /\s+/g,
      "_"
    )}-${uuidv4()}.jpg`;

    await s3
      .upload({
        Bucket: process.env.S3_BUCKET,
        Key: jpegKey,
        Body: jpegBuffer,
        ContentType: "image/jpeg",
      })
      .promise();

    return {
      jpegUrl: `${process.env.S3_OBJECT_URL}${jpegKey}`,
      jpegKey,
    };
  } catch (err) {
    console.error("generateCertificatePreview Error:", err);
    throw err;
  }
};

//Preview 3
const generateCertificatePreview3 = async (cert) => {
  try {
    const width = 2000;
    const height = 1414;

    // -------- BACKGROUND --------
    const bg = await sharp(template3).resize(width, height).toBuffer();

    // -------- LOGO (TOP LEFT) --------
    let logoBuf = null;
    if (cert.topLogo) {
      const resp = await axios.get(cert.topLogo, {
        responseType: "arraybuffer",
      });
      logoBuf = await sharp(resp.data).resize(250, 250).png().toBuffer();
    }

    // -------- QR / BADGE (OPTIONAL) --------
    let qrBuf = null;
    if (cert.qrData) {
      qrBuf = await QRCode.toBuffer(cert.qrData, { width: 180 });
    }

    // -------- DESCRIPTION WRAP --------
    function wrapText(text, maxChars = 65) {
      const words = text.split(" ");
      const lines = [];
      let current = "";

      for (let w of words) {
        if ((current + w).length > maxChars) {
          lines.push(current.trim());
          current = w + " ";
        } else {
          current += w + " ";
        }
      }
      if (current.trim()) lines.push(current.trim());
      return lines;
    }

    const desc = cert.description || "has successfully completed the course.";
    const wrappedDesc = wrapText(desc);

    let descSVG = "";
    wrappedDesc.forEach((line, i) => {
      descSVG += `
        <text x="50%" y="${760 + i * 42}" text-anchor="middle" class="desc">
          ${line}
        </text>`;
    });

    // -------- TEXT SVG --------
    const svgText = `
    <svg width="${width}" height="${height}">
      <style>
        .title { font-size: 96px; fill: #4A6480; font-weight: 700; font-family: Helvetica; }
        .subtitle { font-size: 34px; fill: #333; font-family: Helvetica; }
        .name { font-size: 92px; fill: #4A6480; font-family: 'Times New Roman', serif; }
        .desc { font-size: 32px; fill: #444; font-family: Helvetica; }
        .date { font-size: 32px; fill: #333; font-family: Helvetica; }
      </style>

      <!-- TITLE -->
      <text x="50%" y="300" text-anchor="middle" class="title">
        CERTIFICATE
      </text>
      <text x="50%" y="370" text-anchor="middle" class="subtitle">
        OF COMPLETION
      </text>

      <!-- SUB TEXT -->
      <text x="50%" y="460" text-anchor="middle" class="subtitle">
        This is to certify that
      </text>

      <!-- NAME -->
      <text x="50%" y="600" text-anchor="middle" class="name">
        ${cert.name || "Recipient Name"}
      </text>

      <!-- DESCRIPTION -->
      ${descSVG}

      <!-- DATE -->
      <text x="50%" y="930" text-anchor="middle" class="date">
        Date: ${cert.date || new Date().toLocaleDateString()}
      </text>
    </svg>
    `;

    const textBuf = await sharp(Buffer.from(svgText)).png().toBuffer();

    // -------- SIGNATURES --------
    const svgSign = `
    <svg width="${width}" height="${height}">
      <style>
        .signName { font-size: 40px; fill: #333; font-family: 'Times New Roman'; }
        .signTitle { font-size: 24px; fill: #555; font-family: Helvetica; }
      </style>

      <!-- LEFT SIGN -->
      <text x="450" y="1100" text-anchor="middle" class="signName">
        ${(cert.signature1 || "Brigitte Schwartz").split(",")[0]}
      </text>
      <line x1="300" y1="1120" x2="600" y2="1120" stroke="#333" stroke-width="3"/>
      <text x="450" y="1160" text-anchor="middle" class="signTitle">
        ${(cert.signature1 || "Program Director").split(",")[1] || ""}
      </text>

      <!-- RIGHT SIGN -->
      <text x="1550" y="1100" text-anchor="middle" class="signName">
        ${(cert.signature2 || "Harumi Kobayashi").split(",")[0]}
      </text>
      <line x1="1400" y1="1120" x2="1700" y2="1120" stroke="#333" stroke-width="3"/>
      <text x="1550" y="1160" text-anchor="middle" class="signTitle">
        ${(cert.signature2 || "Course Instructor").split(",")[1] || ""}
      </text>
    </svg>
    `;

    const signBuf = await sharp(Buffer.from(svgSign)).png().toBuffer();

    // -------- COMPOSITE --------
    const layers = [{ input: bg }, { input: textBuf }, { input: signBuf }];

    if (logoBuf) {
      layers.push({
        input: logoBuf,
        top: 120,
        left: 160,
      });
    }

    if (qrBuf) {
      layers.push({
        input: qrBuf,
        top: 1020,
        left: width / 2 - 90,
      });
    }

    const jpegBuffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite(layers)
      .jpeg({ quality: 90 })
      .toBuffer();

    const jpegKey = `certificates/${cert.name.replace(
      /\s+/g,
      "_"
    )}-${uuidv4()}.jpg`;

    await s3
      .upload({
        Bucket: process.env.S3_BUCKET,
        Key: jpegKey,
        Body: jpegBuffer,
        ContentType: "image/jpeg",
      })
      .promise();

    return {
      jpegUrl: `${process.env.S3_OBJECT_URL}${jpegKey}`,
      jpegKey,
    };
  } catch (err) {
    console.error("generateCertificatePreview Error:", err);
    throw err;
  }
};

//Preview 4
// -------- Preview 4 --------
const generateCertificatePreview4 = async (cert) => {
  try {
    const width = 2000;
    const height = 1414;

    // -------- BACKGROUND --------
    const bg = await sharp(template4).resize(width, height).toBuffer();

    // -------- LOGO (TOP CENTER) --------
    let logoBuf = null;
    if (cert.topLogo) {
      const resp = await axios.get(cert.topLogo, {
        responseType: "arraybuffer",
      });
      logoBuf = await sharp(resp.data).resize(250, 250).png().toBuffer();
    }

    // -------- QR (OPTIONAL) --------
    let qrBuf = null;
    if (cert.qrData) {
      qrBuf = await QRCode.toBuffer(cert.qrData, { width: 160 });
    }

    // -------- DESCRIPTION WRAP --------
    function wrapText(text, maxChars = 70) {
      const words = text.split(" ");
      const lines = [];
      let current = "";

      for (let w of words) {
        if ((current + w).length > maxChars) {
          lines.push(current.trim());
          current = w + " ";
        } else {
          current += w + " ";
        }
      }
      if (current.trim()) lines.push(current.trim());
      return lines.slice(0, 3);
    }

    const wrappedDesc = wrapText(cert.description || "");

    let descSVG = "";
    wrappedDesc.forEach((line, i) => {
      descSVG += `
        <text x="50%" y="${760 + i * 40}" text-anchor="middle" class="desc">
          ${line}
        </text>`;
    });

    // -------- MAIN TEXT --------
    const svgText = `
    <svg width="${width}" height="${height}">
      <style>
        .title { font-size: 104px; font-family: 'Times New Roman', serif; letter-spacing: 6px; }
        .subtitle { font-size: 40px; font-family: 'Times New Roman', serif; letter-spacing: 3px; }
        .desc { font-size: 34px; font-family: 'Times New Roman', serif; fill: #333; }
        .name { font-size: 82px; font-family: 'Times New Roman', serif; font-style: italic; }
      </style>

      <text x="50%" y="390" text-anchor="middle" class="title">
        CERTIFICATE
      </text>

      <text x="50%" y="460" text-anchor="middle" class="subtitle">
        OF PARTICIPATION
      </text>

      <text x="50%" y="550" text-anchor="middle" class="desc">
        This Certificate is presented to
      </text>

      <text x="50%" y="640" text-anchor="middle" class="name">
        ${cert.name || "Recipient Name"}
      </text>

      ${descSVG}

      <!-- Divider -->
      <line x1="600" y1="880" x2="1400" y2="880"
            stroke="#000" stroke-width="2"/>
    </svg>
    `;

    const textBuf = await sharp(Buffer.from(svgText)).png().toBuffer();

    // -------- SIGNATURES (CEO | QR | DIRECTOR) --------
    const svgSign = `
    <svg width="${width}" height="${height}">
      <style>
        .sign { font-size: 34px; font-family: 'Times New Roman', serif; }
      </style>

      <!-- CEO -->
      <text x="450" y="1080" text-anchor="middle" class="sign">
        ${cert.signature1 || ""}
      </text>
      <line x1="300" y1="1110" x2="600" y2="1110"
            stroke="#000" stroke-width="2"/>

      <!-- Director -->
      <text x="1550" y="1080" text-anchor="middle" class="sign">
        ${cert.signature2 || ""}
      </text>
      <line x1="1400" y1="1110" x2="1700" y2="1110"
            stroke="#000" stroke-width="2"/>
    </svg>
    `;

    const signBuf = await sharp(Buffer.from(svgSign)).png().toBuffer();

    // -------- COMPOSE --------
    const layers = [{ input: bg }, { input: textBuf }];

    // Logo
    if (logoBuf) {
      layers.push({
        input: logoBuf,
        top: 90,
        left: width / 2 - 70,
      });
    }

    // QR BETWEEN CEO & DIRECTOR
    if (qrBuf) {
      layers.push({
        input: qrBuf,
        top: 1000, // between name & signatures
        left: width / 2 - 80, // perfectly centered
      });
    }

    // Signatures last
    layers.push({ input: signBuf });

    const jpegBuffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite(layers)
      .jpeg({ quality: 90 })
      .toBuffer();

    const jpegKey = `certificates/${cert.name.replace(
      /\s+/g,
      "_"
    )}-${uuidv4()}.jpg`;

    await s3
      .upload({
        Bucket: process.env.S3_BUCKET,
        Key: jpegKey,
        Body: jpegBuffer,
        ContentType: "image/jpeg",
      })
      .promise();

    return {
      jpegUrl: `${process.env.S3_OBJECT_URL}${jpegKey}`,
      jpegKey,
    };
  } catch (err) {
    console.error("generateCertificatePreview Error:", err);
    throw err;
  }
};

//preview 5
// -------- Preview 5 --------
const generateCertificatePreview5 = async (cert) => {
  try {
    const width = 2000;
    const height = 1414;
    const verticalOffset = 80;

    // -------- BACKGROUND --------
    const bg = await sharp(template5).resize(width, height).toBuffer();

    // -------- LOGO (TOP CENTER – OPTIONAL) --------
    let logoBuf = null;
    if (cert.topLogo) {
      if (cert.topLogo.startsWith("http")) {
        const resp = await axios.get(cert.topLogo, {
          responseType: "arraybuffer",
        });
        logoBuf = await sharp(resp.data).resize(140, 140).png().toBuffer();
      } else {
        logoBuf = await sharp(cert.topLogo).resize(140, 140).png().toBuffer();
      }
    }

    // -------- QR (OPTIONAL – CENTER BOTTOM) --------
    let qrBuf = null;
    if (cert.qrData) {
      qrBuf = await QRCode.toBuffer(cert.qrData, { width: 160 });
    }

    // -------- DESCRIPTION WRAP --------
    function wrapText(text, maxChars = 65) {
      const words = text.split(" ");
      const lines = [];
      let current = "";

      for (let w of words) {
        if ((current + w).length > maxChars) {
          lines.push(current.trim());
          current = w + " ";
        } else {
          current += w + " ";
        }
      }
      if (current.trim()) lines.push(current.trim());
      return lines.slice(0, 3);
    }

    const wrappedDesc = wrapText(cert.description || "");

    let descSVG = "";
    wrappedDesc.forEach((line, i) => {
      descSVG += `
        <text x="50%" y="${810 + i * 42}" text-anchor="middle" class="desc">
          ${line}
        </text>`;
    });

    // -------- MAIN TEXT --------
    const svgText = `
<svg width="${width}" height="${height}">
  <style>
    .title { font-size: 120px; font-family: 'Times New Roman', serif; fill: #2b2b2b; letter-spacing: 6px; }
    .subtitle { font-size: 60px; font-family: 'Times New Roman', serif; fill: #b08a3c; letter-spacing: 4px; }
    .small { font-size: 34px; font-family: 'Times New Roman', serif; fill: #333; letter-spacing: 2px; }
    .name { font-size: 90px; font-family: 'Times New Roman', serif; font-style: italic; fill: #2b2b2b; }
    .desc { font-size: 34px; font-family: 'Times New Roman', serif; fill: #444; }
  </style>

  <text x="50%" y="${360 + verticalOffset}" text-anchor="middle" class="title">
    CERTIFICATE
  </text>

  <text x="50%" y="${
    450 + verticalOffset
  }" text-anchor="middle" class="subtitle">
    OF APPRECIATION
  </text>

  <text x="50%" y="${560 + verticalOffset}" text-anchor="middle" class="small">
    THE FOLLOWING AWARD IS GIVEN TO
  </text>

  <text x="50%" y="${650 + verticalOffset}" text-anchor="middle" class="name">
    ${cert.name || "Recipient Name"}
  </text>

  <line x1="650" y1="${690 + verticalOffset}" x2="1350" y2="${
      690 + verticalOffset
    }"
        stroke="#b08a3c" stroke-width="3"/>

  ${wrappedDesc
    .map(
      (line, i) => `
    <text x="50%" y="${
      810 + verticalOffset + i * 42
    }" text-anchor="middle" class="desc">
      ${line}
    </text>
  `
    )
    .join("")}

</svg>
`;

    const textBuf = await sharp(Buffer.from(svgText)).png().toBuffer();

    // -------- SIGNATURES --------
    const svgSign = `
    <svg width="${width}" height="${height}">
      <style>
        .signName {
          font-size: 36px;
          font-family: 'Times New Roman', serif;
          fill: #2b2b2b;
        }
        .signTitle {
          font-size: 26px;
          font-family: 'Times New Roman', serif;
          fill: #555;
        }
      </style>

      <!-- LEFT SIGN -->
      <line x1="350" y1="1100" x2="750" y2="1100"
            stroke="#b08a3c" stroke-width="3"/>
      <text x="550" y="1140" text-anchor="middle" class="signName">
        ${(cert.signature1 || "").split(",")[0]}
      </text>
      <text x="550" y="1180" text-anchor="middle" class="signTitle">
        ${(cert.signature1 || "").split(",")[1] || ""}
      </text>

      <!-- RIGHT SIGN -->
      <line x1="1250" y1="1100" x2="1650" y2="1100"
            stroke="#b08a3c" stroke-width="3"/>
      <text x="1450" y="1140" text-anchor="middle" class="signName">
        ${(cert.signature2 || "").split(",")[0]}
      </text>
      <text x="1450" y="1180" text-anchor="middle" class="signTitle">
        ${(cert.signature2 || "").split(",")[1] || ""}
      </text>
    </svg>
    `;

    const signBuf = await sharp(Buffer.from(svgSign)).png().toBuffer();

    // -------- COMPOSE --------
    const layers = [{ input: bg }, { input: textBuf }];

    if (logoBuf) {
      layers.push({
        input: logoBuf,
        top: 160,
        left: width / 2 - 70,
      });
    }

    if (qrBuf) {
      layers.push({
        input: qrBuf,
        top: 980,
        left: width / 2 - 80,
      });
    }

    layers.push({ input: signBuf });

    const jpegBuffer = await sharp({
      create: { width, height, channels: 3, background: "#ffffff" },
    })
      .composite(layers)
      .jpeg({ quality: 90 })
      .toBuffer();

    const jpegKey = `certificates/${cert.name.replace(
      /\s+/g,
      "_"
    )}-${uuidv4()}.jpg`;

    await s3
      .upload({
        Bucket: process.env.S3_BUCKET,
        Key: jpegKey,
        Body: jpegBuffer,
        ContentType: "image/jpeg",
      })
      .promise();

    return {
      jpegUrl: `${process.env.S3_OBJECT_URL}${jpegKey}`,
      jpegKey,
    };
  } catch (err) {
    console.error("generateCertificatePreview Error:", err);
    throw err;
  }
};

module.exports = {
  generateCertificatePreview1,
  generateCertificatePreview2,
  generateCertificatePreview3,
  generateCertificatePreview4,
  generateCertificatePreview5,
};
