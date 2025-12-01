import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

interface UserPayload {
  role: string;
  id: string;
}

const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .json({ message: 'Enter valid authorization token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string) as UserPayload;
    req.user = { role: payload.role, id: payload.id };
    next();
  } catch (error) {
    console.error(error);
    res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .json({ message: 'You are not authorized to access this route.', error });
  }
};

export default auth;
