import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
// import rateLimit from 'express-rate-limit';
import authenticate from './middlewares/authentication.middleware';

// Import routes
import userAuthRouter from './routes/userAuth.router';
import userRouter from './routes/user.router';
import frontendRouter from './routes/frontend.router';
import adminAuthRouter from './routes/adminAuth.router';
import eventRouter from './routes/event.router';
import clubRouter from './routes/club.router';
import cardRouter from './routes/card.router';
import bagRouter from './routes/bag.router';
import communityRouter from './routes/community.router';
import contentRouter from './routes/content.router';
import tileRouter from './routes/tile.router';
import paymentRouter from './routes/payment.router';
import chatRouter from './routes/chat.router';
import macbeaseContentRouter from './routes/macbeaseContent.router';
import shortCutRouter from './routes/shortCut.router';
import invitationRouter from './routes/invitation.router';
import ticketRouter from './routes/ticket.router';
import badgeRouter from './routes/badge.router';
import contentModerationRouter from './routes/contentModeration.router';
import resourceRouter from './routes/resource.router';
import projectRouter from './routes/project.router';
import itineraryRouter from './routes/itinerary.router';
import dotenv from 'dotenv';
dotenv.config();

const app: Express = express();
// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 10, // Allow only 10 requests per 15 minutes per IP
//   message: { error: 'Too many login attempts. Please try again later.' },
// });

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

// API routes
app.use('/api/v2/admin', adminAuthRouter);
app.use('/api/v2/auth/user', userAuthRouter);
app.use('/api/v2/payment', paymentRouter);

app.use('/api/v2/badge', authenticate, badgeRouter);
app.use('/api/v2/bag', authenticate, bagRouter);
app.use('/api/v2/card', authenticate, cardRouter);
app.use('/api/v2/chat', authenticate, chatRouter);
app.use('/api/v2/club', authenticate, clubRouter);
app.use('/api/v2/community', authenticate, communityRouter);
app.use('/api/v2/content', authenticate, contentRouter);
app.use('/api/v2/content-moderation', authenticate, contentModerationRouter);
app.use('/api/v2/event', authenticate, eventRouter);
app.use('/api/v2/frontend', authenticate, frontendRouter);
app.use('/api/v2/invitation', authenticate, invitationRouter);
app.use('/api/v2/itinerary', authenticate, itineraryRouter);
app.use('/api/v2/macbease-content', authenticate, macbeaseContentRouter);
app.use('/api/v2/project', authenticate, projectRouter);
app.use('/api/v2/resource', authenticate, resourceRouter);
app.use('/api/v2/shortcuts', authenticate, shortCutRouter);
app.use('/api/v2/tile', authenticate, tileRouter);
app.use('/api/v2/ticket', authenticate, ticketRouter);
app.use('/api/v2/user', authenticate, userRouter);

// Add a GET route for '/'
app.get('/', (req: Request, res: Response) => {
  res.send('MacBease v2');
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
  next(err);
});

export default app;
