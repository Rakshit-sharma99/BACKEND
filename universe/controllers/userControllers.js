const { StatusCodes } = require("http-status-codes");
const User = require("../models/user");
const Admin = require("../models/admin");
const bcrypt = require("bcryptjs");
const Session = require("../models/session");
const Community = require("../models/community");
const Club = require("../models/club");
const Bookmark = require("../models/bookmark");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const {
  sendMail,
  scheduleNotification,
  scheduleNotification2,
  updateUserIP,
  lemmatize,
} = require("../controllers/utils");
const { default: mongoose } = require("mongoose");
const {
  fetchSearchedEvents,
  fetchSearchedCards,
  fetchSearchedContents,
  getMemoryCount,
  fetchAllowedDomains,
  fetchMultipleAssets,
  fetchSearchedProfileFacets,
  fetchAssetCategories,
  fetchTrendingEvents,
  fetchTrendingCards,
} = require("./interServiceCalls");
const { redis } = require("../app");
require("dotenv").config();

const hostCookie = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  path: "/",
};

const sharedCookie = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  domain: ".macbease.com",
  path: "/",
};

const securePassword = async (password) => {
  try {
    const hash = await bcrypt.hash(password, 10);
    return hash;
  } catch (error) {
    console.log(error);
  }
};

//Controller 1
const searchUserByName = async (req, res) => {
  const { name } = req.query;
  if (!name) {
    throw new Error("Missing 'name' in query");
  }
  const users = await User.find(
    { name: new RegExp(name, "i", "g") },
    { name: 1, image: 1, _id: 1 },
  );
  const adminUsers = await Admin.find(
    { name: new RegExp(name, "i", "g") },
    { name: 1, image: 1, _id: 1 },
  );
  let finalData = [...users, ...adminUsers];
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 2
const getUserBio = async (req, res) => {
  console.log("user bio");
  try {
    const [user, bookmarksCount] = await Promise.all([
      User.findById(req.user.id, {
        course: 1,
        role: 1,
        interests: 1,
        clubs: 1,
        communitiesCreated: 1,
        communitiesPartOf: 1,
        giftsSend: 1,
        name: 1,
        image: 1,
        chatRooms: 1,
        email: 1,
        unreadNotice: 1,
        level: 1,
        passoutYear: 1,
        field: 1,
        incompleteProfile: 1,
        notifications: 1,
        shortCuts: 1,
        incompleteFields: 1,
        universeMetaData: 1,
        phone: 1,
        isPhoneVerified: 1,
      }),
      Bookmark.countDocuments({ userId: req.user.id }),
    ]);
    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "User not found" });
    }
    const {
      course,
      role,
      interests,
      clubs,
      communitiesCreated,
      communitiesPartOf,
      giftsSend,
      name,
      image,
      chatRooms,
      email,
      unreadNotice,
      level,
      passoutYear,
      field,
      incompleteProfile,
      shortCuts,
      incompleteFields,
      universeMetaData,
      phone,
      isPhoneVerified,
    } = user;

    console.log("bookmarksCount", bookmarksCount);

    return res.status(StatusCodes.OK).json({
      course,
      role,
      interests,
      clubs: clubs?.length,
      communitiesCreated: communitiesCreated?.length,
      communitiesPartOf: communitiesPartOf?.length,
      giftsSend: giftsSend?.length,
      name,
      image,
      chatRooms,
      email,
      notices: unreadNotice?.length,
      level,
      passoutYear,
      field,
      incompleteProfile,
      shortCuts,
      incompleteFields,
      universeMetaData,
      bookmarksCount,
      phone,
      isPhoneVerified,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
};

//controller 3
const updateUser = async (req, res) => {
  if (req.user.role === "user") {
    const userID = req.user.id;
    const updatedUser = await User.findByIdAndUpdate(
      { _id: userID },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );
    res.status(StatusCodes.OK).send("Updated successfully!");
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to update user profile.");
  }
};

const getUser = async (req, res) => {
  if (req.user.role === "user") {
    const { name, reg } = req.query;
    const queryObject = {};
    if (name) {
      queryObject.name = { $regex: name, $options: "i" };
    }
    if (reg) {
      queryObject.reg = Number(reg);
    }
    let result = User.find(queryObject);
    fieldsList = "name reg image";
    result = result.select(fieldsList);
    const finalResult = await result;
    if (!finalResult) {
      return res
        .status(StatusCodes.NO_CONTENT)
        .send("No body can match your profile even wildly.");
    }
    res.status(StatusCodes.OK).json({ finalResult });
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("You are not authorized to read other user profile");
  }
};

const deleteUser = async (req, res) => {
  if (req.user.role === "user") {
    const userID = req.user.id;
    const user = await User.findOne({ _id: userID });
    if (!user) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("User to be deleted is no more available.");
    }
    const deletedUser = await User.findByIdAndDelete({ _id: userID });
    res.status(StatusCodes.OK).json({ deletedUser });
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("You are not authorized to delete user profile.");
  }
};

//psuedo controller to get an user just by sending his token in the header of the req

const getUserByToken = async (req, res) => {
  if (req.user.role === "user") {
    const userID = req.user.id;
    User.findById(userID, (err, user) => {
      if (err) return console.error(err);
      return res.status(StatusCodes.OK).json(user);
    });
  }
};

//Master controller to perform advance search
const advanceSearch = async (req, res) => {
  const { filter, query } = req.query;
  let user = [];
  if (filter === "name") {
    user = await User.find(
      { name: new RegExp(query, "i", "g") },
      {
        name: 1,
        image: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
        deactivated: 1,
        email: 1,
      },
    ).limit(100);
    //lucky can see all the users
    if (req.user.id === "67418053759b2a80fd8f7171") {
      user = await User.find(
        { name: new RegExp(query, "i", "g") },
        {
          name: 1,
          image: 1,
          _id: 1,
          course: 1,
          pushToken: 1,
          interests: 1,
          deactivated: 1,
          email: 1,
        },
      );
    }
  } else if (filter === "reg") {
    const regNum = Number(query);
    if (isNaN(regNum)) {
      return res.status(400).json({ error: "Invalid registration number" });
    }
    user = await User.find(
      { reg: regNum },
      {
        name: 1,
        image: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
        deactivated: 1,
        email: 1,
      },
    ).limit(100);
  } else if (filter === "course") {
    user = await User.find(
      { course: new RegExp(query, "i", "g") },
      {
        name: 1,
        image: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
        deactivated: 1,
        email: 1,
      },
    ).limit(100);
  } else if (filter === "multipleClubs") {
    const decodedClubIds = JSON.parse(Buffer.from(query, "base64").toString());
    const clubs = await Club.find(
      { _id: { $in: decodedClubIds } },
      { members: 1 },
    );
    for (let i = 0; i < clubs.length; i++) {
      const clubMembersIds = clubs[i].members;
      const clubMembers = await User.find(
        { _id: { $in: clubMembersIds } },
        {
          name: 1,
          image: 1,
          _id: 1,
          course: 1,
          pushToken: 1,
          interests: 1,
          deactivated: 1,
          email: 1,
        },
      );
      user = [...clubMembers, ...user];
    }
  } else if (filter === "organisation") {
    const { organisationType, organisationId } = req.query;
    if (organisationType === "Club") {
      const club = await Club.findById(organisationId, { members: 1 });
      user = await User.find(
        { _id: { $in: club.members }, name: new RegExp(query, "i", "g") },
        {
          name: 1,
          image: 1,
          _id: 1,
          course: 1,
          pushToken: 1,
          interests: 1,
          deactivated: 1,
          email: 1,
        },
      );
    } else if (organisationType === "Community") {
      const community = await Community.findById(organisationId, {
        members: 1,
      });
      user = await User.find(
        { _id: { $in: community.members }, name: new RegExp(query, "i", "g") },
        {
          name: 1,
          image: 1,
          _id: 1,
          course: 1,
          pushToken: 1,
          interests: 1,
          deactivated: 1,
          email: 1,
        },
      );
    }
  } else if (filter === "all") {
    const aggregate = {
      $or: [
        { name: new RegExp(query, "i", "g") },
        { course: new RegExp(query, "i", "g") },
        { interests: { $in: [new RegExp(query, "i", "g")] } },
      ],
    };
    user = await User.find(aggregate, {
      name: 1,
      image: 1,
      _id: 1,
      course: 1,
      pushToken: 1,
      interests: 1,
      deactivated: 1,
      email: 1,
    }).limit(100);
  }
  return res.status(StatusCodes.OK).json(user);
};

//demo controller made to get all user for chat app
const getAllUsers = async (req, res) => {
  try {
    const { profession } = req.query;
    // Build query dynamically
    const query = {};
    if (profession && profession !== "All") {
      query.profession = profession;
    }

    const users = await User.find(query, {
      name: 1,
      image: 1,
      _id: 1,
      pushToken: 1,
      course: 1,
      interests: 1,
      email: 1,
    });

    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Error");
  }
};

//Controller to get 10 random users
const randomUsers = async (req, res) => {
  let users = await User.aggregate([
    { $sample: { size: 10 } },
    {
      $project: {
        name: 1,
        image: 1,
        course: 1,
        _id: 1,
        interests: 1,
        pushToken: 1,
      },
    },
  ]);
  return res.status(StatusCodes.OK).json(users);
};

//function to change password from your profile using oldPass as authentication
const changePassword = async (req, res) => {
  const { oldPass, newPass } = req.body;
  const requestedPlatform =
    req.body.platform || (req.cookies?.refresh_token ? "web" : "app");
  const key = requestedPlatform.toLowerCase() === "web" ? "web" : "app";

  try {
    let user = await User.findById(req.user.id, {
      password: 1,
      refreshTokens: 1,
      uid: 1,
      universeMetaData: 1,
    });

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "User not found" });
    }

    const isOldPassCorrect = await bcrypt.compare(oldPass, user.password);
    if (!isOldPassCorrect) {
      return res.status(StatusCodes.OK).send("Old password does not match");
    }

    const newPassword = await securePassword(newPass);
    user.password = newPassword;
    user.refreshTokens = { app: null, web: null };

    const logoutTime = Math.floor(Date.now() / 1000);
    const token = user.createAccessToken();
    const refreshToken = user.createRefreshToken();
    user.refreshTokens[key] = refreshToken;

    await user.save();

    if (redis) {
      await redis.set(
        `logout:${user._id.toString()}`,
        logoutTime,
        "EX",
        25 * 60
      );
    }

    const session = await Session.create({ userId: user._id.toString() });

    if (key === "web") {
      ["access_token", "refresh_token", "session_id"].forEach((name) => {
        res.clearCookie(name, hostCookie);
        res.clearCookie(name, sharedCookie);
      });

      res.cookie("access_token", token, {
        ...sharedCookie,
        maxAge: 25 * 60 * 1000,
      });

      res.cookie("refresh_token", refreshToken, {
        ...sharedCookie,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.cookie("session_id", session._id.toString(), {
        ...sharedCookie,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Password changed successfully",
      ...(key === "app" ? { token, refreshToken } : {}),
      sessionId: session._id,
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Password change failed",
    });
  }
};

const deactivateAccount = async (req, res) => {
  const { password } = req.body;
  try {
    let user = await User.findById(req.user.id, {
      password: 1,
      deactivated: 1,
      deactivationDate: 1,
      pushToken: 1,
    });
    const isPassCorrect = await bcrypt.compare(password, user.password);
    if (!isPassCorrect) {
      return res.status(StatusCodes.OK).send("Password is not correct.");
    }
    user.pushToken = null;
    user.deactivated = true;
    user.deactivationDate = new Date();
    user.save();
    return res.status(StatusCodes.OK).send("Deactivation successful.");
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json("Something went wrong.");
  }
};

const pushPermanentNotice = async (req, res) => {
  const { userId } = req.query;
  const { value, img1, img2, action, params, key } = req.body;
  if (!userId || !value || !img1 || !img2 || !action || !params || !key) {
    return res
      .status(StatusCodes.OK)
      .send("Incomplete information to push a notice.");
  }
  //we have integrated in-app notice likeContent controller ,this call will be inactivated in next version, till then just a precautionary measure
  if (key !== "like") {
    let data = {
      ...req.body,
      time: new Date(),
      uid: `${new Date()}/${userId}/${req.user.id}`,
    };
    let user = await User.findById(userId);
    user.unreadNotice = [...user.unreadNotice, data];
    user.save();
  }
  return res.status(StatusCodes.OK).send("Notice sucessfully pushed.");
};

const getPermanentNotices = async (req, res) => {
  try {
    let user = await User.findById(req.user.id, {
      unreadNotice: 1,
      notifications: 1,
    });
    const data = {
      unread: user.unreadNotice,
      read: user.notifications.slice(0, 12 - user.unreadNotice.length),
    };
    user.unreadNotice = [];
    user.notifications = [...data.unread, ...user.notifications];
    user.save();
    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json("Something went wrong.");
  }
};

const getPermanentNoticeInBatch = async (req, res) => {
  const { batch, batchSize } = req.query;
  try {
    const user = await User.findById(req.user.id, {
      notifications: 1,
    });
    let notices = [];
    if (batch && batchSize) {
      notices = user.notifications.slice(
        (batch - 1) * batchSize,
        batch * batchSize,
      );
    } else {
      notices = user.notifications;
    }
    return res.status(StatusCodes.OK).json(notices);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json("Something went wrong.");
  }
};

const deleteNotifications = async (req, res) => {
  try {
    const { uid } = req.body;
    let user = await User.findById(req.user.id, {
      notifications: 1,
    });
    let arr = user.notifications;
    arr = arr.filter((item) => item.uid !== uid);
    user.notifications = arr;
    user.save();
    return res
      .status(StatusCodes.OK)
      .send("Successfully deleted the notification.");
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json("Something went wrong.");
  }
};

const getCommunitiesForPost = async (req, res) => {
  try {
    const user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
    });
    const allCommunities = user.communitiesPartOf;
    const len = allCommunities.length;
    let finalData = [];
    for (let i = 0; i < len; i++) {
      const id = allCommunities[i].communityId;
      if (id) {
        const community = await Community.findById(id, {
          secondaryCover: 1,
          title: 1,
        });
        if (community) {
          finalData.push(community);
        }
      }
    }
    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json("Something went wrong.");
  }
};

const sendMailToUsers = async (req, res) => {
  const { destination, intro, outro, subject } = req.body;
  try {
    const name = "there!";
    const { ses, params } = await sendMail(
      name,
      intro,
      outro,
      subject,
      destination,
    );
    ses.sendEmail(params, function (err, data) {
      if (err) {
        console.log(err, err.stack);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send("Something went wrong.");
      } else {
        return res.status(StatusCodes.OK).send("Email sent successfully.");
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const getBasicUserBio = async (req, res) => {
  try {
    const { id } = req.query;
    const user = await User.findById(id, {
      course: 1,
      image: 1,
      name: 1,
      fullName: 1,
      passoutYear: 1,
      clubs: 1,
      role: 1,
      deactivated: 1,
      communitiesPartOf: 1,
      tunedIn_By: 1,
      creatorPost: 1,
      profession: 1,
      interests: 1,
      field: 1,
      incompleteProfile: 1,
      level: 1,
      ip: 1,
      phone: 1,
      isPhoneVerified: 1,
      memoryList: 1,
      memoryBin: 1,
      universeMetaData: 1,
      gender: 1,
      emailVerified: 1,
      cards: 1,
      vicinityAsset: 1,
    }).lean();
    console.log("verified", user.emailVerified);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found");
    }
    const communityIds = user.communitiesPartOf.map((item) =>
      mongoose.Types.ObjectId(item.communityId),
    );
    const clubIds = user.clubs.map((item) =>
      mongoose.Types.ObjectId(item.clubId),
    );
    let tunerIds = [];
    if (user.tunedIn_By) {
      tunerIds = user.tunedIn_By.slice(0, 3);
    } else {
      tunerIds = [];
    }
    const [communities, clubs, tunerGraphics, memoriesCount, bookmarksCount] =
      await Promise.all([
        Community.find(
          { _id: { $in: communityIds } },
          { title: 1, secondaryCover: 1 },
        ).lean(),
        Club.find(
          { _id: { $in: clubIds } },
          { name: 1, secondaryImg: 1 },
        ).lean(),
        User.find(
          { _id: { $in: tunerIds } },
          { name: 1, image: 1, pushToken: 1 },
        ).lean(),
        getMemoryCount(id),
        Bookmark.countDocuments({ userId: id }),
      ]);
    const outcome = {
      course: user.course,
      tuned: user.tunedIn_By
        ? user.tunedIn_By.some((id) => id.toString() === req.user.id.toString())
        : false,
      batch: user.passoutYear,
      role: user.role,
      creatorPost: user.creatorPost,
      tunedIn_By: user.tunedIn_By ? user.tunedIn_By.length : 0,
      tunerGraphics,
      organisationData: [
        ...(Array.isArray(clubs)
          ? clubs.map((item) => ({ ...item, type: "club" }))
          : []),
        ...(Array.isArray(communities)
          ? communities.map((item) => ({ ...item, type: "community" }))
          : []),
      ],
      deactivated: user.deactivated,
      clubs: user.clubs,
      profession: user.profession,
      interests: user.interests,
      field: user.field,
      incompleteProfile: user.incompleteProfile,
      level: user.level,
      ip: user.ip,
      memoriesCount,
      memoryList: (user?.memoryList || []).length,
      memoryBinCount: (user?.memoryBin || []).length,
      universeMetaData: user.universeMetaData,
      fullName: user.fullName,
      gender: user.gender,
      emailVerified: user.emailVerified,
      cards: user.cards,
      bookmarksCount,
      phone: user.phone,
      isPhoneVerified: user.isPhoneVerified,
    };
    return res.status(StatusCodes.OK).json(outcome);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

// function to get Push tokens
const getPushTokens = async (query, exempt) => {
  if (Array.isArray(query)) {
    let ids = query;

    if (exempt) {
      ids = ids.filter((id) => id !== exempt);
    }

    const users = await User.find(
      { _id: { $in: ids } },
      { pushToken: 1 },
    ).lean();
    return users.map((user) => user.pushToken).filter(Boolean);
  }

  if (query === "all-users") {
    const users = await User.find({}, { pushToken: 1 }).lean();
    return users.map((user) => user.pushToken).filter(Boolean);
  } else if (query === "all-students") {
    const users = await User.find(
      { profession: "Student" },
      { pushToken: 1 },
    ).lean();
    return users.map((user) => user.pushToken).filter(Boolean);
  } else if (query === "all-professors") {
    const users = await User.find(
      { profession: "Professor" },
      { pushToken: 1 },
    ).lean();
    return users.map((user) => user.pushToken).filter(Boolean);
  } else if (query === "all-alumni") {
    const users = await User.find(
      { profession: "Alumni" },
      { pushToken: 1 },
    ).lean();
    return users.map((user) => user.pushToken).filter(Boolean);
  } else if (query.startsWith("Inactive-users")) {
    const arr = query.split("-");
    const days = arr[2];

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - parseInt(days));

    const users = await User.find({}, { name: 1, lastActive: 1, pushToken: 1 });

    const inactiveUsers = users.filter((user) => {
      const lastActiveDate = new Date(user.lastActive);
      return !isNaN(lastActiveDate) && lastActiveDate < thresholdDate;
    });

    return inactiveUsers.map((user) => user.pushToken).filter(Boolean);
  } else {
    const arr = query.split("-");
    const id = arr[0];
    const designation = arr[1];
    const type = arr[2];

    let members = [];
    if (type === "club") {
      const club = await Club.findById(id, {
        members: 1,
        adminId: 1,
        team: 1,
      }).lean();
      if (designation === "All Members") {
        members.push(...club.members);
      } else if (designation === "Admins") {
        members.push(...club.adminId);
      } else {
        members.push(...club.team.map((item) => item.id));
      }
      if (exempt) {
        members = members.filter((item) => item !== exempt);
      }
    } else if (type === "community") {
      const community = await Community.findById(id, { members: 1 });
      members.push(...community.members);
    }

    const users = await User.find(
      { _id: { $in: members } },
      { pushToken: 1 },
    ).lean();

    const pushTokens = users.map((user) => user.pushToken).filter(Boolean);

    return pushTokens;
  }
};

const sendNotification = async (req, res) => {
  let { token, title, body, query, imageUrl, url, deepLink } = req.body;
  if (query !== undefined) {
    token = await getPushTokens(query);
  }
  try {
    if (deepLink) {
      scheduleNotification2({
        pushToken: token,
        title,
        body,
        image: imageUrl,
        url: deepLink,
      });
    } else {
      scheduleNotification(token, title, body, imageUrl, url);
    }
    return res.status(StatusCodes.OK).send("Notification dispatched");
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

// testing crone jobs
const cleanUp = async (req, res) => {
  try {
    const users = await User.find({}, { _id: 1 });
    const arr = users.map((item) => item._id);
    return res.status(StatusCodes.OK).json(arr);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

// controller to get club ,community or person by name
const search = async (req, res) => {
  const { query } = req.query;
  const onlyUsers =
    req.query.onlyUsers && req.query.onlyUsers !== "undefined"
      ? req.query.onlyUsers === "true"
      : false;

  if (!query) {
    return res.status(StatusCodes.BAD_REQUEST).send("Empty query received.");
  }
  try {
    let communitiesWithType = [];
    let clubsWithType = [];
    if (!onlyUsers) {
      const communities = await Community.find(
        { title: new RegExp(query, "i", "g") },
        {
          secondaryCover: 1,
          title: 1,
          _id: 1,
          universeMetaData: 1,
          uid: 1,
        },
      ).lean();
      communitiesWithType = communities.map((community) => ({
        ...community,
        type: "community",
      }));
      const clubs = await Club.find(
        { name: new RegExp(query, "i", "g") },
        {
          secondaryImg: 1,
          name: 1,
          _id: 1,
          universeMetaData: 1,
          uid: 1,
        },
      ).lean();
      clubsWithType = clubs.map((club) => ({
        ...club,
        type: "club",
      }));
    }
    const users = await User.find(
      { name: new RegExp(query, "i", "g") },
      {
        image: 1,
        name: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        universeMetaData: 1,
        uid: 1,
      },
    )
      .limit(24)
      .lean();
    const usersWithType = users.map((user) => ({
      ...user,
      type: "people",
    }));
    return res.status(StatusCodes.OK).json({
      clubs: clubsWithType,
      communities: communitiesWithType,
      users: usersWithType,
    });
  } catch (e) {
    console.log("Error in searching :", e);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong!");
  }
};

//controller to return user bio from an array of user ids
const fetchMultipleProfiles = async (req, res) => {
  try {
    const { ids } = req.body;
    const processedIds = ids.map((item) => mongoose.Types.ObjectId(item));
    const users = await User.aggregate([
      {
        $match: { _id: { $in: processedIds } },
      },
      {
        $project: {
          name: 1,
          image: 1,
          course: 1,
          _id: 1,
          interests: 1,
          pushToken: 1,
          uid: 1,
          universeMetaData: 1,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const tuneIn = async (req, res) => {
  const { creatorId } = req.query;
  const tunerId = req.user.id;
  try {
    const [creator, tuner] = await Promise.all([
      User.findById(creatorId, { role: 1, pushToken: 1 }),
      User.findById(tunerId, { name: 1, pushToken: 1, image: 1 }),
    ]);
    if (!creator || creator.role !== "Creator") {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send("Content creator access not found.");
    }
    await Promise.all([
      User.findByIdAndUpdate(creatorId, {
        $addToSet: { tunedIn_By: mongoose.Types.ObjectId(tunerId) },
      }),
      User.findByIdAndUpdate(tunerId, {
        $addToSet: { hasTunedTo: mongoose.Types.ObjectId(creatorId) },
      }),
    ]);
    scheduleNotification2({
      pushToken: [creator.pushToken],
      title: `${tuner.name} Just Tuned In! 🎉`,
      body: `Your content is gaining fans! ${tuner.name} is now following your journey.`,
      url: `https://macbease.com/app/profile/${tuner._id}`,
    });
    return res.status(StatusCodes.OK).send("Successfully tuned in!");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error occurred while tuning in.");
  }
};

const untune = async (req, res) => {
  const { creatorId } = req.query;
  const tunerId = req.user.id;
  try {
    const creator = await User.findById(creatorId, { role: 1 });
    if (!creator || creator.role !== "Creator") {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send("Content creator access not found.");
    }
    await Promise.all([
      User.findByIdAndUpdate(creatorId, {
        $pull: { tunedIn_By: mongoose.Types.ObjectId(tunerId) },
      }),
      User.findByIdAndUpdate(tunerId, {
        $pull: { hasTunedTo: mongoose.Types.ObjectId(creatorId) },
      }),
    ]);
    return res.status(StatusCodes.OK).send("Successfully untuned!");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error occurred while untuning.");
  }
};

const getProfessorRecommendations = async (req, res) => {
  try {
    const { mode } = req.query;
    const limit = mode === "all" ? 0 : parseInt(req.query.limit) || 18;

    const pipeline = [
      { $match: { profession: "Professor" } },
      {
        $project: {
          name: 1,
          image: 1,
          pushToken: 1,
          course: 1,
          field: 1,
          interests: 1,
        },
      },
    ];

    if (limit > 0) {
      pipeline.push({ $limit: limit });
    }

    const professors = await User.aggregate(pipeline);

    return res.status(200).json(professors);
  } catch (error) {
    console.error("Error finding professor recommendations:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error finding professor recommendations");
  }
};

const searchFromAllProfessors = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== "string") {
      return res
        .status(400)
        .send("Query parameter is required and must be a string");
    }
    const regex = new RegExp(query, "i");
    const professors = await User.find(
      {
        profession: "Professor",
        $or: [
          { course: regex },
          { field: regex },
          { name: regex },
          { interests: regex },
        ],
      },
      {
        name: 1,
        image: 1,
        pushToken: 1,
        course: 1,
        field: 1,
        interests: 1,
      },
    );
    return res.status(200).json(professors);
  } catch (error) {
    console.error("Error searching professors:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error searching professors");
  }
};

const sendMailVerification = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(StatusCodes.NO_CONTENT).send("Email is required!");
  }

  if (!email.endsWith("@gmail.com")) {
    return res.status(204).send("Invalid university email");
  }

  try {
    const verificationUrl = `https://macbease.com/app/verifyEmail?${email}`;

    const action = {
      instructions: "Click the button below to verify your email:",
      color: "#1ea1ed",
      text: "Verify Email",
      url: verificationUrl,
    };

    const { ses, params } = await sendMail(
      "Macbease",
      "Welcome to Macbease! Please verify your email.",
      "Thank you for signing up. Let us know if you have questions!",
      "Verify Your Email",
      email,
      action,
    );

    await ses.sendEmail(params).promise();
    return res
      .status(StatusCodes.OK)
      .json({ message: "Verification email sent" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to send email" });
  }
};

const verifyEmail = async (req, res) => {
  const { email } = req.body;

  try {
    await User.updateOne(
      { _id: mongoose.Types.ObjectId(req.user.id) },
      {
        $set: {
          professionalEmail: email,
        },
      },
    );

    return res.status(StatusCodes.OK).send("Email verified");
  } catch (error) {
    console.error("Error verifying email:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

// ── Step 1: Send OTP to professional email after domain validation ──
const sendProfessionalEmailOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email is required",
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const domain = email.split("@")[1].toLowerCase();

    // Fetch allowed domains from multiverse service
    const universeId = req.user.uid;
    console.log("req user", req.user);
    if (!universeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "User is not associated with any universe",
      });
    }

    const allowedDomains = await fetchAllowedDomains(universeId);

    if (!allowedDomains || allowedDomains.length === 0) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "No allowed domains configured for this universe",
      });
    }

    // Check if the email domain is in the allowed list
    const normalizedAllowed = allowedDomains.map((d) => d.toLowerCase());
    if (!normalizedAllowed.includes(domain)) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: `Email domain "${domain}" is not allowed for this universe. Allowed domains: ${normalizedAllowed.join(", ")}`,
      });
    }

    const userId = req.user.id;

    // Rate limit: 60-second cooldown between OTP requests
    const cooldownKey = `otp:${userId}:cooldown`;
    const isCooldown = await redis.get(cooldownKey);
    if (isCooldown) {
      return res.status(429).json({
        success: false,
        message: "Please wait 60 seconds before requesting another OTP",
      });
    }

    // Generate 6-digit OTP and hash it
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpHash = await bcrypt.hash(String(otp), 10);

    // Store in Redis with 10-minute TTL
    const hashKey = `otp:${userId}:hash`;
    const emailKey = `otp:${userId}:email`;
    const attemptsKey = `otp:${userId}:attempts`;

    await redis.set(hashKey, otpHash, "EX", 600);
    await redis.set(emailKey, email, "EX", 600);
    await redis.set(attemptsKey, 0, "EX", 600);
    await redis.set(cooldownKey, "1", "EX", 60);

    // Send OTP via email (AWS SES)
    const intro = [
      "Greetings from Macbease.",
      "To verify your professional email, please enter the following OTP.",
      `Your OTP is: ${otp}`,
      "This OTP is valid for 10 minutes.",
    ];

    const outro =
      "If you did not request this verification, please ignore this email. Contact us at support@macbease.com for help.";

    const { ses, params } = await sendMail(
      "there",
      intro,
      outro,
      "Professional Email Verification - OTP",
      email,
    );

    await ses.sendEmail(params).promise();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "OTP sent to your email. It is valid for 10 minutes.",
    });
  } catch (error) {
    console.error("Error sending professional email OTP:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ── Step 2: Verify OTP and save professional email ──
const verifyProfessionalEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const userId = req.user.id;
    const hashKey = `otp:${userId}:hash`;
    const emailKey = `otp:${userId}:email`;
    const attemptsKey = `otp:${userId}:attempts`;

    // Check if OTP exists (not expired)
    const storedHash = await redis.get(hashKey);
    if (!storedHash) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Check attempt limit (max 5)
    const attempts = parseInt(await redis.get(attemptsKey)) || 0;
    if (attempts >= 5) {
      // Delete all OTP keys to force re-request
      await redis.del(hashKey, emailKey, attemptsKey);
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      });
    }

    // Verify that email matches the one used when sending OTP
    const storedEmail = await redis.get(emailKey);
    if (storedEmail !== email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email does not match the one the OTP was sent to",
      });
    }

    // Compare OTP against stored hash
    const isMatch = await bcrypt.compare(String(otp), storedHash);
    if (!isMatch) {
      // Increment attempts
      await redis.incr(attemptsKey);
      const remaining = 4 - attempts;
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: `Invalid OTP. ${remaining > 0 ? remaining + " attempts remaining." : "This was your last attempt."}`,
      });
    }

    // OTP verified — save professional email and mark verified
    await User.updateOne(
      { _id: mongoose.Types.ObjectId(userId) },
      {
        $set: {
          professionalEmail: email,
          emailVerified: true,
        },
      },
    );

    // Clean up Redis keys
    await redis.del(hashKey, emailKey, attemptsKey, `otp:${userId}:cooldown`);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Professional email verified successfully",
    });
  } catch (error) {
    console.error("Error verifying professional email OTP:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const completeProfile = async (req, res) => {
  try {
    const fieldsToUpdate = req.body;

    if (!fieldsToUpdate || Object.keys(fieldsToUpdate).length === 0) {
      return res
        .status(StatusCodes.NO_CONTENT)
        .send("No Fields provided for update");
    }

    fieldsToUpdate.incompleteProfile = false;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: fieldsToUpdate },
      { new: true, runValidators: true },
    );

    if (!updatedUser) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.");
    }

    return res.status(StatusCodes.OK).send("User profile completed.");
  } catch (err) {
    console.log("Error updating user:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const sendBatchedNotifications = async (req, res) => {
  try {
    const { users, title, body, deepLink } = req.body;
    const usersData = await User.find(
      { _id: { $in: users } },
      { pushToken: 1 },
    );
    const tokens = usersData.map((u) => u.pushToken);
    const notificationData = {
      pushToken: tokens,
      title,
      body,
      url: deepLink,
    };
    scheduleNotification2(notificationData);
    return res.status(StatusCodes.OK).send("Notifications dispatched!");
  } catch (error) {
    console.log("Error updating user:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const getInactiveUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || isNaN(query)) {
      return res
        .status(400)
        .json({ error: "Valid number of days is required" });
    }

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - parseInt(query));

    const users = await User.find({}, { name: 1, lastActive: 1, email: 1 });

    const inactiveUsers = users.filter((user) => {
      const lastActiveDate = new Date(user.lastActive);
      return !isNaN(lastActiveDate) && lastActiveDate < thresholdDate;
    });

    return res.status(200).json(inactiveUsers);
  } catch (error) {
    console.error("Error fetching inactive users:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const updateIncompleteFields = async (req, res) => {
  try {
    const users = await User.find({});

    const updatedUsers = users.map(async (user) => {
      const incompleteFields = [];

      const checkField = (field, fieldName) => {
        if (
          field === null ||
          field === undefined ||
          (Array.isArray(field) && field.every((item) => item === "")) ||
          (typeof field === "string" && field.trim() === "")
        ) {
          incompleteFields.push(fieldName);
        }
      };

      checkField(user.course, "course");
      checkField(user.interests, "interests");
      checkField(user.field, "field");
      checkField(user.passoutYear, "passoutYear");
      checkField(user.level, "level");

      user.incompleteFields = incompleteFields;
      return user.save();
    });

    const results = await Promise.all(updatedUsers);

    res
      .status(200)
      .json({ message: "Incomplete fields updated successfully", results });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error fetching users", details: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.query;
    const user = await User.findById(id, { name: 1, image: 1, pushToken: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.");
    }

    return res.status(StatusCodes.OK).json(user);
  } catch (err) {
    console.log("Error fetching user by id :", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong!");
  }
};

const changeIp = async (req, res) => {
  try {
    const { ip, description, questId, userId } = req.body;

    // Validate required fields
    if (ip === undefined || ip === null || !description) {
      return res.status(Sta0tusCodes.BAD_REQUEST).json({
        message:
          "Incomplete data provided. Both 'ip' and 'description' are required.",
      });
    }

    // Ensure IP is within valid range (-100 to +100)
    if (typeof ip !== "number" || ip < -100 || ip > 100) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid IP value. It must be a number between -100 and +100.",
      });
    }

    // Perform the IP update
    await updateUserIP({
      userId,
      ipChange: ip, // Accepts both negative and positive values
      c_source: "user",
      d_source: "system",
      c_ref: req.user.id,
      description,
    });

    const user = await User.findById(userId, { ip: 1 }).lean();

    // TODO: Add quest completion logic in quest service
    // if (questId) {
    //   await Quest.findByIdAndUpdate(questId, {
    //     $push: { completedBy: mongoose.Types.ObjectId(userId) },
    //   });
    // }

    return res
      .status(StatusCodes.OK)
      .json({ message: "IP successfully updated.", totalIp: user.ip });
  } catch (error) {
    console.error("Error updating user IP:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong while updating IP.",
      error: error.message,
    });
  }
};

const getUsersBySignupDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (req.user.role !== "admin") {
      console.log("mid");
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send("Not authorized to access this data.");
    }
    if (!date) {
      return res
        .status(400)
        .json({ message: "Date query parameter is required" });
    }

    const queryDate = new Date(date);
    const year = queryDate.getFullYear();
    const month = queryDate.getMonth(); // 0-indexed (Jan = 0)
    const day = queryDate.getDate();

    // Create the range: start of that day to start of next day
    const startOfDay = new Date(year, month, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month, day + 1, 0, 0, 0, 0);

    const users = await User.find(
      {
        createdAt: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      },
      { name: 1, pushToken: 1 },
    );

    res.status(200).json({ total: users.length, users });
  } catch (error) {
    console.error("Error fetching users by signup date:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getUserFieldsById = async (req, res) => {
  const { id, fields, batch, batchSize, arrayFieldForBatching } = req.body;

  // Validate ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: "Invalid user ID." });
  }

  // Validate fields
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: "Fields array is required." });
  }

  // Check for batching
  let projection = {};
  for (const field of fields) {
    if (
      arrayFieldForBatching &&
      field === arrayFieldForBatching &&
      batch &&
      batchSize
    ) {
      const skip = (parseInt(batch) - 1) * parseInt(batchSize);
      projection[field] = { $slice: [skip, parseInt(batchSize)] };
    } else {
      projection[field] = 1;
    }
  }

  try {
    const user = await User.findById(id, projection).lean();

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    return res.status(StatusCodes.OK).json({ data: user });
  } catch (error) {
    console.error("❌ getUserFieldsById error:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch user data.",
    });
  }
};

const pushNotice = async (req, res) => {
  try {
    const { userId, notice } = req.body;
    if (!userId || !notice) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    await User.findByIdAndUpdate(userId, {
      $push: { unreadNotice: notice },
    });

    return res
      .status(200)
      .json({ success: true, message: "Notice pushed successfully" });
  } catch (error) {
    console.error("❌ pushNotice error:", error.message);
    return res.status(500).json({ error: "Failed to push notice" });
  }
};

const addToContentTeam = async (req, res) => {
  if (req.user.role === "admin") {
    try {
      const { id } = req.query;
      let user = await User.findById(id, { role: 1, email: 1, name: 1 });
      user.role = "Creator";
      user.save();
      //sending email to creator
      const name = user.name;
      const intro = [
        "We are so delighted to have you onboard Macbease Content Team.",
        `We look forward to having wonderful working experience with you.`,
      ];
      const outro = "Let us begin this journey together!";
      const subject = "Macbease Confirmation";
      const destination = [user.email];
      const { ses, params } = await sendMail(
        name,
        intro,
        outro,
        subject,
        destination,
      );
      ses.sendEmail(params, function (err, data) {
        if (err) {
          console.log(err, err.stack);
        }
      });
      return res
        .status(StatusCodes.OK)
        .send("Successfully added to Macbease content team!");
    } catch (error) {
      console.log(error.message);
      return res.status(StatusCodes.OK).send("Something went wrong.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to add to content team.");
  }
};

const readContentTeam = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(StatusCodes.FORBIDDEN).json({
      error: "You are not authorized to read the content team.",
    });
  }

  try {
    const users = await User.find(
      { role: "Creator" },
      {
        name: 1,
        image: 1,
        course: 1,
        email: 1,
        _id: 1,
        reg: 1,
        pushToken: 1,
        interests: 1,
      },
    ).lean();

    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    console.error("❌ Error fetching content team:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch content team.",
    });
  }
};

const removeFromTeam = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(StatusCodes.FORBIDDEN).json({
      error: "You are not authorized to remove users from the content team.",
    });
  }

  const { id } = req.query;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid user ID is required.",
    });
  }

  try {
    const user = await User.findById(id, { role: 1, email: 1, name: 1 });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "User not found.",
      });
    }

    user.role = "Normal";
    await user.save();

    const name = user.name;
    const intro = [
      "We are so sorry to let you go from the Macbease Content Team.",
      "It was a great experience working with you. All the best for your future endeavours.",
    ];
    const outro =
      "This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.";
    const subject = "Macbease Confirmation";
    const destination = [user.email];

    try {
      const { ses, params } = await sendMail(
        name,
        intro,
        outro,
        subject,
        destination,
      );
      ses.sendEmail(params, (err) => {
        if (err) {
          console.error(
            "❌ Failed to send removal email:",
            err.stack || err.message,
          );
        }
      });
    } catch (emailErr) {
      console.error("❌ Error while preparing SES email:", emailErr.message);
    }

    return res.status(StatusCodes.OK).json({
      message: "Successfully removed from Macbease content team.",
    });
  } catch (error) {
    console.error("❌ Error in removeFromTeam:", {
      adminId: req.user.id,
      targetUserId: id,
      error: error.message,
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while removing the user from the team.",
    });
  }
};

const getContentTeamAdmins = async (req, res) => {
  try {
    let team = await Admin.find({ role: "Content Team" }, { _id: 1 });
    if (team.length === 0) {
      team = await Admin.find({}, { _id: 1 });
    }
    const ids = team.map((item) => item._id);
    return res.status(StatusCodes.OK).json(ids);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const saveInterest = async (req, res) => {
  try {
    // Check role
    if (req.user.role !== "user") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to save interests.");
    }

    const { interests } = req.body;

    // Validate request body
    if (!Array.isArray(interests) || interests.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Please provide a valid array of interests.");
    }

    // Lemmatize interests
    const lemmatized = lemmatize(interests);

    // Find user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("User not found. Please try again.");
    }

    // Update interests
    user.interests = lemmatized;
    await user.save();

    return res.status(StatusCodes.OK).send("Successfully updated interests.");
  } catch (error) {
    console.error("Error saving interests:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An unexpected error occurred while saving interests.");
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allUsers = await User.find({});

    const bulkOps = allUsers.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
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
              lng: 75.70361,
            },
          },
        },
      },
    }));

    const result = await User.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} users`);

    res.status(200).json({
      message: "Users updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getMemoryListUsers = async (req, res) => {
  try {
    // Ensure user is authenticated
    const userId = req.user.id;
    if (!userId) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ msg: "Unauthorized access." });
    }

    // Find the logged-in user
    const user = await User.findById(userId).select("memoryList");
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: "User not found." });
    }

    // If memory list is empty
    if (!user.memoryList || user.memoryList.length === 0) {
      return res.status(StatusCodes.OK).json({ users: [] });
    }

    // Fetch all users in the memoryList
    const memoryUsers = await User.find(
      { _id: { $in: user.memoryList } },
      { name: 1, image: 1, course: 1 },
    );

    return res.status(StatusCodes.OK).json({ users: memoryUsers });
  } catch (error) {
    console.error("Error fetching memory list users:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Failed to fetch memory list users.",
      error: error.message,
    });
  }
};

const removeUserFromMemoryList = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!userId) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ msg: "Unauthorized access." });
    }

    if (!targetUserId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "targetUserId is required." });
    }

    const userToUpdate = await User.findById(userId);

    // Filter out the target user ID manually
    userToUpdate.memoryList = userToUpdate.memoryList.filter(
      (id) => id.toString() !== targetUserId,
    );

    await userToUpdate.save();

    return res
      .status(StatusCodes.OK)
      .json({ msg: "Successfully removed from memory list" });
  } catch (error) {
    console.error("Error removing user from memory list:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Failed to remove user from memory list.",
      error: error.message,
    });
  }
};

const getSearchResults = async (req, res) => {
  try {
    let query = req.query.query?.trim() || "";
    const key = req.query.key || "All";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const MIN_SCORE = 0.5; // relevance threshold

    let seenIds = [];
    if (req.query.seenIds) {
      try {
        const parsed = JSON.parse(req.query.seenIds);
        if (Array.isArray(parsed)) seenIds = parsed;
      } catch (e) {
        seenIds = req.query.seenIds.split(",");
      }
    }
    const validSeenIds = seenIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const skip = validSeenIds.length > 0 ? 0 : (page - 1) * limit;

    if (!query) return res.status(200).json({ success: true, results: [] });

    const isFiltered = key !== "All";

    async function fetchClubs() {
      const pipeline = [
        {
          $search: {
            index: "default",
            compound: {
              should: [
                {
                  autocomplete: { query, path: "name", fuzzy: { maxEdits: 1 } },
                },
                {
                  text: {
                    query,
                    path: ["motto", "tags"],
                    fuzzy: { maxEdits: 1 },
                  },
                },
              ],
            },
          },
        },
        { $match: { _id: { $nin: validSeenIds } } },
        { $addFields: { membersCount: { $size: "$members" } } },
        {
          $project: {
            name: 1,
            motto: 1,
            featuringImg: 1,
            secondaryImg: 1,
            type: { $literal: "club" },
            score: { $meta: "searchScore" },
          },
        },
        { $sort: { score: -1, membersCount: -1, _id: 1 } },
      ];
      if (isFiltered) {
        pipeline.push({ $skip: skip }, { $limit: limit + 1 });
      } else {
        pipeline.push({ $limit: 12 });
      }
      return await Club.aggregate(pipeline);
    }

    async function fetchEvents() {
      if (isFiltered) {
        return fetchSearchedEvents(query, {
          page: validSeenIds.length > 0 ? 1 : page,
          limit,
          seenIds,
        });
      }
      return fetchSearchedEvents(query, { seenIds });
    }

    async function fetchCommunities() {
      const pipeline = [
        {
          $search: {
            index: "default",
            compound: {
              should: [
                {
                  autocomplete: {
                    query,
                    path: "title",
                    fuzzy: { maxEdits: 1 },
                  },
                },
                {
                  text: {
                    query,
                    path: ["description", "label", "tags"],
                    fuzzy: { maxEdits: 1 },
                  },
                },
              ],
            },
          },
        },
        { $match: { _id: { $nin: validSeenIds } } },
        {
          $project: {
            title: 1,
            label: 1,
            secondaryCover: 1,
            type: { $literal: "community" },
            score: { $meta: "searchScore" },
          },
        },
        { $sort: { score: -1, _id: 1 } },
      ];
      if (isFiltered) {
        pipeline.push({ $skip: skip }, { $limit: limit + 1 });
      } else {
        pipeline.push({ $limit: 12 });
      }
      return await Community.aggregate(pipeline);
    }

    async function fetchUsers() {
      const pipeline = [
        {
          $search: {
            index: "default",
            compound: {
              should: [
                {
                  autocomplete: { query, path: "name", fuzzy: { maxEdits: 1 } },
                },
                {
                  autocomplete: {
                    query,
                    path: "fullName",
                    fuzzy: { maxEdits: 1 },
                  },
                },
                { text: { query, path: "interests", fuzzy: { maxEdits: 1 } } },
                { text: { query, path: "course", fuzzy: { maxEdits: 1 } } },
              ],
            },
          },
        },
        { $match: { _id: { $nin: validSeenIds } } },
        {
          $project: {
            name: 1,
            fullName: 1,
            image: 1,
            course: 1,
            interests: 1,
            type: { $literal: "user" },
            score: { $meta: "searchScore" },
          },
        },
        { $sort: { score: -1, _id: 1 } },
      ];
      if (isFiltered) {
        pipeline.push({ $skip: skip }, { $limit: limit + 1 });
      } else {
        pipeline.push({ $limit: 12 });
      }
      return await User.aggregate(pipeline);
    }

    async function fetchCards() {
      if (isFiltered) {
        return fetchSearchedCards(query, {
          page: validSeenIds.length > 0 ? 1 : page,
          limit,
          seenIds,
        });
      }
      return fetchSearchedCards(query, { seenIds });
    }

    async function fetchContents() {
      if (isFiltered) {
        return fetchSearchedContents(query, {
          page: validSeenIds.length > 0 ? 1 : page,
          limit,
          seenIds,
        });
      }
      return fetchSearchedContents(query, { seenIds });
    }

    // fetch based on key mode
    let [clubs, events, communities, users, cards, contents] =
      await Promise.all([
        ["Clubs", "All"].includes(key) ? fetchClubs() : [],
        ["Events", "All"].includes(key) ? fetchEvents() : [],
        ["Communities", "All"].includes(key) ? fetchCommunities() : [],
        ["People", "All"].includes(key) ? fetchUsers() : [],
        ["Cards", "All"].includes(key) ? fetchCards() : [],
        ["Content"].includes(key) ? fetchContents() : [],
      ]);

    const deduplicate = (arr) => {
      if (!arr || !Array.isArray(arr)) return [];
      const seen = new Set();
      return arr.filter((item) => {
        const id = item._id
          ? item._id.toString()
          : item.id
            ? item.id.toString()
            : null;
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    };

    clubs = deduplicate(clubs);
    events = deduplicate(events);
    communities = deduplicate(communities);
    users = deduplicate(users);
    cards = deduplicate(cards);
    contents = deduplicate(contents);

    if (key === "All") {
      // "All" mode: return top items from each category, ordered by highest-scoring category first
      const categoryBlocks = [
        { type: "club", data: clubs, top: clubs[0]?.score || 0 },
        { type: "event", data: events, top: events[0]?.score || 0 },
        {
          type: "community",
          data: communities,
          top: communities[0]?.score || 0,
        },
        { type: "user", data: users, top: users[0]?.score || 0 },
        { type: "card", data: cards, top: cards[0]?.score || 0 },
      ];

      categoryBlocks.sort((a, b) => b.top - a.top);

      const results = categoryBlocks.flatMap((c) =>
        c.data.filter((s) => s.score >= MIN_SCORE).slice(0, 4),
      );
      return res.json({ success: true, results, hasMore: false });
    } else {
      // Filtered mode: single-category with pagination
      const dataMap = {
        Clubs: clubs,
        Events: events,
        Communities: communities,
        People: users,
        Cards: cards,
        Content: contents,
      };
      const rawData = dataMap[key] || [];
      const filtered = rawData.filter((s) => s.score >= MIN_SCORE);
      const hasMore = filtered.length > limit;
      const results = filtered.slice(0, limit);
      return res.json({ success: true, results, hasMore, page });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const getTuners = async (req, res) => {
  try {
    const { userId, page = 1, batchSize = 12 } = req.query;

    if (!userId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "userId is required" });
    }

    const skip = (parseInt(page) - 1) * parseInt(batchSize);
    const limit = parseInt(batchSize);

    const user = await User.findById(userId, { tunedIn_By: 1 }).lean();

    if (!user || !Array.isArray(user.tunedIn_By)) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User or tunedIn_By list not found" });
    }

    const userIds = user.tunedIn_By.slice(skip, skip + limit);

    const tuners = await User.find(
      { _id: { $in: userIds } },
      { name: 1, image: 1, course: 1, passoutYear: 1 },
    ).lean();

    return res.status(StatusCodes.OK).json({
      page: parseInt(page),
      batchSize: limit,
      count: tuners.length,
      tuners,
    });
  } catch (error) {
    console.error("Error fetching tuners", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Failed to fetch tuners.",
      error: error.message,
    });
  }
};

const getMemoryListRecommendation = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch only the memory field to keep the query efficient
    const user = await User.findById(userId, { memoryList: 1 }).lean();

    if (!user || !user.memoryList) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User or memory list not found" });
    }

    // Get the last 12 entries from the memory array
    const recentMemoryList = user.memoryList.slice(-24).reverse();

    // Fetch the corresponding user data
    const recommendation = await User.find(
      { _id: { $in: recentMemoryList } },
      { image: 1, name: 1, _id: 1, course: 1, pushToken: 1 },
    ).lean();

    return res.status(StatusCodes.OK).json({ recommendation });
  } catch (error) {
    console.error("Error fetching recent memories:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Failed to fetch recent memories.",
      error: error.message,
    });
  }
};

// controller to insert universe meta data in every shortcut
const DEFAULT_UNIVERSE = {
  uid: "696f491a0bfc89b35dc62326",
  name: "Lovely Professional University",
  callSign: "LPU",
  location: "Punjab, India",
  logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
  logoKey: "public/universes/lpu_logo-removebg-preview.png",
};

const addUniverseMetaDataToShortcuts = async (req, res) => {
  try {
    const result = await User.updateMany(
      { "shortCuts.0": { $exists: true } },
      {
        $set: {
          "shortCuts.$[].universeMetaData": DEFAULT_UNIVERSE,
        },
      },
      {
        strict: false,
      },
    );

    return res.json({
      success: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

const getUsersWithDynamicQuery = async (req, res) => {
  try {
    const { filter, projection } = req.body;

    // Validate that `filter` is an object
    if (!filter || typeof filter !== "object") {
      return res
        .status(400)
        .json({ error: "Invalid or missing filter object." });
    }

    // Projection can be either an object (recommended) or a string
    const users = await User.find(filter, projection || {}).limit(6);

    return res.status(200).json({ data: users });
  } catch (error) {
    console.error("Error fetching users with dynamic query:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const fetchBulkUsers = async (req, res) => {
  try {
    const { userIds, fields = [] } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "User IDs are required." });
    }

    const projection = fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {});

    const objectIds = userIds
      .map((id) =>
        mongoose.Types.ObjectId.isValid(id)
          ? new mongoose.Types.ObjectId(id)
          : null,
      )
      .filter(Boolean);

    if (objectIds.length === 0) {
      return res.status(400).json({ error: "No valid user IDs provided." });
    }

    const users = await User.find({ _id: { $in: objectIds } }, projection);

    return res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users in bulk:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const getUsersByFields = async (req, res) => {
  try {
    const { filters = {}, fields = [] } = req.body;

    if (!filters || typeof filters !== "object") {
      return res.status(400).json({
        success: false,
        message: "Filters object is required",
      });
    }

    if (fields && !Array.isArray(fields)) {
      return res.status(400).json({
        success: false,
        message: "Fields must be an array",
      });
    }

    const query = {};

    for (const key in filters) {
      const value = filters[key];

      if (Array.isArray(value)) {
        if (key === "_id") {
          query[key] = {
            $in: value
              .filter(mongoose.Types.ObjectId.isValid)
              .map((id) => new mongoose.Types.ObjectId(id)),
          };
        } else {
          query[key] = { $in: value };
        }
      } else {
        query[key] = value;
      }
    }

    let projection = null;
    if (fields.length > 0) {
      projection = fields.join(" ");
    }

    const users = await User.find(query).select(projection).lean();

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getUsersByFields error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

const getPostableSpaces = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select("clubs communitiesPartOf communitiesCreated")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const clubIds = (user.clubs || []).map((c) => c.clubId);

    //  Sort communities by lastPosted (recent first)
    const sortedCommunitiesPartOf = [
      ...(user.communitiesPartOf || []),
      ...(user.communitiesCreated || []),
    ].sort((a, b) => {
      if (!a.lastPosted && !b.lastPosted) return 0;
      if (!a.lastPosted) return 1;
      if (!b.lastPosted) return -1;
      return new Date(b.lastPosted) - new Date(a.lastPosted);
    });

    const communityIds = sortedCommunitiesPartOf.map((c) => c.communityId);

    // 2. Fetch allowed clubs & communities
    const [clubs, communities] = await Promise.all([
      Club.find({
        _id: { $in: clubIds },
        "permissions.whoCanPost": userId,
      })
        .select(
          "_id name secondaryImg universeMetaData uid rating members motto",
        )
        .sort({ rating: -1 }) //  top rated clubs
        .lean(),

      Community.find({
        _id: { $in: communityIds },
        $or: [{ postPermission: true }, { creatorId: userId }],
      })
        .select("_id title secondaryCover universeMetaData uid members tag")
        .lean(),
    ]);

    // Create lookup for lastPosted
    const lastPostedMap = {};
    sortedCommunitiesPartOf.forEach((c) => {
      lastPostedMap[c.communityId.toString()] = c.lastPosted;
    });

    // Normalize
    const normalizedClubs = clubs.map((c) => ({
      id: c._id,
      name: c.name,
      secondaryImg: c.secondaryImg,
      universeMetaData: c.universeMetaData,
      uid: c.uid,
      motto: c.motto,
      membersCount: c.members?.length || 0,
      type: "club",
    }));

    const normalizedCommunities = communities.map((c, index) => ({
      id: c._id,
      title: c.title,
      secondaryCover: c.secondaryCover,
      universeMetaData: c.universeMetaData,
      uid: c.uid,
      tag: c.tag,
      membersCount: c.members?.length || 0,
      label: index < 3 ? "Just Posted" : undefined,
      type: "community",
    }));

    // Final limit = 12
    const MAX = 12;

    // pick TOP ones (not random)
    const topCommunities = normalizedCommunities.slice(0, 6);
    const topClubs = normalizedClubs.slice(0, 6);

    // now interleave them randomly
    const mixed = [];
    let i = 0;
    let j = 0;

    while (
      mixed.length < MAX &&
      (i < topCommunities.length || j < topClubs.length)
    ) {
      const takeCommunity =
        i < topCommunities.length &&
        (j >= topClubs.length || Math.random() > 0.5);

      if (takeCommunity) {
        mixed.push(topCommunities[i++]);
      } else if (j < topClubs.length) {
        mixed.push(topClubs[j++]);
      }
    }

    const result = mixed;

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error("getPostableSpaces error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const searchPostableSpaces = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q } = req.query; // search text

    if (!q || !q.trim()) {
      return res.status(400).json({ message: "Search query required" });
    }

    const user = await User.findById(userId)
      .select("clubs communitiesPartOf communitiesCreated")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const clubIds = (user.clubs || []).map((c) => c.clubId);

    const communityIds = [
      ...(user.communitiesPartOf || []),
      ...(user.communitiesCreated || []),
    ].map((c) => c.communityId);

    const regex = new RegExp(q, "i");

    const [clubs, communities] = await Promise.all([
      Club.find({
        _id: { $in: clubIds },
        "permissions.whoCanPost": userId,
        name: { $regex: regex },
      })
        .select(
          "_id name secondaryImg universeMetaData uid rating members motto",
        )
        .limit(6)
        .lean(),

      Community.find({
        _id: { $in: communityIds },
        $or: [{ postPermission: true }, { creatorId: userId }],
        title: { $regex: regex },
      })
        .select("_id title secondaryCover universeMetaData uid members tag")
        .limit(6)
        .lean(),
    ]);

    const result = [
      ...communities.map((c) => ({
        id: c._id,
        title: c.title,
        secondaryCover: c.secondaryCover,
        universeMetaData: c.universeMetaData,
        uid: c.uid,
        tag: c.tag,
        membersCount: c.members?.length || 0,
        type: "community",
      })),
      ...clubs.map((c) => ({
        id: c._id,
        name: c.name,
        secondaryImg: c.secondaryImg,
        universeMetaData: c.universeMetaData,
        uid: c.uid,
        motto: c.motto,
        membersCount: c.members?.length || 0,
        type: "club",
      })),
    ];

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error("searchPostableSpaces error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==================== BOOKMARK CONTROLLERS ====================

const bookmarkContent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contentId, contentType = "content" } = req.body;

    if (!contentId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "contentId is required." });
    }

    // Upsert — idempotent, no duplicate error
    await Bookmark.findOneAndUpdate(
      { userId, contentId },
      { userId, contentId, contentType, savedAt: new Date() },
      { upsert: true, new: true },
    );

    // Count total bookmarks for this content and update via Kafka
    const bookmarkCount = await Bookmark.countDocuments({ contentId });

    await sendKafkaMessage("UPDATE_CONTENT", "content", {
      contentId: contentId.toString(),
      updatedFields: { bookmarkCount },
    });

    return res.status(StatusCodes.OK).json({
      message: "Content bookmarked successfully.",
      bookmarkCount,
    });
  } catch (error) {
    console.error("Error in bookmarkContent:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while bookmarking." });
  }
};

const unbookmarkContent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contentId } = req.body;

    if (!contentId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "contentId is required." });
    }

    const deleted = await Bookmark.findOneAndDelete({ userId, contentId });

    if (!deleted) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Bookmark not found." });
    }

    // Recount and update via Kafka
    const bookmarkCount = await Bookmark.countDocuments({ contentId });

    await sendKafkaMessage("UPDATE_CONTENT", "content", {
      contentId: contentId.toString(),
      updatedFields: { bookmarkCount },
    });

    return res.status(StatusCodes.OK).json({
      message: "Bookmark removed successfully.",
      bookmarkCount,
    });
  } catch (error) {
    console.error("Error in unbookmarkContent:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while removing bookmark." });
  }
};

const getBookmarks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor, limit = 10 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 10, 50);

    const query = { userId };
    if (cursor) {
      query.savedAt = { $lt: new Date(cursor) };
    }

    const bookmarks = await Bookmark.find(query)
      .sort({ savedAt: -1 })
      .limit(parsedLimit)
      .lean();

    const nextCursor =
      bookmarks.length === parsedLimit
        ? bookmarks[bookmarks.length - 1].savedAt.toISOString()
        : null;

    return res.status(StatusCodes.OK).json({
      bookmarks,
      nextCursor,
      count: bookmarks.length,
    });
  } catch (error) {
    console.error("Error in getBookmarks:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while fetching bookmarks." });
  }
};

const checkBookmarks = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { contentIds } = req.body;

    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "contentIds array is required." });
    }

    const objectIds = contentIds
      .map((id) =>
        mongoose.Types.ObjectId.isValid(id)
          ? new mongoose.Types.ObjectId(id)
          : null,
      )
      .filter(Boolean);

    const bookmarks = await Bookmark.find(
      {
        userId,
        contentId: { $in: objectIds },
      },
      { contentId: 1 },
    ).lean();

    const bookmarkedIds = bookmarks.map((b) => b.contentId.toString());

    return res.status(StatusCodes.OK).json({ bookmarkedIds });
  } catch (error) {
    console.error("Error in checkBookmarks:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while checking bookmarks." });
  }
};

const saveUserAsset = async (req, res) => {
  try {
    const asset = req.body.asset || req.body;
    const userId = req.user.id;

    if (!asset || !asset.assetId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Missing required fields." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { vicinityAsset: asset } },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    return res.status(StatusCodes.OK).json({
      message: "Asset saved successfully.",
      vicinityAsset: updatedUser.vicinityAsset,
    });
  } catch (error) {
    console.error("Error saving user asset:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while saving the asset." });
  }
};

const savePayloadToMyAsset = async (req, res) => {
  try {
    const { payloadType, payloadItem, sourceAssetId, sourceUserId } = req.body;
    const userId = req.user.id;

    if (!payloadType || !payloadItem) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: "Missing required fields: payloadType and payloadItem.",
      });
    }

    const validTypes = ["book", "movie", "audio"];
    if (!validTypes.includes(payloadType)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: `Invalid payloadType. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    const { savePayloadToAsset } = require("../services/assetSaveService");

    const result = await savePayloadToAsset(userId, payloadType, payloadItem, {
      sourceAssetId,
      sourceUserId,
    });

    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.error("Error in savePayloadToMyAsset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: "Something went wrong while saving the payload.",
    });
  }
};

const editUserAsset = async (req, res) => {
  try {
    const { assetId, updates, assets } = req.body;
    const userId = req.user.id;

    if (assets && Array.isArray(assets)) {
      if (assets.length === 0) {
        console.log("xf");
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ error: "Assets array cannot be empty." });
      }

      // Build $set query and arrayFilters for multiple updates
      const setQuery = {};
      const arrayFilters = [];

      assets.forEach((item, index) => {
        const identifier = `elem${index}`;
        if (item.assetId && item.updates) {
          for (const key in item.updates) {
            setQuery[`vicinityAsset.$[${identifier}].${key}`] =
              item.updates[key];
          }
          arrayFilters.push({ [`${identifier}.assetId`]: item.assetId });
        }
      });

      if (Object.keys(setQuery).length === 0) {
        console.log("No valid updates provided in assets array.");
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ error: "No valid updates provided in assets array." });
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: userId },
        { $set: setQuery },
        { arrayFilters, new: true },
      );

      if (!updatedUser) {
        console.log("xfdssdsdsd");
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ error: "User not found." });
      }

      return res.status(StatusCodes.OK).json({
        message: "Assets updated successfully.",
        vicinityAsset: updatedUser.vicinityAsset,
      });
    }

    // Single update logic (legacy/fallback)
    if (!assetId || !updates) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Missing required fields." });
    }

    // Build $set query for the specific fields matching in the updates object
    const setQuery = {};
    for (const key in updates) {
      setQuery[`vicinityAsset.$.${key}`] = updates[key];
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, "vicinityAsset.assetId": assetId },
      { $set: setQuery },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Asset or User not found." });
    }

    return res.status(StatusCodes.OK).json({
      message: "Asset updated successfully.",
      vicinityAsset: updatedUser.vicinityAsset,
    });
  } catch (error) {
    console.error("Error editing user asset:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while editing the asset." });
  }
};

const deleteUserAsset = async (req, res) => {
  try {
    const { assetId } = req.body;
    const userId = req.user.id;

    if (!assetId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Missing required fields." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { vicinityAsset: { _id: assetId } } },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    return res.status(StatusCodes.OK).json({
      message: "Asset deleted successfully.",
      vicinityAsset: updatedUser.vicinityAsset,
    });
  } catch (error) {
    console.error("Error deleting user asset:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while deleting the asset." });
  }
};

const getUserAssets = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Missing userId query parameter." });
    }

    const user = await User.findById(userId, { vicinityAsset: 1 }).lean();

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    const vicinityAssets = user.vicinityAsset || [];

    if (vicinityAssets.length === 0) {
      return res.status(StatusCodes.OK).json({ vicinityAsset: [] });
    }

    const assetIds = vicinityAssets.map((asset) => asset.assetId);

    // Fetch full asset data from the map service
    const fetchedAssets = await fetchMultipleAssets({ ids: assetIds });

    // Merge user schema properties (x, z, dx, dy, payload) with full asset definition
    const populatedAssets = vicinityAssets
      .map((vcAsset) => {
        const fullAsset = fetchedAssets.find(
          (fa) => String(fa._id) === String(vcAsset.assetId),
        );
        if (fullAsset) {
          const { payload, ...rest } = vcAsset;
          const filteredPayload = payload?.customLabel
            ? { customLabel: payload.customLabel, cardId: payload?.cardId }
            : undefined;

          return {
            ...fullAsset, // the actual asset properties (name, url, etc)
            ...rest, // the user vicinity specific positioning (excluding payload)
            ...(filteredPayload && { payload: filteredPayload }),
          };
        }
        return null; // Handle if asset got deleted entirely from the map db
      })
      .filter(Boolean);

    return res.status(StatusCodes.OK).json({
      vicinityAsset: populatedAssets,
    });
  } catch (error) {
    console.error("Error fetching user assets:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while fetching the assets." });
  }
};

const getUserAssetById = async (req, res) => {
  try {
    const { userId, vicinityAssetId } = req.query;

    if (!userId || !vicinityAssetId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Missing userId or vicinityAssetId query parameter." });
    }

    const user = await User.findById(userId, { vicinityAsset: 1 }).lean();

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    const vcAsset = (user.vicinityAsset || []).find(
      (asset) => String(asset._id) === String(vicinityAssetId),
    );

    if (!vcAsset) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Asset not found in user's vicinity." });
    }

    // Fetch full asset data from the map service
    const fetchedAssets = await fetchMultipleAssets({ ids: [vcAsset.assetId] });
    const fullAsset = fetchedAssets.find(
      (fa) => String(fa._id) === String(vcAsset.assetId),
    );

    if (!fullAsset) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Asset not found in map service." });
    }

    return res.status(StatusCodes.OK).json({
      ...fullAsset,
      ...vcAsset,
    });
  } catch (error) {
    console.error("Error fetching user asset by id:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while fetching the asset." });
  }
};

const searchUsersByFacet = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Query string is required" });
    }

    const facetResponse = await fetchSearchedProfileFacets(query);

    if (
      !facetResponse ||
      !facetResponse.success ||
      !facetResponse.data ||
      !facetResponse.data.length
    ) {
      return res.status(StatusCodes.OK).json([]);
    }

    const parentIds = facetResponse.data.map((item) => item._id);

    const users = await User.find(
      { _id: { $in: parentIds } },
      {
        name: 1,
        image: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
        deactivated: 1,
        email: 1,
        profession: 1,
        field: 1,
      },
    ).lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const sortedUsers = parentIds
      .map((id) => userMap.get(String(id)))
      .filter(Boolean);

    const results = sortedUsers.map((user) => {
      const facetData = facetResponse.data.find(
        (f) => String(f._id) === String(user._id),
      );
      return {
        ...user,
        matchedFacets: facetData ? facetData.facets : [],
      };
    });

    return res.status(StatusCodes.OK).json(results);
  } catch (error) {
    console.error("searchUsersByFacet error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

const getAlumniByCompany = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "Unauthorized" });
    }
    const alumniStats = await User.aggregate([
      {
        $match: {
          profession: "Alumni",
        },
      },
      {
        $group: {
          _id: "$company",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          company: "$_id",
          count: 1,
          _id: 0,
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    return res.status(StatusCodes.OK).json(alumniStats);
  } catch (error) {
    console.error("Error fetching alumni by company:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

/**
 * Suggests 2–3 asset categories the user hasn't uploaded yet.
 * Prioritises categories whose assets have payloadConfig (audio/book/movie),
 * then fills up with non-payload categories.
 * Returns { tag, subTag, lottieUrl } for each suggestion.
 */
const getAssetSuggestions = async (req, res) => {
  try {
    const userId = req.query.userId || req.user._id;

    if (!userId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Missing userId." });
    }

    // 1. Get what the user already has
    const user = await User.findById(userId, { vicinityAsset: 1 }).lean();
    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "User not found." });
    }

    const userAssets = user.vicinityAsset || [];
    const userAssetIds = userAssets.map((a) => a.assetId);

    // Fetch full asset data to know their tags + payload types
    let existingPayloadTypes = new Set();
    let existingTags = new Set();

    if (userAssetIds.length > 0) {
      const fullAssets = await fetchMultipleAssets({ ids: userAssetIds });
      fullAssets.forEach((a) => {
        if (a.tag) existingTags.add(a.tag);
        if (
          a.payloadConfig?.requiresPayload &&
          a.payloadConfig?.allowedPayloadTypes
        ) {
          a.payloadConfig.allowedPayloadTypes.forEach((pt) => {
            if (pt && pt !== "none") existingPayloadTypes.add(pt);
          });
        }
      });

      // Also check user-level payloads (vicinityAsset.payload.type)
      userAssets.forEach((a) => {
        if (a.payload?.type) existingPayloadTypes.add(a.payload.type);
      });
    }

    // 2. Fetch all available categories from the map service
    const allCategories = await fetchAssetCategories();

    if (!allCategories || allCategories.length === 0) {
      return res
        .status(StatusCodes.OK)
        .json({ success: true, suggestions: [] });
    }

    // 3. Split into payload vs non-payload categories the user hasn't used
    const payloadCandidates = [];
    const plainCandidates = [];

    allCategories.forEach((cat) => {
      if (cat.hasPayload && cat.payloadTypes.length > 0) {
        // Check if user already has ALL payload types in this category
        const userHasAll = cat.payloadTypes.every((pt) =>
          existingPayloadTypes.has(pt),
        );
        if (!userHasAll) {
          payloadCandidates.push(cat);
        }
      } else {
        // Non-payload category – check if user already has an asset with this tag
        if (!existingTags.has(cat.tag)) {
          plainCandidates.push(cat);
        }
      }
    });

    // 4. Pick up to 3 suggestions: payload categories first, then plain
    const suggestions = [];
    for (const cat of payloadCandidates) {
      if (suggestions.length >= 3) break;
      suggestions.push({
        tag: cat.tag,
        subTag: cat.subTag,
        lottieUrl: cat.lottieUrl,
        lottieType: cat.lottieType,
        payloadTypes: cat.payloadTypes,
      });
    }
    for (const cat of plainCandidates) {
      if (suggestions.length >= 3) break;
      suggestions.push({
        tag: cat.tag,
        subTag: cat.subTag,
        lottieUrl: cat.lottieUrl,
        lottieType: cat.lottieType,
        payloadTypes: [],
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("Error fetching asset suggestions:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching asset suggestions.",
      error: error.message,
    });
  }
};

// ─── Channel Internal Endpoints (called by event service) ──────────────

/**
 * Guard: ensures only internal service-to-service calls can access these endpoints.
 * The generateServiceToken() used by event/ticket services sets role = "internal".
 */
const requireServiceRole = (req, res) => {
  if (!req.internalService) {
    res.status(403).json({ error: "Service-only endpoint" });
    return false;
  }
  return true;
};

/**
 * Add a channel entry to a single user
 * POST /user/addChannelToUser
 * Body: { userId, channelId, role, rooms }
 */
const addChannelToUser = async (req, res) => {
  try {
    if (!requireServiceRole(req, res)) return;

    const { userId, channelId, role, rooms } = req.body;

    if (!userId || !channelId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "userId and channelId are required" });
    }

    // Check if channel already exists for user
    const existingUser = await User.findOne(
      { _id: userId, "channels.channelId": channelId },
      { _id: 1 },
    );

    if (existingUser) {
      // Channel already exists, add missing rooms
      if (rooms && rooms.length > 0) {
        await User.updateOne(
          { _id: userId, "channels.channelId": channelId },
          { $addToSet: { "channels.$.rooms": { $each: rooms } } },
        );
      }
      return res
        .status(StatusCodes.OK)
        .json({ success: true, message: "Channel updated" });
    }

    await User.updateOne(
      { _id: userId },
      {
        $push: {
          channels: {
            channelId,
            role: role || "member",
            rooms: rooms || [],
          },
        },
      },
    );

    return res.status(StatusCodes.OK).json({ success: true });
  } catch (error) {
    console.error("addChannelToUser error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong" });
  }
};

/**
 * Bulk update channels for multiple users
 * POST /user/bulkUpdateUserChannels
 * Body: { userIds, channelId, role, rooms } (simple mode)
 *   OR  { operations: [{ userId, action, channelId, role, rooms }] } (operations mode)
 */
const bulkUpdateUserChannels = async (req, res) => {
  try {
    if (!requireServiceRole(req, res)) return;

    const { userIds, channelId, role, rooms, operations } = req.body;

    if (operations && Array.isArray(operations)) {
      const bulkOps = operations.map((op) => {
        if (op.action === "addRooms") {
          return {
            updateOne: {
              filter: {
                _id: op.userId,
                "channels.channelId": op.channelId,
              },
              update: {
                $addToSet: {
                  "channels.$.rooms": { $each: op.rooms },
                },
              },
            },
          };
        } else {
          return {
            updateOne: {
              filter: {
                _id: op.userId,
                "channels.channelId": { $ne: op.channelId },
              },
              update: {
                $push: {
                  channels: {
                    channelId: op.channelId,
                    role: op.role || "member",
                    rooms: op.rooms || [],
                  },
                },
              },
            },
          };
        }
      });

      if (bulkOps.length) {
        await User.bulkWrite(bulkOps);
      }
    } else if (userIds && channelId) {
      const bulkOps = userIds.map((uid) => ({
        updateOne: {
          filter: {
            _id: uid,
            "channels.channelId": { $ne: channelId },
          },
          update: {
            $push: {
              channels: {
                channelId,
                role: role || "member",
                rooms: rooms || [],
              },
            },
          },
        },
      }));

      if (bulkOps.length) {
        await User.bulkWrite(bulkOps);
      }
    }

    return res.status(StatusCodes.OK).json({ success: true });
  } catch (error) {
    console.error("bulkUpdateUserChannels error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong" });
  }
};

/**
 * Get channel data for users
 * POST /user/getUserChannels
 * Body: { userIds, channelId? }
 */
const getUserChannels = async (req, res) => {
  try {
    if (!requireServiceRole(req, res)) return;

    const { userIds, channelId } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "userIds must be a non-empty array" });
    }

    let users;
    if (channelId) {
      // Optimized: use $elemMatch projection to fetch only the relevant channel entry
      users = await User.find(
        { _id: { $in: userIds } },
        { channels: { $elemMatch: { channelId } } },
      ).lean();
    } else {
      users = await User.find(
        { _id: { $in: userIds } },
        { channels: 1 },
      ).lean();
    }

    const result = {};
    for (const user of users) {
      const uid = user._id.toString();
      if (channelId) {
        const channelData = (user.channels || [])[0] || null;
        result[uid] = channelData;
      } else {
        result[uid] = user.channels || [];
      }
    }

    return res.status(StatusCodes.OK).json({ data: result });
  } catch (error) {
    console.error("getUserChannels error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong" });
  }
};

/**
 * Check if a user is part of a channel and return their role
 * POST /user/checkUserChannelRole
 * Body: { userId, channelId }
 */
const checkUserChannelRole = async (req, res) => {
  try {
    if (!requireServiceRole(req, res)) return;

    const { userId, channelId } = req.body;

    if (!userId || !channelId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "userId and channelId are required" });
    }

    const user = await User.findOne(
      {
        _id: userId,
        "channels.channelId": channelId,
      },
      { "channels.$": 1 },
    ).lean();

    if (!user || !user.channels || user.channels.length === 0) {
      return res.status(StatusCodes.OK).json({ data: null });
    }

    return res.status(StatusCodes.OK).json({
      data: {
        role: user.channels[0].role,
        rooms: user.channels[0].rooms,
      },
    });
  } catch (error) {
    console.error("checkUserChannelRole error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong" });
  }
};

const getRecommendedProfiles = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "User not found" });
    }

    const users = await User.aggregate([
      {
        $match: {
          _id: { $ne: user._id },
          profession: "Student",
          $or: [
            { course: user.course },
            { interests: { $in: user.interests } },
          ],
        },
      },
      { $sample: { size: 5 } }, // RANDOM 5 USERS
      {
        $project: {
          name: 1,
          image: 1,
          course: 1,
          field: 1,
        },
      },
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Fetched users successfully",
      recommendedProfiles: users,
    });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Server error" });
  }
};

const getTrendingSearches = async (req, res) => {
  try {
    const { filter } = req.query;
    const LIMIT = 6;

    if (!filter) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "filter query param is required" });
    }

    const validFilters = ["club", "community", "events", "people", "card"];
    if (!validFilters.includes(filter)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Invalid filter. Must be one of: ${validFilters.join(", ")}`,
      });
    }

    // ── Club / Community ───────────────────────────────────────────────
    if (filter === "club") {
      const clubs = await Club.aggregate([
        {
          $addFields: {
            membersCount: { $size: { $ifNull: ["$members", []] } },
          },
        },
        { $sort: { membersCount: -1 } },
        { $limit: LIMIT },
        {
          $project: {
            name: 1,
            motto: 1,
            featuringImg: 1,
            secondaryImg: 1,
            tags: 1,
            membersCount: 1,
            universeMetaData: 1,
          },
        },
      ]);

      return res
        .status(StatusCodes.OK)
        .json({ success: true, filter, data: clubs });
    }

    if (filter === "community") {
      const communities = await Community.aggregate([
        {
          $addFields: {
            membersCount: { $size: { $ifNull: ["$members", []] } },
          },
        },
        { $sort: { membersCount: -1 } },
        { $limit: LIMIT },
        {
          $project: {
            title: 1,
            label: 1,
            cover: 1,
            secondaryCover: 1,
            tag: 1,
            membersCount: 1,
            universeMetaData: 1,
          },
        },
      ]);

      return res
        .status(StatusCodes.OK)
        .json({ success: true, filter, data: communities });
    }

    // ── Events (interservice) ──────────────────────────────────────────
    if (filter === "events") {
      const events = await fetchTrendingEvents({ limit: LIMIT });
      return res
        .status(StatusCodes.OK)
        .json({ success: true, filter, data: events });
    }

    // ── People ─────────────────────────────────────────────────────────
    if (filter === "people") {
      const currentUser = await User.findById(req.user.id, {
        interests: 1,
      }).lean();

      const interests = currentUser?.interests || [];

      let people;
      if (interests.length > 0) {
        // Match users who share at least one interest, ranked by overlap
        people = await User.aggregate([
          {
            $match: {
              _id: { $ne: mongoose.Types.ObjectId(req.user.id) },
              interests: { $in: interests },
              deactivated: { $ne: true },
            },
          },
          {
            $addFields: {
              matchScore: {
                $size: {
                  $setIntersection: ["$interests", interests],
                },
              },
            },
          },
          { $sort: { matchScore: -1 } },
          { $limit: LIMIT },
          {
            $project: {
              name: 1,
              image: 1,
              course: 1,
              interests: 1,
              universeMetaData: 1,
            },
          },
        ]);
      } else {
        // Fallback: random non-deactivated users
        people = await User.aggregate([
          {
            $match: {
              _id: { $ne: mongoose.Types.ObjectId(req.user.id) },
              deactivated: { $ne: true },
            },
          },
          { $sample: { size: LIMIT } },
          {
            $project: {
              name: 1,
              image: 1,
              course: 1,
              interests: 1,
              universeMetaData: 1,
            },
          },
        ]);
      }

      return res
        .status(StatusCodes.OK)
        .json({ success: true, filter, data: people });
    }

    // ── Card (interservice) ────────────────────────────────────────────
    if (filter === "card") {
      const currentUser = await User.findById(req.user.id, {
        interests: 1,
      }).lean();

      const interests = currentUser?.interests || [];
      const cards = await fetchTrendingCards({ tags: interests, limit: LIMIT });

      return res
        .status(StatusCodes.OK)
        .json({ success: true, filter, data: cards });
    }
  } catch (error) {
    console.error("Error in getTrendingSearches:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Something went wrong" });
  }
};

// ==================== ASSET REACTION CONTROLLERS ====================

/**
 * React to an asset with an emoji.
 * POST /user/reactToAsset
 * Body: { ownerUserId, vicinityAssetId, emoji }
 *
 * Toggle behaviour:
 *  - If user already reacted with the SAME emoji → unreact (remove)
 *  - If user already reacted with a DIFFERENT emoji → switch
 *  - If user has no reaction → add
 */
const reactToAsset = async (req, res) => {
  try {
    const { ownerUserId, vicinityAssetId, emoji } = req.body;
    const reactorId = req.user.id;

    if (!ownerUserId || !vicinityAssetId || !emoji) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "ownerUserId, vicinityAssetId, and emoji are required.",
      });
    }

    const owner = await User.findById(ownerUserId, { vicinityAsset: 1 });
    if (!owner) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Asset owner not found." });
    }

    const asset = owner.vicinityAsset.id(vicinityAssetId);
    if (!asset) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Asset not found." });
    }

    // Initialise reactions map if it doesn't exist yet
    if (!asset.reactions) {
      asset.reactions = new Map();
    }

    // Check if user already reacted with THIS SPECIFIC emoji
    const existingIdx = (asset.reactedBy || []).findIndex(
      (r) => String(r.userId) === String(reactorId) && r.emoji === emoji,
    );

    if (existingIdx >= 0) {
      // Same emoji again → toggle off (unreact)
      const oldCount = asset.reactions.get(emoji) || 0;
      if (oldCount <= 1) {
        asset.reactions.delete(emoji);
      } else {
        asset.reactions.set(emoji, oldCount - 1);
      }

      asset.reactedBy.splice(existingIdx, 1);

      await owner.save();
      return res
        .status(StatusCodes.OK)
        .json({ success: true, action: "unreacted" });
    }

    // Add new reaction
    const currentCount = asset.reactions.get(emoji) || 0;
    asset.reactions.set(emoji, currentCount + 1);
    asset.reactedBy.push({
      userId: reactorId,
      emoji,
      reactedAt: new Date(),
    });

    await owner.save();

    return res
      .status(StatusCodes.OK)
      .json({ success: true, action: "reacted" });
  } catch (error) {
    console.error("Error in reactToAsset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while reacting to asset.",
    });
  }
};

/**
 * Get aggregated reactions for an asset.
 * GET /user/getAssetReactions?ownerUserId=xxx&vicinityAssetId=yyy
 */
const getAssetReactions = async (req, res) => {
  try {
    const { ownerUserId, vicinityAssetId } = req.query;
    const callerId = req.user?.id;

    if (!ownerUserId || !vicinityAssetId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "ownerUserId and vicinityAssetId are required.",
      });
    }

    const owner = await User.findById(ownerUserId, { vicinityAsset: 1 }).lean();
    if (!owner) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Asset owner not found." });
    }

    const asset = (owner.vicinityAsset || []).find(
      (a) => String(a._id) === String(vicinityAssetId),
    );

    if (!asset) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Asset not found." });
    }

    // Build reactions object from the Map
    const reactions =
      asset.reactions instanceof Map
        ? Object.fromEntries(asset.reactions)
        : asset.reactions || {};

    const totalCount = Object.values(reactions).reduce((sum, c) => sum + c, 0);

    // Find calling user's reaction
    let userReaction = null;
    if (callerId && Array.isArray(asset.reactedBy)) {
      const entry = asset.reactedBy.find(
        (r) => String(r.userId) === String(callerId),
      );
      if (entry) {
        userReaction = entry.emoji;
      }
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      reactions,
      totalCount,
      userReaction,
    });
  } catch (error) {
    console.error("Error in getAssetReactions:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while fetching reactions.",
    });
  }
};

/**
 * GET /user/getRecommendedSpaces
 *
 * Returns recommended communities & clubs for users who have few or no
 * postable spaces. Useful for new-user onboarding inside the Post In selector.
 *
 * Prioritisation:
 *   1. Same-universe communities the user is NOT already in
 *   2. Interest-matched communities (user.interests ∩ community.tag)
 *   3. Trending / fast-growing communities (by member count)
 *   4. Beginner-friendly open communities
 *   5. Locked clubs the user might want to apply to
 */
const getRecommendedSpaces = async (req, res) => {
  try {
    const userId = req.user.id;
    const MIN_RESULTS = 6;
    const MAX_RESULTS = 15;

    const user = await User.findById(userId)
      .select(
        "clubs communitiesPartOf communitiesCreated interests uid universeMetaData",
      )
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // IDs the user is already a member of
    const memberCommunityIds = [
      ...(user.communitiesPartOf || []).map((c) => c.communityId.toString()),
      ...(user.communitiesCreated || []).map((c) => c.communityId.toString()),
    ];
    const memberClubIds = (user.clubs || []).map((c) => c.clubId.toString());
    const excludedCommunityIds = memberCommunityIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const excludedClubIds = memberClubIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    const userInterests = (user.interests || []).map((i) =>
      i.toLowerCase().trim(),
    );
    const userUid = user.uid ? user.uid.toString() : null;

    // ── 1. Fetch candidate open communities ──
    const communityQuery = {
      _id: { $nin: excludedCommunityIds },
      "entryRules.visibility": { $ne: false },
      "entryRules.isInviteOnly": { $ne: true },
    };

    // Prefer same universe first, then fall back to all
    const [sameUniCommunities, globalCommunities] = await Promise.all([
      userUid
        ? Community.find({ ...communityQuery, uid: userUid })
            .select(
              "_id title secondaryCover tag members activeMembers uid universeMetaData entryRules",
            )
            .sort({ activeMembers: -1 })
            .limit(MAX_RESULTS)
            .lean()
        : Promise.resolve([]),
      Community.find(communityQuery)
        .select(
          "_id title secondaryCover tag members activeMembers uid universeMetaData entryRules",
        )
        .sort({ activeMembers: -1 })
        .limit(MAX_RESULTS * 2)
        .lean(),
    ]);

    // ── 2. Fetch candidate clubs (locked = require proposal to join) ──
    const clubQuery = {
      _id: { $nin: excludedClubIds },
    };

    const [sameUniClubs, globalClubs] = await Promise.all([
      userUid
        ? Club.find({ ...clubQuery, uid: userUid })
            .select(
              "_id name motto tags secondaryImg members uid universeMetaData",
            )
            .sort({ "members.length": -1 })
            .limit(8)
            .lean()
        : Promise.resolve([]),
      Club.find(clubQuery)
        .select(
          "_id name motto tags secondaryImg members uid universeMetaData",
        )
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
    ]);

    // ── 3. De-duplicate ──
    const seenIds = new Set();
    const dedup = (arr) =>
      arr.filter((item) => {
        const id = item._id.toString();
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });

    const allCommunities = dedup([...sameUniCommunities, ...globalCommunities]);
    const allClubs = dedup([...sameUniClubs, ...globalClubs]);

    // ── 4. Score & categorise communities ──
    const scoredCommunities = allCommunities.map((c) => {
      let score = 0;
      const tags = (c.tag || []).map((t) =>
        typeof t === "string" ? t.toLowerCase().trim() : "",
      );

      // Same university bonus
      if (userUid && c.uid && c.uid.toString() === userUid) {
        score += 30;
      }

      // Interest overlap
      const overlap = tags.filter((t) => userInterests.includes(t)).length;
      score += overlap * 15;

      // Active members bonus (trending)
      const memberCount = c.members?.length || 0;
      if (memberCount > 50) score += 10;
      else if (memberCount > 20) score += 5;

      // Active members score
      score += Math.min(c.activeMembers || 0, 20);

      // Determine category
      let category = "global";
      if (userUid && c.uid && c.uid.toString() === userUid) {
        category = "campus";
      } else if (overlap > 0) {
        category = "interest";
      } else if (memberCount > 30) {
        category = "trending";
      } else if (memberCount > 10) {
        category = "growing";
      } else {
        category = "beginner";
      }

      return {
        id: c._id,
        type: "community",
        joinType: "open",
        name: c.title,
        description: tags
          .filter((t) => t.length > 0)
          .slice(0, 4)
          .join(" • "),
        secondaryCover: c.secondaryCover,
        membersCount: memberCount,
        tags,
        category,
        universeName: c.universeMetaData?.callSign || "",
        eligibilityHint: "Open to all",
        score,
      };
    });

    // ── 5. Score & categorise clubs ──
    const scoredClubs = allClubs.map((c) => {
      let score = 0;
      const tags = (c.tags || []).map((t) =>
        typeof t === "string" ? t.toLowerCase().trim() : "",
      );

      if (userUid && c.uid && c.uid.toString() === userUid) {
        score += 25;
      }

      const overlap = tags.filter((t) => userInterests.includes(t)).length;
      score += overlap * 12;

      const memberCount = c.members?.length || 0;
      if (memberCount > 30) score += 8;

      let category = "global";
      if (userUid && c.uid && c.uid.toString() === userUid) {
        category = "campus";
      } else if (overlap > 0) {
        category = "interest";
      } else if (memberCount > 20) {
        category = "trending";
      } else {
        category = "growing";
      }

      return {
        id: c._id,
        type: "club",
        joinType: "locked",
        name: c.name,
        description: c.motto || "",
        secondaryImg: c.secondaryImg,
        membersCount: memberCount,
        tags,
        category,
        universeName: c.universeMetaData?.callSign || "",
        eligibilityHint: "Requires approval",
        score,
      };
    });

    // ── 6. Sort by score and interleave ──
    scoredCommunities.sort((a, b) => b.score - a.score);
    scoredClubs.sort((a, b) => b.score - a.score);

    // Take top communities and top clubs, interleave
    const topCommunities = scoredCommunities.slice(0, 10);
    const topClubs = scoredClubs.slice(0, 5);

    const result = [];
    let ci = 0;
    let cli = 0;

    // Interleave: 2 communities then 1 club
    while (
      result.length < MAX_RESULTS &&
      (ci < topCommunities.length || cli < topClubs.length)
    ) {
      if (ci < topCommunities.length) result.push(topCommunities[ci++]);
      if (ci < topCommunities.length) result.push(topCommunities[ci++]);
      if (cli < topClubs.length) result.push(topClubs[cli++]);
    }

    // If still below minimum, pad with remaining
    if (result.length < MIN_RESULTS) {
      const remaining = [
        ...scoredCommunities.slice(ci),
        ...scoredClubs.slice(cli),
      ].sort((a, b) => b.score - a.score);

      for (const item of remaining) {
        if (result.length >= MIN_RESULTS) break;
        if (!result.find((r) => r.id.toString() === item.id.toString())) {
          result.push(item);
        }
      }
    }

    // Remove internal score from response
    const sanitized = result.map(({ score, ...rest }) => rest);

    return res.status(200).json({
      success: true,
      count: sanitized.length,
      data: sanitized,
    });
  } catch (err) {
    console.error("getRecommendedSpaces error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  getAssetSuggestions,
  getUserAssets,
  getUserAssetById,
  saveUserAsset,
  savePayloadToMyAsset,
  editUserAsset,
  deleteUserAsset,
  reactToAsset,
  getAssetReactions,
  getUser,
  updateUser,
  deleteUser,
  getUserByToken,
  searchUserByName,
  getUserBio,
  advanceSearch,
  getAllUsers,
  cleanUp,
  randomUsers,
  changePassword,
  pushPermanentNotice,
  getPermanentNotices,
  deleteNotifications,
  getCommunitiesForPost,
  getPermanentNoticeInBatch,
  sendMailToUsers,
  getBasicUserBio,
  sendNotification,
  deactivateAccount,
  search,
  fetchMultipleProfiles,
  getPushTokens,
  tuneIn,
  untune,
  getProfessorRecommendations,
  searchFromAllProfessors,
  sendMailVerification,
  verifyEmail,
  completeProfile,
  sendBatchedNotifications,
  getInactiveUsers,
  updateIncompleteFields,
  getUserById,
  changeIp,
  getUsersBySignupDate,
  getUserFieldsById,
  pushNotice,
  addToContentTeam,
  readContentTeam,
  removeFromTeam,
  getContentTeamAdmins,
  saveInterest,
  insertNewFields,
  getMemoryListUsers,
  removeUserFromMemoryList,
  getSearchResults,
  getTuners,
  getMemoryListRecommendation,
  addUniverseMetaDataToShortcuts,
  getUsersWithDynamicQuery,
  fetchBulkUsers,
  getUsersByFields,
  getPostableSpaces,
  searchPostableSpaces,
  bookmarkContent,
  unbookmarkContent,
  getBookmarks,
  checkBookmarks,
  sendProfessionalEmailOTP,
  verifyProfessionalEmailOTP,
  searchUsersByFacet,
  getAlumniByCompany,
  addChannelToUser,
  bulkUpdateUserChannels,
  getUserChannels,
  checkUserChannelRole,
  getRecommendedProfiles,
  getTrendingSearches,
  getRecommendedSpaces,
};

const sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Phone number is required." });
    }

    // MOCK OTP
    const otp = "1234";
    console.log(`[MOCK OTP] Sending OTP ${otp} to phone ${phone}`);

    res
      .status(StatusCodes.OK)
      .json({ success: true, message: "OTP sent successfully." });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to send OTP." });
  }
};

const verifyPhoneOTP = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Phone number and OTP are required." });
    }

    // MOCK VERIFICATION
    if (otp !== "1234") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Invalid OTP." });
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { phone, isPhoneVerified: true },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    res
      .status(StatusCodes.OK)
      .json({ success: true, message: "Phone number verified successfully." });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Phone number is already associated with another account.",
      });
    }
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to verify OTP." });
  }
};

module.exports.sendPhoneOTP = sendPhoneOTP;
module.exports.verifyPhoneOTP = verifyPhoneOTP;
