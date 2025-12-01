const { StatusCodes } = require("http-status-codes");
const Invitation = require("../models/invitation");
const User = require("../models/user");
const Admin = require("../models/admin");
const Club = require("../models/club");
const schedule = require("node-schedule");
const {
  scheduleNotification,
  pingAdmins,
  scheduleNotification2,
  sendMail,
} = require("../controllers/utils");
const { default: mongoose } = require("mongoose");

//Controller 1
const createInvitation = async (req, res) => {
  const { sentTo, action, text, img1, img2, type, subject } = req.body;
  if (!sentTo || !action || !text || !type) {
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
    });
    if (type === "Content Team Application") {
      const scheduleTime = new Date(Date.now() + 3000);
      schedule.scheduleJob(
        `contentCreatorApplication_${invitation._id}`,
        scheduleTime,
        async () => {
          await pingAdmins({
            role: "Content Team",
            pingLevel: 2,
            notification: {
              title: "Hello Macbease Content Team!",
              body: "We have got new application for content creator!",
              img1,
              img2,
              key: "invitation",
              action: "invitation",
              params: {
                invitationId: invitation._id,
                action,
              },
            },
            email: {
              intro:
                "We have got a new application for Content Creator post. Please review the application.",
              outro: "Our team is getting bigger and stronger.",
              subject: "Content Creator Application",
            },
          });
        }
      );
    } else {
      let receiver = await User.findById(sentTo, { unreadNotice: 1 });
      const notice = {
        value: subject ? subject : `Proposal- ${text}`,
        img1,
        img2,
        key: "invitation",
        action: "invitation",
        params: {
          invitationId: invitation._id,
          action,
        },
        time: new Date(),
        uid: `${new Date()}/${receiver._id}/${req.user.id}`,
      };
      receiver.unreadNotice = [notice, ...receiver.unreadNotice];
      receiver.save();
    }
    return res
      .status(StatusCodes.OK)
      .json({ msg: "Invitation created successfully.", id: invitation._id });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller
const getInvitationInfo = async (req, res) => {
  const { invitationId } = req.query;
  try {
    const invitation = await Invitation.findById(invitationId);
    const userId = invitation.sentBy;
    const userInfo = await User.findById(userId, {
      name: 1,
      image: 1,
      pushToken: 1,
    });
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
    invitation.save();
    secondaryActions({
      sentBy: invitation.sentBy,
      sentTo: invitation.sentTo,
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
    secondaryActions({
      sentBy: result.sentBy,
      sentTo: result.sentTo,
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

    invitation.state = "accepted";
    invitation.save();
    secondaryActions({
      sentBy: invitation.sentBy,
      sentTo: invitation.sentTo,
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

const getPendingCreatorApplications = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send("You are not authorized to access this route.");
    }
    const applications = await Invitation.find({
      type: "Content Team Application",
      state: "undecided",
    }).populate("sentBy", "name image pushToken");
    const finalData = applications.map((application) => ({
      ...application._doc,
      senderMetaData: application.sentBy,
    }));
    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const secondaryActions = async ({
  sentBy,
  sentTo,
  sentByModal,
  sentToModal,
  pingLevel,
  senderNotification,
  receiverNotification,
  senderEmail,
  receiverEmail,
}) => {
  try {
    let oneSec = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `${sentBy}_${sentTo}_${new Date().toISOString()}`,
      oneSec,
      async () => {
        // Helper function to fetch user/admin details
        const fetchUserOrAdmin = async (id, model) => {
          const fields = {
            unreadNotice: 1,
            name: 1,
            image: 1,
            pushToken: 1,
            email: 1,
          };
          return model === "User"
            ? await User.findById(id, fields)
            : await Admin.findById(id, fields);
        };

        const sender = await fetchUserOrAdmin(sentBy, sentByModal);
        const receiver = await fetchUserOrAdmin(sentTo, sentToModal);

        if (!sender || !receiver) {
          console.error("Sender or receiver not found.");
          return;
        }

        // Helper function to send notifications
        const sendNotification = (target, notificationPayload, model) => {
          if (!notificationPayload?.title || !notificationPayload?.body) return;

          const notificationData = {
            pushToken: [target.pushToken],
            title: notificationPayload.title,
            body: notificationPayload.body,
            ...(notificationPayload.url && { url: notificationPayload.url }),
          };

          if (model === "User") {
            notificationPayload.url
              ? scheduleNotification2(notificationData)
              : scheduleNotification(
                  [target.pushToken],
                  notificationData.title,
                  notificationData.body
                );
          } else {
            // Function to dispatch notification to admin
          }
        };

        // Send notifications
        sendNotification(sender, senderNotification, sentByModal);
        sendNotification(receiver, receiverNotification, sentToModal);

        // Handle pingLevel actions
        if (pingLevel === 1 || pingLevel === 2) {
          const createNotice = (title, img1, img2) => ({
            value: title,
            img1,
            img2,
            key: "read",
            time: new Date(),
            uid: `${new Date()}/${sender._id}/${receiver._id}`,
          });

          const noticeSender = createNotice(
            senderNotification?.title,
            receiver.image,
            sender.image
          );
          const noticeReceiver = createNotice(
            receiverNotification?.title,
            sender.image,
            receiver.image
          );

          sender.unreadNotice.unshift(noticeSender);
          receiver.unreadNotice.unshift(noticeReceiver);

          await Promise.all([sender.save(), receiver.save()]);
        }

        // Send emails if pingLevel is 2
        if (pingLevel === 2) {
          const sendEmailToUser = async (target, emailData) => {
            if (!emailData) return;
            const { ses, params } = await sendMail(
              `${target.name}`,
              emailData.intro,
              emailData.outro,
              emailData.subject,
              [target.email]
            );
            ses.sendEmail(params, (err) => {
              if (err) console.error(err, err.stack);
            });
          };

          await Promise.all([
            sendEmailToUser(sender, senderEmail),
            sendEmailToUser(receiver, receiverEmail),
          ]);
        }
      }
    );
  } catch (error) {
    console.error(error);
  }
};

//fetch all the proposals of a club
const fetchAllClubProposals = async (req, res) => {
  try {
    const { clubId } = req.query;

    const club = await Club.findById(clubId, {
      proposalHistory: 1,
      undecidedProposals: 1,
    });

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    let ids = club.proposalHistory
      .map((item) => new mongoose.Types.ObjectId(item.id))
      .concat(
        club.undecidedProposals.map((item) => new mongoose.Types.ObjectId(item))
      );

    // Fetch proposals and populate user name from sentBy field
    const proposals = await Invitation.find({ _id: { $in: ids } })
      .populate({
        path: "sentBy",
        model: "User",
        select: "name course reg field passoutYear level email",
      }) // Populate only the name field from User
      .select("text sentBy"); // Select only text and sentBy fields

    // Filter proposals with more than 10 words in text
    const filteredProposals = proposals.filter((proposal) => {
      return proposal.text.split(/\s+/).length > 10;
    });

    return res.status(200).json(filteredProposals);
  } catch (error) {
    console.error("Error fetching filtered proposals:", error);
    return res.status(500).json({ message: "Server error!" });
  }
};

module.exports = {
  createInvitation,
  getInvitationInfo,
  declineInvitation,
  endorseInvitation,
  acceptInvitation,
  getPendingCreatorApplications,
  fetchAllClubProposals,
};
