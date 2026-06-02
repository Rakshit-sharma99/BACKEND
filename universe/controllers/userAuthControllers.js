const { StatusCodes } = require("http-status-codes");
const { validationResult } = require("express-validator");
const User = require("../models/user");
const Session = require("../models/session");
const UnregisteredDevices = require("../models/unregisteredDevices");
const Club = require("../models/club");
const Community = require("../models/community");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  sendMail,
  fetchOrgData,
  createNewOrg,
  sendOnboardingMail,
  containsRestrictedWords,
} = require("../controllers/utils");
const { OpenAI } = require("openai");
const { default: mongoose } = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const AppConfig = require("../models/appConfig");
const semver = require("semver");
const schedule = require("node-schedule");
const nodemailer = require("nodemailer");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const { shortcuts } = require("./validators/user.validator");
const { registerCustomUniverse } = require("./interServiceCalls");
const {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3v3 = new S3Client({
  region: process.env.S3_AWS_REGION,
  credentials: {
    accessKeyId: process.env.S3_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_AWS_SECRET_ACCESS_KEY,
  },
});
const s3v3Videos = new S3Client({
  region: process.env.S3_AWS_VIDEO_REGION,
  credentials: {
    accessKeyId: process.env.S3_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_AWS_SECRET_ACCESS_KEY,
  },
});
const { redis } = require("../app");
const securePassword = async (password) => {
  try {
    const hash = await bcrypt.hash(password, 10);
    return hash;
  } catch (error) {
    console.log(error);
  }
};

//util function to create org when alumni signs up
const createOrg = async (orgMetaData, userId) => {
  try {
    if (!orgMetaData.name || !orgMetaData.logo) {
      return;
    }
    const threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(`updateOrg_${userId}`, threeSec, async () => {
      try {
        const org_query = {
          orgName: orgMetaData.name,
        };
        const org = await fetchOrgData(org_query);
        const user = await User.findById(userId, { orgId: 1 });
        if (org) {
          sendKafkaMessage("ADD_USERTO_ORG", "org", {
            orgId: org._id.toString(),
            userId,
          });
          // org.working.push(userId);
          user.orgId = org._id;
          // await org.save();
        } else {
          const create_org = {
            orgName: orgMetaData.name,
            orgLogo: orgMetaData.logo,
            working: [userId],
          };
          const newOrg = await createNewOrg(create_org);
          user.orgId = newOrg._id;
        }
        await user.save();
      } catch (error) {
        console.log("Error in creating org for alumni", error);
      }
    });
  } catch (error) {
    console.error("Error in scheduled job in org creation:", error);
  }
};

const generateGibberishPassword = () => {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const specialChars = "!@#$%^&*()_+-=";

  // Ensure at least one of each character type
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += specialChars[Math.floor(Math.random() * specialChars.length)];

  // Fill remaining length with random characters
  const allChars = uppercase + lowercase + numbers + specialChars;
  const remainingLength = 12 - password.length; // Increased total length to 12

  for (let i = 0; i < remainingLength; i++) {
    const randomBytes = new Uint8Array(1);
    crypto.getRandomValues(randomBytes);
    password += allChars[randomBytes[0] % allChars.length];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};

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

const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors.array());
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const {
      name,
      email,
      password,
      course,
      reg,
      interests,
      image,
      field,
      passoutYear,
      level,
      incompleteProfile,
      profession,
      career,
      company,
      workingPosition,
      orgMetaData,
      universe,
      customUniverse,
    } = req.body;

    if (containsRestrictedWords(name)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message:
          "The provided name contains restricted words and cannot be used.",
      });
    }

    const hasUniverse = Object.prototype.hasOwnProperty.call(
      req.body,
      "universe",
    );
    const effectiveCustomUniverse = hasUniverse ? null : customUniverse;
    /* ---------- Platform ---------- */
    const platform = req.body.platform || "app";

    const fallBackUniverse = {
      _id: "697214a93cc594c4ac0b5c77",
      callSign: "X",
      lat: 0,
      lng: 0,
      location: "Macbease Co.",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
      name: "Wild Card",
    };

    const finalUniverse = effectiveCustomUniverse ? fallBackUniverse : universe;

    /* ---------- Build universeMetaData safely ---------- */
    const universeMetaData = {
      name: finalUniverse.name.trim(),
      callSign: finalUniverse.callSign.trim(),
      location: finalUniverse.location.trim(),
      logo: finalUniverse.logo.trim(),
      logoKey: finalUniverse.logoKey?.trim(),
      lat: Number(finalUniverse.lat),
      lng: Number(finalUniverse.lng),
    };

    /* ---------- Check existing user ---------- */
    const existingUser = await User.findOne({ $or: [{ email }, { name }] });
    if (existingUser) {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ success: false, message: "Email already registered" });
    }

    /* ---------- Find incomplete fields ---------- */
    const incompleteFields = [];

    const checkField = (field, fieldName) => {
      if (
        field === null ||
        field === undefined ||
        (Array.isArray(field) && field.every((v) => v === "")) ||
        (typeof field === "string" && field.trim() === "")
      ) {
        incompleteFields.push(fieldName);
      }
    };

    checkField(course, "course");
    checkField(interests, "interests");
    checkField(field, "field");
    checkField(passoutYear, "passoutYear");
    checkField(level, "level");

    if (profession === "Alumni") {
      checkField(career, "career");
      checkField(workingPosition, "workingPosition");
      checkField(company, "company");
    }

    /* ---------- Hash password ---------- */
    const hashedPassword = await securePassword(password);

    /* ---------- Create user ---------- */
    const user = await User.create({
      name: name.trim(),
      email,
      password: hashedPassword,
      course: course?.trim(),
      reg: profession === "Alumni" ? "00000000" : reg,
      interests,
      image,
      field: field?.trim(),
      passoutYear: String(passoutYear)?.trim(),
      level: level?.trim(),
      incompleteProfile,
      profession: profession || "Student",
      career: career?.trim(),
      company: company?.trim(),
      workingPosition: workingPosition?.trim(),
      incompleteFields,
      universeMetaData,
      uid: finalUniverse._id,
    });

    /* ---------- Tokens ---------- */
    const refreshToken = user.createRefreshToken();
    user.refreshTokens[platform] = refreshToken;

    /* ---------- Shortcuts ---------- */
    const randomIndex = Math.floor(Math.random() * shortcuts.length);
    const selectedShortcuts = shortcuts[randomIndex];
    user.shortCuts = selectedShortcuts;
    await user.save();

    const accessToken = user.createAccessToken();

    /* ---------- Optional: alumni org creation ---------- */
    if (profession === "Alumni" && orgMetaData) {
      createOrg(orgMetaData, user._id);
    }

    /* ---------- Background: Custom Universe Registration ---------- */
    if (effectiveCustomUniverse) {
      registerCustomUniverse(effectiveCustomUniverse, user._id);
    }

    /* ---------- Send onboarding mail ---------- */
    sendOnboardingMail(user);

    /* ---------- Publish user.signup event for SERE ---------- */
    try {
      await sendKafkaMessage("USER_SIGNUP", "user", {
        userId: user._id.toString(),
        uid: finalUniverse._id,
        name: user.name,
        interests: user.interests || [],
        profession: user.profession,
        universeMetaData,
      });
      console.log("📤 Published user.signup for SERE");
    } catch (kafkaErr) {
      console.error("user.signup publish failed:", kafkaErr.message);
    }

    /* ---------- Publish universe stats update ---------- */
    if (finalUniverse._id) {
      try {
        await sendKafkaMessage("UNIVERSE_STATS_UPDATE", "multiverse", {
          universeId: finalUniverse._id.toString(),
          field: "members",
          delta: 1,
        });
      } catch (kafkaErr) {
        console.error(
          "universe stats update publish failed:",
          kafkaErr.message,
        );
      }
    }

    /* ---------- Cookies ---------- */
    if (platform === "web") {
      ["access_token", "refresh_token", "session_id"].forEach((name) => {
        res.clearCookie(name, hostCookie);
        res.clearCookie(name, sharedCookie);
      });

      res.cookie("access_token", accessToken, {
        ...sharedCookie,
        maxAge: 25 * 60 * 1000,
      });

      res.cookie("refresh_token", refreshToken, {
        ...sharedCookie,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    const res_payload = {
      user: {
        _id: user._id,
        name: user.name,
        image: user.image,
        role: user.role,
        reg: user.reg,
        profession: user.profession,
        universeMetaData,
      },
    };
    if (platform === "app") {
      res_payload.token = accessToken;
      res_payload.refreshToken = refreshToken;
    }
    return res.status(StatusCodes.CREATED).json({
      success: true,
      res_payload,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Registration failed",
    });
  }
};

const loginUtil = async (user, platform) => {
  if (user.deactivated) {
    const daysElapsed = Math.floor(
      (Date.now() - new Date(user.deactivationDate)) / (1000 * 60 * 60 * 24),
    );

    if (daysElapsed > 29) return "User does not exist.";

    return {
      msg: "Account is currently deactivated.",
      days: 29 - daysElapsed,
    };
  }

  const refreshToken = user.createRefreshToken();
  user.refreshTokens = user.refreshTokens || {};
  user.refreshTokens[platform] = refreshToken;
  user.save();
  const AccessToken = user.createAccessToken();
  return {
    user: {
      _id: user._id,
      name: user.name,
      image: user.image,
      role: user.role,
      reg: user.reg,
      profession: user.profession,
      uid: user.uid,
      universeMetaData: user.universeMetaData,
      email: user.email,
    },
    token: AccessToken,
    refreshToken,
  };
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const googleRegister = async (req, res) => {
  const { idToken } = req.body;
  console.log("idToken: ", idToken);
  try {
    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email } = payload;
    const password = generateGibberishPassword();

    // Check if the user already exists
    let user = await User.findOne({ email });

    if (!user) {
      // User does not exist so share email of user to frontend for further signup process
      return res
        .status(StatusCodes.OK)
        .json({ message: "User does not exists.", email, password });
    }

    return res.status(StatusCodes.OK).json({ msg: "User already exists." });
  } catch (error) {
    console.error("Error during Google Sign-In:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong." });
  }
};

const googleLogin = async (req, res) => {
  const { idToken } = req.body;
  const platform = req.body.platform || "app";
  try {
    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email } = payload;
    // const { sub, email, name, picture } = payload;

    // Check if the user already exists
    let user = await User.findOne(
      { email },
      {
        deactivated: 1,
        deactivationDate: 1,
        name: 1,
        image: 1,
        role: 1,
        reg: 1,
        profession: 1,
        uid: 1,
        universeMetaData: 1,
        email: 1,
      },
    );

    if (!user) {
      // User does not exist so share email of user to frontend for further signup process
      return res.status(StatusCodes.OK).json({ msg: "User does not exists." });
    }

    const result = await loginUtil(user, platform);
    if (result === "User does not exist.") {
      res.status(StatusCodes.OK).json({ msg: "User does not exists." });
      return;
    }
    if (platform === "web") {
      ["access_token", "refresh_token", "session_id"].forEach((name) => {
        res.clearCookie(name, hostCookie);
        res.clearCookie(name, sharedCookie);
      });

      res.cookie("access_token", result.token, {
        ...sharedCookie,
        maxAge: 25 * 60 * 1000,
      });
      res.cookie("refresh_token", result.refreshToken, {
        ...sharedCookie,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      const { token, refreshToken, ...rest } = result;
      return res.status(StatusCodes.OK).json(rest);
    }

    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.error("Error during Google Sign-In:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong." });
  }
};

const loginUser = async (req, res) => {
  try {
    console.log("login attempted");

    const { email, password, platform = "app" } = req.body;
    const user = await User.findOne(
      { email },
      {
        password: 1,
        deactivated: 1,
        deactivationDate: 1,
        name: 1,
        image: 1,
        role: 1,
        reg: 1,
        profession: 1,
        uid: 1,
        universeMetaData: 1,
        email: 1,
      },
    );

    if (!user) {
      return res
        .status(StatusCodes.OK)
        .json({ message: "User does not exist." });
    }

    if (user.deactivated) {
      return res.status(StatusCodes.OK).json({
        message: "Account is deactivated",
        deactivationDate: user.deactivationDate,
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(StatusCodes.OK).json({ message: "Wrong password." });
    }

    const result = await loginUtil(user, platform);

    if (!result || result === "User does not exist.") {
      return res
        .status(StatusCodes.OK)
        .json({ message: "User does not exist." });
    }

    if (platform === "web") {
      ["access_token", "refresh_token", "session_id"].forEach((name) => {
        res.clearCookie(name, hostCookie);
        res.clearCookie(name, sharedCookie);
      });

      res.cookie("access_token", result.token, {
        ...sharedCookie,
        maxAge: 25 * 60 * 1000,
      });

      res.cookie("refresh_token", result.refreshToken, {
        ...sharedCookie,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      const { token, refreshToken, ...rest } = result;
      return res.status(StatusCodes.OK).json(rest);
    }

    return res.status(StatusCodes.OK).json(result);
  } catch (err) {
    console.error("Login error:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Login failed" });
  }
};

//Create new Access token using refresh token
const regenerateAccessToken = async (req, res) => {
  try {
    const { appVersion, platform = "app" } = req.body;
    const key = platform.toLowerCase();

    // 1. Get refresh token
    // App clients should trust the body token first so stale cookies from older
    // mobile sessions cannot override the current refresh token.
    const refreshToken =
      key === "app"
        ? req.body.refreshToken || req.cookies?.refresh_token
        : req.cookies?.refresh_token || req.body.refreshToken;

    if (!refreshToken) {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ message: "Refresh token missing" });
    }

    // 2. Verify refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id, {
      refreshTokens: 1,
      appVersion: 1,
      uid: 1,
      universeMetaData: 1,
    });

    if (!user) {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ message: "Invalid refresh token" });
    }

    if (!user.refreshTokens || user.refreshTokens[key] !== refreshToken) {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ message: "Invalid refresh token" });
    }

    // 3. Rotate tokens
    const newRefreshToken = user.createRefreshToken();
    const newAccessToken = user.createAccessToken();

    if (appVersion) user.appVersion = appVersion;
    user.refreshTokens[key] = newRefreshToken;
    await user.save();

    // 4. Create session
    const session = await Session.create({ userId: payload.id });

    // 5. Set cookies
    if (key === "web") {
      ["access_token", "refresh_token", "session_id"].forEach((name) => {
        res.clearCookie(name, hostCookie);
        res.clearCookie(name, sharedCookie);
      });

      res.cookie("access_token", newAccessToken, {
        ...sharedCookie,
        maxAge: 25 * 60 * 1000,
      });
      res.cookie("refresh_token", newRefreshToken, {
        ...sharedCookie,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.cookie("session_id", session._id.toString(), {
        ...sharedCookie,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
    let response = {};
    if (platform === "app") {
      response.newAccessToken = newAccessToken;
      response.newRefreshToken = newRefreshToken;
      response.sessionId = session._id;
    }

    return res.status(StatusCodes.OK).json(response);
  } catch (err) {
    console.error("regenerateAccessToken error:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Token refresh failed" });
  }
};

//to send recovery otp via email
const recoveryEmail = async (req, res) => {
  const { userEmail, otp, name } = req.body;

  const intro = [
    "You have received this email because a password reset request for your account was received.",
    `The OTP is ${otp}`,
  ];
  const outro =
    "If you did not request a password reset, no further action is required on your part.";
  const subject = "Password Recovery";
  const destination = [userEmail];
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
      return res.status(StatusCodes.OK).send("Something went wrong.");
    } else {
      return res.status(StatusCodes.OK).send("Email sent successfully.");
    }
  });
};

//function to check if the user exists. If it exists then setting a recoveryOtp and returning it
const setOtp = async (req, res) => {
  const { userEmail } = req.body;
  User.findOne({ email: userEmail }, (err, user) => {
    if (err) return console.error(err);
    if (!user) return res.status(StatusCodes.OK).send("User does not exists.");
    let otp = Math.floor(100000 + Math.random() * 900000);
    user.recoveryOtp = otp;
    user.save();
    return res.status(StatusCodes.OK).json(user.recoveryOtp);
  });
};

//function to set new password through email verification
const setNewPassword = async (req, res) => {
  let { otp, newPass, userEmail } = req.body;
  const user = await User.findOne({ userEmail });
  if (!user) return res.status(StatusCodes.OK).send("User does not exists.");
  let encryptedPassword = await securePassword(newPass);
  User.findOne({ email: userEmail }, (err, user) => {
    if (err) return console.error(err);
    let fixedOtp = user.recoveryOtp;
    if (fixedOtp === otp) {
      user.password = encryptedPassword;
    } else {
      return res.status(StatusCodes.OK).send("Verification failed.");
    }
    user.save();
    return res.status(StatusCodes.OK).json("Password changed successfully.");
  });
};

//function to set push token for notifications
const pushToken = async (req, res) => {
  const { userId, pushToken } = req.query;
  console.log("push token fired", userId, pushToken);
  User.findById(userId, (err, user) => {
    if (err) return console.error(err);
    user.pushToken = pushToken;
    user.save((err, update) => {
      if (err) return console.error(err);
      return res.status(StatusCodes.OK).send("Push token successfully saved!");
    });
  });
};

//function to check for availability of username
const userNameAvailable = async (req, res) => {
  const { userName, email, reg, profession, college } = req.query;

  if (containsRestrictedWords(userName)) {
    return res.status(StatusCodes.OK).send("name contains restricted words");
  }

  const nameExists = await User.findOne({ name: userName }, { _id: 1 });
  const emailExists = await User.findOne({ email: email }, { _id: 1 });
  if (college === "Lovely Professional University") {
    if (profession !== "Alumni") {
      const regExists = await User.findOne({ reg: parseInt(reg) }, { _id: 1 });
      if (regExists) {
        return res.status(StatusCodes.OK).send("reg exists");
      }
    }
  }
  if (nameExists) {
    return res.status(StatusCodes.OK).send("name exists");
  } else if (emailExists) {
    return res.status(StatusCodes.OK).send("email exists");
  } else {
    return res.status(StatusCodes.OK).send("clear");
  }
};

//function to send email verification otp during sign up
const emailVerification = async (req, res) => {
  try {
    const { userEmail, name } = req.query;
    if (!userEmail || !name) {
      return res.status(400).json({ message: "Email and name are required" });
    }

    // Check if an OTP was sent in the last 60 seconds
    // const isCached = await redis.get(userEmail);
    const isCached = false;
    if (isCached) {
      return res
        .status(429)
        .json({ message: "Please wait before requesting another OTP." });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Email content
    const intro = [
      "Greetings from Macbease.",
      "To verify your email, please enter the following OTP.",
      `The OTP is ${otp}`,
    ];

    const outro =
      "If you did not expect any response from Macbease, then no further action is required. Feel free to contact us at support@macbease.com.";

    const subject = "Email Verification";

    // Send email via AWS SES
    const { ses, params } = await sendMail(
      name,
      intro,
      outro,
      subject,
      userEmail,
    );

    await ses.sendEmail(params).promise(); // Use promise instead of callback

    // Store email in Redis with a 60-second expiry
    // await redis.set(userEmail, otp, "EX", 60);

    return res.status(200).json({ otp, msg: "Email sent successfully." });
  } catch (error) {
    console.error("Email verification error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

const emailVerification2 = async (req, res) => {
  try {
    const { userEmail, name } = req.query;

    // Generate a 6-digit OTP
    let otp = Math.floor(100000 + Math.random() * 900000);

    // Create email content
    let emailBody = `
      <p>Greetings from Macbease.</p>
      <p>To verify your email, please enter the following OTP:</p>
      <h2>${otp}</h2>
      <p>If you did not request this, you can ignore this email.</p>
      <p>For any help, contact us at support@macbease.com.</p>
    `;

    // Create a Nodemailer transporter
    let transporter = nodemailer.createTransport({
      service: "gmail", // You can change this to other services like Outlook, Yahoo, etc.
      auth: {
        user: "ankitmeena9783226195@gmail.com", // Your email address
        pass: "uoel fitd hmpm drxc", // Your email password or app password
      },
    });

    // Email options
    let mailOptions = {
      from: `"Macbease Support" support@macbease.com`,
      to: userEmail,
      subject: "Email Verification",
      html: emailBody,
    };

    // Send email
    let info = await transporter.sendMail(mailOptions);

    console.log("Email sent: ", info.response);
    return res.status(200).json({ otp, msg: "Email sent successfully." });
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({ error: "Failed to send email." });
  }
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateAbout = async (req, res) => {
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ error: "keyword is required" });
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Generate an 'about' section for a user using the words: ${word}.Please do not include anything that has to be modified by the user(for example don't inlcude user name if not provided like null user).`,
        },
      ],
      max_tokens: 100,
    });

    const aboutSection = response.choices[0].message.content;
    res.json({ about: aboutSection });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the about section" });
  }
};

const generateResearchAreas = async (req, res) => {
  const { word } = req.query;
  if (!word) {
    return res.status(400).json({ error: "keyword is required" });
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Generate an array of 30 research areas in ${word} field.`,
        },
      ],
    });
    const aboutSection = response.choices[0].message.content;
    const array = aboutSection
      .split("\n")
      .map((item) => item.replace(/^\d+\.\s*/, ""));
    res.json(array);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the about section" });
  }
};

// controller to generate interests from the words
const generateInterest = async (req, res) => {
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ error: "keyword is required" });
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Generate an array of similar words using the words : ${word}(might be multiple words or single word).Generate atleast 8 interests for each word. your response should be one dimensional array`,
        },
      ],
      max_tokens: 1000,
    });
    const interests = response.choices[0].message.content;
    const interestArray = JSON.parse(interests);
    res.json({ interestArray });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while generating interests" });
  }
};

const reactivateAccount = async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(StatusCodes.OK).send("User does not exist.");
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(StatusCodes.OK).send("Wrong password.");
    }
    user.deactivated = false;
    user.save();
    return res.status(StatusCodes.OK).send("Reactivation successful.");
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while reactivating account." });
  }
};

const getAppConfig = async (req, res) => {
  try {
    const currentVersion = req.query.version;
    const platform = req.query.platform || "android";
    const userId = req.query?.userId;

    console.log(currentVersion, platform, userId);

    if (platform === "android" && !currentVersion) {
      console.log("missing data");
      return res.status(400).json({
        success: false,
        message: "App version is required in query (?version=2.0.1)",
        query: req.query,
      });
    }

    // Fetch latest config (only 1 doc maintained)
    const config = await AppConfig.findOne({ platform }).lean();
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "No config found",
      });
    }

    const { latestVersion, mandatoryVersion } = config;
    let updateType = "none";

    if (currentVersion && semver.lt(currentVersion, latestVersion)) {
      if (semver.lt(currentVersion, mandatoryVersion)) {
        updateType = "immediate";
      } else {
        updateType = "flexible";
      }
    }

    let chatBadgeCount = 0;
    let pendingMemoryRequestsCount = 0;
    let unreadNoticesCount = 0;

    if (userId) {
      const user = await User.findById(userId, {
        chatRooms: 1,
        memoryRequests: 1,
        unreadNotice: 1,
      }).lean();

      if (user) {
        // Calculate chatBadgeCount: total of unread messages and chat requests
        // A room is counted if it's unread OR if it's a pending request from someone else
        const badgeRooms = (user.chatRooms || []).filter(
          (room) =>
            room.state === "unread" ||
            (room.status === "pending" &&
              room.requestedBy &&
              room.requestedBy.toString() !== userId),
        );
        chatBadgeCount = badgeRooms.length;

        // Calculate pendingMemoryRequestsCount
        console.log("user", user.memoryRequests);
        pendingMemoryRequestsCount = (user.memoryRequests || []).length;
        unreadNoticesCount = (user.unreadNotice || []).length;
        console.log("pendingMemoryRequestsCount", pendingMemoryRequestsCount);
      }
    }

    return res.status(200).json({
      success: true,
      updateType,
      chatBadgeCount,
      pendingMemoryRequestsCount,
      unreadNoticesCount,
      ...config,
    });
  } catch (err) {
    console.error("Error in getAppConfig:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

function generateUsernames(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0].toLowerCase();
  const last = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";

  let candidates = [
    first,
    last ? first + last : null,
    last ? first + "_" + last : null,
    last ? first.charAt(0) + last : null,
    last ? last + "_" + first.charAt(0) : null,
  ].filter(Boolean);

  // Add some numbered variants for fallback
  for (let i = 1; i <= 5; i++) {
    candidates.push(first + i);
    if (last) candidates.push(first + last + i);
  }

  return [...new Set(candidates)]; // remove duplicates
}

const suggestUsername = async (req, res) => {
  try {
    const { fullName } = req.query;
    if (!fullName) {
      return res.status(400).json({ msg: "Full name is required" });
    }

    // Generate possible usernames
    const candidates = generateUsernames(fullName);

    // Find already taken usernames from DB
    const takenUsers = await User.find(
      { name: { $in: candidates } },
      { name: 1, _id: 0 },
    ).lean();

    const takenNames = new Set(takenUsers.map((u) => u.name));

    // Filter available
    let available = candidates.filter((c) => !takenNames.has(c));

    // If not enough available, generate random suffixes until we have at least 5
    while (available.length < 5) {
      const random = Math.floor(Math.random() * 10000);
      const candidate = fullName.split(/\s+/)[0].toLowerCase() + random;
      const exists = await User.findOne({ name: candidate }).lean();
      if (!exists && !available.includes(candidate)) {
        available.push(candidate);
      }
    }

    return res.status(200).json({
      suggestions: available.slice(0, 5),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Server error" });
  }
};

const getUploadUrl = async (req, res) => {
  try {
    let { fileType, key } = req.body;
    const allowedTypes = [
      // Images
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",

      // Videos
      "video/mp4",
      "video/webm",
      "video/quicktime",

      // Documents
      "application/pdf",
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-powerpoint", // .ppt
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
      "text/plain", // .txt
    ];

    if (!allowedTypes.includes(fileType)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid file type",
      });
    }

    const uniqueName = `${Date.now()}`;

    if (!key) {
      key = `public/content/${uniqueName}`;
    }

    const bucket = fileType.startsWith("video/")
      ? process.env.S3_VIDEO_BUCKET
      : process.env.S3_BUCKET;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType, // ✅ IMPORTANT
    });

    let signedUrl;
    if (fileType.startsWith("video/")) {
      signedUrl = await getSignedUrl(s3v3Videos, command, {
        expiresIn: 60,
      });
    } else {
      signedUrl = await getSignedUrl(s3v3, command, {
        expiresIn: 60,
      });
    }
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Generated URL successfully",
      url: signedUrl,
      key,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const copyObject = async (req, res) => {
  try {
    const { fileType, sourceKey, destinationKey } = req.body;

    if (!sourceKey || !destinationKey) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Source and destination required",
      });
    }

    const bucket = fileType?.startsWith("video/")
      ? process.env.S3_VIDEO_BUCKET
      : process.env.S3_BUCKET;

    await s3v3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: destinationKey,
        CopySource: encodeURIComponent(`${bucket}/${sourceKey}`),
        MetadataDirective: "COPY",
      }),
    );

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Copied successfully",
      key: destinationKey,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

function getAppleSigningKey(kid) {
  return new Promise((resolve, reject) => {
    apple_client.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      const signingKey = key.getPublicKey();
      resolve(signingKey);
    });
  });
}

async function verifyAppleToken(identityToken) {
  const decodedHeader = jwt.decode(identityToken, { complete: true });

  if (!decodedHeader) {
    throw new Error("Invalid identity token");
  }

  const kid = decodedHeader.header.kid;
  const alg = decodedHeader.header.alg;

  const signingKey = await getAppleSigningKey(kid);

  // Verify the JWT
  const payload = jwt.verify(identityToken, signingKey, {
    algorithms: [alg],
    issuer: "https://appleid.apple.com",
  });

  return {
    userId: payload.sub,
    email: payload.email || null,
    emailVerified: payload.email_verified,
    isPrivateRelay: payload.is_private_email,
  };
}

const appleRegister = async (req, res) => {
  const { idToken } = req.body;
  try {
    const payload = await verifyAppleToken(idToken);
    const { email } = payload;
    const password = generateGibberishPassword();

    // Check if the user already exists
    let user = await User.findOne({ email });

    if (!user) {
      // User does not exist so share email of user to frontend for further signup process
      return res
        .status(StatusCodes.OK)
        .json({ message: "User does not exists.", email, password });
    }

    return res.status(StatusCodes.OK).json({ msg: "User already exists." });
  } catch (error) {
    console.error("Error during Apple Sign-In:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong." });
  }
};

const appleLogin = async (req, res) => {
  const { idToken } = req.body;
  const platform = req.body.platform || "app";
  try {
    const payload = await verifyAppleToken(idToken);
    const { email } = payload;
    // Check if the user already exists
    let user = await User.findOne(
      { email },
      {
        deactivated: 1,
        deactivationDate: 1,
        name: 1,
        image: 1,
        role: 1,
        reg: 1,
        profession: 1,
      },
    );

    if (!user) {
      // User does not exist so share email of user to frontend for further signup process
      return res.status(StatusCodes.OK).json({ msg: "User does not exists." });
    }

    const result = await loginUtil(user, platform);
    if (result === "User does not exist.") {
      res.status(StatusCodes.OK).json({ msg: "User does not exists." });
      return;
    }
    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.error("Error during Apple Sign-In:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong." });
  }
};

const sendOtpEmailForSignup = async (req, res) => {
  try {
    const { userEmail, name } = req.query;

    if (!userEmail || !name) {
      return res.status(400).json({ message: "Email and name are required" });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(userEmail)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email is invalid",
      });
    }
    // Check if an OTP was sent in the last 60 seconds
    const isCached = await redis.get(`otp:${userEmail}`);
    // const isCached = false;
    if (isCached) {
      return res
        .status(429)
        .json({ message: "Please wait before requesting another OTP." });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Email content
    const intro = [
      "Greetings from Macbease.",
      "To verify your email, please enter the following OTP.",
      `The OTP is ${otp}`,
    ];

    const outro =
      "If you did not expect any response from Macbease, then no further action is required. Feel free to contact us at support@macbease.com.";

    const subject = "Email Verification";

    // Send email via AWS SES
    const { ses, params } = await sendMail(
      name,
      intro,
      outro,
      subject,
      userEmail,
    );

    await ses.sendEmail(params).promise(); // Use promise instead of callback

    // Store email in Redis with a 60-second expiry
    await redis.set(`otp:${userEmail}`, otp, "EX", 60);

    return res.status(200).json({
      msg: "Email sent successfully.",
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

const verifyOtpEmailForSignup = async (req, res) => {
  try {
    const { userEmail, otp } = req.body;

    if (!userEmail || !otp) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email and Otp is required",
      });
    }

    let serverOTP = await redis.get(`otp:${userEmail}`);

    if (!serverOTP) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "OTP is invalid or expired",
      });
    }

    if (String(otp) !== String(serverOTP)) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "OTP is invalid",
      });
    }
    await redis.del(userEmail);
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "OTP is verifed successfully!",
    });
  } catch (e) {
    console.log(e.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const copyImage = async (req, res) => {
  try {
    const { sourceKey, destinationKey } = req.body;

    if (!sourceKey || !destinationKey) {
      return res.status(400).json({
        success: false,
        message: "Both sourceKey and destinationKey are required",
      });
    }

    await s3v3.send(
      new CopyObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: destinationKey,
        CopySource: encodeURIComponent(`${process.env.S3_BUCKET}/${sourceKey}`),
        MetadataDirective: "COPY",
      }),
    );

    return res.status(200).json({
      success: true,
      message: `File copied successfully from ${sourceKey} to ${destinationKey}`,
    });
  } catch (error) {
    console.error("S3 Copy Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error copying file",
      error: error.message,
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");

    user.passwordResetToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    user.passwordResetTokenExpire = Date.now() + 10 * 60 * 1000;

    await user.save();

    const resetUrl = `https://app.macbease.com/reset-password/${token}`;

    const intro = [
      "You have received this email because a password reset request for your account was received.",
      resetUrl,
    ];

    const outro = "If you did not request this, please ignore this email.";

    const subject = "Password Recovery";
    const destination = [user.email];
    const name = user.name || "User";

    const { ses, params } = await sendMail(
      name,
      intro,
      outro,
      subject,
      destination,
    );

    ses.sendEmail(params, async (err) => {
      if (err) {
        user.passwordResetToken = undefined;
        user.passwordResetTokenExpire = undefined;
        await user.save();
        console.log(err);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ success: false, message: "Email failed" });
      }

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Password reset email sent",
      });
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { password, token } = req.body;

    if (!password) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Password is required" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await securePassword(password);
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpire = undefined;

    user.refreshTokens = { app: null, web: null };

    await user.save();

    const logoutTime = Math.floor(Date.now() / 1000);
    if (redis) {
      await redis.set(
        `logout:${user._id.toString()}`,
        logoutTime,
        "EX",
        25 * 60,
      );
    }

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (err) {
    console.log(err);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

const webPushToken = async (req, res) => {
  try {
    const { userId, webPushToken } = req.query;

    await UnregisteredDevices.deleteOne({ fcmToken: webPushToken });

    if (userId) {
      const user = await User.findById(userId);

      if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "User not found",
        });
      }

      user.webPushToken = webPushToken;
      await user.save();

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Saved user PushToken successfully",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Saved token successfully!",
    });
  } catch (err) {
    console.error(err);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const storeUnregisteredDevices = async (req, res) => {
  const { fcmToken } = req.body;
  try {
    if (!fcmToken) return res.status(400).json({ error: "FCM token missing" });

    await UnregisteredDevices.updateOne(
      { fcmToken },
      { $setOnInsert: { fcmToken, createdAt: new Date() } },
      { upsert: true },
    );

    return res.status(200).json({ message: "Anonymous token stored" });
  } catch (err) {
    console.log("Error registering new devices:", err);
    return res.status(500).json({ error: "Something went wrong!" });
  }
};

const nameAndMailExistence = async (req, res) => {
  try {
    const { userName, email } = req.body;

    if (!userName && !email) {
      return res
        .status(400)
        .json({ message: "Username or email is required." });
    }

    const [nameExists, emailExists] = await Promise.all([
      userName ? User.findOne({ name: userName }, { _id: 1 }) : null,
      email ? User.findOne({ email: email }, { _id: 1 }) : null,
    ]);

    return res.status(200).json({
      nameExists: !!nameExists,
      emailExists: !!emailExists,
    });
  } catch (error) {
    console.error("Name and mail existence error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

const getTopClubsCommunities = async (req, res) => {
  try {
    const { limit } = req.query

    const safeLimit = Math.max(1, Number(limit) || 3);

    const clubs = await Club.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: safeLimit,
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

    const communities = await Community.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: 3,
      },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          rating: 1,
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

    return res.status(StatusCodes.OK).json({ clubs, communities });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching top clubs and communities.");
  }
};

const logoutUser = async (req, res) => {
  try {
    ["access_token", "refresh_token", "session_id"].forEach((name) => {
      res.clearCookie(name, hostCookie);
      res.clearCookie(name, sharedCookie);
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  googleRegister,
  googleLogin,
  recoveryEmail,
  setOtp,
  setNewPassword,
  pushToken,
  userNameAvailable,
  emailVerification,
  regenerateAccessToken,
  generateAbout,
  generateResearchAreas,
  generateInterest,
  reactivateAccount,
  emailVerification2,
  getAppConfig,
  suggestUsername,
  getUploadUrl,
  copyObject,
  appleRegister,
  appleLogin,
  sendOtpEmailForSignup,
  verifyOtpEmailForSignup,
  copyImage,
  forgotPassword,
  resetPassword,
  webPushToken,
  storeUnregisteredDevices,
  nameAndMailExistence,
  getTopClubsCommunities,
  logoutUser,
};
