const mongoose = require('mongoose');

const ProjectStates = {
  NEW: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

const projectSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
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
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    interested: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    responseClosedAt: {
      type: Date,
      require: true,
      validate: {
        validator: function (v) {
          return v > Date.now();
        },
        message: 'responseClosedAt must be a future date.',
      },
    },
    review: {
      type: String,
    },
    media: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MacbeaseContent',
      },
    ],
     uid: {
    type: String,
  },
  universeMetaData: {
    name: String,
    location: String,
    logo: String,
    callSign: String,
  }
  },
  { timestamps: true }
);

projectSchema.pre('find', function () {
  this.sort({ responseClosedAt: 1 });
});

module.exports = mongoose.model('Project', projectSchema);
