const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "ap-south-1",
});

const BUCKET = process.env.AWS_S3_BUCKET || "macbease-mou-documents";

/**
 * Upload a signed MOU PDF to S3.
 *
 * @param {Buffer} pdfBuffer - The PDF document buffer
 * @param {string} key - S3 object key (e.g., "mou/eventId_timestamp.pdf")
 * @returns {{ key: string, url: string }} - The S3 key and public/presigned URL
 */
async function uploadMOUToS3(pdfBuffer, key) {
  const params = {
    Bucket: BUCKET,
    Key: key,
    Body: pdfBuffer,
    ContentType: "application/pdf",
  };

  await s3.upload(params).promise();
  console.log(`☁️  MOU uploaded to S3: ${key}`);

  return {
    key,
    url: `https://${BUCKET}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${key}`,
  };
}

/**
 * Generate a presigned URL for downloading a signed MOU.
 *
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiry in seconds (default 1 hour)
 * @returns {string} Presigned download URL
 */
function getPresignedUrl(key, expiresIn = 3600) {
  return s3.getSignedUrl("getObject", {
    Bucket: BUCKET,
    Key: key,
    Expires: expiresIn,
  });
}

module.exports = { uploadMOUToS3, getPresignedUrl };
