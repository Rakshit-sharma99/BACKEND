const {StatusCodes} = require("http-status-codes");
const Org = require("../models/org");

const createOrg = async (req, res) => {
  try {
    const {
      orgName,
      orgLogo,
      orgMetaData,
      working = [],
      uid,
      universeMetaData,
    } = req.body;

    // Basic validation
    if (!orgName || typeof orgName !== "string" || !orgName.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "'orgName' is required and must be a non-empty string.",
      });
    }

    if (!orgLogo || typeof orgLogo !== "string" || !orgLogo.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "'orgLogo' is required and must be a non-empty string.",
      });
    }

    if(!universeMetaData){
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "universeMetaData is required.",
      });
    }

    // Check for duplicate org
    const existing = await Org.findOne({ orgName: orgName.trim() });
    if (existing) {
      return res.status(StatusCodes.CONFLICT).json({
        message: "An organization with this name already exists.",
        org: existing,
      });
    }

    // Create new org
    const newOrg = await Org.create({
      orgName: orgName.trim(),
      orgLogo: orgLogo.trim(),
      orgMetaData: orgMetaData || undefined,
      universeMetaData: universeMetaData,
      working: Array.isArray(working) ? working : [],
      uid: req.user.uid ,
    });

    return res.status(StatusCodes.CREATED).json({
      message: "Organization created successfully.",
      org: newOrg,
    });
  } catch (error) {
    console.error("Error creating organization:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const findOrg = async (req, res) => {
  try {
    const rawFilter = Object.keys(req.body).length ? req.body : req.query;

    if (!rawFilter || Object.keys(rawFilter).length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "At least one filter field is required to search for the organization.",
      });
    }

    // Transform string filters into case-insensitive regex
    const filter = {};
    for (const [key, value] of Object.entries(rawFilter)) {
      if (typeof value === "string") {
        filter[key] = { $regex: `^${value}$`, $options: "i" }; // exact match, case-insensitive
      } else {
        filter[key] = value;
      }
    }

    const org = await Org.findOne(filter);

    if (!org) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Organization not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      message: "Organization found successfully.",
      org,
    });
  } catch (error) {
    console.error("Error finding organization:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};


module.exports = {
    createOrg,
    findOrg
}