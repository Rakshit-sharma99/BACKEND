import mongoose from 'mongoose';
import logger from '../utils/logger';

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI!;
    const conn = await mongoose.connect(mongoUri as string);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`Database connection error: ${error}`);
    process.exit(1);
  }
};

export default connectDB;
