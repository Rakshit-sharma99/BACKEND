import mongoose, { Document, Schema, Types } from 'mongoose';

interface IEvent extends Document {
  url?: string;
  name: string;
  description: string;
  place: string;
  startTime?: Date;
  endTime?: Date;
  eventDate?: Date;
  eventEndDate?: Date;
  ticketDate?: Date;
  postedBy?: string;
  dl?: boolean;
  ticketAvailable: boolean;
  ticketTypes: Array<{
    type: string;
    price: string;
    available: string;
  }>;
  bookedBy: Types.ObjectId | null;
  belongsTo: Record<string, any>;
  status: 'pending' | 'featured' | 'past and unclear' | 'past and clear';
  amtPaid?: number;
  amtPaidTo?: number;
  ticketSellingDays?: string[];
  cumulativeRevenue?: (number | string)[];
  courseAnalytics?: any[];
  faq: any[];
  eventManagerMail?: string;
  eventManagerPhone?: string;
  authorizedPerson?: {
    _id: string;
    course: string;
    deactivated: boolean;
    email: string;
    image: string;
    interests: string[];
    name: string;
    pushToken: string;
  };
  itineraries?: any[];
}

const eventSchema: Schema = new Schema({
  url: { type: String },
  name: { type: String },
  description: { type: String },
  place: { type: String },
  startTime: { type: Date },
  endTime: { type: Date },
  eventDate: { type: Date },
  eventEndDate: { type: Date },
  ticketDate: { type: Date },
  postedBy: { type: String },
  dl: { type: Boolean },
  ticketAvailable: { type: Boolean },
  ticketTypes: { type: Array },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  belongsTo: { type: Object },
  status: {
    type: String,
    enum: ['pending', 'featured', 'past and unclear', 'past and clear'],
    default: 'pending',
  },
  amtPaid: { type: Number },
  amtPaidTo: { type: Number },
  ticketSellingDays: { type: Array },
  cumulativeRevenue: { type: Array },
  courseAnalytics: { type: Array },
  faq: { type: Array },
  eventManagerMail: { type: String },
  eventManagerPhone: { type: String },
  authorizedPerson: { type: Object },
  itineraries: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Itinerary',
  },
});

export default mongoose.model<IEvent>('Event', eventSchema);
