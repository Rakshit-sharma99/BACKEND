import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Admin from '../../models/admin.model';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { securePassword, generateOtp, sendMail } from '../utils.controller';
import { AdminPayload, LoginAdminBody, RegisterAdminBody, SetNewPasswordBody } from './interface';

/**
 * @desc Register a new admin
 * @route POST /admin/register
 * @access Super Admin
 */
const registerAdmin = async (req: Request<"", "", RegisterAdminBody>, res: Response) => {
  const { name, adminKey, email, password } = req.body;

  try {
    if (await Admin.exists({ email })) {
      return res.status(StatusCodes.CONFLICT).json({ message: 'Admin already exists.' });
    }

    const hashedPassword = await securePassword(password);
    const admin = await Admin.create({ name, adminKey, email, password: hashedPassword });

    const token = admin.createAccessToken();
    const refreshToken = admin.createRefreshToken();
    admin.refreshToken = refreshToken;
    await admin.save();

    res.status(StatusCodes.CREATED).json({ admin: { name: admin.name }, token, refreshToken });
  } catch (error) {
    console.error('Error registering admin:', error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Admin login
 * @route POST /admin/login
 * @access Admin
 */
const loginAdmin = async (req: Request<"", "", LoginAdminBody>, res: Response) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid credentials.' });
    }

    const token = admin.createAccessToken();
    const refreshToken = admin.createRefreshToken();
    admin.refreshToken = refreshToken;
    await admin.save();

    res.status(StatusCodes.OK).json({
      admin: { name: admin.name, image: admin.image, _id: admin._id },
      token,
      refreshToken,
    });
  } catch (error) {
    console.error('Error logging in admin:', error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Regenerate access token using refresh token
 * @route POST /admin/regenerate-access-token-72f8c571-2a36-11ec-8d3d-0242ac130003
 * @access Admin
 */
const regenerateAccessToken = async (
  req: Request,
  res: Response,
) => {
  const { refreshToken } = req.body;

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as AdminPayload;
    const admin = await Admin.findById(payload.id);

    if (!admin || admin.refreshToken !== refreshToken) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid refresh token.' });
    }

    const newAccessToken = admin.createAccessToken();
    const newRefreshToken = admin.createRefreshToken();
    admin.refreshToken = newRefreshToken;
    await admin.save();

    res.status(StatusCodes.OK).json({ newAccessToken, newRefreshToken });
  } catch (error) {
    console.error('Error regenerating access token:', error);
    res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid refresh token.' });
  }
};

/**
 * @desc Send OTP for password recovery
 * @route POST /admin/password-recovery
 * @access Admin
 */
const setOtp = async (req: Request<"", "", { adminEmail: string }>, res: Response) => {
  const { adminEmail } = req.body;

  try {
    const admin = await Admin.findOne({ email: adminEmail });
    if (!admin) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Admin does not exist.' });
    }

    const otp = generateOtp();
    admin.recoveryOtp = otp;
    await admin.save();

    const intro = ['You have requested a password reset.', `The OTP is ${otp}`];
    const outro = 'If you did not request this, ignore the email.';
    const subject = 'Password Recovery';
    const destination = [adminEmail];

    const { ses, params } = await sendMail(admin.name, intro, outro, subject, destination);
    ses.sendEmail(params, (err: Error) => {
      if (err) {
        console.error('Error sending OTP:', err);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ message: 'Failed to send OTP.', err });
      }
      res.status(StatusCodes.OK).json({ message: 'OTP sent successfully.', otp });
    });
  } catch (error) {
    console.error('Error setting OTP:', error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Set new password using OTP
 * @route PATCH /admin/password-reset
 * @access Admin
 */
const setNewPassword = async (req: Request<"", "", SetNewPasswordBody>, res: Response) => {
  const { otp, newPass, adminEmail } = req.body;

  try {
    const session = await mongoose.startSession();
    session.startTransaction();

    const admin = await Admin.findOne({ email: adminEmail }).session(session);
    if (!admin) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Admin does not exist.' });
    }

    if (admin.recoveryOtp !== otp) {
      await session.abortTransaction();
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid OTP.' });
    }

    const encryptedPassword = await securePassword(newPass);
    admin.password = encryptedPassword;
    admin.recoveryOtp = undefined; // Clear OTP after use

    await admin.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(StatusCodes.OK).json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Error setting new password:', error);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

export { registerAdmin, loginAdmin, regenerateAccessToken, setOtp, setNewPassword };
