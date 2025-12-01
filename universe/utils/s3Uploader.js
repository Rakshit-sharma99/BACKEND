const AWS = require("aws-sdk");
const crypto = require('crypto');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS S3 client globally
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Helper function to encrypt names
const encryptName = (name) => {
    return crypto.createHash('sha256').update(name).digest('hex');
};

/**
 * Uploads a file to S3 with encrypted folder and file names.
 * @param {Express.Multer.File} file - File object received from Multer middleware.
 * @param {string} folder - Hardcoded folder name (e.g., 'features', 'events').
 * @returns {Promise<{ url: string, folder: string, fileName: string }>} - S3 file details including URL.
 */

exports.uploadToS3 = async (file, folder) => {
    // Encrypt folder and file names

    // If we want to encrypt the folder name uncomment the line below -->
    // const encryptedFolder = encryptName(folder);

    const encryptedFolder = folder;
    const encryptedFileName = `${uuidv4()}_${encryptName(file.originalname)}${path.extname(file.originalname)}`;

    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: `${encryptedFolder}/${encryptedFileName}`, // Folder/File structure
        Body: file.buffer,
        ContentType: file.mimetype,
    };

    try {
        const uploadResult = await s3.upload(params).promise();
        const url = 'https://photos.macbease.com/' + uploadResult.Key;

        return url;
    } catch (error) {
        console.error('S3 upload failed:', error);
        if (error instanceof Error) {
            throw new Error(`S3 upload failed: ${error.message}`);
        } else {
            throw new Error('S3 upload failed: Unknown error');
        }
    }
};

exports.uploadMultipleToS3 = async (files, folder) => {
    return Promise.all(files.map(file => exports.uploadToS3(file, folder)));
};
