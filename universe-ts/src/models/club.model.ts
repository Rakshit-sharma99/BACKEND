import mongoose, { Document, Schema } from 'mongoose';

export interface IClub extends Document {
  name: string;
  motto: string;
  tags?: string[];
  featuringImg: string;
  secondaryImg?: string;
  gallery: {
    postedBy: any;
    url: string;
    id: string;
    desc?: string;
  }[];
  videos: { url: string; id: string }[];
  chiefImage: string;
  chiefMsg: string;
  upcomingEvent: {
    id: string;
    url: string;
    name: string;
    description: string;
    place: string;
    startTime?: string;
    endTime?: string;
    dl: boolean;
    ticketAvailable: boolean;
    ticketTypes?: Array<{
      type: string;
      price: string | number;
      available: string | number;
    }>;
    eventId: mongoose.Types.ObjectId;
    eventDate: string;
    ticketDate: string;
    eventManagerMail?: string;
    eventManagerPhone?: string;
    belongsTo?: Array<{
      type: string;
      id: mongoose.Types.ObjectId;
      img: string;
      name: string;
    }>;
    authorizedPerson?: Object;
    // venue: string;
    time?: string;
    postedBy: string;
    itineraries?: string | any;
  }[];
  team: {
    id: string;
    pos: string;
  }[];
  xAxisData: number[];
  yAxisData: Date[];
  members: string[];
  adminId: string[];
  mainAdmin?: string;
  notifications: {
    uid: string;
    title: string;
    msg: string;
    visibility: string;
    postedBy: string;
    name: string;
    image: string;
    createdAt: string;
  }[];
  content: {
    timeStamp: string | number | Date;
    contentId: string;
    postedBy: string;
  }[];
  rating?: number;
  createdOn: Date;
  unusedBadges: string[];
  usedBadges?: string[];
  reviewBadges?: string[];
  proposalHistory: Array<{
    id: string;
    senderMetaData: {
      _id: mongoose.Types.ObjectId;
      image: string;
      name: string;
      pushToken: string;
    };
    state: string;
    subject: string;
    visibility: string;
  }>;
  undecidedProposals?: string[];
  pinnedBy?: mongoose.Types.ObjectId[];
}

const clubSchema = new Schema<IClub>({
  name: {
    type: String,
    required: [true, 'Please provide the name of the club.'],
  },
  motto: {
    type: String,
    required: [true, 'Please provide the motto of the club.'],
  },
  tags: {
    type: [String],
  },
  featuringImg: {
    type: String,
    required: [true, 'Please provide the featuring image of the club.'],
  },
  secondaryImg: {
    type: String,
  },
  gallery: {
    type: [{ url: String, id: String, desc: String }],
  },
  videos: {
    type: [{ url: String, id: String }],
  },
  chiefImage: {
    type: String,
    required: [true, 'Please provide the chief image of the club.'],
  },
  chiefMsg: {
    type: String,
    required: [true, 'Please provide the message of the chief.'],
  },
  upcomingEvent: {
    type: [
      {
        id: String,
        url: String,
        name: String,
        description: String,
        place: String,
        time: String,
        postedBy: String,
      },
    ],
  },
  team: {
    type: [{ id: String, pos: String }],
  },
  xAxisData: {
    type: [Number],
    default: [0],
  },
  yAxisData: {
    type: [Date],
    default: [new Date()],
  },
  members: {
    type: [String],
  },
  adminId: {
    type: [String],
  },
  mainAdmin: {
    type: String,
  },
  notifications: {
    type: [
      {
        uid: String,
        title: String,
        msg: String,
        visibility: String,
        postedBy: String,
        name: String,
        image: String,
        createdAt: String,
      },
    ],
  },
  content: {
    type: [{ contentId: String, postedBy: String }],
  },
  rating: {
    type: Number,
  },
  createdOn: {
    type: Date,
    default: new Date(),
  },
  unusedBadges: {
    type: [String],
  },
  usedBadges: {
    type: [String],
  },
  reviewBadges: {
    type: [String],
  },
  proposalHistory: {
    type: [String],
  },
  undecidedProposals: {
    type: [String],
  },
  pinnedBy: {
    type: [String],
  },
});

export default mongoose.model<IClub>('Club', clubSchema);
