const mongoose = require("mongoose");

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

const isStringArray = (arr) =>
  Array.isArray(arr) && arr.every((v) => typeof v === "string");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isNumber = (v) => typeof v === 'number' && !isNaN(v);

const validateGalleryItem = (item) => {
  if (typeof item !== "object") return false;

  return (
    isNonEmptyString(item.url) &&
    isNonEmptyString(item.id) &&
    isValidObjectId(item.postedBy) &&
    isNonEmptyString(item.date)
  );
};

const validateUniverseMetaData = (meta) => {
  if (typeof meta !== "object" || meta === null) return false;

  const stringFields = ["name", "location", "logo", "callSign", "logoKey"];

  for (const field of stringFields) {
    if (meta[field] !== undefined && !isNonEmptyString(meta[field])) {
      return false;
    }
  }

  if (meta.lat !== undefined) {
    if (!isNumber(meta.lat) || meta.lat < -90 || meta.lat > 90) {
      return false;
    }
  }

  if (meta.lng !== undefined) {
    if (!isNumber(meta.lng) || meta.lng < -180 || meta.lng > 180) {
      return false;
    }
  }

  return true;
};

const validateRequestBody = (body) => {
  const errors = [];

  // required fields
  if (!isNonEmptyString(body.name)) {
    errors.push("Club name is required.");
  }

  if (!isNonEmptyString(body.motto)) {
    errors.push("Club motto is required.");
  }

  if (!isNonEmptyString(body.featuringImg)) {
    errors.push("Featuring image is required.");
  }

  // optional fields
  if (body.tags && !isStringArray(body.tags)) {
    errors.push("Tags must be an array of strings.");
  }

  if (body.gallery) {
    if (!Array.isArray(body.gallery)) {
      errors.push("Gallery must be an array.");
    } else {
      const invalid = body.gallery.find((g) => !validateGalleryItem(g));
      if (invalid) {
        errors.push("Invalid gallery item structure.");
      }
    }
  }

  // uid validation
  if (body.uid !== undefined && !isNonEmptyString(body.uid)) {
    errors.push("UID must be a non-empty string.");
  }

  // universeMetaData validation
  if (
    body.universeMetaData &&
    !validateUniverseMetaData(body.universeMetaData)
  ) {
    errors.push("Invalid universeMetaData structure.");
  }

  return errors;
};

const sanitizeClubPayload = (body) => {
  const forbiddenFields = [
    "adminId",
    "mainAdmin",
    "members",
    "permissions",
    "awards",
    "rating",
    "processedPayments",
  ];

  const sanitized = { ...body };
  forbiddenFields.forEach((f) => delete sanitized[f]);
  return sanitized;
};

module.exports = {
  validateRequestBody,
  validateUniverseMetaData,
  sanitizeClubPayload,
};
