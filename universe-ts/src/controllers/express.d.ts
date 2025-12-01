export declare global {
  namespace Express {
    interface Request {
      user: {
        role: string;
        id: string;
      };
    }
  }
}
