const { StatusCodes } = require("http-status-codes");
const Invitation = require("../models/invitation");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const { default: mongoose } = require("mongoose");
const { fetchUserData, fetchNativeUserData, fetchNativeClubData } = require("./utilController");

//Controller 1
const createInvitation = async (req, res) => {
  const { sentTo, action, text, img1, img2, type, subject, universeMetaData } = req.body;
  if (!sentTo || !action || !text || !type || !universeMetaData) {
    return res.status(StatusCodes.BAD_REQUEST).send("Incomplete data.");
  }
  try {
    const currentDate = new Date();
    const futureDate = new Date(
      currentDate.getTime() + 7 * 24 * 60 * 60 * 1000
    );
    const invitation = await Invitation.create({
      ...req.body,
      sentBy: req.user.id,
      expiration: futureDate,
      uid: req.user.uid
    });
    await sendKafkaMessage("CREATE_INVITATION", "universe", {
      invitationId: invitation._id.toString(),
      sendBy: req.user.id,
      sentTo,
      img1,
      img2,
      type,
      action,
      subject,
      text
    });
    return res
      .status(StatusCodes.OK)
      .json({ msg: "Invitation created successfully.", id: invitation._id });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong.");
  }
};

//Controller 2
const getInvitationInfo = async (req, res) => {
  const { invitationId } = req.query;
  try {
    const invitation = await Invitation.findById(invitationId);
    const userId = invitation.sentBy;
    const user_query = {
      id: userId,
      fields: ["name", "image", "pushToken"]
    }
    const userInfo = await fetchUserData(user_query);
    const finalData = { invitation, userInfo };
    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller 3
const declineInvitation = async (req, res) => {
  const { invitationId } = req.query;
  try {
    let invitation = await Invitation.findById(invitationId, {
      sentBy: 1,
      sentTo: 1,
      expiration: 1,
      state: 1,
      subject: 1,
      cc: 1,
      sentByModel: 1,
      sentToModel: 1,
    });
    if (!invitation) {
      return res.status(StatusCodes.NOT_FOUND).send("Invitation not found.");
    }
    if (invitation.state !== "undecided") {
      return res
        .status(StatusCodes.OK)
        .send("Proposal has already been nullified.");
    }
    if (
      ![...invitation.cc, invitation.sentTo.toString()].includes(req.user.id)
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("You are not authorized to reject this proposal.");
    }
    invitation.state = "rejected";
    await invitation.save();
    await sendKafkaMessage("SECONDARY_INVITATION_ACTION", "universe", {
      sentBy: invitation.sentBy.toString(),
      sentTo: invitation.sentTo.toString(),
      pingLevel: 2,
      receiverEmail: {
        intro: `Proposal titled - ${invitation.subject} was declined by you.`,
        outro: "Thank you for reviewing the proposal.",
        subject: "Proposal Declined",
      },
      senderEmail: {
        intro: `Your proposal titled - ${invitation.subject} was declined.`,
        outro:
          "We are sorry for it. Hope so you try again with better proposal.",
        subject: "Proposal Declined",
      },
      receiverNotification: {
        title: "Proposal Declined",
        body: `Proposal titled - ${invitation.subject} was declined by you.`,
        img1: "xyz",
        img2: "xyz",
      },
      senderNotification: {
        title: "Proposal Declined",
        body: `Your proposal titled - ${invitation.subject} was declined.`,
        img1: "xyz",
        img2: "xyz",
      },
      sentByModal: invitation.sentByModel,
      sentToModal: invitation.sentToModel,
    });

    return res
      .status(StatusCodes.OK)
      .send("Proposal has been successfully declined.");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 4
const endorseInvitation = async (req, res) => {
  const { invitationId } = req.body;
  try {
    const result = await Invitation.findByIdAndUpdate(
      invitationId,
      { $addToSet: { endorsedBy: req.user.id } },
      {
        new: true,
        fields: {
          endorsedBy: 1,
          sentBy: 1,
          subject: 1,
          sentTo: 1,
          sentByModel: 1,
          sentToModel: 1,
        },
      }
    );
    if (!result) {
      return res.status(StatusCodes.NOT_FOUND).send("Invitation not found.");
    }
    await sendKafkaMessage("SECONDARY_INVITATION_ACTION", "universe", {
      sentBy: result.sentBy.toString(),
      sentTo: result.sentTo.toString(),
      pingLevel: 0,
      receiverNotification: {
        title: "Proposal Endorsed",
        body: `Thank you for endorsing proposal titled ${result.subject}`,
      },
      senderNotification: {
        title: "Proposal Endorsed",
        body: `Your proposal titled - ${result.subject} was endorsed.`,
      },
      sentByModal: result.sentByModel,
      sentToModal: result.sentToModel,
    });

    return res
      .status(StatusCodes.OK)
      .send("Successfully endorsed the proposal.");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error endorsing proposal.");
  }
};

//Controller 5
const acceptInvitation = async (req, res) => {
  const { invitationId } = req.query;
  console.log(`[acceptInvitation] Received request for invitationId: ${invitationId}, user: ${req.user.id}`);
  try {
    let invitation = await Invitation.findById(invitationId, {
      sentBy: 1,
      sentTo: 1,
      expiration: 1,
      state: 1,
      subject: 1,
      cc: 1,
      sentByModel: 1,
      sentToModel: 1,
    });
    
    console.log(`[acceptInvitation] Fetched invitation: ${!!invitation}`);

    if (!invitation) {
      console.log(`[acceptInvitation] Invitation not found`);
      return res.status(StatusCodes.NOT_FOUND).send("Invitation not found.");
    }
    
    if (invitation.state !== "undecided") {
      console.log(`[acceptInvitation] Invitation state is not undecided: ${invitation.state}`);
      return res
        .status(StatusCodes.OK)
        .send("Proposal has already been nullified.");
    }
    
    let allowedUsers = [...(invitation.cc || []), invitation.sentTo?.toString()];

    if (req.query.clubId) {
      const clubQuery = {
        id: req.query.clubId,
        fields: ["permissions", "mainAdmin"],
        callSign: "universe"
      };
      const clubData = await fetchNativeClubData(clubQuery);
      if (clubData) {
        if (clubData.permissions && clubData.permissions.length > 0) {
          allowedUsers.push(...clubData.permissions);
        } else if (clubData.mainAdmin) {
          allowedUsers.push(clubData.mainAdmin.toString());
        }
      }
    }

    if (!allowedUsers.includes(req.user.id)) {
      console.log(`[acceptInvitation] User ${req.user.id} not authorized. Allowed:`, allowedUsers);
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("You are not authorized to reject this proposal.");
    }

    invitation.state = "accepted";
    await invitation.save();
    console.log(`[acceptInvitation] Invitation state updated to accepted`);
    
    await sendKafkaMessage("SECONDARY_INVITATION_ACTION", "universe", {
      sentBy: invitation.sentBy.toString(),
      sentTo: invitation.sentTo.toString(),
      pingLevel: 2,
      receiverEmail: {
        intro: `Proposal titled - ${invitation.subject} was accepted by you.`,
        outro: "Thank you for reviewing the proposal.",
        subject: "Proposal Accepted",
      },
      senderEmail: {
        intro: `Your proposal titled - ${invitation.subject} was accepted.`,
        outro: "Congratulations! It is a remarkable achievement.",
        subject: "Proposal Accepted",
      },
      receiverNotification: {
        title: "Proposal Accepted",
        body: `Proposal titled - ${invitation.subject} was accepted by you.`,
        img1: "xyz",
        img2: "xyz",
      },
      senderNotification: {
        title: "Proposal Accepted",
        body: `Your proposal titled - ${invitation.subject} was accepted.`,
        img1: "xyz",
        img2: "xyz",
      },
      sentByModal: invitation.sentByModel,
      sentToModal: invitation.sentToModel,
    });

    console.log(`[acceptInvitation] Successfully sent Kafka message for secondary invitation action`);
    return res
      .status(StatusCodes.OK)
      .send("Proposal has been successfully declined."); // Note: Original message said 'declined' here
  } catch (error) {
    console.error(`[acceptInvitation] Error:`, error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const getPendingCreatorApplications = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to access this route.");
    }

    const applications = await Invitation.find({
      type: "Content Team Application",
      state: "undecided",
    });

    // Fetch metadata for each `sentBy` user (in parallel)
    const userMetadataList = await Promise.all(
      applications.map((app) => fetchUserData({
        id: app.sentBy.toString(),
        fields: ["name", "image", "pushToken", "_id"]
      }))
    );

    // Merge user metadata back into the response
    const finalData = applications.map((app, index) => ({
      ...app.toObject(),
      senderMetaData: userMetadataList[index] || null,
    }));

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error("Error in getPendingCreatorApplications:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while fetching pending applications.");
  }
};


//fetch all the proposals of a club
const fetchAllClubProposals = async (req, res) => {
  try {
    const { clubId } = req.query;

    const club_query = {
      id: clubId,
      fields: ["proposalHistory", "undecidedProposals"],
      callSign: "universe"
    }
    const club = await fetchNativeClubData(club_query);

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    let ids = club.proposalHistory
      .map((item) => new mongoose.Types.ObjectId(item.id))
      .concat(
        club.undecidedProposals.map((item) => new mongoose.Types.ObjectId(item))
      );

    // Fetch proposals and populate user name from sentBy field
    const proposals = await Invitation.find({ _id: { $in: ids } }).select(
      "text sentBy"
    );

    // Step 2: Extract unique user IDs from sentBy
    const userIds = [...new Set(proposals.map((p) => p.sentBy.toString()))];

    // Step 3: Fetch user data for each ID (use Map to avoid redundant calls)
    const userMap = new Map();

    await Promise.all(
      userIds.map(async (userId) => {
        const userData = await fetchNativeUserData({
          id: userId,
          fields: ["name", "course", "reg", "field", "passoutYear", "level", "email"],
          callSign: "universe"
        });
        userMap.set(userId, userData);
      })
    );

    // Step 4: Filter proposals and replace sentBy with user data
    const filteredProposals = proposals
      .filter((proposal) => {
        return proposal.text.split(/\s+/).length > 10;
      })
      .map((proposal) => ({
        ...proposal.toObject(),
        sentBy: userMap.get(proposal.sentBy.toString()) || null,
      }));

    return res.status(200).json(filteredProposals);
  } catch (error) {
    console.error("Error fetching filtered proposals:", error);
    return res.status(500).json({ message: "Server error!" });
  }
};

const getInvitationById = async (req, res) => {
  try {
    const { id, select } = req.body; // id can be a string or an array

    // Validate ID
    if (!id || (Array.isArray(id) && id.length === 0)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Invitation ID is required.");
    }

    // Build projection (selected fields)
    let projection = null;
    if (select && Array.isArray(select) && select.length > 0) {
      projection = select.join(" ");
    }

    let invitations;

    if (Array.isArray(id)) {
      // Multiple IDs → fetch all matching invitations
      invitations = await Invitation.find({ _id: { $in: id } }).select(projection);
    } else {
      // Single ID → fetch one invitation
      const singleInvitation = await Invitation.findById(id).select(projection);
      invitations = singleInvitation;
    }

    if (!invitations || invitations.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("No invitations found.");
    }

    return res.status(StatusCodes.OK).json(invitations);
  } catch (error) {
    console.error("Error fetching invitation(s):", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An unexpected error occurred while fetching invitation(s).");
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allInvitations = await Invitation.find({});

    const bulkOps = allInvitations.map((invitation) => ({
      updateOne: {
        filter: { _id: invitation._id },
        update: {
          $set: {
            uid: "696f491a0bfc89b35dc62326",
            universeMetaData: {
              location: "Punjab, India",
              logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
              logoKey: "public/universes/lpu_logo-removebg-preview.png",
              name: "Lovely Professional University",
              callSign: "LPU",
              lat: 31.25361,
              lng: 75.70361
            },
          },
        },
      }
    }));

    const result = await Invitation.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} Invitations`);

    res.status(StatusCodes.OK).json({
      message: "Invitations updated successfully.",
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.log("Error updating invitations:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
}

module.exports = {
  createInvitation,
  getInvitationInfo,
  declineInvitation,
  endorseInvitation,
  acceptInvitation,
  getPendingCreatorApplications,
  fetchAllClubProposals,
  insertNewFields,
  getInvitationById
};
