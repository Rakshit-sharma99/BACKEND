import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';

/**
 * @desc Verifies the user's token and determines their role
 * @route POST /auth/verify-token
 * @access Public
 */
const verifyToken = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.role) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: 'Unauthorized. No user role found.' });
    }

    return res.status(StatusCodes.OK).json({ isAdmin: req.user.role === 'admin' });
  } catch (error) {
    console.error('Error verifying token:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to verify token.', error });
  }
};

export { verifyToken };
