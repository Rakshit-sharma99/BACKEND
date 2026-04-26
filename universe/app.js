require("dotenv").config();
require("./config/kafka_producer");
require("./config/kafka_listener");
require("./config/snapshotCron");

const cors = require("cors");
const express = require("express");
const admin = require("firebase-admin");
const helmet = require("helmet");
const socketIo = require("socket.io");
const http = require("http");
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  path: "/universe/socket.io",
});
const cookieParser = require("cookie-parser");

const Redis = require("ioredis");
const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: 6379,
});

// redis.on("connect", () => console.log("✅ Connected to Redis!"));
// redis.on("error", (err) => {
//   console.error("🚨 Redis Error:", err.message);
// });

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const secret_name = "macbease-backend-env-sms";

const client = new SecretsManagerClient({
  region: "ap-south-1",
});

module.exports = { io, redis };

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const checkAdmin = require("./middlewares/checkadmin");
const userAuthRouter = require("./routes/userAuthRouter");
const userRouter = require("./routes/userRouter");
const frontendRouter = require("./routes/frontendRouter");
const adminAuthRouter = require("./routes/adminAuthRouter");
const clubRouter = require("./routes/clubRouter");
const communityRouter = require("./routes/communityRouter");
const paymentRouter = require("./routes/paymentRouter");
const walletRouter = require("./routes/walletRouter");
const chatRouter = require("./routes/chatRouter");
const shortCutRouter = require("./routes/shortCutRouter");
const letterRouter = require("./routes/letterRouter");
const contentModerationRouter = require("./routes/contentModerationRouter");
const alumniRouter = require("./routes/alumniRouter");
const rateLimit = require("express-rate-limit");
const awardRouter = require("./routes/awardRouter");
const blockRouter = require("./routes/blockRouter");
const Session = require("./models/session");
const recentSearchesRouter = require("./routes/recentSearchesRouter");
const chapterLeaderRouter = require("./routes/chapterLeaderRoutes");
const productRouter = require("./routes/productRouter");
const orderRouter = require("./routes/orderRouter");
const layoutRouter = require("./routes/layoutRouter");
const seatLock = require("./sockets/seatLock");

const sessionRouter = require("./routes/sessionRouter");
const communityMetaRouter = require("./routes/communityMetaRouter");
const accessCodeRouter = require("./routes/accessRouter");

app.set("trust proxy", 1);
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://macbease.com",
      "https://www.macbease.com",
      "https://admin.macbease.com",
      "https://www.admin.macbease.com",
    ],
    credentials: true,
  }),
);
const pushRouter = require("./routes/pushRouter");
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${req.ip} ${req.method} ${req.originalUrl}`;

  console.log(logEntry);

  const sessionId = req.headers["session"];

  if (sessionId) {
    Session.findByIdAndUpdate(
      sessionId,
      { $push: { callStack: logEntry } },
      { new: false, useFindAndModify: false },
    ).catch((err) => {
      console.error("Session logging error:", err.message);
    });
  }

  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Allow only 10 requests per 15 minutes per IP
  message: { error: "IP blocked" },
});

app.get("/universe/api/v1/hello", authLimiter, (req, res) => {
  res.send("Macbease - updated.");
});

app.use("/universe/api/v1/auth/user", userAuthRouter);
app.use("/universe/api/v1/admin", adminAuthRouter);
app.use("/universe/api/v1/payment", authenticate, paymentRouter);
app.use("/universe/api/v1/wallet", authenticate, walletRouter);
app.use("/universe/api/v1/user", authenticate, userRouter);
app.use("/universe/api/v1/frontend", authenticate, frontendRouter);
app.use("/universe/api/v1/club", authenticate, clubRouter);
app.use("/universe/api/v1/community", authenticate, communityRouter);
app.use("/universe/api/v1/chat", authenticate, chatRouter);
app.use("/universe/api/v1/shortCuts", authenticate, shortCutRouter);
app.use("/universe/api/v1/letter", authenticate, letterRouter);
app.use(
  "/universe/api/v1/contentModeration",
  authenticate,
  contentModerationRouter,
);
app.use("/universe/api/v1/alumni", authenticate, alumniRouter);
app.use("/universe/api/v1/award", authenticate, awardRouter);
app.use("/universe/api/v1/block", authenticate, blockRouter);
app.use("/universe/api/v1/recentSearches", authenticate, recentSearchesRouter);
// app.use("/universe/api/v1/events/register", authenticate, eventRegisterRouter);

app.use("/universe/api/v1/chapterLeader", chapterLeaderRouter);
app.use("/universe/api/v1/product", authenticate, productRouter);
app.use("/universe/api/v1/order", authenticate, orderRouter);
app.use("/universe/api/v1/push", authenticate, pushRouter);
app.use("/universe/api/v1/layout", authenticate, layoutRouter);

// admin routes
app.use("/universe/api/v1/session", authenticate, checkAdmin, sessionRouter);
app.use(
  "/universe/api/v1/community-metadata",
  authenticate,
  checkAdmin,
  communityMetaRouter,
);
app.use("/universe/api/v1/accessCode", authenticate, accessCodeRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Something went wrong!" });
});

const port = process.env.PORT || 5050;

async function getSecret() {
  if (process.env.NODE_ENV === "production") {
    let response;

    try {
      response = await client.send(
        new GetSecretValueCommand({
          SecretId: secret_name,
          VersionStage: "AWSCURRENT",
        }),
      );

      if (response.SecretString) {
        const secrets = JSON.parse(response.SecretString);
        process.env.MONGO_URI = secrets.MONGO_URI;
        process.env.ACCESS_TOKEN_SECRET = secrets.ACCESS_TOKEN_SECRET;
        process.env.REFRESH_TOKEN_SECRET = secrets.REFRESH_TOKEN_SECRET;
        process.env.EMAIL = secrets.EMAIL;
        process.env.PASSWORD = secrets.PASSWORD;
        process.env.AWS_ACCESS_KEY_ID = secrets.AWS_ACCESS_KEY_ID;
        process.env.AWS_SECRET_ACCESS_KEY = secrets.AWS_SECRET_ACCESS_KEY;
        process.env.AWS_REGION = secrets.AWS_REGION;
        process.env.REFRESH_TOKEN_LIFETIME = secrets.REFRESH_TOKEN_LIFETIME;
        process.env.RAZOR_PAY_KEY = secrets.RAZOR_PAY_KEY;
        process.env.RAZOR_PAY_SECRET = secrets.RAZOR_PAY_SECRET;
        process.env.OPENAI_API_KEY = secrets.OPENAI_API_KEY;
        // process.env.OPENAI_ORG_ID = secrets.OPENAI_ORG_ID || '';
        // process.env.OPENAI_BASE_URL = secrets.OPENAI_BASE_URL || '';
        process.env.PROJECT_ID = secrets.PROJECT_ID;
        process.env.PRIVATE_KEY_ID = secrets.PRIVATE_KEY_ID;
        process.env.PRIVATE_KEY = secrets.PRIVATE_KEY;
        process.env.CLIENT_EMAIL = secrets.CLIENT_EMAIL;
        process.env.CLIENT_ID = secrets.CLIENT_ID;
        process.env.AUTH_URI = secrets.AUTH_URI;
        process.env.TOKEN_URI = secrets.TOKEN_URI;
        process.env.AUTH_PROVIDER = secrets.AUTH_PROVIDER;
        process.env.CLIENT = secrets.CLIENT;
        process.env.UNIVERSE_DOMAIN = secrets.UNIVERSE_DOMAIN;
        console.log("Secrets loaded successfully.");
      }
    } catch (error) {
      console.error("Error retrieving secret: ", error);
      return;
    }
  }
}

const start = async () => {
  try {
    await getSecret();
    admin.initializeApp({
      credential: admin.credential.cert({
        project_id: process.env.PROJECT_ID,
        private_key_id: process.env.PRIVATE_KEY_ID,
        private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
        client_email: process.env.CLIENT_EMAIL,
        client_id: process.env.CLIENT_ID,
        auth_uri: process.env.AUTH_URI,
        token_uri: process.env.TOKEN_URI,
        client_x509_cert_url: process.env.CLIENT,
        auth_provider_x509_cert_url: process.env.AUTH_PROVIDER,
        universe_domain: process.env.UNIVERSE_DOMAIN,
      }),
    });
    await connectDB(process.env.MONGO_URI);
    io.on("connection", (socket) => {
      console.log("A user connected!");
      seatLock(io, socket);
      socket.on("disconnect", () => {
        console.log("A user disconnected!");
      });
    });
    server.listen(port, () => {
      console.log(`✅ Server is listening to port ${port}!`);
      require("./jobs/updateProgress");
    });
  } catch (error) {
    console.log(error);
  }
};

start();
