import mongoose, { Document, Schema } from 'mongoose';

interface IItinerary extends Document {
  eventId: mongoose.Schema.Types.ObjectId;
  title: string;
  description: string;
  venue: string;
  cover: string;
  start: Date;
  end: Date;
  allowed: string[];
  rsvpEnabled: boolean;
  rsvpList: mongoose.Schema.Types.ObjectId[];
  maxRsvps?: number;
  notifyList: mongoose.Schema.Types.ObjectId[];
  status: 'Upcoming' | 'Ongoing' | 'Completed' | 'Canceled';
}

const itinerarySchema: Schema = new Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    venue: {
      type: String,
      required: true,
      trim: true,
    },
    cover: {
      type: String,
      required: true,
    },
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
    },
    allowed: [
      {
        type: String,
      },
    ],
    rsvpEnabled: {
      type: Boolean,
      default: false,
    },
    rsvpList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    maxRsvps: {
      type: Number,
      min: 0,
    },
    notifyList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['Upcoming', 'Ongoing', 'Completed', 'Canceled'],
      default: 'Upcoming',
    },
  },
  { timestamps: true },
);

itinerarySchema.pre('save', function (next) {
  if (this.end && new Date() > this.end) {
    this.status = 'Completed';
  }
  next();
});

export default mongoose.model<IItinerary>('Itinerary', itinerarySchema);
