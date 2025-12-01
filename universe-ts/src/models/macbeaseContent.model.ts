import mongoose, { Document, Schema } from 'mongoose';

interface IMacbeaseContent extends Document {
  contentType: 'text' | 'image' | 'video' | 'doc';
  url?: string;
  c_url?: string;
  text?: string;
  comments?: Array<{
    likes: any;
    msg: string;
    id: string;
    replies: Array<any>;
  }>;
  likes?: string[];
  tags?: string[];
  sendBy: 'Macbease';
  belongsTo?: string;
  idOfSender: string;
  useful?: boolean;
  timeStamp?: Date;
  peopleTagged?: string[];
  params?: Record<string, any>;
  metaData?: Record<string, any>;
  underReview?: boolean;
  discretion?: string;
  blur?: boolean;
}

const macbeaseContentSchema: Schema = new Schema({
  contentType: {
    type: String,
    enum: ['text', 'image', 'video', 'doc'],
    required: [true, 'Please provide the content type.'],
  },
  url: String,
  c_url: String,
  text: String,
  comments: {
    type: [{ msg: String, id: String, replies: Array<any> }],
  },
  likes: [String],
  tags: [String],
  sendBy: {
    type: String,
    enum: ['Macbease'],
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
});

export default mongoose.model<IMacbeaseContent>('MacbeaseContent', macbeaseContentSchema);
