const { StatusCodes } = require("http-status-codes");
const Club = require("../models/club");
const Event = require("../models/event");
const User = require("../models/user");
const Admin = require("../models/admin");
const Community = require("../models/community");
const MacbeaseContent = require("../models/macbeaseContent");
const Invitation = require("../models/invitation");
const Itinerary = require("../models/itinerary");
const Award = require("../models/award");
const schedule = require("node-schedule");
const {
  sendMail,
  getCurrentISTDate,
  scheduleNotification,
  updateDynamicIsland,
  scheduleNotification2,
  generateUri,
  fetchMacbeaseContentFromIds,
  fetchInvitationById,
  fetchItineraryFromIds,
} = require("../controllers/utils");
const mongoose = require("mongoose");
const { getPushTokens } = require("./userControllers");
const {
  fetchContent,
  fetchMultipleContents,
  searchContentsFromIds,
} = require("./interServiceCalls");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");

//Middleware

const checkAuthorization = async (clubId, id) => {
  const club = await Club.findById(clubId, {
    adminId: 1,
    mainAdmin: 1,
    _id: 0,
  });
  if (club) {
    if (club.mainAdmin === id) return "Fully-authorized";
    let admins = club.adminId;
    let matchedAdmin = admins.find((item) => item === id);
    if (matchedAdmin) return "Authorized";
    return "Not-authorized";
  } else {
    return "Club not found";
  }
};

const isInTeam = async (clubId, id) => {
  const club = await Club.findById(clubId, { team: 1, _id: 0 });
  for (let i = 0; i < club.team.length; i++) {
    const memberId = club.team[i].id;
    if (memberId === id) {
      return "Team Member";
    }
  }
  return "Not Team Member";
};

const checkIsMember = async (clubId, userId) => {
  const club = await Club.findById(clubId);
  if (club) {
    let clubMembers = club.members;
    let matchedMember = clubMembers.find((item) => item === userId);
    if (matchedMember) return "Is a member";
    return "Not a member";
  } else {
    return "Club not found";
  }
};

//Controller 1

const validateRequestBody = (body) => {
  const errors = [];

  // Required fields and their validation logic
  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    errors.push("Name is required and must be a non-empty string.");
  }

  if (
    !body.motto ||
    typeof body.motto !== "string" ||
    body.motto.trim() === ""
  ) {
    errors.push("Motto is required and must be a non-empty string.");
  }

  if (
    !body.featuringImg ||
    typeof body.featuringImg !== "string" ||
    body.featuringImg.trim() === ""
  ) {
    errors.push("Featuring image must be a valid URL.");
  }

  if (
    !Array.isArray(body.tags) ||
    body.tags.length === 0 ||
    body.tags.some((tag) => typeof tag !== "string" || tag.trim() === "")
  ) {
    errors.push("Tags must be a non-empty array of non-empty strings.");
  }

  if (
    !body.secondaryImg ||
    typeof body.secondaryImg !== "string" ||
    body.secondaryImg.trim() === ""
  ) {
    errors.push("Secondary image must be a valid URL.");
  }

  return errors;
};

const createClub = async (req, res) => {
  try {
    const errors = validateRequestBody(req.body);
    if (errors.length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ errors });
    }
    const club = await Club.create({
      ...req.body,
      adminId: [req.user.id],
      mainAdmin: req.user.id,
      team: [{ id: req.user.id, pos: "Founder" }],
      members: [req.user.id],
      createdOn: new Date(),
      permissions: {
        whoCanPost: [req.user.id],
        whoCanAcceptProposals: [req.user.id],
        chatModerators: [req.user.id],
        whoCanSendNotifications: [req.user.id],
        whoCanDispatchAwards: [req.user.id],
      },
    });
    const founder = await User.findById(req.user.id, {
      clubs: 1,
      unreadNotice: 1,
      email: 1,
      name: 1,
      pushToken: 1,
      image: 1,
      reg: 1,
      shortCuts: 1,
    });
    founder.clubs.push({
      clubId: club._id.toString(),
      joinDate: new Date(),
      badges: [],
    });
    await founder.save();
    secondaryActionsForClubCreation(req, club, founder);
    return res.status(StatusCodes.OK).json(club);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const secondaryActionsForClubCreation = async (req, club, founder) => {
  try {
    //sending an in-app notification
    const scheduleTime = new Date(Date.now() + 3000);
    schedule.scheduleJob(`clubCreation_${club._id}`, scheduleTime, async () => {
      const noticeForFounder = {
        value: `Congratulations! ${founder.name} for starting the club ${club.name}.`,
        img1: club.secondaryImg,
        img2: founder.image,
        key: "read",
        action: "club",
        params: {
          name: club.name,
          secondaryImg: club.secondaryImg,
          id: club._id,
        },
        time: new Date(),
        uid: `${new Date()}/${club.mainAdmin}/${req.user.id}`,
      };
      const shortCut = {
        type: "club",
        id: club._id,
        name: club.name,
        secondaryImg: club.secondaryImg,
        native: true,
        metaData: { posts: 0, notifications: 0, messages: 0 },
      };
      founder.shortCuts = [shortCut, ...founder.shortCuts];
      founder.unreadNotice = [noticeForFounder, ...founder.unreadNotice];
      await founder.save();
      scheduleNotification2({
        pushToken: [founder.pushToken],
        title: `🎉 Hats Off, Founder Extraordinaire! 🎩`,
        body: `You've just birthed the legendary club "${club.name}" into existence. The world (and your members) are waiting for your brilliance! 🌟`,
        url: `https://macbease.com/app/club/${club._id}`,
      });

      //sending an email
      const name = founder.name;
      const intro = [
        `Congratulations! ${founder.name} for starting the club ${club.name}.`,
        "Our team at Macbease will help you turn this club into great organization.",
      ];
      const outro =
        "This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.";
      const subject = "Club Creation";
      const destination = [founder.email];
      const { ses, params } = await sendMail(
        name,
        intro,
        outro,
        subject,
        destination
      );
      ses.sendEmail(params, function (err, data) {
        if (err) {
          console.log(err, err.stack);
        }
      });
    });
  } catch (error) {
    console.error("Error in secondary action for club creation:", error);
  }
};

//Controller 2
const deleteClub = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { clubId } = req.body;
    const id = req.user.id;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === "Fully-authorized") {
      if (req.user.role === "admin") {
        const deletedClub = await Club.findByIdAndRemove({ _id: clubId });
        Admin.findById(req.user.id, (err, admin) => {
          if (err) return console.error(err);
          let clubs = admin.clubs;
          clubs.filter((item) => {
            item !== clubId;
          });
          admin.clubs = [];
          admin.clubs = clubs;
          admin.save((err, update) => {
            if (err) return console.error(err);
            return res
              .status(StatusCodes.OK)
              .send("Club was successfully deleted.");
          });
        });
      }
      if (req.user.role === "user") {
        const deletedClub = await Club.findByIdAndRemove({ _id: clubId });
        User.findById(req.user.id, (err, user) => {
          if (err) return console.error(err);
          let clubs = user.clubs;
          clubs = clubs.filter((item) => {
            item.clubId !== clubId;
          });
          user.clubs = [];
          user.clubs = clubs;
          user.save((err, update) => {
            if (err) return console.error(err);
            return res
              .status(StatusCodes.OK)
              .send("Club was successfully deleted.");
          });
        });
      }
    }
    if (isAuthorized === "Authorized" || isAuthorized === "Not-authorized") {
      return res
        .status(StatusCodes.OK)
        .send("You are not authorized to delete the club.");
    }
    if (isAuthorized === "Club not found") {
      return res.status(StatusCodes.OK).send("No such club is active.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to access the route of deleting the club.");
  }
};

//Controller 3
const joinAsMember = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { clubId } = req.body;
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      if (club.members.includes(req.user.id)) {
        return res.status(StatusCodes.OK).send("You are already a member.");
      }
      if (club) {
        if (req.user.role === "user") {
          User.findById(req.user.id, (err, user) => {
            if (err) return console.error(err);
            user.clubs.push({
              clubId: clubId,
              joinDate: new Date(),
              badges: [],
            });
            user.save();
          });
        }
        if (req.user.role === "admin") {
          Admin.findById(req.user.id, (err, admin) => {
            if (err) return console.error(err);
            admin.clubs.push({ clubId: clubId });
            admin.save();
          });
        }
        club.members.push(req.user.id);
        let len = club.xAxisData.length;
        let lastElement = club.xAxisData[len - 1];
        let newElement = lastElement + 1;
        club.xAxisData.push(newElement);
        club.yAxisData.push(new Date());
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send("You have successfully joined as the member of the club.");
        });
      } else {
        return res.status(StatusCodes.OK).send("No such club found.");
      }
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to be the member of the club.");
  }
};

//Controller 4
const leaveAsMember = async (req, res) => {
  try {
    const { clubId } = req.body;

    // Find the club
    const club = await Club.findById(clubId, {
      members: 1,
      adminId: 1,
      team: 1,
      xAxisData: 1,
      yAxisData: 1,
    });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("No such club found.");
    }

    // Prevent the founder from leaving
    if (req.user.id === club.mainAdmin) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send(
          "You are the founder. Leaving means the club will be disbanded. Please contact Macbease for further assistance."
        );
    }

    // Remove the club from the user's clubs list
    const user = await User.findById(req.user.id, { clubs: 1 });

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("User not found. Please try again.");
    }
    user.clubs = user.clubs.filter((club) => club.clubId !== clubId);
    await user.save();

    // Remove the user from the club's members, admins, and team
    club.members = club.members.filter((memberId) => memberId !== req.user.id);
    club.adminId = club.adminId.filter((adminId) => adminId !== req.user.id);
    club.team = club.team.filter((teamMember) => teamMember.id !== req.user.id);

    // Update club analytics data (xAxis and yAxis)
    const lastElement = club.xAxisData[club.xAxisData.length - 1];
    club.xAxisData.push(lastElement - 1); // Decrement membership count
    club.yAxisData.push(new Date()); // Add current timestamp

    await club.save();

    return res
      .status(StatusCodes.OK)
      .send("You have successfully left the club as a member.");
  } catch (error) {
    console.error("Error in leaveAsMember:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while processing your request.");
  }
};

//Controller 5
const addAsMember = async (req, res) => {
  try {
    const { role, id } = req.user;
    if (role !== "admin" && role !== "user") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to add members to the club.");
    }

    const { clubId, userId } = req.body;

    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === "Not-authorized") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to add members to the club.");
    }
    if (isAuthorized === "Club not found") {
      return res.status(StatusCodes.NOT_FOUND).send("No such club is active.");
    }

    const [club, user] = await Promise.all([
      Club.findById(clubId, {
        name: 1,
        secondaryImg: 1,
        members: 1,
        xAxisData: 1,
        yAxisData: 1,
      }),
      User.findById(userId, {
        name: 1,
        email: 1,
        clubs: 1,
        image: 1,
        unreadNotice: 1,
        pushToken: 1,
      }),
    ]);

    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("No such club found.");
    }
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("No such user found.");
    }

    // Check if the user is already a member
    const isAlreadyMember = club.members.some(
      (memberId) => memberId.toString() === userId
    );

    if (isAlreadyMember) {
      return res
        .status(StatusCodes.OK)
        .send("Successfully added the member to the club.");
    }

    // Add the user to the club
    user.clubs.push({
      clubId,
      joinDate: new Date(),
      badges: [],
    });

    club.members.push(userId);

    const newElement =
      (club.xAxisData.length ? club.xAxisData[club.xAxisData.length - 1] : 0) +
      1;
    club.xAxisData.push(newElement);
    club.yAxisData.push(new Date());

    await Promise.all([user.save(), club.save()]);

    scheduleMemberNotification(user, club);

    return res
      .status(StatusCodes.OK)
      .send("Successfully added the member to the club.");
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while adding the member.");
  }
};

const scheduleMemberNotification = (user, club) => {
  const notice = {
    value: `Congratulations! ${club.name} accepted your membership application.`,
    img1: club.secondaryImg,
    img2: user.image,
    key: "read",
    action: "club",
    params: { name: club.name, secondaryImg: club.secondaryImg, id: club._id },
    time: new Date(),
    uid: new Date().toISOString() + "membership_accepted",
  };
  const scheduleTime = new Date(Date.now() + 3 * 1000);
  schedule.scheduleJob(
    `congratulateMember_${user.id}_${scheduleTime}`,
    scheduleTime,
    async () => {
      user.unreadNotice.unshift(notice);
      scheduleNotification2({
        pushToken: [user.pushToken],
        title: `Congratulations🎊🥳🎉!`,
        body: `${club.name} accepted your membership application.`,
        url: `https://macbease.com/app/club/${club._id}`,
      });
      await user.save();
      await sendMemberEmail(user, club);
    }
  );
};

// Function to send member email
const sendMemberEmail = async (user, club) => {
  const name = user.name;
  const intro = [
    `Congratulations! for becoming the member of the club ${club.name}.`,
    "As a member, you will have access to exclusive events, resources, and opportunities to connect with fellow members. We encourage you to participate actively and make the most of your membership.",
  ];
  const outro =
    "This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.";
  const subject = "Great News";
  const destination = [user.email];

  const { ses, params } = await sendMail(
    name,
    intro,
    outro,
    subject,
    destination
  );
  ses.sendEmail(params, (err) => {
    if (err) {
      console.error("Error sending email:", err);
    }
  });
};

//Controller 6
const removeAsMember = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { clubId, userId } = req.body;
    const id = req.user.id;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === "Fully-authorized") {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        User.findById(userId, (err, user) => {
          if (err) return console.error(err);
          let clubs = user.clubs;
          clubs = clubs.filter((item) => {
            item !== clubId;
          });
          user.clubs = [];
          user.clubs = clubs;
          user.save();
        });
        let clubMembers = club.members;
        let clubAdmins = club.adminId;
        let clubTeam = club.team;
        clubMembers = clubMembers.filter((item) => item !== userId);
        clubAdmins = clubAdmins.filter((item) => item !== userId);
        let teamArr = [];
        for (let i = 0; i < clubTeam.length; i++) {
          if (clubTeam[i].id !== userId) {
            teamArr.push(clubTeam[i]);
          }
        }
        club.members = [];
        club.members = clubMembers;
        club.adminId = [];
        club.adminId = clubAdmins;
        club.team = [];
        club.team = teamArr;
        let len = club.xAxisData.length;
        let lastElement = club.xAxisData[len - 1];
        let newElement = lastElement - 1;
        club.xAxisData.push(newElement);
        club.yAxisData.push(new Date());
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send("Successfully removed the member of the club.");
        });
      });
    }
    if (isAuthorized === "Not-authorized") {
      return res
        .status(StatusCodes.OK)
        .send("You are not authorized to remove members from the club.");
    }
    if (isAuthorized === "Club not found") {
      return res.status(StatusCodes.OK).send("No such club is active.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to remove members from the club.");
  }
};

//Controller 7
const addAdmin = async (req, res) => {
  try {
    const { clubId, userId } = req.body;
    const { id, role } = req.user;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === "Club not found") {
      return res.status(StatusCodes.NOT_FOUND).send("No such club is active.");
    }
    if (isAuthorized !== "Fully-authorized") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to add an admin to the club.");
    }
    const isMember = await checkIsMember(clubId, userId);
    if (isMember !== "Is a member") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("The user must first become a member of the club.");
    }
    const club = await Club.findById(clubId, {
      adminId: 1,
      name: 1,
      secondaryImg: 1,
    });
    const userInfo = await User.findById(userId, { pushToken: 1 });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
    }
    club.adminId.push(userId);
    scheduleNotification2({
      pushToken: [userInfo.pushToken],
      title: `Congratulations🎊🥳🎉!`,
      body: `You were promoted to admin post in ${club.name}`,
      url: `https://macbease.com/app/club/${clubId}`,
    });
    await club.save();
    return res.status(StatusCodes.OK).send("Admin successfully added");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while adding the admin.");
  }
};

//Controller 8
const removeAdmin = async (req, res) => {
  try {
    const { clubId, userId } = req.body;

    // Check if the user is authorized
    const isAuthorized = await checkAuthorization(clubId, req.user.id);

    // Handle authorization cases
    if (
      isAuthorized === "Fully-authorized" ||
      (isAuthorized === "Authorized" && userId === req.user.id)
    ) {
      const club = await Club.findById(clubId);
      if (!club) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .send("No such club is active.");
      }

      // Remove the admin
      club.adminId = club.adminId.filter(
        (adminId) => adminId.toString() !== userId.toString()
      );

      await club.save();
      return res
        .status(StatusCodes.OK)
        .send("Admin has been successfully removed.");
    } else if (
      isAuthorized === "Authorized" ||
      isAuthorized === "Not-authorized"
    ) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to remove admin from the club.");
    } else if (isAuthorized === "Club not found") {
      return res.status(StatusCodes.NOT_FOUND).send("No such club is active.");
    }
  } catch (error) {
    console.error("Error removing admin:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while removing the admin.");
  }
};

// Function to segregate array into batches
function segregateIntoBatches(array, batchSize) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

// secondary function for posting event on club
const scheduleEventNotifications = async (event, clubId, userId) => {
  try {
    const threeSec = new Date(Date.now() + 3 * 1000);
    schedule.scheduleJob(
      `pushNoticeOfEvent_${userId}_${Date.now()}`,
      threeSec,
      async () => {
        const club = await Club.findById(clubId, {
          name: 1,
          secondaryImg: 1,
          notifications: 1,
          members: 1,
        });

        if (!club) return console.error("Club not found");

        const { name: clubName, secondaryImg, members } = club;
        const { name: eventName, eventDate, url } = event;

        if (!members || members.length === 0)
          return console.log("No members to notify");

        const userDetails = await User.findById(userId, {
          name: 1,
          image: 1,
          pushToken: 1,
        }).lean();

        // Prepare club notice
        const clubNotice = {
          uid: new Date().toISOString() + `${userId}`,
          title: "Upcoming event!",
          msg: `We are going to organize ${eventName}!`,
          visibility: "public",
          createdAt: getCurrentISTDate(),
          postedBy: userId,
          name: userDetails.name,
          image: userDetails.image,
          pushToken: userDetails.pushToken,
        };

        // Update club notifications
        club.notifications.unshift(clubNotice);
        await club.save();

        let emails = [];
        let pushTokens = [];

        // Fetch user data in a single batch request
        const users = await User.find(
          { _id: { $in: members } },
          { unreadNotice: 1, eventFeed: 1, email: 1, pushToken: 1 }
        );

        const notice = {
          value: `${clubName} is going to organize ${eventName}.`,
          img1: secondaryImg,
          img2: url,
          key: "event",
          action: "eventExpand",
          params: { eventData: event },
          time: new Date(),
        };

        users.forEach((user) => {
          pushTokens.push(user.pushToken);
          emails.push(user.email);

          user.unreadNotice.unshift({
            ...notice,
            uid: `${Date.now()}/${user._id}/${userId}`,
          });
          user.eventFeed.unshift({
            ...event,
            header: `${clubName} is going to organize ${eventName}`,
          });

          user.save();
        });

        // Send push notifications in batch
        scheduleNotification(
          pushTokens.filter(Boolean),
          "Upcoming Event!",
          `${clubName} is organizing ${eventName} on ${eventDate}`
        );
        scheduleNotification2({
          pushToken: pushTokens.filter(Boolean),
          title: "Upcoming Event!",
          body: `${clubName} is organizing ${eventName} on ${eventDate}.`,
          url: `https://macbease.com/app/eventExpand/${event.eventId}`,
        });

        // Send emails in batches
        const emailBatches = segregateIntoBatches(emails, 50);
        emailBatches.forEach(async (batch) => {
          try {
            const { ses, params } = await sendMail(
              "there!",
              [
                `We are glad to inform you that ${clubName} is organizing ${eventName}. Find out more on the club's official page at Macbease.`,
                `We are expecting to see your active participation.`,
              ],
              "This is good college life!",
              "Upcoming Event",
              batch,
              {
                instructions: "Click below to view event details:",
                text: "View Event",
                url: `https://macbease.com/app/eventExpand/${event.eventId}`,
                color: "#1ea1ed",
              }
            );
            await ses.sendEmail(params).promise();
          } catch (error) {
            console.error("Error sending email:", error);
          }
        });
      }
    );
  } catch (error) {
    console.error("Error scheduling event notifications:", error);
  }
};

//Controller 9
const postEvent = async (req, res) => {
  try {
    const { clubId, event } = req.body;

    if (!["admin", "user"].includes(req.user.role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to post an event.");
    }

    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (!["Fully-authorized", "Authorized"].includes(isAuthorized)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You must be an admin to post an event.");
    }

    const club = await Club.findById(clubId, { upcomingEvent: 1, name: 1 });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
    }

    club.upcomingEvent.unshift({ ...event, postedBy: req.user.id });
    await club.save();

    // Schedule notifications, emails, and feeds
    scheduleEventNotifications(event, clubId, req.user.id);

    return res.status(StatusCodes.OK).send("Event posted successfully.");
  } catch (error) {
    console.error("Error posting event:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 10
const removeEvent = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== "admin" && role !== "user") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to remove an event.");
    }

    const { clubId, eventId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, userId);

    if (!["Fully-authorized", "Authorized"].includes(isAuthorized)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You must be an admin to remove an event.");
    }

    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
    }

    let cantDelete = false;
    club.upcomingEvent = await Promise.all(
      club.upcomingEvent.map(async (eventPoint) => {
        if (eventPoint.id === eventId && eventPoint.eventId) {
          const concernedEvent = await Event.findById(eventPoint.eventId);
          if (
            concernedEvent &&
            (concernedEvent.status === "featured" ||
              concernedEvent.status === "past and unclear")
          ) {
            cantDelete = true;
            return eventPoint; // Keep the event
          }
          await Event.findByIdAndDelete(eventPoint.eventId);
          return null; // Remove event
        }
        return eventPoint;
      })
    );

    if (cantDelete) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("Cannot delete featured event.");
    }

    club.upcomingEvent = club.upcomingEvent.filter(Boolean);
    await club.save();

    return res.status(StatusCodes.OK).send("Successfully removed event!");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred.");
  }
};

//Controller 11
const postContent = async (req, res) => {
    let { clubId, contentId } = req.body;
    const clubData = await Club.findById(clubId, { permissions: 1 }).lean();
    const isAuthorized = Array.isArray(clubData?.permissions?.whoCanPost)
      ? clubData.permissions.whoCanPost.includes(req.user.id)
      : false;

    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to post in this club.");
    }
      try {
        //scheduling job for updating feed
        let threeSec = new Date(Date.now() + 1 * 3 * 1000);
        let content = await fetchContent({
          contentId,
          select: "url,contentType,text",
        });
        content = content;
        schedule.scheduleJob(
          `feedClub_${req.user.id}_${new Date()}`,
          threeSec,
          async () => {
            try {
              //reproduce actual content to be pushed in the user's feed
              const club = await Club.findById(clubId, {
                members: 1,
                name: 1,
                secondaryImg: 1,
                pinnedBy: 1,
                _id: 0,
              });
              let point = {
                _id: contentId,
              };
              let noticeTemplate = {
                value: `${club.name} posted a pin.`,
                img1: club.secondaryImg,
                img2: content.url,
                contentType: content.contentType,
                key: "content",
                action: "club",
                params: {
                  name: club.name,
                  secondaryImg: club.secondaryImg,
                  id: clubId,
                },
                time: new Date(),
              };
              let users = await User.find(
                { _id: { $in: club.members } },
                { pushToken: 1, feed: 1, unreadNotice: 1 }
              );
              const tokens = users.map((item) => item.pushToken);
              let userUpdatePromise = users.map((user) => {
                let notice = {
                  ...noticeTemplate,
                  uid: `${new Date()}/${user._id}/${req.user.id}`,
                };
                user.feed = [point, ...user.feed];
                user.unreadNotice = [notice, ...user.unreadNotice];
                return user.save();
              });
              await Promise.all(userUpdatePromise);
              await updateDynamicIsland(club.pinnedBy, clubId, "posts", true);
              if (content.contentType === "image") {
                const img = await generateUri(content.url.split("@")[0]);
                scheduleNotification2({
                  pushToken: tokens,
                  title: `${club.name} posted a pin.`,
                  body: `${content.text.substring(0, 50)}...`,
                  image: img,
                  url: `https://macbease.com/app/club/${clubId}`,
                });
              } else {
                scheduleNotification2({
                  pushToken: tokens,
                  title: `${club.name} posted a pin.`,
                  body: `${content.text.substring(0, 50)}...`,
                  url: `https://macbease.com/app/club/${clubId}`,
                });
              }
            } catch (error) {
              console.error("Error in scheduled job:", error);
            }
          }
        );
        let data = { contentId, postedBy: req.user.id, timeStamp: new Date() };
        let concernedClub = await Club.findById(clubId, {
          content: 1,
          videos: 1,
        });
        concernedClub.content = [...concernedClub.content, data];
        if (content.contentType === "video") {
          concernedClub.videos = [...concernedClub.videos, data];
        }
        concernedClub.save();
        let user = await User.findById(req.user.id, { clubContributions: 1 });
        user.clubContributions = [contentId, ...user.clubContributions];
        user.save();
        return res.status(StatusCodes.OK).send("Successfully posted content!");
      } catch (error) {
        console.log(error);
        return res.status(StatusCodes.OK).send("Something went wrong.");
      }
};

//Controller 12
const removeContent = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { clubId, contentId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === "Fully-authorized" || isAuthorized === "Authorized") {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let contents = club.content;
        let videos = club.videos;
        contents = contents.filter((item) => item.contentId !== contentId);
        videos = videos.filter((item) => item.contentId !== contentId);
        club.content = [];
        club.videos = [];
        club.content = [...contents];
        club.videos = [...videos];
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send("Successfully removed content!");
        });
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send("You have to be admin to remove a content.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        "You are not authorized to access this route of removing a content."
      );
  }
};

//Controller 13
const postGallery = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    let { clubId, url, id, desc, date } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === "Fully-authorized" || isAuthorized === "Authorized") {
      let data = { url, id, postedBy: req.user.id, desc, date };
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        club.gallery.push(data);
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send("Successfully posted in gallery!");
        });
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send("You have to be admin to post in gallery!");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        "You are not authorized to access this route of posting in gallery."
      );
  }
};

//Controller 14
const removeGallery = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { clubId, id } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === "Fully-authorized" || isAuthorized === "Authorized") {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let gallery = club.gallery;
        gallery = gallery.filter((item) => item.id !== id);
        club.gallery = [];
        club.gallery = [...gallery];
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send("Successfully removed from gallery!");
        });
      });
    } else {
      res
        .status(StatusCodes.OK)
        .send("You have to be admin to remove from gallery.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        "You are not authorized to access this route of removing from gallery."
      );
  }
};

//Controller 15
const addNotifications = async (req, res) => {
  try {
    let { clubId, notification } = req.body;

     const clubData = await Club.findById(clubId, { permissions: 1 }).lean();
    const isAuthorized = Array.isArray(
      clubData?.permissions?.whoCanSendNotifications
    )
      ? clubData.permissions.whoCanSendNotifications.includes(req.user.id)
      : false;

    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to add notifications to this club.");
    }

    const user = await User.findById(req.user.id, { name: 1, image: 1 });
    notification = {
      ...notification,
      postedBy: req.user.id,
      createdAt: getCurrentISTDate(),
      name: user.name,
      image: user.image,
    };
      const club = await Club.findById(clubId, {
        notifications: 1,
        pinnedBy: 1,
      });
      club.notifications.unshift(notification);

    // Optional: cap number of stored notifications
    if (club.notifications.length > 100) {
      club.notifications = club.notifications.slice(0, 100);
    }

    await club.save();
      let threeSec = new Date(Date.now() + 1 * 3 * 1000);
      schedule.scheduleJob(
        `addClubNotice_${req.user.id}_${new Date()}`,
        threeSec,
        async () => {
          try {
            await updateDynamicIsland(
              club.pinnedBy,
              clubId,
              "notifications",
              true
            );
          } catch (error) {
            console.error("Error in scheduled job:", error);
          }
        }
      );
      return res
        .status(StatusCodes.OK)
        .send("Notification was successfully added.");
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error occured while creating notification.");
  }
};

//Controller 16
const deleteNotifications = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    let { clubId, uid } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === "Fully-authorized" || isAuthorized === "Authorized") {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let notifications = club.notifications;
        notifications = notifications.filter((item) => item.uid !== uid);
        club.notifications = [];
        club.notifications = [...notifications];
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send("Notification has been successfully deleted.");
        });
      });
    } else {
      res
        .status(StatusCodes.OK)
        .send("You have to be admin to delete notification.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to delete notifications from the club.");
  }
};

//Controller 17
const editProfile = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { clubId, data } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === "Fully-authorized") {
      const club = await Club.findByIdAndUpdate(clubId, { ...data });
      return res.status(StatusCodes.OK).send("Successfully updated!");
    } else {
      return res
        .status(StatusCodes.OK)
        .send("You have to be main admin to edit the profile.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        "You are not authorized to access this route of editing club's profile."
      );
  }
};

//Controller 18
const addTeamMember = async (req, res) => {
  try {
    const { clubId, id, pos } = req.body;
    const data = { id, pos };
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    const authorization = await checkAuthorization(clubId, id);
    if (authorization !== "Authorized") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("First become an admin to get admitted to the team.");
    }
    if (isAuthorized !== "Fully-authorized") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You must be the main admin to edit the club's team.");
    }
    const club = await Club.findById(clubId, {
      team: 1,
      name: 1,
      secondaryImg: 1,
    });
    const userInfo = await User.findById(id, { pushToken: 1 });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
    }
    club.team.push(data);
    await club.save();
    scheduleNotification2({
      pushToken: [userInfo.pushToken],
      title: `Congratulations🎊🥳🎉!`,
      body: `You were promoted to ${pos} in ${club.name}`,
      url: `https://macbease.com/app/club/${clubId}`,
    });
    return res.status(StatusCodes.OK).send("Successfully added to the team!");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while adding the team member.");
  }
};

//Controller 19
const removeTeamMember = async (req, res) => {
  try {
    if (req.user.role !== "user" && req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send(
          "You are not authorized to access the route of updating the club's team profile."
        );
    }

    const { clubId, id } = req.body;

    // Check if the user is authorized to perform this action
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    const isPartOfTeam = await isInTeam(clubId, req.user.id);

    // Allow if fully authorized or if the user is a team member trying to remove themselves
    if (
      isAuthorized === "Fully-authorized" ||
      (isPartOfTeam === "Team Member" && id === req.user.id)
    ) {
      const club = await Club.findById(clubId);

      if (!club) {
        return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
      }

      // Remove the team member
      club.team = club.team.filter((member) => member.id !== id);

      await club.save();

      return res
        .status(StatusCodes.OK)
        .send("Successfully removed from the team!");
    } else {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You must be the main admin to edit the club's team.");
    }
  } catch (error) {
    console.error("Error in removeTeamMember:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while removing the team member.");
  }
};

//Controller 20
const getAllEvents = async (req, res) => {
  try {
    const { clubId } = req.query;

    // Validate clubId
    if (!clubId) {
      return res.status(400).json({ error: "Club ID is required" });
    }

    // Fetch club's upcoming events
    const club = await Club.findById(clubId, { _id: 0, upcomingEvent: 1 });

    if (
      !club ||
      !Array.isArray(club.upcomingEvent) ||
      club.upcomingEvent.length === 0
    ) {
      return res.status(200).json([]);
    }

    // Fetch event posters (users) and itineraries in parallel
    const finalData = await Promise.all(
      club.upcomingEvent.map(async (event) => {
        // Fetch event poster details
        const userDetail = await User.findById(event.postedBy, {
          name: 1,
          image: 1,
          _id: 0,
        });

        let itineraries = [];
        
        // Fetch itinerary details for the event
        if(Array.isArray(event.itineraries) && event.itineraries.length!==0){
          const body = {
            itineraryIds : event.itineraries
          } 
          itineraries = await fetchItineraryFromIds(body);
        }

        return {
          ...event,
          userDetail: userDetail || {}, // Handle case where user might not exist
          itineraries,
        };
      })
    );

    return res.status(200).json(finalData);
  } catch (error) {
    console.error("Error fetching events:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//Controller 21
const getClubsByTag = async (req, res) => {
  const { tag } = req.query;
  const clubs = await Club.find(
    { tags: new RegExp(tag, "i", "g") },
    { secondaryImg: 1, name: 1, tags: 1, motto: 1 }
  );
  if (req.user.role === "user") {
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      user.lastActive = new Date();
      user.save();
    });
  } else if (req.user.role === "admin") {
    Admin.findById(req.user.id, (err, admin) => {
      if (err) return console.error(err);
      admin.lastActive = new Date();
      admin.save();
    });
  }
  return res.status(StatusCodes.OK).json(clubs);
};

//Controller 22
const getLikeStatus = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { contentId } = req.query;
    const content = await fetchContent({ contentId, select: "likes" });
    let liked = content.likes.includes(req.user.id);
    return res.status(StatusCodes.OK).json({ liked });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to get the like status. ");
  }
};

//Controller 23
const getLatestContent = async (req, res) => {
  const { clubId } = req.query;
  if (req.user.role === "user") {
    const user = await User.findById(req.user.id);
    let lastActive = user.lastActive;
    lastActive = new Date(lastActive);
    let arr = [];
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      let contents = club.content;
      for (let i = 0; i < contents.length; i++) {
        let content = contents[i];
        if (lastActive - new Date(content.timeStamp) < 0) arr.push(content);
      }
      return res.status(StatusCodes.OK).json(arr);
    });
  } else if (req.user.role === "admin") {
    const admin = await Admin.findById(req.user.id);
    let lastActive = admin.lastActive;
    lastActive = new Date(lastActive);
    let arr = [];
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      let contents = club.content;
      for (let i = 0; i < contents.length; i++) {
        let content = contents[i];
        if (lastActive - new Date(content.timeStamp) < 0) arr.push(content);
      }
      return res.status(StatusCodes.OK).json(arr);
    });
  }
};

//Controller 24
const getClubsPartOf = async (req, res) => {
  try {
    const { userId } = req.query;
    const userClubs = await User.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(userId) },
      },
      {
        $project: {
          clubs: 1,
          passoutYear: 1,
          _id: 0,
        },
      },
      {
        $unwind: "$clubs",
      },
      {
        $addFields: {
          clubObjectId: { $toObjectId: "$clubs.clubId" },
        },
      },
      {
        $lookup: {
          from: "clubs",
          localField: "clubObjectId",
          foreignField: "_id",
          as: "clubDetails",
        },
      },
      {
        $unwind: "$clubDetails",
      },
      {
        $project: {
          clubId: "$clubs.clubId",
          joinDate: "$clubs.joinDate",
          badges: "$clubs.badges",
          name: "$clubDetails.name",
          secondaryImg: "$clubDetails.secondaryImg",
          passoutYear: "$passoutYear",
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(userClubs);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching club details");
  }
};

//Controller 25
const getClubProfile = async (req, res) => {
  try {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, {
      _id: 0,
      name: 1,
      secondaryImg: 1,
      tags: 1,
      featuringImg: 1,
      motto: 1,
      hiddenTags: 1,
    });
    return res.status(StatusCodes.OK).json(club);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the club profile.");
  }
};

//util function
function getCurrentMonthCode() {
  const now = new Date();
  const year = now.getFullYear() % 100; // Get last two digits of year
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  return `${year}${month}`;
}

//Controller 26
// util function
function getCurrentMonthCode() {
  const now = new Date();
  const year = now.getFullYear() % 100;
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

// Controller
const updateRating = async (req, res) => {
  try {
    const { clubId } = req.query;
    const club = await Club.findById(clubId);

    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
    }

    const members = club.members?.length || 0;
    const gallery = club.gallery?.length || 0;
    const events = club.upcomingEvent?.length || 0;
    const content = club.content?.length || 0;

    const newRating = Math.floor(13.6 * (members + gallery + events + content));
    const oldRating = club.rating || 0;
    const monthCode = getCurrentMonthCode();
    const ratingDiff = newRating - oldRating;

    if (!Array.isArray(club.monthlyRating)) {
      club.monthlyRating = [];
    }

    const lastEntry = club.monthlyRating[club.monthlyRating.length - 1];

    if (lastEntry && lastEntry.month === monthCode) {
      lastEntry.rating += ratingDiff;
    } else {
      club.monthlyRating.push({ month: monthCode, rating: ratingDiff });
    }

    club.rating = newRating;
    await club.save();

    return res.status(StatusCodes.OK).send("Updated rating!");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while updating club rating.");
  }
};

//Controller 27
const getClubBio = async (req, res) => {
  try {
    const { clubId } = req.query;
    if (!clubId) {
      return res.status(StatusCodes.BAD_REQUEST).send("Club ID is required.");
    }
    const club = await Club.findById(clubId, {
      members: 1,
      upcomingEvent: 1,
      rating: 1,
      featuringImg: 1,
      motto: 1,
      tags: 1,
      createdOn: 1,
      team: 1,
      name: 1,
    });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
    }
    const data = {
      name: club.name || "",
      featuringImg: club.featuringImg || "",
      motto: club.motto || "",
      createdOn: club.createdOn || "",
      totalMembers: club.members?.length || 0,
      totalEvents: club.upcomingEvent?.length || 0,
      ranking: club.rating || "",
      team: [],
      tag: club.tags || [],
    };
    const teamDetails = await Promise.all(
      club.team.map(async (member) => {
        const user = await User.findById(member.id, { name: 1, image: 1 });
        return {
          ...member,
          name: user?.name || "Unknown",
          image: user?.image || null,
        };
      })
    );
    data.team = teamDetails;
    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching club bio.");
  }
};

//Controller 28
const getClubContent = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, { content: 1, _id: 0 });
    return res.status(StatusCodes.OK).json(club);
  }
};

//Controller 29
const getClubGallery = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { clubId, mode, batch, batchSize } = req.query;
    const club = await Club.findById(clubId, { gallery: 1, _id: 0 });
    let data = [];
    if (mode === "tiles") {
      data = club.gallery.slice((batch - 1) * batchSize, batch * batchSize);
    } else {
      data = club.gallery.slice((batch - 1) * batchSize, batch * batchSize);
      for (let i = 0; i < data.length; i++) {
        const userId = data[i].postedBy;
        const userInfo = await User.findById(userId, {
          name: 1,
          image: 1,
          pushToken: 1,
        });
        data[i] = { ...data[i], userInfo };
      }
    }
    return res.status(StatusCodes.OK).json(data);
  }
};

// new controller added
const getClubVideos = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, { videos: 1, _id: 0 });
    let videos = club.videos;
    videos = videos.reverse();
    let len = videos.length;
    if (len > 6) {
      videos = videos.slice(0, 12);
    }
    let actualContent = [];
    for (let k = 0; k < videos.length; k++) {
      let contentId = videos[k].contentId;
      let actualData = await fetchContent({ contentId });
      actualData = actualData;
      let data = { ...actualData };
      actualContent.push(data);
    }
    let finishedContent = [];
    for (let l = 0; l < actualContent.length; l++) {
      let data = actualContent[l];
      let userId = data.idOfSender;
      let user = await User.findById(userId, {
        image: 1,
        name: 1,
        _id: 0,
        pushToken: 1,
      });
      let withPicData = {
        ...data,
        userName: user.name,
        userPic: user.image,
        userPushToken: user.pushToken,
      };
      finishedContent.push(withPicData);
    }
    return res.status(StatusCodes.OK).json(finishedContent);
  }
};

//Controller 30
const isAdmin = async (req, res) => {
  const { clubId } = req.query;
  let club = await Club.findById(clubId, { adminId: 1, _id: 0 });
  let admin = club.adminId;
  let result = admin.includes(req.user.id);
  return res.status(StatusCodes.OK).json(result);
};

//Controller 31
const isMember = async (req, res) => {
  const { clubId } = req.query;
  let club = await Club.findById(clubId, { members: 1, _id: 0 });
  let members = club.members;
  let result = members.includes(req.user.id);
  return res.status(StatusCodes.OK).json(result);
};

//Controller 32
const getClubNotifications = async (req, res) => {
  try {
    const { clubId, batch, batchSize } = req.query;
    const club = await Club.findById(clubId, { _id: 0, notifications: 1 });
    let notifications = club.notifications.slice(
      (batch - 1) * batchSize,
      batch * batchSize
    );
    if (batch === "1") {
      const isAuthorized = await checkAuthorization(clubId, req.user.id);
      const isTeamMember = await isInTeam(clubId, req.user.id);
      return res
        .status(StatusCodes.OK)
        .json({ notifications, isAuthorized, isTeamMember });
    }
    return res.status(StatusCodes.OK).json(notifications);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json("Something went wrong.");
  }
};

//Controller 35
const isMainAdmin = async (req, res) => {
  const { clubId } = req.query;
  const isAuthorized = await checkAuthorization(clubId, req.user.id);
  if (isAuthorized === "Fully-authorized") {
    return res.status(StatusCodes.OK).send(true);
  } else {
    return res.status(StatusCodes.OK).send(false);
  }
};

//Controller 36
const getCreatorId = async (req, res) => {
  const { clubId } = req.query;
  if (req.user.role === "user" || req.user.role === "admin") {
    const club = await Club.findById(clubId, { mainAdmin: 1, _id: 0 });
    return res.status(StatusCodes.OK).json(club);
  }
};

//Controller 38
const getStatus = async (req, res) => {
  const { clubId } = req.query;
  const id = req.user.id;
  try {
    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      _id: 0,
      members: 1,
      team: 1,
      undecidedProposals: 1,
      permissions: 1,
    });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found");
    }
    const isAuthorized =
      club.mainAdmin === id
        ? "Fully-authorized"
        : club.adminId.includes(id)
        ? "Authorized"
        : "Not-authorized";
    const isMember = club.members.includes(id) ? "Is a member" : "Not a member";
    const isInTeam = club.team.some((member) => member.id === id)
      ? "Team Member"
      : "Not Team Member";
    return res.status(StatusCodes.OK).json({
      isAuthorized,
      isMember,
      isInTeam,
      canPost: club.permissions.whoCanPost.includes(req.user.id),
      canAcceptProposals: club.permissions.whoCanAcceptProposals.includes(
        req.user.id
      ),
      isChatModerator: club.permissions.chatModerators.includes(req.user.id),
      canSendNotifications: club.permissions.whoCanSendNotifications.includes(
        req.user.id
      ),
      undecidedProposals: club.undecidedProposals.length,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching status.");
  }
};

//Controller 39
const getFastNativeFeed = async (req, res) => {
  const { clubId, key, batch, batchSize, remedy } = req.query;
  try {
    const club = await Club.findById(clubId, {
      content: 1,
      _id: 0,
      upcomingEvent: 1,
      videos: 1,
    });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }
    // Extract content IDs and reverse only once
    let contents = club.content.map((c) => c.contentId).reverse();

    // Apply pagination logic
    if (batch && batchSize) {
      const startIdx = (batch - 1) * batchSize;
      const endIdx = batch * batchSize;
      contents = contents.slice(startIdx, endIdx);
    }

    // Apply remedy safely
    if (remedy && remedy > 0 && remedy <= contents.length) {
      contents = contents.slice(remedy);
    }

    let actualContent = await fetchMultipleContents({
      ids: contents,
    });
    actualContent = actualContent.reverse();

    // Map to maintain order and insert `commentsNum`
    const orderedContent = contents
      .map((id) => {
        const content = actualContent.find((c) => c._id.toString() === id);
        if (content) {
          return {
            ...content,
            commentsNum: content.comments.length,
            comments: content.comments.slice(0, 6),
          };
        }
        return null;
      })
      .filter(Boolean); // Remove nulls in case of missing content

    // Getting few videos of the club
    let processedSnippets = [];
    if (parseInt(batch) === 1) {
      let videos = club.videos;
      videos = videos.reverse();
      let len = videos.length;
      if (len > 2) {
        videos = videos.slice(0, 2);
      }
      const videoIds = videos.map((video) => video.contentId);
      const snippets = await fetchMultipleContents({ ids: videoIds });
      if(snippets){
        processedSnippets = snippets.map((snippet) => ({
        ...snippet,
        commentsNum: snippet.comments.length, // Store total comment count
          comments: snippet.comments.slice(0, 6), // Get only first 6 comments
        }));
      }
    }

    return res
      .status(StatusCodes.OK)
      .json({ finishedContent: orderedContent, snippets: processedSnippets });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong!");
  }
};

//Controller 40

const getClub = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { id } = req.query;
    const club = await Club.findById(id, { name: 1, secondaryImg: 1 });
    if (club) return res.status(StatusCodes.OK).json(club);
    else
      return res.status(StatusCodes.NOT_FOUND).send("Could not find the club.");
  } else {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send("You are not authorized to access the club data.");
  }
};

//Controller 41
const getAllClub = async (req, res) => {
  try {
    const batch = parseInt(req.query.batch) || 1; // default to first batch
    const batchSize = parseInt(req.query.batchSize) || 100; // default batch size
    const skipCount = (batch - 1) * batchSize;
    const clubs = await Club.aggregate([
      {
        $project: {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          hiddenTags: 1,
          motto: 1,
          mainAdmin: 1,
          membersCount: { $size: "$members" },
          top5Members: { $slice: ["$members", 5] },
          founderId: { $toObjectId: "$mainAdmin" },
          isCore: { $in: [req.user.id, "$team.id"] },
          isAdmin: { $in: [req.user.id, "$adminId"] },
          isMember: { $in: [req.user.id, "$members"] },
        },
      },
      {
        $addFields: {
          top5Members: {
            $map: {
              input: "$top5Members",
              as: "memberId",
              in: { $toObjectId: "$$memberId" },
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          hiddenTags: 1,
          motto: 1,
          membersCount: 1,
          isCore: 1,
          isAdmin: 1,
          isMember: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
      { $skip: skipCount },
      { $limit: batchSize },
    ]);

    return res.status(StatusCodes.OK).json(clubs);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the club data.");
  }
};

//Controller 43
const getAllLikedPins = async (req, res) => {
  const { key, mode, batch, batchSize, id } = req.query;
  const skip = (batch - 1) * batchSize;
  const limit = parseInt(batchSize);
  try {
    let likedContents = await User.findById(id || req.user.id, {
      likedContents: 1,
      taggedContents: 1,
      _id: 0,
    });
    if (!likedContents)
      return res.status(StatusCodes.OK).json({ likedSocialPins: [] });
    likedContents =
      mode === "liked"
        ? likedContents.likedContents.reverse()
        : likedContents.taggedContents.reverse();
    const selectedBatch = likedContents.slice(skip, skip + limit);
    const macbeaseIds = selectedBatch
      .filter((item) => item.type === "macbease" && key === "all")
      .map((item) => mongoose.Types.ObjectId(item.contentId));
    const contentIds = selectedBatch
      .filter((item) => item.type !== "macbease" || key !== "all")
      .map((item) => mongoose.Types.ObjectId(item.contentId));
    const [macbeaseData, contentData] = await Promise.all([
      fetchMacbeaseContentFromIds({ids:macbeaseIds}),
      fetchMultipleContents({ ids: contentIds }),
    ]);
    const data = [...macbeaseData, ...contentData].sort(
      (a, b) => new Date(b.timeStamp) - new Date(a.timeStamp)
    );
    return res.status(StatusCodes.OK).json({ likedSocialPins: data });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching liked pins.");
  }
};

//Controller 44
const getSimilarGroups = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Unauthorized" });
    }

    // Fetch user data
    const user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      clubs: 1,
    }).lean();
    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found" });
    }

    // Convert user’s joined group IDs to ObjectId
    const communityIds = user.communitiesPartOf.map(
      (c) => new mongoose.Types.ObjectId(c.communityId)
    );
    const clubIds = user.clubs.map(
      (c) => new mongoose.Types.ObjectId(c.clubId)
    );

    // Run all queries in parallel
    const [communities, clubs, userCommunities, userClubs] = await Promise.all([
      // Fetch recommended communities (not joined) - Limit to 12
      Community.aggregate([
        {
          $match: {
            _id: { $nin: communityIds },
            $or: [
              { "entryRules.isInviteOnly": { $exists: false } },
              { "entryRules.isInviteOnly": false },
            ],
          },
        },
        { $sample: { size: 12 } }, // Randomly select 12
        {
          $project: {
            secondaryCover: 1,
            label: 1,
            activeMembers: 1,
            title: 1,
            tag: 1,
            membersCount: { $size: "$members" },
            top5Members: { $slice: ["$members", 5] },
            founderId: { $toObjectId: "$creatorId" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "top5Members",
            foreignField: "_id",
            as: "top5Profiles",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "founderId",
            foreignField: "_id",
            as: "foundersDetails",
          },
        },
        {
          $project: {
            secondaryCover: 1,
            label: 1,
            activeMembers: 1,
            title: 1,
            tag: 1,
            membersCount: 1,
            top5Profiles: {
              $map: {
                input: "$top5Profiles",
                as: "profile",
                in: {
                  id: "$$profile._id",
                  name: "$$profile.name",
                  img: "$$profile.image",
                  pushToken: "$$profile.pushToken",
                },
              },
            },
            foundersDetails: {
              $arrayElemAt: [
                {
                  $map: {
                    input: "$foundersDetails",
                    as: "profile",
                    in: {
                      id: "$$profile._id",
                      name: "$$profile.name",
                      img: "$$profile.image",
                      pushToken: "$$profile.pushToken",
                      course: "$$profile.course",
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      ]),

      // Fetch recommended clubs (not joined) - Limit to 12
      Club.aggregate([
        { $match: { _id: { $nin: clubIds } } },
        { $sample: { size: 12 } },
        {
          $addFields: {
            top5Members: {
              $map: {
                input: { $slice: ["$members", 5] },
                as: "m",
                in: { $toObjectId: "$$m" },
              },
            },
            membersCount: { $size: "$members" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "top5Members",
            foreignField: "_id",
            as: "top5Profiles",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "founderId",
            foreignField: "_id",
            as: "foundersDetails",
          },
        },
        {
          $project: {
            secondaryImg: 1,
            name: 1,
            tags: 1,
            motto: 1,
            membersCount: 1,
            top5Profiles: {
              $map: {
                input: "$top5Profiles",
                as: "profile",
                in: {
                  id: "$$profile._id",
                  name: "$$profile.name",
                  img: "$$profile.image",
                  pushToken: "$$profile.pushToken",
                },
              },
            },
            foundersDetails: {
              $arrayElemAt: [
                {
                  $map: {
                    input: "$foundersDetails",
                    as: "profile",
                    in: {
                      id: "$$profile._id",
                      name: "$$profile.name",
                      img: "$$profile.image",
                      pushToken: "$$profile.pushToken",
                      course: "$$profile.course",
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      ]),

      // Fetch user's joined communities
      Community.find(
        { _id: { $in: communityIds } },
        {
          secondaryCover: 1,
          title: 1,
          tag: 1,
          activeMembers: 1,
          label: 1,
          membersCount: { $size: "$members" },
        }
      ).lean(),

      // Fetch user's joined clubs
      Club.find(
        { _id: { $in: clubIds } },
        {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          membersCount: { $size: "$members" },
        }
      ).lean(),
    ]);

    // Send final response
    return res.status(StatusCodes.OK).json({
      community: communities, // Recommended communities (max 12)
      club: clubs, // Recommended clubs (max 12)
      all: [...userClubs, ...userCommunities], // User's joined communities & clubs
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong." });
  }
};

//Controller 45
const getEveryoneOfClub = async (req, res) => {
  try {
    if (req.user.role === "admin" || req.user.role === "user") {
      const { clubId } = req.query;
      const club = await Club.findById(clubId, {
        members: 1,
        adminId: 1,
        team: 1,
        _id: 0,
        mainAdmin: 1,
        unusedBadges: 1,
      });
      const { members, adminId, team, unusedBadges } = club;
      const allUserIds = [...members, ...team.map((t) => t.id)];
      const users = await User.find(
        { _id: { $in: allUserIds } },
        { name: 1, image: 1, pushToken: 1, course: 1 }
      ).lean();
      const userMap = users.reduce((acc, user) => {
        acc[user._id] = user;
        return acc;
      }, {});
      let finalMembers = [];
      let finalAdmins = [];
      let finalTeam = [];
      for (let i = 0; i < members.length; i++) {
        let user = userMap[members[i]];
        if (adminId.includes(members[i])) {
          finalAdmins.push(user);
        } else {
          finalMembers.push(user);
        }
      }

      for (let j = 0; j < team.length; j++) {
        let user = userMap[team[j].id];
        if (user) {
          finalTeam.push({ ...user, pos: team[j].pos });
        }
      }
      return res.status(StatusCodes.OK).json({
        finalMembers,
        finalAdmins,
        finalTeam,
        unusedBadges,
      });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching club details");
  }
};

//Controller 47
const getPushTokenChunk = async (req, res) => {
  const { mode, clubId } = req.query;
  let pushTokens = [];
  if (mode === "all") {
    let members = await Club.findById(clubId, { members: 1, _id: 0 });
    members = members.members;
    let len = members.length;
    for (let i = 0; i < len; i++) {
      let id = members[i];
      let user = await User.findById(id, { pushToken: 1 });
      if (user) {
        pushTokens.push(user.pushToken);
      }
    }
  } else if (mode === "admin") {
    let members = await Club.findById(clubId, { adminId: 1, _id: 0 });
    members = members.adminId;
    let len = members.length;
    for (let i = 0; i < len; i++) {
      let id = members[i];
      let user = await User.findById(id, { pushToken: 1 });
      if (user) {
        pushTokens.push(user.pushToken);
      }
    }
  } else if (mode === "team") {
    let members = await Club.findById(clubId, { team: 1, _id: 0 });
    members = members.team;
    let len = members.length;
    for (let i = 0; i < len; i++) {
      let id = members[i].id;
      let user = await User.findById(id, { pushToken: 1 });
      if (user) {
        pushTokens.push(user.pushToken);
      }
    }
  }
  return res.status(StatusCodes.OK).json(pushTokens);
};

//Controller 48
const changeLeader = async (req, res) => {
  const { clubId, leaderId, invitationId } = req.query;
  try {
    const cond1 = leaderId === req.user.id;
    let club = await Club.findById(clubId, {
      mainAdmin: 1,
      featuringImg: 1,
      secondaryImg: 1,
      name: 1,
    });
    let invitation = await fetchInvitationById({id:invitationId});
    const cond2 =
      invitation.type === "Leader Change" &&
      invitation.state === "undecided" &&
      invitation.sentBy.toString() === club.mainAdmin;
    invitation.sentTo.toString() === req.user.id;
    if (cond1 && cond2) {
      let prevLeader = await User.findById(club.mainAdmin, {
        unreadNotice: 1,
        name: 1,
        image: 1,
        pushToken: 1,
      });
      let newLeader = await User.findById(leaderId, {
        unreadNotice: 1,
        name: 1,
        image: 1,
        pushToken: 1,
      });
      const noticeForPrev = {
        value: `Congratulations! ${newLeader.name} has accepted your proposal to lead ${club.name}.`,
        img1: newLeader.image,
        img2: club.featuringImg,
        key: "read",
        action: "club",
        params: {
          name: club.name,
          secondaryImg: club.secondaryImg,
          id: clubId,
        },
        time: new Date(),
        uid: `${new Date()}/${club.mainAdmin}/${req.user.id}`,
      };
      const noticeForNew = {
        value: `Congratulations! You are now the CEO of ${club.name}.`,
        img1: prevLeader.image,
        img2: club.featuringImg,
        key: "read",
        action: "club",
        params: {
          name: club.name,
          secondaryImg: club.secondaryImg,
          id: clubId,
        },
        time: new Date(),
        uid: `${new Date()}/${club.mainAdmin}/${req.user.id}`,
      };
      club.mainAdmin = leaderId;
      prevLeader.unreadNotice = [noticeForPrev, ...prevLeader.unreadNotice];
      newLeader.unreadNotice = [noticeForNew, ...newLeader.unreadNotice];
      prevLeader.save();
      newLeader.save();
      club.save();
      await sendKafkaMessage("UPDATE_INVITATION","invitation",{
        invitationId,
        updatedFields:{
          state:"accepted"
        }
      })
      return res
        .status(StatusCodes.OK)
        .send("Leader has been chnaged successfully.");
    } else {
      return res
        .status(StatusCodes.OK)
        .send(
          "You are not authorized to become the leader of the concerned club."
        );
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller 49
const getClubContributions = async (req, res) => {
  const { id, batch, batchSize } = req.query;
  const skip = (batch - 1) * batchSize;
  try {
    const user = await User.findById(id, {
      clubContributions: { $slice: [skip, parseInt(batchSize)] },
    }).lean();

    if (!user || !user.clubContributions) {
      return res.status(StatusCodes.OK).json([]);
    }
    const relevantIds = user.clubContributions.map((item) =>
      mongoose.Types.ObjectId(item)
    );
    const contributions = await fetchMultipleContents({ ids: relevantIds });
    return res.status(StatusCodes.OK).json(contributions);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching club contributions.");
  }
};

//Controller 50
const addProposal = async (req, res) => {
  try {
    const { proposalId, clubId, visibility } = req.body;
    const club = await Club.findById(clubId, {
      undecidedProposals: 1,
      proposalHistory: 1,
      name: 1,
    });
    const proposal = await fetchInvitationById({id:proposalId});
    const senderMetaData = await User.findById(proposal.sentBy, {
      name: 1,
      image: 1,
      pushToken: 1,
    });
    const obj = {
      id: proposalId,
      visibility,
      state: proposal.state,
      subject: proposal.subject,
      senderMetaData,
    };
    club.proposalHistory.push(obj);
    club.undecidedProposals.push(proposalId);
    await club.save();
    //scheduling a job for dispatching push notification
    let oneSec = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `proposal_notice_${proposal._id}`,
      oneSec,
      async () => {
        const ids = [proposal.sentTo, ...proposal.cc];
        const users = await User.find({ _id: { $in: ids } }, { pushToken: 1 });
        const tokens = users.map((item) => item.pushToken);
        scheduleNotification(
          tokens,
          club.name,
          `A proposal has been raised in ${club.name} for you to address.`
        );
      }
    );
    return res.status(StatusCodes.OK).send("Successfully submitted proposal.");
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error setting proposal.");
  }
};

//Controller 51
const fetchProposals = async (req, res) => {
  const { clubId, batch, batchSize } = req.query;
  try {
    const club = await Club.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(clubId) } },
      {
        $project: {
          proposalHistory: {
            $slice: [
              { $reverseArray: "$proposalHistory" },
              (batch - 1) * batchSize,
              parseInt(batchSize),
            ],
          },
          undecidedProposals: 1,
          permissions: 1,
          mainAdmin: 1,
        },
      },
    ]);
    const proposals = club[0].proposalHistory;
    if (proposals) {
      const proposalIds = proposals.map((item) => item.id);
      const proposalsDoc = await fetchInvitationById({id:proposalIds,select:["endoredBy","expiration"]});
      const proposalsDocMap = proposalsDoc.reduce((acc, doc) => {
        acc[doc._id.toString()] = doc;
        return acc;
      }, {});
      const finalData = proposals.map((proposal) => {
        const proposalData = proposalsDocMap[proposal.id.toString()];
        if (proposalData) {
          return {
            ...proposal,
            endorsedBy: proposalData.endorsedBy,
            expiration: proposalData.expiration,
          };
        }
        return proposal;
      });
      if (parseInt(batch) !== 1) {
        return res.status(StatusCodes.OK).json(finalData);
      } else {
        return res
          .status(StatusCodes.OK)
          .json({ finalData,
                  undecidedProposals: club[0].undecidedProposals,
                  permissions: club[0].permissions.whoCanAcceptProposals,
                  mainAdmin: club[0].mainAdmin,
                  });
      }
    } else {
      return res.status(StatusCodes.OK).json([]);
    }
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching proposals.");
  }
};

// Controller 52
const changeProposalStatus = async (req, res) => {
  const { proposalId, clubId, status } = req.body;
  try {
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(StatusCodes.BAD_REQUEST).send("Invalid status.");
    }
    const proposal = await fetchInvitationById({id:proposalId,select:["sentTo","cc"]})
    if (![...proposal.cc, proposal.sentTo.toString()].includes(req.user.id)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("You are not authorized to reject this proposal.");
    }
    const club = await Club.findById(clubId, {
      undecidedProposals: 1,
      proposalHistory: 1,
      notifications: 1,
    });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send("Club not found.");
    }
    club.undecidedProposals = club.undecidedProposals.filter(
      (id) => id !== proposalId
    );
    let matchedProposal;
    for (let i = 0; i < club.proposalHistory.length; i++) {
      if (club.proposalHistory[i].id === proposalId) {
        matchedProposal = club.proposalHistory[i];
        matchedProposal.state = status;
        club.proposalHistory[i] = matchedProposal;
        break;
      }
    }
    if (!matchedProposal) {
      return res.status(StatusCodes.NOT_FOUND).send("Proposal not found.");
    }
    const userDetails = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      _id: 0,
    });
    const notice = {
      uid: new Date().toISOString() + `${proposalId}`,
      title: "Decision made",
      msg: `Proposal titled - ${matchedProposal.subject} was reviewed and decision was taken.`,
      visibility: matchedProposal.visibility,
      createdAt: getCurrentISTDate(),
      postedBy: req.user.id,
      name: userDetails.name,
      image: userDetails.image,
    };
    club.notifications.unshift(notice);
    club.save();
    return res
      .status(StatusCodes.OK)
      .send("Proposal status successfully modified.");
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error changing status of club proposal.");
  }
};

const nullifyClubDynamicIsland = async (req, res) => {
  try {
    const { type, clubId } = req.query;
    await updateDynamicIsland(
      [mongoose.Types.ObjectId(req.user.id)],
      clubId,
      type
    );
    return res.status(StatusCodes.OK).send(`${type} nullified.`);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot restore dynamic island.");
  }
};

const newClubMessage = async (req, res) => {
  try {
    const { clubId, message, sender, tags } = req.body;
    const clubInfo = await Club.findById(clubId, {
      pinnedBy: 1,
      name: 1,
      secondaryImg: 1,
    });
    let tokens = [];

    if (Array.isArray(tags) && tags.length > 0) {
      const userIds = tags.map((tag) => tag._id);
      tokens = await getPushTokens(userIds, req.user.id);
    } else {
      tokens = await getPushTokens(`${clubId}-All Members-club`, req.user.id);
    }
    await updateDynamicIsland(clubInfo.pinnedBy, clubId, "messages", true);
    scheduleNotification2({
      pushToken: tokens,
      title: `${sender} messaged in ${clubInfo.name}.`,
      body: `${message.substring(0, 50)}...`,
      url: `https://macbease.com/app/club/${clubId}`,
    });

    return res.status(StatusCodes.OK).send("Success");
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot mark new club chat message.");
  }
};

const clubsWithPostingRights = async (req, res) => {
  try {
    const user = await User.findById(req.user.id, { clubs: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.");
    }
    const clubIds = user.clubs.map((item) => item.clubId);
    const clubs = await Club.find(
      { _id: { $in: clubIds } },
      { adminId: 1, mainAdmin: 1, secondaryImg: 1, name: 1 }
    );
    const authorizedClubs = clubs.filter((club) => {
      if (club.mainAdmin === req.user.id) return true;
      return club.adminId.includes(req.user.id);
    });
    const result = authorizedClubs.map((club) => ({
      _id: club._id,
      secondaryImg: club.secondaryImg,
      name: club.name,
    }));
    return res.status(StatusCodes.OK).json({ clubs: result });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot fetch clubs with posting rights.");
  }
};

const searchClubMembers = async (req, res) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res.status(400).json({ error: "Club ID and query are required" });
    }

    // Find the club and get member IDs
    const club = await Club.findById(clubId, {
      members: 1,
      adminId: 1,
      team: 1,
    });
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    // Search for users whose names match the regex
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const members = await User.find(
      {
        _id: { $in: club.members },
        name: regex,
      },
      { name: 1, image: 1, pushToken: 1 }
    );

    const teamIds = club.team.map((e) => e.id);

    const membersWithRole = members.map((member) => ({
      ...member.toObject(),
      role: teamIds.includes(member._id.toString())
        ? "Core team"
        : club.adminId.includes(member._id)
        ? "Admin"
        : "Member",
    }));

    return res.status(200).json(membersWithRole);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const searchClubContent = async (req, res) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res.status(400).json({ error: "Club ID and query are required" });
    }

    // Find the club and get content IDs
    const club = await Club.findById(clubId, { content: 1 });
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    const slicedContents = club.content.slice(-100);
    const contentIds = slicedContents.map((p) => p.contentId);

    // Find content where `text` or `tags` match the query
    const contentResults = await searchContentsFromIds({
      contentIds,
      search: query,
    });

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum: content.comments.length, // Total comments count
      comments: content.comments.slice(0, 6), // Slice top 6 comments
    }));

    return res.status(200).json(processedResults);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const searchClubFiles = async (req, res) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res.status(400).json({ error: "Club ID and query are required" });
    }

    // Find the club and get content IDs
    const club = await Club.findById(clubId, { content: 1 });
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    const slicedContents = club.content.slice(-100);
    const contentIds = slicedContents.map((p) => p.contentId);

    // Find content where `text` or `tags` match the query
    const contentResults = await searchContentsFromIds({
      contentIds,
      contentType: "doc",
      search: query,
    });

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum: content.comments.length, // Total comments count
      comments: content.comments.slice(0, 6), // Slice top 6 comments
    }));

    return res.status(200).json(processedResults);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const searchClubEvent = async (req, res) => {
  try {
    const { clubId, query } = req.query;
    if (!clubId || !query) {
      return res.status(400).json({ error: "Club ID and query are required" });
    }

    // Create case-insensitive regex for searching
    const regex = new RegExp(query, "i");

    // Find the club and get upcoming events
    const club = await Club.findById(clubId, { upcomingEvent: 1 });
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    // Filter events that match the query in any field
    const matchedEvents = club.upcomingEvent.filter(
      (event) =>
        regex.test(event.name) ||
        regex.test(event.description) ||
        regex.test(event.venue)
    );

    return res.status(200).json(matchedEvents);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const searchClubProposals = async (req, res) => {
  try {
    const { clubId, query, visibility } = req.query;
    console.log(req.query);

    if (!clubId || !query || !visibility) {
      console.log("heres");
      return res
        .status(400)
        .json({ error: "Club ID, query, and visibility are required" });
    }

    // Validate visibility value
    const allowedVisibility = ["all", "admin", "team"];
    if (!allowedVisibility.includes(visibility)) {
      console.log("here");
      return res.status(400).json({ error: "Invalid visibility filter" });
    }

    // Create case-insensitive regex for searching
    const regex = new RegExp(query, "i");

    // Find the club and get proposal history
    const club = await Club.findById(clubId, { proposalHistory: 1 });
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    // Filter based on query and visibility
    const matchedProposals = club.proposalHistory.filter((proposal) => {
      const matchesQuery =
        regex.test(proposal.subject) ||
        regex.test(proposal.senderMetaData.name) ||
        regex.test(proposal.state);

      // Visibility filter logic
      if (visibility === "all")
        return matchesQuery && proposal.visibility === "all";
      if (visibility === "admin")
        return (
          matchesQuery &&
          (proposal.visibility === "admin" || proposal.visibility === "all")
        );
      if (visibility === "team") return matchesQuery; // Team can access all proposals

      return false;
    });
    const proposalIds = matchedProposals.map((item) => item.id);
    const proposalsDoc = await fetchInvitationById({id:proposalIds,select:["endorsedBy","expiration"]});
    const proposalsDocMap = proposalsDoc.reduce((acc, doc) => {
      acc[doc._id.toString()] = doc;
      return acc;
    }, {});
    const finalData = matchedProposals.map((proposal) => {
      const proposalData = proposalsDocMap[proposal.id.toString()];
      if (proposalData) {
        return {
          ...proposal,
          endorsedBy: proposalData.endorsedBy,
          expiration: proposalData.expiration,
        };
      }
      return proposal;
    });
    return res.status(200).json(finalData);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const utilForGettingMonthlyContent = async (monthYear, contents) => {
  try {
    // Parse start and end of the given month
    const startDate = new Date(`${monthYear}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // Move to the next month

    // Reverse iterate to efficiently find content IDs for the given month
    const contentIds = [];
    for (let i = contents.length - 1; i >= 0; i--) {
      const { contentId, timeStamp } = contents[i];
      const itemDate = new Date(timeStamp);

      if (itemDate < startDate) break; // Stop when content is from an older month
      if (itemDate >= startDate && itemDate < endDate) {
        contentIds.push(mongoose.Types.ObjectId(contentId));
      }
    }

    if (contentIds.length === 0) {
      return { content: [] };
    }

    // Aggregation Pipeline to optimize querying
    const contentDocs = await fetchMultipleContents({
      ids: contentIds,
      filters: {
        contentType: { $ne: "text" },
      },
    });
    return { content: contentDocs.reverse() };
  } catch (error) {
    console.error("Error in utilForGettingMonthlyContent:", error);
    throw new Error("Error fetching content");
  }
};

const getClubContentByMonth = async (req, res) => {
  try {
    const { clubId, monthYear } = req.query;

    if (!clubId || !monthYear) {
      return res
        .status(400)
        .json({ error: "Club ID and monthYear (YYYY-MM) are required" });
    }

    // Find the club and get only relevant content
    const club = await Club.findById(clubId, { content: 1, createdOn: 1 });
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    // Convert club creation date to YYYY-MM format
    const clubCreationDate = new Date(club.createdOn);
    const clubCreationYear = clubCreationDate.getFullYear();
    const clubCreationMonth = (clubCreationDate.getMonth() + 1)
      .toString()
      .padStart(2, "0");
    const clubCreationTimeFrame = `${clubCreationYear}-${clubCreationMonth}`;

    let pinsFound = 0;
    let finalData = [];
    let timeFrame = monthYear;

    while (pinsFound < 18 && pinsFound < club.content.length) {
      if (timeFrame < clubCreationTimeFrame) break;
      const pins = await utilForGettingMonthlyContent(timeFrame, club.content);

      if (pins.content.length !== 0) {
        finalData.push(pins.content);
        pinsFound += pins.content.length;
      }

      // Update the time frame for the previous month
      const [year, month] = timeFrame.split("-").map(Number);
      const date = new Date(year, month - 1, 1);
      date.setMonth(date.getMonth() - 1);
      const newYear = date.getFullYear();
      const newMonth = (date.getMonth() + 1).toString().padStart(2, "0");
      timeFrame = `${newYear}-${newMonth}`;
    }

    return res.status(200).json({
      month: monthYear,
      content: finalData,
    });
  } catch (error) {
    console.error("Error in getClubContentByMonth:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const getProposalsFromIds = async (req, res) => {
  try {
    const { ids, clubId } = req.body;

    // Fetch only the required proposals from proposalHistory
    const club = await Club.findById(clubId, { proposalHistory: 1 });

    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    // Filter proposals directly
    const filteredProposals = club.proposalHistory.filter((proposal) =>
      ids.includes(proposal.id)
    );

    const proposalIds = filteredProposals.map((fp) => fp.id);
    // Fetch invitations only for relevant proposals
    const invitations = await fetchInvitationById({id:proposalIds,select:["endorsedBy","expiration"]});

    // Convert to map for quick lookup
    const dataMap = new Map(
      invitations.map((doc) => [doc._id.toString(), doc])
    );

    // Merge data while filtering out undefined results
    const finalFilteredData = filteredProposals
      .map((fp) => {
        const fpData = dataMap.get(fp.id);
        return fpData
          ? {
              ...fp,
              endorsedBy: fpData.endorsedBy,
              expiration: fpData.expiration,
            }
          : null;
      })
      .filter(Boolean); // Remove null values

    return res.status(200).json(finalFilteredData);
  } catch (error) {
    console.error("Error in fetching proposals:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const checkClubExists = async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Club name is required." });
    }

    // Case-insensitive search for club name
    const existingClub = await Club.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });

    if (existingClub) {
      return res.json({
        exists: true,
        message: "Club with this name already exists.",
      });
    }

    return res.json({ exists: false, message: "Club name is available." });
  } catch (error) {
    console.error("Error checking club existence:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const searchClubs = async (req, res) => {
  try {
    const { query } = req.query;
    const clubs = await Club.aggregate([
      {
        $match: {
          $or: [
            { name: { $regex: query, $options: "i" } },
            { tags: { $regex: query, $options: "i" } },
          ],
        },
      },
      {
        $project: {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          mainAdmin: 1,
          membersCount: { $size: "$members" },
          top5Members: { $slice: ["$members", 5] },
          founderId: { $toObjectId: "$mainAdmin" },
          isCore: { $in: [req.user.id, "$team.id"] },
          isAdmin: { $in: [req.user.id, "$adminId"] },
          isMember: { $in: [req.user.id, "$members"] },
        },
      },
      {
        $addFields: {
          top5Members: {
            $map: {
              input: "$top5Members",
              as: "memberId",
              in: { $toObjectId: "$$memberId" },
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          membersCount: 1,
          isCore: 1,
          isAdmin: 1,
          isMember: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(clubs);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the club data.");
  }
};

const getClubFieldsById = async (req, res) => {
  try {
    const { id, fields } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Club ID is required." });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: "An array of fields is required." });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = fields.join(" ");

    const club = await Club.findById(id).select(projection);

    if (!club) {
      return res.status(404).json({ error: "Club not found." });
    }

    return res.status(200).json({ data: club });
  } catch (err) {
    console.error("Error fetching club fields:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const getRandomClubs = async (req, res) => {
  try {
    // Parse and validate the size query param
    const size = parseInt(req.query.size, 10) || 3;
    if (size <= 0) {
      return res.status(400).json({ error: "Invalid size parameter." });
    }

    // Parse and construct the projection query param (e.g., ?projection=content,title)
    const projectionFields = req.query.projection
      ? req.query.projection.split(",").reduce((acc, field) => {
          acc[field.trim()] = 1;
          return acc;
        }, {})
      : {};

    const clubs = await Club.aggregate([
      { $sample: { size } },
      ...(Object.keys(projectionFields).length
        ? [{ $project: projectionFields }]
        : []),
    ]);

    return res.status(200).json(clubs);
  } catch (error) {
    console.error("Error fetching random clubs:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const fetchClubLeaderBoard = async (req, res) => {
  try {
    const limitParam = Number(req.query.limit);
    const limit = !isNaN(limitParam) && limitParam > 0 ? limitParam : 30;
    const clubs = await Club.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          mainAdmin: 1,
          rating: 1,
          membersCount: { $size: "$members" },
          top5Members: { $slice: ["$members", 5] },
          founderId: { $toObjectId: "$mainAdmin" },
          isCore: { $in: [req.user.id, "$team.id"] },
          isAdmin: { $in: [req.user.id, "$adminId"] },
          isMember: { $in: [req.user.id, "$members"] },
        },
      },
      {
        $addFields: {
          top5Members: {
            $map: {
              input: "$top5Members",
              as: "memberId",
              in: { $toObjectId: "$$memberId" },
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          membersCount: 1,
          isCore: 1,
          isAdmin: 1,
          isMember: 1,
          rating: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ]);

    if (clubs.length >= 2) {
      [clubs[0], clubs[1]] = [clubs[1], clubs[0]];
    }

    return res.status(StatusCodes.OK).json(clubs);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the club leaderboard.");
  }
};

const getClubPermissions = async (req, res) => {
  try {
    const { clubId } = req.query;

    // Fetch permissions + members/admins/team info
    const club = await Club.findById(clubId).select(
      "permissions members adminId team"
    );
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    const permissions = club.permissions || {};

    // Collect all unique user IDs across all permission keys
    const allUserIds = [
      ...(permissions.whoCanPost || []),
      ...(permissions.whoCanAcceptProposals || []),
      ...(permissions.chatModerators || []),
      ...(permissions.whoCanSendNotifications || []),
    ];

    const uniqueUserIds = [...new Set(allUserIds.map((id) => id.toString()))];

    // Fetch user details
    const users = await User.find(
      { _id: { $in: uniqueUserIds } },
      { name: 1, image: 1, pushToken: 1 }
    ).lean();

    // Map users by ID
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    // Build role lookup sets
    const adminSet = new Set(club.adminId.map((id) => id.toString()));
    const memberSet = new Set(club.members.map((id) => id.toString()));
    const teamMap = club.team.reduce((acc, t) => {
      acc[t.id.toString()] = t.pos || "team"; // store position if available
      return acc;
    }, {});

    // Replace IDs in permissions with user objects + role
    const populatedPermissions = {};
    for (const [key, ids] of Object.entries(permissions)) {
      populatedPermissions[key] = (ids || []).map((id) => {
        const strId = id.toString();
        let role = "member";

        if (teamMap[strId]) {
          role = "team";
        } else if (adminSet.has(strId)) {
          role = "admin";
        } else if (memberSet.has(strId)) {
          role = "member";
        }

        return {
          _id: strId,
          role,
          ...(userMap[strId] || {}),
        };
      });
    }

    res.status(200).json({
      clubId,
      permissions: populatedPermissions,
    });
  } catch (error) {
    console.error("Error fetching club permissions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const assignDefaultPermissions = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "You are not authorized to access this route",
      });
    }

    const clubs = await Club.find({});
    if (!clubs.length) {
      return res.status(404).json({ message: "No clubs found" });
    }

    const updatePromises = clubs.map(async (club) => {
      club.permissions = {
        ...club.permissions,
        whoCanPost: club.adminId || [],
        whoCanSendNotifications: club.adminId || [],
        whoCanAcceptProposals: club.mainAdmin ? [club.mainAdmin] : [],
      };
      return club.save();
    });

    await Promise.all(updatePromises);

    res.status(200).json({
      message: "Permissions updated successfully for all clubs",
      updatedCount: clubs.length,
    });
  } catch (error) {
    console.error("Error assigning permissions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateClubPermission = async (req, res) => {
  try {
    const { clubId, permissionKey } = req.query;
    const { selector = [], value = [] } = req.body; // selector is array now

    // Fetch club
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    // Authorization check
    if (req.user.role !== "admin" && req.user.id !== club.mainAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to update permissions" });
    }

    // Validate permission key
    const validKeys = [
      "whoCanPost",
      "whoCanAcceptProposals",
      "chatModerators",
      "whoCanSendNotifications",
    ];
    if (!validKeys.includes(permissionKey)) {
      return res.status(400).json({ message: "Invalid permission key" });
    }

    let updated = [];

    // 🔑 Handle selectors
    if (selector.includes("Select All")) {
      updated = club.members || [];
    } else {
      for (const sel of selector) {
        const normalized = sel.trim().toLowerCase();
        if (normalized === "select admins") {
          updated.push(...(club.adminId || []));
        } else if (normalized === "select core team") {
          updated.push(...(club.team || []).map((t) => t.id));
        } else if (normalized === "select members") {
          updated.push(...(club.members || []));
        }
      }

      // Fallback to explicit value
      if (updated.length === 0 && value.length > 0) {
        updated = value;
      }
    }

    // Deduplicate & save
    const uniqueIds = [...new Set(updated.map(String))];
    club.permissions[permissionKey] = uniqueIds;
    await club.save();

    // 🔑 Fetch user details
    const users = await User.find(
      { _id: { $in: uniqueIds } },
      { name: 1, image: 1, pushToken: 1 }
    ).lean();

    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    // Helper to determine role inside the club
    const getRole = (id) => {
      if ((club.team || []).map((t) => String(t.id)).includes(id))
        return "team";
      if ((club.adminId || []).map(String).includes(id)) return "admin";
      if ((club.members || []).map(String).includes(id)) return "member";
      return "member"; // fallback
    };

    const populated = uniqueIds.map((id) => ({
      _id: id,
      ...(userMap[id] || {}),
      role: getRole(id), // 🔥 Add role based on club data
    }));

    res.status(200).json({
      message: `Permission '${permissionKey}' updated successfully`,
      updatedPermission: populated, // contains name, image, pushToken, role
      permissions: club.permissions, // still raw IDs
    });
  } catch (error) {
    console.error("Error updating club permission:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getTopProfilesOfClub = async (req, res) => {
  try {
    const { clubId } = req.query;

    const club = await Club.findById(clubId, {
      team: 1,
      adminId: 1,
      members: 1,
    });

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    const coreIds = club.team.map((t) => t.id.toString());
    const adminIds = club.adminId.map((a) => a.toString());

    // Fetch admins (small number)
    const admins = await User.find(
      { _id: { $in: adminIds } },
      { name: 1, image: 1, pushToken: 1 }
    ).lean();

    let arr = admins.map((u) => ({
      ...u,
      role: coreIds.includes(u._id.toString()) ? "team" : "admin",
    }));

    // If less than 30, fetch only the required number of members
    if (arr.length < 30) {
      const remaining = 30 - arr.length;

      const members = await User.find(
        {
          _id: {
            $in: club.members, // only from club members
            $nin: adminIds, // exclude admins
          },
        },
        { name: 1, image: 1, pushToken: 1 }
      )
        .limit(remaining) // only as many as needed
        .lean();

      arr.push(...members.map((m) => ({ ...m, role: "member" })));
    }

    return res.status(200).json(arr);
  } catch (error) {
    console.error("Error in getTopProfilesOfClub:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const addAwardToClub = async (req, res) => {
  try {
    const { clubId } = req.query;
    const {
      awardId,
      count,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      amtPaid,
    } = req.body;

    // Step 0: Basic validation
    if (!clubId || !awardId || !count) {
      return res.status(400).json({
        success: false,
        message: "clubId, awardId, and count are required.",
      });
    }

    // Step 1: Validate award existence
    const award = await Award.findById(awardId);
    if (!award) {
      return res.status(404).json({
        success: false,
        message: "Award not found.",
      });
    }

    // Step 2: Verify Razorpay signature (server-side)
    const razorpaySecret = process.env.RAZOR_PAY_SECRET;
    const razorpayKeyId = process.env.RAZOR_PAY_KEY;
    const razorpayKeySecret = process.env.RAZOR_PAY_SECRET;

    const expectedSignature = crypto
      .createHmac("sha256", razorpaySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed: Invalid signature.",
      });
    }

    // Step 3: Verify payment details via Razorpay API
    const authHeader = `Basic ${Buffer.from(
      `${razorpayKeyId}:${razorpayKeySecret}`
    ).toString("base64")}`;

    const { data: payment } = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        headers: { Authorization: authHeader },
      }
    );

    // Step 4: Validate payment
    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed: Payment not captured.",
      });
    }

    const expectedAmount = award.price * count;
    if (
      payment.amount !== amtPaid * 100 ||
      payment.amount !== expectedAmount * 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed: Incorrect amount.",
      });
    }

    // Step 5: Update club
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        message: "Club not found.",
      });
    }

    const existingAward = club.awards.find(
      (a) => a.awardId.toString() === awardId
    );

    if (existingAward) {
      existingAward.count += Number(count);
    } else {
      club.awards.push({ awardId, count: Number(count) });
    }

    club.processedPayments.push(razorpay_payment_id);

    await club.save();

    return res.status(200).json({
      success: true,
      message: "Award successfully added to club.",
      data: club.awards,
    });
  } catch (error) {
    console.error("Error adding award to club:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while adding award to club.",
      error: error.message,
    });
  }
};

const getAllClubs = async (req, res) => {
  try {
    const { fields } = req.body;

    let projection;

    // ✅ If fields is provided, validate it
    if (fields !== undefined) {
      const isArrayProjection =
        Array.isArray(fields) && fields.length > 0;

      const isObjectProjection =
        fields &&
        typeof fields === "object" &&
        !Array.isArray(fields) &&
        Object.keys(fields).length > 0;

      if (!isArrayProjection && !isObjectProjection) {
        return res.status(400).json({
          error: "fields must be a non-empty array or projection object",
        });
      }

      projection = isArrayProjection ? fields.join(" ") : fields;
    }

    // ✅ Fetch clubs
    const clubs = projection
      ? await Club.find().select(projection)
      : await Club.find();

    return res.status(200).json({
      message: "Clubs fetched successfully",
      data: clubs,
    });
  } catch (error) {
    console.error("Error fetching clubs:", error);
    return res.status(500).json({
      error: "Server error while fetching clubs",
    });
  }
};

const getClubById = async (req, res) => {
  try {
    const { id, ids, fields } = req.body;

    // ✅ Validate id / ids
    const hasSingleId = !!id;
    const hasMultipleIds = Array.isArray(ids) && ids.length > 0;

    if (!hasSingleId && !hasMultipleIds) {
      return res.status(400).json({
        error: "Club id or ids array is required",
      });
    }

    let projection;

    // ✅ Optional projection validation
    if (fields !== undefined) {
      const isArrayProjection =
        Array.isArray(fields) && fields.length > 0;

      const isObjectProjection =
        fields &&
        typeof fields === "object" &&
        !Array.isArray(fields) &&
        Object.keys(fields).length > 0;

      if (!isArrayProjection && !isObjectProjection) {
        return res.status(400).json({
          error: "fields must be a non-empty array or projection object",
        });
      }

      projection = isArrayProjection ? fields.join(" ") : fields;
    }

    // ✅ Case 1: Multiple IDs
    if (hasMultipleIds) {
      const clubs = projection
        ? await Club.find({ _id: { $in: ids } }).select(projection)
        : await Club.find({ _id: { $in: ids } });

      if (!clubs || clubs.length === 0) {
        return res.status(404).json({
          error: "Clubs not found",
        });
      }

      return res.status(200).json({
        message: "Clubs fetched successfully",
        data: clubs,
      });
    }

    // ✅ Case 2: Single ID
    const club = projection
      ? await Club.findById(id).select(projection)
      : await Club.findById(id);

    if (!club) {
      return res.status(404).json({
        error: "Club not found",
      });
    }

    return res.status(200).json({
      message: "Club fetched successfully",
      data: club,
    });
  } catch (error) {
    console.error("Error fetching club(s):", error);
    return res.status(500).json({
      error: "Server error while fetching club(s)",
    });
  }
};


module.exports = {
  createClub,
  deleteClub,
  joinAsMember,
  leaveAsMember,
  addAsMember,
  removeAsMember,
  addAdmin,
  removeAdmin,
  addNotifications,
  deleteNotifications,
  getAllEvents,
  getClub,
  getAllClub,
  postEvent,
  removeEvent,
  postContent,
  removeContent,
  postGallery,
  removeGallery,
  editProfile,
  addTeamMember,
  removeTeamMember,
  getClubsByTag,
  getLikeStatus,
  getLatestContent,
  getClubsPartOf,
  getClubProfile,
  updateRating,
  getClubBio,
  getClubContent,
  getClubGallery,
  getClubVideos,
  isAdmin,
  isMember,
  getClubNotifications,
  isMainAdmin,
  getCreatorId,
  getStatus,
  getFastNativeFeed,
  getAllLikedPins,
  getSimilarGroups,
  getEveryoneOfClub,
  getPushTokenChunk,
  changeLeader,
  getClubContributions,
  addProposal,
  fetchProposals,
  changeProposalStatus,
  searchClubProposals,
  nullifyClubDynamicIsland,
  newClubMessage,
  clubsWithPostingRights,
  searchClubMembers,
  searchClubContent,
  searchClubFiles,
  searchClubEvent,
  getClubContentByMonth,
  getProposalsFromIds,
  checkClubExists,
  searchClubs,
  getClubFieldsById,
  getRandomClubs,
  fetchClubLeaderBoard,
  getClubPermissions,
  assignDefaultPermissions,
  updateClubPermission,
  getTopProfilesOfClub,
  addAwardToClub,
  getAllClubs,
  getClubById
};
