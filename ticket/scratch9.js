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
      Key: 'public/club/SatMar07202615:30:33GMT+0530'
    }).promise();
    console.log("Success! Buffer length:", data.Body.length);
  } catch(e) {
    console.error("S3 Get Error:", e);
  }
}
test();
