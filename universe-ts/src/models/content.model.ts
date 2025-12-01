import mongoose, { Document, Schema } from 'mongoose';

interface IContent extends Document {
  contentType: 'text' | 'image' | 'video' | 'doc';
  url?: string;
  c_url?: string;
  text?: string;
  comments?: Array<{
    likes: mongoose.Types.ObjectId[];
    id: string;
    cid: number;
    text: string;
    name: string;
    peopleTagged: any[];
    img: string;
    pushToken: string;
    replies: any;
  }>;
  likes?: string[];
  tags?: string[];
  sendBy: 'userGift' | 'club' | 'Macbease' | 'admin' | 'userCommunity';
  belongsTo: string;
  idOfSender: string;
  useful?: boolean;
  timeStamp?: Date;
  peopleTagged?: string[];
  params?: Record<string, any>;
  metaData?: Record<string, any>;
  underReview?: boolean;
  discretion?: string;
  blur?: boolean;
  vector?: number[];
}

const contentSchema: Schema = new Schema({
  contentType: {
    type: String,
    enum: ['text', 'image', 'video', 'doc'],
    required: [true, 'Please provide the content type.'],
  },
  url: String,
  c_url: String,
  text: String,
  comments: {
    type: [{ msg: String, id: String }],
  },
  likes: [String],
  tags: [String],
  sendBy: {
    type: String,
    enum: ['userGift', 'club', 'Macbease', 'admin', 'userCommunity'],
    required: [true, 'Please provide who send the content.'],
  },
  belongsTo: String,
  idOfSender: {
    type: String,
    required: [true, 'Please provide the id of the sender.'],
  },
  useful: {
    type: Boolean,
    default: true,
  },
  timeStamp: {
    type: Date,
    default: Date.now,
  },
  peopleTagged: [String],
  params: Object,
  metaData: Object,
  underReview: {
    type: Boolean,
    default: false,
  },
  discretion: String,
  blur: {
    type: Boolean,
    default: false,
  },
  vector: Array,
});

export default mongoose.model<IContent>('Content', contentSchema);
