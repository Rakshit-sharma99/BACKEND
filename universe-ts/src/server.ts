import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './app';
import connectDB from './config/db';
import { initializeSecrets } from './utils/secrets';
import { handleSocketConnections } from './socket/index';
import { initializeFirebase } from './config/firebase';
import dotenv from 'dotenv';

dotenv.config();

const _PORT = process.env.PORT || 5050;
const _HOST = process.env.HOST || '127.0.0.1';

const httpServer = createServer(app);
export const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'UPDATE', 'DELETE'],
  },
});

const startServer = async (): Promise<void> => {
  try {
    await initializeSecrets(); // Load secrets if in production
    await initializeFirebase();
    await connectDB();
    handleSocketConnections(io);
    httpServer.listen(_PORT, () => {
      console.log(`Server is running on port on http://${_HOST}:${_PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

startServer();
