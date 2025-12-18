const mongoose = require("mongoose");

const AppConfigSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ["android", "ios"],
    required: true,
    default: "android",
  },
  latestVersion: { type: String, required: true },
  mandatoryVersion: { type: String, required: true },
  AwsAccessKeyId: { type: String, required: true },
  AwsSecretAccessKey: { type: String, required: true },
  AwsRegion: { type: String, required: true },
  s3Bucket: { type: String, required: true },
  cloudFrontUrl: { type: String, required: true },
  cloudFrontUrlVideo: { type: String, required: true },
  s3BucketUrlVideo: { type: String, required: true },
  CdnDistributionId: { type: String, required: true },
  s3BucketVideo: { type: String, required: true },
  iosUpdateRequired: { type: Boolean, default: false },
  FbApiKey: { type: String },
  FbAuthDomain: { type: String},
  FbDatabaseURL: { type: String },
  FbProjectId: { type: String },
  FbStorageBucket: { type: String },
  FbMessagingSenderId: { type: String },
  FbAppId: { type: String },
  FbMeasurementId: { type: String },
});

module.exports = mongoose.model("AppConfig", AppConfigSchema);
