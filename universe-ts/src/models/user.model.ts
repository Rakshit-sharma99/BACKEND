import mongoose, { Document, Schema } from 'mongoose';
import jwt from 'jsonwebtoken';

export interface IUser extends Document {
  profession: 'Student' | 'Professor' | 'Alumni';
  incompleteProfile: boolean;
  career: string;
  company: string;
  workingPosition: string;
  orgId: mongoose.Types.ObjectId;
  role: string;
  name: string;
  reg: number;
  course?: string;
  field?: string;
  passoutYear?: string;
  level?: string;
  email: string;
  password: string;
  image: string;
  phone?: number;
  dob?: Date;
  cart?: any[];
  reviewHistory?: any[];
  cards?: any[];
  chatRooms?: Array<{
    doc_id: string;
    metaData: Array<{
      deactivated: boolean;
      image: string;
      name: string;
      pushToken: string;
    }>;
    requestedBy: string;
    state: string;
    status: string;
  }>;
  credibilityScore: number;
  propOrder?: any[];
  giftsSend?: any[];
  giftsReceived?: any[];
  notifications?: any[];
  unreadNotice?: Array<{
    action: string;
    contentMetaData?: any[];
    contentType?: string;
    value: string;
    img1: string | null;
    img2: string | null;
    key: string;
    params: {
      img?: string;
      userPushToken?: string;
      name?: string;
      secondaryImg?: string;
      id?: mongoose.Types.ObjectId;
      invitationId?: mongoose.Types.ObjectId;
      action?: {
        endPoint: string;
        body: {
          clubId: mongoose.Types.ObjectId;
          userId: mongoose.Types.ObjectId;
        };
        reqType: string;
      };
    };
    time: Date;
    uid: string;
  }>;
  clubs?: any[];
  blockList?: any[];
  likedCards: string[];
  communitiesCreated?: any[];
  communitiesPartOf?: any[];
  communityContribution?: any[];
  clubContributions?: any[];
  likedContents?: any[];
  taggedContents?: any[];
  commentedContents?: any[];
  interests?: any[];
  lastActive: string;
  recoveryOtp: number | undefined;
  pushToken: string | undefined;
  feed?: any[];
  eventFeed?: any[];
  macbeaseContentContribution?: any[];
  shortCuts?: Array<{
    id: mongoose.Types.ObjectId;
    img: string;
    name: string;
    secondary?: string | undefined;
    secondaryImg?: string;
    type: string;
    userPushToken: string;
    metaData?: {
      messages: number;
      notifications: number;
      posts: number;
    };
  }>;
  ticketsBought?: Array<{
    type: mongoose.Types.ObjectId;
    ref: 'Ticket';
  }>;
  refreshToken?: string;
  cardFeed?: Array<{
    _id: mongoose.Types.ObjectId;
    creator: mongoose.Types.ObjectId;
    creatorName: string;
    creatorPic: string;
    likedBy: [];
    tags: string | [];
    time: string;
    userMetaData: Array<{
      name: string;
      course: string;
      image: string;
      pushToken: string | undefined;
    }>;
    userPushToken?: string;
    value: string;
    vector: any[];
  }>;
  badges?: any[];
  deactivated: boolean;
  deactivationDate?: Date;
  pinnedBy?: any[];
  tunedIn_By?: any[];
  hasTunedTo?: any[];
  creatorPost?: string;
  resources?: mongoose.Types.ObjectId[];
  status?: string;
  professionalEmail?: string;
  incompleteFields?: any[];
  appVersion: string;
  createAccessToken(): string;
  createRefreshToken(): string;
}

const userSchema: Schema<IUser> = new Schema({
  profession: {
    type: String,
    enum: ['Student', 'Professor'],
    default: 'Student',
  },
  incompleteProfile: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    default: 'Normal',
  },
  name: {
    type: String,
    required: [true, 'Please provide the user name.'],
  },
  reg: {
    type: Number,
    required: [true, 'Please provide the registration number.'],
  },
  course: {
    type: String,
  },
  field: {
    type: String,
  },
  passoutYear: {
    type: String,
  },
  level: {
    type: String,
  },
  email: {
    type: String,
    required: [true, 'Please provide the email id.'],
    trim: true,
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      'Please provide a valid email',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please provide the password.'],
  },
  image: {
    type: String,
    default: 'xyz.com',
  },
  phone: {
    type: Number,
  },
  dob: {
    type: Date,
    default: new Date('2000-01-01'),
  },
  cart: {
    type: Array,
  },
  reviewHistory: {
    type: Array,
  },
  cards: {
    type: Array,
  },
  chatRooms: {
    type: [
      {
        doc_id: { type: String, required: true },
        metaData: [
          {
            deactivated: { type: Boolean, required: true },
            image: { type: String, required: true },
            name: { type: String, required: true },
            pushToken: { type: String, required: true },
          },
        ],
        requestedBy: { type: String, required: false },
        state: { type: String, required: true },
        status: { type: String, required: false },
      },
    ],
    required: false,
  },
  credibilityScore: {
    type: Number,
    default: 5,
  },
  propOrder: {
    type: Array,
  },
  giftsSend: {
    type: Array,
  },
  giftsReceived: {
    type: Array,
  },
  notifications: {
    type: Array,
  },
  unreadNotice: {
    type: Array,
  },
  clubs: {
    type: Array,
  },
  blockList: {
    type: Array,
  },
  likedCards: {
    type: [String],
  },
  communitiesCreated: {
    type: Array,
  },
  communitiesPartOf: {
    type: Array,
  },
  communityContribution: {
    type: Array,
  },
  clubContributions: {
    type: Array,
  },
  likedContents: {
    type: Array,
  },
  taggedContents: {
    type: Array,
  },
  commentedContents: {
    type: Array,
  },
  interests: {
    type: Array,
  },
  lastActive: {
    type: String,
  },
  recoveryOtp: {
    type: Number,
  },
  pushToken: {
    type: String,
  },
  feed: {
    type: Array,
  },
  eventFeed: {
    type: Array,
  },
  macbeaseContentContribution: {
    type: Array,
  },
  shortCuts: {
    type: [
      {
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
        img: { type: String, required: false },
        name: { type: String, required: true },
        secondary: { type: String, required: false },
        secondaryImg: { type: String, required: false },
        type: { type: String, required: true },
        userPushToken: { type: String, required: false },
        metaData: [
          {
            messages: { type: Number, required: false },
            notifications: { type: Number, required: false },
            posts: { type: Number, required: false },
          },
        ],
      },
    ],
    required: false,
  },
  ticketsBought: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
    },
  ],
  refreshToken: { type: String },
  cardFeed: [
    {
      creator: { type: mongoose.Schema.Types.ObjectId, required: true },
      creatorName: { type: String, required: true },
      creatorPic: { type: String, required: true },
      likedBy: { type: Array, default: [] },
      tags: { type: [String], default: [] },
      time: { type: String, required: true },
      userMetaData: [
        {
          name: { type: String, required: true },
          course: { type: String, required: true },
          image: { type: String, required: true },
          pushToken: { type: String },
        },
      ],
      userPushToken: { type: String },
      value: { type: String, required: false },
      vector: { type: Array, default: [] },
    },
  ],
  badges: {
    type: Array,
  },
  deactivated: {
    type: Boolean,
    default: false,
  },
  deactivationDate: {
    type: Date,
  },
  pinnedBy: {
    type: Array,
  },
  tunedIn_By: {
    type: Array,
  },
  hasTunedTo: {
    type: Array,
  },
  creatorPost: {
    type: String,
  },
  resources: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
    },
  ],
  status: {
    type: String,
  },
  professionalEmail: {
    type: String,
  },
  incompleteFields: {
    type: Array,
  },
  career: {
    type: String,
  },
  company: {
    type: String,
  },
  workingPosition: {
    type: String,
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Org",
  },
  appVersion: {
    type: String,
  },
});

userSchema.methods.createAccessToken = function (): string {
  return jwt.sign({ role: 'user', id: this._id }, process.env.ACCESS_TOKEN_SECRET as string, {
    expiresIn: 60 * 25,
  });
};

userSchema.methods.createRefreshToken = function (): string {
  return jwt.sign({ role: 'user', id: this._id }, process.env.REFRESH_TOKEN_SECRET as string, {
    expiresIn: parseInt(process.env.REFRESH_TOKEN_LIFETIME as string, 10),
  });
};

export default mongoose.model<IUser>('User', userSchema);
