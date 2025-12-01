import { StatusCodes } from 'http-status-codes';
import redis from '../../config/redis';
import { Request, Response } from 'express';
import User, { IUser } from '../../models/user.model';
// import Community from '../../models/community.model';
// import Club from '../../models/club.model';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { generateOtp, sendMail, securePassword } from '../utils.controller';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import {
  PushTokenQuery,
  ReactivateAccountBody,
  SetNewPasswordBody,
  UserNameAvailableQuery,
} from './interface';
import Org from '../../models/org.model';
import schedule from 'node-schedule';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

// Predefined shortcuts for new users
const p1 = [
  {
    type: 'club',
    name: 'Coding Club',
    id: new mongoose.Types.ObjectId('657b9303f18136e2f692398c'),
    secondaryImg: 'public/club/CodingPost3.jpg',
  },
  {
    type: 'community',
    name: 'Mamba Mentality',
    id: new mongoose.Types.ObjectId('66ed18fe0c4142316f4c43f7'),
    secondary: 'public/community/FriSep20202412:11:00GMT+0530img',
  },
  {
    type: 'club',
    name: 'Pawn Knight',
    id: new mongoose.Types.ObjectId('657b97a8f18136e2f69239ab'),
    secondaryImg: 'public/club/chessClunCover.jpg',
  },
  {
    type: 'community',
    name: 'got-it!',
    id: new mongoose.Types.ObjectId('657b9407f18136e2f69239a1'),
    secondary: 'public/club/SocialClubLogo.jpg',
  },
];

const p2 = [
  {
    type: 'club',
    name: 'Sheyn',
    id: new mongoose.Types.ObjectId('65fbb7a60fa1132b8c9cc280'),
    secondaryImg: 'public/club/ThuMar21202409:59:22GMT+0530img',
  },
  {
    type: 'community',
    name: 'World Wizards',
    id: new mongoose.Types.ObjectId('657ba2e9f18136e2f69239d4'),
    secondary: 'public/communities/wAlogo.jpeg',
  },
  {
    type: 'club',
    name: 'Department of Entrepreneurship',
    id: new mongoose.Types.ObjectId('66d29ec57657f2d4231cd22a'),
    secondaryImg: 'public/club/SatAug31202410:10:35GMT+0530img',
  },
  {
    type: 'community',
    name: 'Game devs',
    id: new mongoose.Types.ObjectId('670a1d50884ee1bcc3bb12b0'),
    secondary: 'public/community/SatOct12202412:25:09GMT+0530img',
  },
];

const p3 = [
  {
    type: 'club',
    name: 'Coding Club',
    id: new mongoose.Types.ObjectId('657b9303f18136e2f692398c'),
    secondaryImg: 'public/club/CodingPost3.jpg',
  },
  {
    type: 'community',
    name: 'got-it!',
    id: new mongoose.Types.ObjectId('657b9407f18136e2f69239a1'),
    secondary: 'public/club/SocialClubLogo.jpg',
  },
  {
    type: 'club',
    name: '0x0CAFE',
    id: new mongoose.Types.ObjectId('670eb50be40cd552e8ba386d'),
    secondaryImg: 'public/club/WedOct16202400:01:37GMT+0530img',
  },
  {
    type: 'community',
    name: 'World Wizards',
    id: new mongoose.Types.ObjectId('657ba2e9f18136e2f69239d4'),
    secondary: 'public/communities/wAlogo.jpeg',
  },
];

const shortcuts = [p1, p2, p3];

/**
 * @desc Internal utility function to generate random password
 * @use INTERNAL
 */
const generateGibberishPassword = () => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specialChars = '!@#$%^&*()_+-=';

  // Ensure at least one of each character type
  let password = '';
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
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

const createOrg = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { name, logo } = req.body;
    const userId = req.user?.id; // Assuming user ID is available in the request object

    if (!name || !logo) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Organization name and logo are required.' });
    }

    const scheduleTime = new Date(Date.now() + 3000);

    schedule.scheduleJob(`updateOrg_${userId}`, scheduleTime, async () => {
      try {
        const org = await Org.findOne({ orgName: name });
        const user = await User.findById(userId).select('orgId');

        if (!user) {
          console.error(`User with ID ${userId} not found.`);
          return;
        }

        if (org) {
          if (!org.working.includes(new mongoose.Types.ObjectId(userId))) {
            org.working.push(new mongoose.Types.ObjectId(userId as string));
            await org.save();
          }
          user.orgId = org._id as mongoose.Types.ObjectId;
        } else {
          const newOrg = await Org.create({ orgName: name, orgLogo: logo, working: [userId] });
          user.orgId = newOrg._id as unknown as mongoose.Types.ObjectId;
        }

        await user.save();
      } catch (error) {
        console.error('Error in scheduled org creation:', error);
      }
    });

    return res.status(StatusCodes.ACCEPTED).json({ message: 'Organization creation scheduled successfully.' });
  } catch (error) {
    console.error('Error scheduling org creation:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error.' });
  }
};

/**
 * @desc Register a new user
 * @route POST /auth/user/register
 * @access Public
 */
const registerUser = async (req: Request, res: Response) => {
  try {
    console.log('Sign up initiated');

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
      profession = 'Student',
      career,
      company,
      workingPosition,
      orgMetaData,
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(StatusCodes.CONFLICT)
        .json({ message: 'User with this email already exists.' });
    }

    const incompleteFields: string[] = [];
    const requiredFields = [
      { field: course, name: 'course' },
      { field: interests, name: 'interests' },
      { field: field, name: 'field' },
      { field: passoutYear, name: 'passoutYear' },
      { field: level, name: 'level' },
    ];

    if (profession === 'Alumni') {
      requiredFields.push(
        { field: career, name: 'career' },
        { field: company, name: 'company' },
        { field: workingPosition, name: 'workingPosition' },
      );
    }

    requiredFields.forEach(({ field, name }) => {
      if (
        !field ||
        (Array.isArray(field) && field.every((item) => !item.trim())) ||
        (typeof field === 'string' && !field.trim())
      ) {
        incompleteFields.push(name);
      }
    });

    console.log('Incomplete fields:', incompleteFields);

    const hashedPassword = await securePassword(password);
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      course,
      reg: profession === 'Alumni' ? '00000000' : reg,
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
      incompleteFields,
    });

    const refreshToken = newUser.createRefreshToken();
    newUser.refreshToken = refreshToken;
    await newUser.save();

    if (profession === 'Alumni' && orgMetaData) {
      createOrg(orgMetaData, newUser._id as Response<any, Record<string, any>>);
    }

    const accessToken = newUser.createAccessToken();

    schedule.scheduleJob(
      `sendMailOnSignUp_${newUser._id}`,
      new Date(Date.now() + 3000),
      async () => {
        try {
          const intro = [
            'We are so delighted to have you onboard Macbease.',
            'We look forward to making your college experience a delightful one.',
          ];
          const outro = 'Let us begin this journey together!';
          const subject = 'Macbease Confirmation';
          const destination = [newUser.email];
          const { ses, params } = await sendMail(name, intro, outro, subject, destination);
          ses.sendEmail(params, (err) => err && console.log(err));
        } catch (error) {
          console.error('Error sending email:', error);
        }
      },
    );

    return res.status(StatusCodes.CREATED).json({
      user: {
        name: newUser.name,
        image: newUser.image,
        _id: newUser._id,
        role: newUser.role,
        reg: newUser.reg,
        profession: newUser.profession,
      },
      token: accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }
};

/**
 * @desc Internal utility function for reusable logic of login
 * @use INTERNAL
 */
const loginUtil = async (user: mongoose.Document<unknown, "", IUser> & IUser & Required<{ _id: unknown; }> & { __v: number; }) => {
  if (user.deactivated && user.deactivationDate) {
    const deactivationDate = user.deactivationDate;
    const givenDate = new Date(deactivationDate);
    const currentDate = new Date();
    const timeDifference = currentDate.getTime() - givenDate.getTime();
    const daysElapsed = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    if (daysElapsed > 29) {
      return 'User does not exist.';
    }
    return {
      msg: 'Account is currently deactivated.',
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
    },
    token: AccessToken,
    refreshToken,
  };
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const googleRegister = async (req: Request, res: Response) => {
  const { idToken } = req.body;
  // console.log("idToken: ", idToken);
  try {
    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email } = payload as TokenPayload;
    const password = generateGibberishPassword();

    // Check if the user already exists
    const user = await User.findOne({ email });

    if (!user) {
      // User does not exist so share email of user to frontend for further signup process
      return res.status(StatusCodes.OK).json({ message: "User does not exists.", email, password });

    }

    return res.status(StatusCodes.OK).json({ msg: 'User already exists.' });
  } catch (error) {
    console.error('Error during Google Sign-In:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong.' });
  }
}

const googleLogin = async (req: Request, res: Response) => {
  const { idToken } = req.body;
  try {
    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email } = payload as TokenPayload;
    // const { sub, email, name, picture } = payload;

    // Check if the user already exists
    const user = await User.findOne(
      { email },
      {
        deactivated: 1,
        deactivationDate: 1,
        name: 1,
        image: 1,
        role: 1,
        reg: 1,
        profession: 1,
      }
    );

    if (!user) {
      // User does not exist so share email of user to frontend for further signup process
      return res.status(StatusCodes.OK).json({ msg: "User does not exists." });
    }

    const result = await loginUtil(user);
    if (result === 'User does not exist.') {
      res.status(StatusCodes.OK).json({ msg: "User does not exists." });
      return;
    }
    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.error('Error during Google Sign-In:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Something went wrong.' });
  }
}

/**
 * @desc    Login user and generate access & refresh tokens
 * @route   POST /auth/user/login
 * @access  Public
 */
const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'Email and password are required.' });
  }

  if (!email.trim() || !password.trim()) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email }).select('+password +deactivated +deactivationDate');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User does not exist.' });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid credentials.' });
    }

    const result = await loginUtil(user);
    if (result === 'User does not exist.') {
      return res.status(StatusCodes.OK).send(result);
    }
    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error', error });
  }
};

/**
 * @desc    Regenerate access token using refresh token
 * @route   POST /auth/user/regenerate-access-token-72f8c570-2a36-11ec-8d3d-0242ac130003
 * @access  Public
 */
const regenerateAccessToken = async (req: Request, res: Response) => {
  const { refreshToken, appVersion } = req.body;
  if (!refreshToken) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Refresh token is required.' });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as JwtPayload;
    const user = await User.findById(payload.id, { refreshToken: 1, appVersion: 1 });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid refresh token.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      user.refreshToken = user.createRefreshToken();
      if (appVersion) {
        user.appVersion = appVersion;
      }
      await user.save({ session });

      const newAccessToken = user.createAccessToken();
      await session.commitTransaction();
      session.endSession();

      return res
        .status(StatusCodes.OK)
        .json({ newAccessToken, newRefreshToken: user.refreshToken });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid refresh token.', error });
  }
};

/**
 * @desc Generate OTP for password recovery
 * @route POST /auth/set-otp
 * @access Public
 */
const setOtp = async (req: Request<"", "", { userEmail: string }>, res: Response) => {
  const { userEmail } = req.body;

  try {
    const user = await User.findOne({ email: userEmail }).select('_id');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User does not exist.' });
    }

    const otp = generateOtp();
    await User.findByIdAndUpdate(user._id, { recoveryOtp: otp });

    res.status(StatusCodes.OK).json({ otp });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Set a new password for the user
 * @route POST /auth/user/set-new-password
 * @access Public
 */
const setNewPassword = async (req: Request<"", "", SetNewPasswordBody>, res: Response) => {
  const { otp, newPass, userEmail } = req.body;

  try {
    const user = await User.findOne({ email: userEmail }).select('password recoveryOtp');
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User does not exist.' });
    }

    if (user.recoveryOtp !== otp) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid OTP.' });
    }

    user.password = await securePassword(newPass);
    user.recoveryOtp = undefined; // Clear OTP after use
    await user.save();

    res.status(StatusCodes.OK).json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Save or update user push notification token
 * @route PUT auth/user/push-token
 * @access User
 */
const pushToken = async (
  req: Request<"", "", { pushToken: string }, PushTokenQuery>,
  res: Response,
) => {
  const { userId } = req.query;
  const { pushToken } = req.body;

  try {
    const user = await User.findByIdAndUpdate(userId, { pushToken }, { new: true, select: '_id' });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
    }

    res.status(StatusCodes.OK).json({ message: 'Push token updated successfully.' });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Check if username, email, or registration number is available
 * @route GET /auth/user/availability
 * @access Public
 */
const userNameAvailable = async (
  req: Request<"", "", "", UserNameAvailableQuery>,
  res: Response,
) => {
  const { userName, email, reg } = req.query;
  if (!userName.trim() || !email.trim() || !reg) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'Username, email, and registration number are required.' });
  }

  try {
    const [nameExists, emailExists, regExists] = await Promise.all([
      User.findOne({ name: userName }),
      User.findOne({ email }),
      User.findOne({ reg: Number(reg) || 0 }),
    ]);

    if (nameExists) return res.status(StatusCodes.OK).json({ message: 'Username already exists.' });
    if (emailExists) return res.status(StatusCodes.OK).json({ message: 'Email already exists.' });
    if (regExists)
      return res.status(StatusCodes.OK).json({ message: 'Registration number already exists.' });

    return res.status(StatusCodes.OK).json({ message: 'Available.' });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Send email verification OTP
 * @route POST /auth/email-verification
 * @access Public
 */
const emailVerification = async (
  req: Request<"", "", { userEmail: string; name: string }>,
  res: Response,
) => {
  const { userEmail, name } = req.body;
  if (!userEmail || !name) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'User email and name are required.' });
  }

  try {
    // Check if an OTP was sent in the last 60 seconds
    const isCached = await redis.get(userEmail);
    if (isCached) {
      return res
        .status(StatusCodes.TOO_MANY_REQUESTS)
        .json({ message: 'Please wait before requesting another OTP.' });
    }

    const otp = generateOtp();
    const intro = [
      'Greetings from Macbease.',
      'To verify your email, please enter the following OTP.',
      `The OTP is ${otp}`,
    ];
    const outro =
      'If you did not expect any response from Macbease, feel free to contact us at support@macbease.com.';
    const subject = 'Email Verification';

    const { ses, params } = await sendMail(name, intro, outro, subject, userEmail);
    await ses.sendEmail(params, (err) => {
      if (err) {
        console.error(err);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'Failed to send OTP.', err });
      }
      res.status(StatusCodes.OK).json({ otp, message: 'OTP sent successfully.' });
    });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Generate an about section for a user
 * @route GET /user/generate-about
 * @access Public
 */
const generateAbout = async (req: Request, res: Response) => {
  const { word } = req.query;

  if (!word) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Keyword is required.' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Generate an 'about' section for a user using the words: ${word}. Please do not include anything that has to be modified by the user(for example don't inlcude user name if not provided like null user).`,
        },
      ],
      max_tokens: 100,
    });

    res.status(StatusCodes.OK).json({ about: response.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to generate about section.', error });
  }
};

/**
 * @desc Generates research areas based on a keyword
 * @route GET /generate-research-areas
 * @access Public
 */
const generateResearchAreas = async (req: Request, res: Response) => {
  const { word } = req.query;

  if (!word) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Keyword is required.' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Generate an array of 30 research areas in ${word} field.`,
        },
      ],
    });
    const aboutSection = response.choices[0].message.content;
    if (!aboutSection) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Failed to generate research areas.' });
    }
    const areas = aboutSection.split('\n').map((item) => item.replace(/^\d+\.\s*/, ''));
    return res.status(StatusCodes.OK).json({ areas });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to generate research areas.', error });
  }
};

/**
 * @desc Generates interests from a keyword
 * @route GET /generate-interest
 * @access Public
 */
const generateInterest = async (req: Request, res: Response) => {
  const { word } = req.query;
  if (!word) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'keyword is required' });
  }
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Generate an array of similar words using the words : ${word}(might be multiple words or single word).Generate atleast 8 interests for each word. your response should be one dimensional array`,
        },
      ],
      max_tokens: 1000,
    });
    const interests = JSON.parse(response.choices[0]?.message?.content || '[]');
    return res.status(StatusCodes.OK).json({ interests });
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while generating interests', error });
  }
};

/**
 * @desc Reactivates a deactivated user account
 * @route POST /reactivate-account
 * @access User
 */
const reactivateAccount = async (req: Request<"", "", ReactivateAccountBody>, res: Response) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User does not exist.' });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Incorrect password.' });
    }
    user.deactivated = false;
    user.save();
    return res.status(StatusCodes.OK).json({ message: 'Reactivation successful.' });
  } catch (error) {
    console.error('Error reactivating account:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to reactivate account.', error });
  }
};

/**
 * @desc Sends a recovery OTP via email
 * @route POST /send-recovery-email
 * @access Public
 */
const recoveryEmail = async (req: Request, res: Response) => {
  try {
    const { userEmail, otp, name } = req.body;

    const intro = [
      'You have received this email because a password reset request for your account was received.',
      `The OTP is ${otp}`,
    ];
    const outro = 'If you did not request a password reset, please ignore this email.';
    const subject = 'Password Recovery';
    const { ses, params } = await sendMail(name, intro, outro, subject, [userEmail]);
    ses.sendEmail(params, (err) => {
      if (err) {
        console.error('Error sending recovery email:', err);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'Failed to send email.', err });
      }
      return res.status(StatusCodes.OK).json({ message: 'Recovery email sent successfully.' });
    });
  } catch (error) {
    console.error('Error sending recovery email:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to send email.', error });
  }
};

export {
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
};
