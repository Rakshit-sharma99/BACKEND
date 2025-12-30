const { StatusCodes } = require("http-status-codes");
const User = require("../models/user");
const Community = require("../models/community");
const Club = require("../models/club");
const Org = require("../models/org");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendMail, fetchOrgData, createNewOrg } = require("../controllers/utils");
const { OpenAI } = require("openai");
const { default: mongoose } = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const AppConfig = require("../models/appConfig");
const semver = require("semver");

const schedule = require("node-schedule");
const nodemailer = require("nodemailer");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
// const Redis = require('ioredis');
// const redis = new Redis();

//using this function a new user can join Macbease
//req configuration:
//we need to send four parameters in form of an object in the req.body
//eg- {"name":"Amartya","reg":12113246,"email":"amartyasingh1010@gmail.com","password":"Carpediem@408"}

const p1 = [
  {
    type: "club",
    name: "Coding Club",
    id: mongoose.Types.ObjectId("657b9303f18136e2f692398c"),
    secondaryImg: "public/club/CodingPost3.jpg",
  },
  {
    type: "community",
    name: "Mamba Mentality ",
    id: mongoose.Types.ObjectId("66ed18fe0c4142316f4c43f7"),
    secondary: "public/community/FriSep20202412:11:00GMT+0530img",
  },
  {
    type: "club",
    name: "Pawn Knight",
    id: mongoose.Types.ObjectId("657b97a8f18136e2f69239ab"),
    secondaryImg: "public/club/chessClunCover.jpg",
  },
  {
    type: "community",
    name: "got-it!",
    id: mongoose.Types.ObjectId("657b9407f18136e2f69239a1"),
    secondary: "public/club/SocialClubLogo.jpg",
  },
];
const p2 = [
  {
    type: "club",
    name: "Sheyn",
    id: mongoose.Types.ObjectId("65fbb7a60fa1132b8c9cc280"),
    secondaryImg: "public/club/ThuMar21202409:59:22GMT+0530img",
  },
  {
    type: "community",
    name: "World Wizards",
    id: mongoose.Types.ObjectId("657ba2e9f18136e2f69239d4"),
    secondary: "public/communities/wAlogo.jpeg",
  },
  {
    type: "club",
    name: "Department of Entrepreneurship ",
    id: mongoose.Types.ObjectId("66d29ec57657f2d4231cd22a"),
    secondaryImg: "public/club/SatAug31202410:10:35GMT+0530img",
  },
  {
    type: "community",
    name: "Game devs",
    id: mongoose.Types.ObjectId("670a1d50884ee1bcc3bb12b0"),
    secondary: "public/community/SatOct12202412:25:09GMT+0530img",
  },
];
const p3 = [
  {
    type: "club",
    name: "Coding Club",
    id: mongoose.Types.ObjectId("657b9303f18136e2f692398c"),
    secondaryImg: "public/club/CodingPost3.jpg",
  },
  {
    type: "community",
    name: "got-it!",
    id: mongoose.Types.ObjectId("657b9407f18136e2f69239a1"),
    secondary: "public/club/SocialClubLogo.jpg",
  },
  {
    type: "club",
    name: "0x0CAFE",
    id: mongoose.Types.ObjectId("670eb50be40cd552e8ba386d"),
    secondaryImg: "public/club/WedOct16202400:01:37GMT+0530img",
  },
  {
    type: "community",
    name: "World Wizards",
    id: mongoose.Types.ObjectId("657ba2e9f18136e2f69239d4"),
    secondary: "public/communities/wAlogo.jpeg",
  },
];
const arr = [p1, p2, p3];

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
          orgName: orgMetaData.name
        }
        const org = await fetchOrgData(org_query);
        // const org = await Org.findOne({ orgName: orgMetaData.name });
        const user = await User.findById(userId, { orgId: 1 });
        if (org) {
          sendKafkaMessage("ADD_USERTO_ORG","org",{
            orgId:org._id.toString(),
            userId
          })
          // org.working.push(userId);
          user.orgId = org._id;
          // await org.save();
        } else {
          const create_org = {
            orgName: orgMetaData.name,
            orgLogo: orgMetaData.logo,
            working: [userId],
          }
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

const registerUser = async (req, res) => {
  console.log("sign up fired");
  const {
    name,
    email,
    password,
    course,
    reg,
    interests,
    cards,
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
    universe
  } = req.body;
  
  const universeMetaData = {
    name:universe.name,
    callSign:universe.callSign,
    location:universe.location,
    logo:universe.logo
  }

  const existingUser = await User.findOne({ name, reg, email });
  if (existingUser) {
    return res
      .status(StatusCodes.OK)
      .send("Already a user with these credentials exist.");
  }

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

  console.log("Incomplete fields:", incompleteFields);

  let hashedPassword = await securePassword(password);
  let newData = {
    name,
    email,
    password: hashedPassword,
    course,
    reg: profession === "Alumni" ? "00000000" : reg,
    interests,
    cards,
    image,
    field,
    passoutYear,
    level,
    incompleteProfile,
    profession: profession || "Student",
    career,
    company,
    workingPosition,
    incompleteFields,
    universeMetaData,
    uid:universe._id
  };
  let user = await User.create({
    ...newData,
  });

  await sendKafkaMessage("CREATE_USER","multiverse",{
    _id:user._id.toString(),
    profession,
    name,
    reg,
    course,
    field,
    passoutYear,
    level,
    email,
    image,
    interests,
    uid:universe._id,
    universeMetaData
  });

  const refreshToken = user.createRefreshToken();
  user.refreshToken = refreshToken;
  const rand = Math.floor(Math.random() * 3);
  for (let j = 0; j < arr[rand].length; j++) {
    const shortcut = arr[rand][j];
    user.shortCuts.push(shortcut);
    if (shortcut.type === "community") {
      const community = await Community.findById(shortcut.id, {
        pinnedBy: 1,
      });
      community.pinnedBy.push(mongoose.Types.ObjectId(user._id));
      await community.save();
    } else if (shortcut.type === "club") {
      const club = await Club.findById(shortcut.id, { pinnedBy: 1 });
      club.pinnedBy.push(mongoose.Types.ObjectId(user._id));
      await club.save();
    }
  }
  const randomUser = await User.aggregate([
    { $sample: { size: 1 } },
    { $project: { name: 1, image: 1, pushToken: 1 } },
  ]);
  const personShortCut = {
    type: "people",
    img: randomUser[0].image,
    name: randomUser[0].name,
    id: randomUser[0]._id,
    userPushToken: randomUser[0].pushToken,
  };
  const concernedUser = await User.findById(personShortCut.id, { pinnedBy: 1 });
  concernedUser.pinnedBy.push(mongoose.Types.ObjectId(user._id));
  await concernedUser.save();
  user.shortCuts.push(personShortCut);
  user.save();
  const AccessToken = user.createAccessToken();

  //sending an email on signup
  const scheduleTimeForEmail = new Date(Date.now() + 3 * 1000);
  schedule.scheduleJob(
    `sendMailOnSignUp_${user._id}`,
    scheduleTimeForEmail,
    async () => {
      const intro = [
        "We are so delighted to have you onboard Macbease.",
        `We look forward to making your college experience a delightful one.`,
      ];
      const outro = "Let us begin this journey together!";
      const subject = "Macbease Confirmation";
      const destination = [user.email];
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
    }
  );

  //creating org if alumni joins in
  if (profession === "Alumni" && orgMetaData) {
    createOrg(orgMetaData, user._id);
  }

  return res.status(StatusCodes.CREATED).json({
    user: {
      name: user.name,
      image: user.image,
      _id: user._id,
      role: user.role,
      reg: user.reg,
      profession: user.profession,
      universeMetaData,
    },
    token: AccessToken,
    refreshToken,
  });
};

const loginUtil = async (user) => {
  if (user.deactivated) {
    const deactivationDate = user.deactivationDate;
    const givenDate = new Date(deactivationDate);
    const currentDate = new Date();
    const timeDifference = currentDate - givenDate;
    const daysElapsed = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    if (daysElapsed > 29) {
      return "User does not exist.";
    }
    return {
      msg: "Account is currently deactivated.",
      days: 29 - daysElapsed,
    };
  }
  const refreshToken = user.createRefreshToken();
  user.refreshToken = refreshToken;
  user.save();
  const AccessToken = user.createAccessToken();
  return {
    user: {
      name: user.name,
      image: user.image,
      _id: user._id,
      role: user.role,
      reg: user.reg,
      profession: user.profession,
      uid: user.uid,
      universeMetaData: user.universeMetaData,
      email:user.email
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
        email:1
      }
    );

    if (!user) {
      // User does not exist so share email of user to frontend for further signup process
      return res.status(StatusCodes.OK).json({ msg: "User does not exists." });
    }

    const result = await loginUtil(user);
    if (result === "User does not exist.") {
      res.status(StatusCodes.OK).json({ msg: "User does not exists." });
      return;
    }
    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.error("Error during Google Sign-In:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong." });
  }
};

//using this function the user can log in to his account
//req configuration:
//send login credentials in req body,eg, {"email":"1234@gmail.com","password":"1234"}

const loginUser = async (req, res) => {
  console.log("login attempted");
  const { email, password } = req.body;
  let user = await User.findOne(
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
      email
    }
  );
  if (!user) {
    return res.status(StatusCodes.OK).send("User does not exist.");
  }
  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    return res.status(StatusCodes.OK).send("Wrong password.");
  }

  const result = await loginUtil(user);
  if (result === "User does not exist.") {
    return res.status(StatusCodes.OK).send(result);
  }
  return res.status(StatusCodes.OK).json(result);
};

//Create new Access token using refresh token
const regenerateAccessToken = async (req, res) => {
  const { refreshToken, appVersion } = req.body;
  let id;
  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    id = payload.id;
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("Invalid refresh token...");
  }
  const user = await User.findById(id, {
    refreshToken: 1,
    appVersion: 1,
    uid: 1,
    universeMetaData: 1,
  });
  if (!user) {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("Invalid refresh token...");
  }
  if (user.refreshToken !== refreshToken) {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("Invalid refresh token...");
  }

  const newRefreshToken = user.createRefreshToken();
  const newAccessToken = user.createAccessToken();
  if (appVersion) {
    user.appVersion = appVersion;
  }
  user.refreshToken = newRefreshToken;
  await user.save();

  return res.status(StatusCodes.OK).send({ newAccessToken, newRefreshToken });
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
    destination
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
  const { userName, email, reg, profession,college } = req.query;
  const nameExists = await User.findOne({ name: userName }, { _id: 1 });
  const emailExists = await User.findOne({ email: email }, { _id: 1 });
  if(college==='Lovely Professional University'){
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
      userEmail
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
    if (platform === "android" && !currentVersion) {
      console.log("missing data");
      return res.status(400).json({
        success: false,
        message: "App version is required in query (?version=2.0.1)",
        query: req.query,
      });
    }

    // Fetch latest config (only 1 doc maintained)
    const config = await AppConfig.findOne({ platform });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "No config found",
      });
    }

    const { latestVersion, mandatoryVersion } = config;
    let updateType = "none";

    if (semver.lt(currentVersion, latestVersion)) {
      if (semver.lt(currentVersion, mandatoryVersion)) {
        updateType = "immediate";
      } else {
        updateType = "flexible";
      }
    }

    return res.status(200).json({
      success: true,
      updateType,
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
      { name: 1, _id: 0 }
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
  suggestUsername
};
