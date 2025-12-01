import mongoose, { Document, Schema } from 'mongoose';

enum ProjectStates {
  NEW = 0,
  IN_PROGRESS = 1,
  COMPLETED = 2,
}

interface IProject extends Document {
  createdBy: mongoose.Types.ObjectId;
  state: ProjectStates;
  title: string;
  description: string;
  allotedTo: mongoose.Types.ObjectId[];
  interested: mongoose.Types.ObjectId[];
  responseClosedAt: Date;
  review?: string;
  media: mongoose.Types.ObjectId[];
}

const projectSchema: Schema<IProject> = new Schema(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    state: {
      type: Number,
      enum: Object.values(ProjectStates),
      default: ProjectStates.NEW,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    allotedTo: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    interested: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    responseClosedAt: {
      type: Date,
      required: true,
      validate: {
        validator: function (v: Date) {
          return v.getTime() > Date.now();
        },
        message: 'responseClosedAt must be a future date.',
      },
    },
    review: {
      type: String,
    },
    media: [
      {
        type: Schema.Types.ObjectId,
        ref: 'MacbeaseContent',
      },
    ],
  },
  { timestamps: true },
);

projectSchema.pre('find', function (next) {
  this.sort({ responseClosedAt: 1 });
  next();
});

export default mongoose.model<IProject>('Project', projectSchema);
