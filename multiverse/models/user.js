const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    profession: {
      type: String,
      enum: ["Student", "Professor", "Alumni"],
      default: "Student",
    },
    role: {
      type: String,
      default: "Normal",
    },
    name: {
      type: String,
      required: [true, "Please provide the user name."],
    },
    reg: {
      type: Number,
      required: [true, "Please provide the registration number."],
    },
    course: {
      type: String,
    },
    field: {
      type: String,
    },
    passoutYear: {
      type: String,
    },
    level: {
      type: String,
    },
    email: {
      type: String,
      required: [true, "Please provide the email id."],
      match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        "Please provide a valid email",
      ],
    },
    image: {
      type: String,
      default: "xyz.com",
    },
    interests: {
      type: Array,
    },
    pushToken: {
      type: String,
    },
    professionalEmail: {
      type: String,
    },
    career: {
      type: String,
    },
    company: {
      type: String,
    },
    workingPosition: {
      type: String,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Org",
    },
    uid: {
      type: String,
    },
    universeMetaData: {
      name: String,
      location: String,
      logo: String,
      callSign: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
