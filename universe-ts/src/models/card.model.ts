import mongoose, { Document, Schema, model } from 'mongoose';

interface ICard extends Document {
  value: string;
  creator: mongoose.Types.ObjectId;
  tags: string[];
  likedBy: mongoose.Types.ObjectId[];
  time: string;
  vector: number[];
  userMetaData: Record<string, any>;
}

const cardSchema: Schema = new Schema({
  value: {
    type: String,
    required: true,
  },
  creator: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  likedBy: {
    type: [mongoose.Types.ObjectId],
    default: [],
  },
  time: {
    type: String,
    required: true,
  },
  vector: {
    type: [Number],
    default: [],
  },
  userMetaData: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {},
  },
});

export default model<ICard>('Card', cardSchema);
