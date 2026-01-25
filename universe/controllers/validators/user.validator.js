const { body } = require("express-validator");
const mongoose = require("mongoose");

const registerUserValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 60 }),

  body("email").normalizeEmail().isEmail().withMessage("Invalid email"),

  body("password").isLength({ min: 6 }).withMessage("Password too short"),

  body("profession").optional().isIn(["Student", "Professor", "Alumni"]),

  body("course").optional().trim(),
  body("field").optional().trim(),
  body("level").optional().trim(),
  body("career").optional().trim(),
  body("company").optional().trim(),
  body("workingPosition").optional().trim(),

  body("reg").optional().isNumeric(),

  body("interests").optional().isArray().withMessage("Interests must be array"),

  body("platform")
    .optional()
    .isIn(["web", "app"])
    .withMessage("Platform must be either 'web' or 'app'"),

  /* ---------- Universe validation ---------- */
  body("universe")
    .notEmpty()
    .withMessage("Universe required")
    .isObject()
    .withMessage("Universe must be an object"),

  body("universe._id").isMongoId().withMessage("Invalid universe id"),

  body("universe.name").trim().notEmpty().withMessage("Universe name required"),

  body("universe.location")
    .trim()
    .notEmpty()
    .withMessage("Universe location required"),

  body("universe.logo").trim().notEmpty().withMessage("Universe logo required"),

  body("universe.callSign")
    .trim()
    .notEmpty()
    .withMessage("Universe callSign required"),

  body("universe.logoKey").optional().trim(),

  body("universe.lat")
    .notEmpty()
    .withMessage("Universe latitude required")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90"),

  body("universe.lng")
    .notEmpty()
    .withMessage("Universe longitude required")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180"),
];

const p1 = [
  {
    type: "club",
    name: "Coding Club",
    id: mongoose.Types.ObjectId("657b9303f18136e2f692398c"),
    secondaryImg: "public/club/CodingPost3.jpg",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "community",
    name: "Mamba Mentality ",
    id: mongoose.Types.ObjectId("66ed18fe0c4142316f4c43f7"),
    secondary: "public/community/FriSep20202412:11:00GMT+0530img",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "club",
    name: "Pawn Knight",
    id: mongoose.Types.ObjectId("657b97a8f18136e2f69239ab"),
    secondaryImg: "public/club/chessClunCover.jpg",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "community",
    name: "got-it!",
    id: mongoose.Types.ObjectId("657b9407f18136e2f69239a1"),
    secondary: "public/club/SocialClubLogo.jpg",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
];
const p2 = [
  {
    type: "club",
    name: "Sheyn",
    id: mongoose.Types.ObjectId("65fbb7a60fa1132b8c9cc280"),
    secondaryImg: "public/club/ThuMar21202409:59:22GMT+0530img",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "community",
    name: "World Wizards",
    id: mongoose.Types.ObjectId("657ba2e9f18136e2f69239d4"),
    secondary: "public/communities/wAlogo.jpeg",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "club",
    name: "Department of Entrepreneurship ",
    id: mongoose.Types.ObjectId("66d29ec57657f2d4231cd22a"),
    secondaryImg: "public/club/SatAug31202410:10:35GMT+0530img",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "community",
    name: "Game devs",
    id: mongoose.Types.ObjectId("670a1d50884ee1bcc3bb12b0"),
    secondary: "public/community/SatOct12202412:25:09GMT+0530img",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
];
const p3 = [
  {
    type: "club",
    name: "Coding Club",
    id: mongoose.Types.ObjectId("657b9303f18136e2f692398c"),
    secondaryImg: "public/club/CodingPost3.jpg",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "community",
    name: "got-it!",
    id: mongoose.Types.ObjectId("657b9407f18136e2f69239a1"),
    secondary: "public/club/SocialClubLogo.jpg",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "club",
    name: "0x0CAFE",
    id: mongoose.Types.ObjectId("670eb50be40cd552e8ba386d"),
    secondaryImg: "public/club/WedOct16202400:01:37GMT+0530img",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
  {
    type: "community",
    name: "World Wizards",
    id: mongoose.Types.ObjectId("657ba2e9f18136e2f69239d4"),
    secondary: "public/communities/wAlogo.jpeg",
    universeMetaData: {
      uid: "696f491a0bfc89b35dc62326",
      name: "Lovely Professional University",
      callSign: "LPU",
      location: "Punjab, India",
      logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
      logoKey: "public/universes/lpu_logo-removebg-preview.png",
    },
  },
];
const shortcuts = [p1, p2, p3];

module.exports = { registerUserValidator, shortcuts };
