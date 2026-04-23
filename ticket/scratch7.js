const PDFDocument = require("pdfkit");
const fs = require('fs');
const AWS = require('aws-sdk');
require('dotenv').config({ path: '../env/ticket/.env' });

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_AWS_SECRET_ACCESS_KEY,
  region: process.env.S3_AWS_REGION,
});

async function test() {
  try {
    const data = await s3.getObject({
      Bucket: process.env.S3_BUCKET,
      Key: 'public/universes/lpu_logo-removebg-preview.png'
    }).promise();
    
    console.log("Downloaded image buffer. Length:", data.Body.length);
    
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream('out.pdf'));
    
    console.log("Drawing image...");
    doc.image(data.Body, 0, 0);
    console.log("Image drawn");
    doc.end();
  } catch(e) {
    console.error("Test Error:", e);
  }
}
test();
