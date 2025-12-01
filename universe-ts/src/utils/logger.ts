import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logDirectory = path.join(__dirname, '../logs');
try {
  if (fs.existsSync(logDirectory) === false) {
    fs.mkdirSync(logDirectory, { recursive: true });
    console.log(`Created log directory at: ${logDirectory}`);
  }
} catch (error) {
  console.error('Error creating log directory:', error);
}

// Define log format
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Timestamp format
  format.errors({ stack: true }), // Include error stack traces
  // format.colorize(), // Add colors
  format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${stack ? '\n' + stack : ''}`;
  }),
);

const isProduction = process.env.NODE_ENV === 'production';
const logToFile = process.env.LOG_TO_FILE?.toLowerCase() === 'true';

const logger = createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    // Console transport for all environments
    new transports.Console({
      format: format.combine(format.colorize(), logFormat),
    }),
  ],
});

// Add file transports if in production or if LOG_TO_FILE is true
if (isProduction || logToFile) {
  logger.add(
    new DailyRotateFile({
      level: 'error',
      filename: path.join(logDirectory, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true, // Compress old logs
      maxSize: '10m', // 10MB max size per file
      maxFiles: '30d', // Keep logs for 30 days
    }),
  );

  logger.add(
    new DailyRotateFile({
      filename: path.join(logDirectory, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '30d',
    }),
  );
}

// Handle unhandled exceptions and rejections
if (isProduction || logToFile) {
  logger.exceptions.handle(
    new transports.File({ filename: path.join(logDirectory, 'exceptions.log') }),
  );

  logger.rejections.handle(
    new transports.File({ filename: path.join(logDirectory, 'rejections.log') }),
  );
}

export default logger;
