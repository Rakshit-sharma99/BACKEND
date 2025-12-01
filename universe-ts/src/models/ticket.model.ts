import mongoose, { Document, Schema } from 'mongoose';

interface ITicket extends Document {
  boughtBy: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  paymentId: string;
  amtPaid: number;
  status: 'redeemed' | 'active' | 'refunded' | 'expired';
  generatedAt: Date;
  reviewMsg: string;
  reviewUrls: string;
  reviewStars: number;
  type: string;
  reviewLiked: boolean;
  rsvp: mongoose.Types.ObjectId[];
}

const ticketSchema: Schema = new Schema({
  boughtBy: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  eventId: {
    type: mongoose.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  paymentId: {
    type: String,
    required: true,
  },
  amtPaid: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['redeemed', 'active', 'refunded', 'expired'],
    default: 'active',
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  reviewMsg: {
    type: String,
  },
  reviewUrls: {
    type: String,
  },
  reviewStars: {
    type: Number,
  },
  type: {
    type: String,
  },
  reviewLiked: {
    type: Boolean,
  },
  rsvp: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Itinerary',
    },
  ],
});

export default mongoose.model<ITicket>('Ticket', ticketSchema);
