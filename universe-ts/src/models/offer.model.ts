import mongoose, { Schema, Document } from "mongoose";

interface IAvailedBy {
  userId: mongoose.Types.ObjectId;
  couponId?: string;
  availedAt: Date;
}

interface IMetaData {
  url?: string;
  store?: string;
}

interface IAction {
  endPoint: string;
  body?: Record<string, unknown>;
  query?: string;
  reqType: string;
}

interface INavigation {
  to: string;
  params: Record<string, unknown>;
}

export interface IOffer extends Document {
  ip: number;
  expiryDate: Date;
  description: string;
  availedBy: IAvailedBy[];
  available: string[];
  status: 0 | 1;
  metaData?: IMetaData;
  action?: IAction;
  navigation?: INavigation;
  visibleTo: mongoose.Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

const OfferSchema: Schema = new Schema<IOffer>(
  {
    ip: { type: Number, required: true },
    expiryDate: { type: Date, required: true },
    description: { type: String, required: true },
    availedBy: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        couponId: { type: String },
        availedAt: { type: Date, default: Date.now },
      },
    ],
    available: [{ type: String }],
    status: { type: Number, enum: [0, 1], default: 1 },
    metaData: {
      url: { type: String },
      store: { type: String },
    },
    action: {
      endPoint: { type: String },
      body: { type: Object },
      query: { type: String },
      reqType: { type: String },
    },
    navigation: {
      to: { type: String },
      params: { type: Object },
    },
    visibleTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model<IOffer>("Offer", OfferSchema);
