import { Schema, model, Document } from 'mongoose';
import jwt from 'jsonwebtoken';

export interface IAdmin extends Document {
  role: 'Content Team';
  name: string;
  email: string;
  password: string;
  image?: string;
  adminKey?: string;
  gifts?: Array<any>;
  clubs?: Array<any>;
  notifications?: Array<any>;
  unreadNotice?: Array<any>;
  unsortedWord?: Array<any>;
  communitiesCreated?: Array<any>;
  communitiesPartOf?: Array<any>;
  communityContribution?: Array<any>;
  likedContents?: Array<any>;
  commentedContents?: Array<any>;
  thrashUrls?: Array<any>;
  lastActive?: string;
  refreshToken?: string;
  reviewContent?: Array<any>;
  recoveryOtp?: number;
  pushToken?: string;
  createAccessToken(): string;
  createRefreshToken(): string;
}

const adminSchema: Schema = new Schema({
  role: {
    type: String,
    enum: ['Content Team'],
  },
  name: {
    type: String,
    required: [true, 'Please provide the admin name.'],
  },
  email: {
    type: String,
    required: [true, 'Please provide the email id of the admin.'],
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      'Please provide a valid email',
    ],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide the password of the admin.'],
  },
  image: {
    type: String,
    default: 'xyz.com',
  },
  adminKey: {
    type: String,
  },
  gifts: {
    type: Array,
  },
  clubs: {
    type: Array,
  },
  notifications: {
    type: Array,
  },
  unreadNotice: {
    type: Array,
  },
  unsortedWord: {
    type: Array,
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
  likedContents: {
    type: Array,
  },
  commentedContents: {
    type: Array,
  },
  thrashUrls: {
    type: Array,
  },
  lastActive: {
    type: String,
  },
  refreshToken: {
    type: String,
  },
  reviewContent: {
    type: Array,
  },
  recoveryOtp: {
    type: Number,
  },
  pushToken: {
    type: String,
  },
});

adminSchema.methods.createAccessToken = function (): string {
  return jwt.sign({ role: 'admin', id: this._id }, process.env.ACCESS_TOKEN_SECRET as string, {
    expiresIn: 60 * 25,
  });
};

adminSchema.methods.createRefreshToken = function (): string {
  return jwt.sign({ role: 'user', id: this._id }, process.env.REFRESH_TOKEN_SECRET as string, {
    expiresIn: 60 * 60 * 24 * 30,
  });
};

export default model<IAdmin>('Admin', adminSchema);
