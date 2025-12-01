import { Redis } from 'ioredis';
import logger from '../utils/logger';

const redis = new Redis({
  host: process.env.HOST,
  port: 6379,
  retryStrategy: (attempts: number) => {
    logger.warn(`🔄 Redis reconnect attempt #${attempts}`);
    return Math.min(attempts * 50, 2000); // Exponential backoff with a max delay of 2s
  },
});

redis.on('connect', () => console.log('✅ Connected to Redis'));
redis.on('error', (err: Error) => {
  logger.error('🚨 Redis Error:', err.message);
});

export default redis;
