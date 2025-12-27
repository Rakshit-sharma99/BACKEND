const mongoose = require("mongoose");
const {StatusCodes} = require("http-status-codes");
const JoinLink = require("../models/joinLink");

const createJoinLink = async (req, res) => {
  try {
    const { type, belongsTo, expiry, maxUses, accessibleTo,universeMetaData } = req.body;

    // Validate `type`
    if (!["Club", "Community"].includes(type)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid type. Must be either 'Club' or 'Community'.",
      });
    }

    // Create the join link
    const newJoinLink = new JoinLink({
      type,
      belongsTo: belongsTo.trim(),
      expiry: expiry ? new Date(expiry) : null,
      maxUses: maxUses ?? -1,
      accessibleTo: accessibleTo || [],
      uid:req.user.uid,
      universeMetaData
    });

    await newJoinLink.save();

    return res.status(StatusCodes.CREATED).json({
      message: "Join link created successfully.",
      joinLink: newJoinLink,
    });
  } catch (err) {
    console.error("Error creating join link:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error.",
    });
  }
};

const getJoinLinkData = async (req, res) => {
  try {
    const { linkId } = req.query;
    const userId = req.user?.id;

    // 1. Validate linkId
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Invalid link ID" });
    }

    // 2. Fetch the join link
    const link = await JoinLink.findById(linkId);
    if (!link) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Join link not found" });
    }

    // 3. Run usage/access checks
    const canBeUsed = link.canBeUsed(userId);
    if (!canBeUsed) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: "This link cannot be used by you." });
    }

    return res.status(StatusCodes.OK).json({
      id: link._id,
      type: link.type,
      belongsTo: link.belongsTo,
      expiry: link.expiry,
      metaData: link.metaData,
      canBeUsed,
    });
  } catch (error) {
    console.error("Error fetching join link:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error." });
  }
};

const insertNewFields = async (req,res) => {
    try{
        const allLinks = await JoinLink.find({});

        const bulkOps = allLinks.map((link) => ({
            updateOne: {
                filter: {_id: link._id},
                update:{
                   $set: {
                    uid: "682f0418482d651a6df66c23",
                    universeMetaData: {
                        location: "Phagwara,Punjab,India",
                        logo: "public/universes/lpu_logo.jpg",
                        name: "Lovely Professional University",
                        callSign: "universe",
                    },
                },
            }, 
        }
    }));

    const result = await JoinLink.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} joinLinks`);

    res.status(StatusCodes.OK).json({
        message: "joinLinks updated successfully.",
        modifiedCount: result.modifiedCount
    });
    } catch(err){
        console.log("Error updating joinLinks:",err);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({error: "Internal server error"});
    }
}

const getJoinLinkById = async (req, res) => {
  try {
    const { id, select } = req.body; // id can be a string or an array

    // Validate ID
    if (!id || (Array.isArray(id) && id.length === 0)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("JoinLink ID is required.");
    }

    // Build projection (selected fields)
    let projection = null;
    if (select && Array.isArray(select) && select.length > 0) {
      projection = select.join(" ");
    }

    let JoinLinks;

    if (Array.isArray(id)) {
      // Multiple IDs → fetch all matching JoinLinks
      JoinLinks = await JoinLink.find({ _id: { $in: id } }).select(projection);
    } else {
      // Single ID → fetch one JoinLink
      const singleJoinLink = await JoinLink.findById(id).select(projection);
      JoinLinks = singleJoinLink;
    }

    if (!JoinLinks || JoinLinks.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("No JoinLinks found.");
    }

    return res.status(StatusCodes.OK).json(JoinLinks);
  } catch (error) {
    console.error("Error fetching JoinLink(s):", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An unexpected error occurred while fetching JoinLink(s).");
  }
};

module.exports = {
  createJoinLink,
  getJoinLinkData,
  insertNewFields,
  getJoinLinkById
};
