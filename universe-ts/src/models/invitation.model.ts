import { Schema, model, Document, Types } from 'mongoose';

interface IInvitation extends Document {
  sentBy: Types.ObjectId;
  sentTo: Types.ObjectId;
  cc?: Types.ObjectId[];
  senderDesignation?: string;
  type?: 'Leader Change' | 'Promotion' | 'Proposal' | 'Content Team Application';
  expiration?: Date;
  state?: 'undecided' | 'accepted' | 'rejected' | 'expired';
  text?: string;
  action?: Record<string, any>;
  attachedFile?: string[];
  subject?: string;
  endorsedBy?: Types.ObjectId[];
  sentByModel: 'User' | 'Admin';
  sentToModel: 'User' | 'Admin';
}

const invitationSchema = new Schema<IInvitation>({
  sentBy: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: 'sentByModel',
  },
  sentTo: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: 'sentToModel',
  },
  cc: {
    type: [Schema.Types.ObjectId],
  },
  senderDesignation: {
    type: String,
  },
  type: {
    type: String,
    enum: ['Leader Change', 'Promotion', 'Proposal', 'Content Team Application'],
  },
  expiration: {
    type: Date,
  },
  state: {
    type: String,
    enum: ['undecided', 'accepted', 'rejected', 'expired'],
    default: 'undecided',
  },
  text: {
    type: String,
  },
  action: {
    type: Schema.Types.Mixed,
  },
  attachedFile: {
    type: [String],
  },
  subject: {
    type: String,
  },
  endorsedBy: {
    type: [Schema.Types.ObjectId],
  },
  sentByModel: {
    type: String,
    required: true,
    enum: ['User', 'Admin'],
    default: 'User',
  },
  sentToModel: {
    type: String,
    required: true,
    enum: ['User', 'Admin'],
    default: 'User',
  },
});

export default model<IInvitation>('Invitation', invitationSchema);
