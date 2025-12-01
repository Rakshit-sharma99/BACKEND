import mongoose, { Document, Schema } from 'mongoose';

export interface ICommunity extends Document {
  creatorId: string;
  creatorPos: 'user' | 'admin';
  title: string;
  cover: string;
  secondaryCover: string;
  label: string;
  createdOn: Date;
  content: Array<{
    contentId: string;
    irrelevanceVote: number;
    flagSaturated: boolean;
    type: string;
    timeStamp: Date;
    flaggedBy: Array<{}>;
  }>;
  members: string[];
  tag: string[];
  activeMembers: number;
  unusedBadges: string[];
  usedBadges: string[];
  reviewBadges: string[];
  onlineMembers: mongoose.Types.ObjectId[];
  muted: mongoose.Types.ObjectId[];
  seeLessFeed: mongoose.Types.ObjectId[];
  pinnedBy: mongoose.Types.ObjectId[];
  postPermission: boolean;
  shareLinkPermission: boolean;
  approveMembership: boolean;
  pendingRequests: mongoose.Types.ObjectId[];
  admins: mongoose.Types.ObjectId[];
}

const communitySchema: Schema = new Schema({
  creatorId: {
    type: String,
    required: true,
  },
  creatorPos: {
    type: String,
    enum: ['user', 'admin'],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  cover: {
    type: String,
    required: true,
  },
  secondaryCover: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  createdOn: {
    type: Date,
    default: Date.now,
  },
  content: [
    {
      contentId: { type: String, required: true },
      irrelevanceVote: { type: Number, required: true },
      flagSaturated: { type: Boolean, required: true },
      type: { type: String, required: true },
      timeStamp: { type: Date, required: true },
      flaggedBy: { type: Array, required: true },
    },
  ],
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
    },
  ],
  tag: {
    type: [String],
    required: true,
  },
  activeMembers: {
    type: Number,
    default: 0,
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
  onlineMembers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  muted: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  seeLessFeed: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  pinnedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  postPermission: {
    type: Boolean,
    default: true,
    required: true,
  },
  shareLinkPermission: {
    type: Boolean,
    default: true,
    required: true,
  },
  approveMembership: {
    type: Boolean,
    default: false,
    required: true,
  },
  pendingRequests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
    },
  ],
  admins: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
    },
  ],
});

export default mongoose.model<ICommunity>('Community', communitySchema);
