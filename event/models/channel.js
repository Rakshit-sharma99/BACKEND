const mongoose = require("mongoose");
const { Schema } = mongoose;

const roomSchema = new Schema(
  {
    groupId: {
      type: String,
      required: true,
    },

    ticketType: {
      type: String,
      default: null,
    },
    membersCount: {
      type: Number,
      default: 0,
    },
    whoCanSendMessages: {
      admins: {
        type: Boolean,
        default: true,
      },
      team: {
        type: Boolean,
        default: true,
      },
      members: {
        type: Boolean,
        default: true,
      },
    },
  },
  { _id: false }
);

const channelSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    rooms: [roomSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Channel", channelSchema);
