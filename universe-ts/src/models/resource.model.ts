import { Schema, model, Document, Types } from 'mongoose';

interface IResource extends Document {
  submittedBy: Types.ObjectId;
  publisherMetaData: {
    name: string;
    image: string;
    pushToken?: string;
  };
  title: string;
  description?: string;
  url?: string;
  access: 'public' | 'private';
  accessList: Types.ObjectId[];
  metaData: {
    size: number;
    uri: string;
    mimeType: string;
  };
  downloads: Types.ObjectId[];
  views: number;
  reviews: {
    reviewId?: string;
    userId: Types.ObjectId;
    timeStamp: Date;
    msg?: string;
    star?: number;
  }[];
}

const resourceSchema = new Schema<IResource>(
  {
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    publisherMetaData: {
      name: {
        type: String,
        required: true,
      },
      image: {
        type: String,
        required: true,
      },
      pushToken: {
        type: String,
      },
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
    },
    access: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    accessList: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    metaData: {
      size: {
        type: Number,
        required: true,
      },
      uri: {
        type: String,
        required: true,
      },
      mimeType: {
        type: String,
        required: true,
      },
    },
    downloads: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    views: {
      type: Number,
      default: 0,
    },
    reviews: [
      {
        reviewId: {
          type: String,
        },
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        timeStamp: {
          type: Date,
          default: Date.now,
        },
        msg: {
          type: String,
        },
        star: {
          type: Number,
          min: 1,
          max: 5,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

export default model<IResource>('Resource', resourceSchema);
