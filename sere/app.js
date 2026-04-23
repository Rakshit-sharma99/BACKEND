require("dotenv").config();
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const socketIo = require("socket.io");
const cookieParser = require("cookie-parser");
const connectDB = require("./db/connect");
const { connectRedis } = require("./config/redis");
const { initSocket } = require("./config/socket");
const { setIO } = require("./services/liveNotificationDispatcher");
const authenticate = require("./middlewares/authentication");
const sereRouter = require("./routes/sereRouter");
const { startScheduler } = require("./engine/scheduler");
const { startCondensationFlusher } = require("./engine/condensationFlusher");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  path: "/sere/socket.io",
  cors: {
    origin: [
      "http://localhost:5173",
      "https://app.macbease.com",
      "https://macbease.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Export io for use by other modules
module.exports = { io };

app.set("trust proxy", 1);
const allowedOrigins = [
  "http://localhost:5173",
  "https://app.macbease.com",
  "https://macbease.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Request logger
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`,
  );
  next();
});

// Health check
app.get("/sere/api/v1/hello", (req, res) => {
  res.send("🚀 SERE — Starman Engagement & Reminder Engine is alive!");
});

// Protected routes
app.use("/sere/api/v1", authenticate, sereRouter);

const port = process.env.PORT || 7100;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    console.log("✅ SERE: MongoDB connected");

    // Connect to Redis (for presence tracking & condensation)
    await connectRedis();

    // Initialize Socket.IO with auth and presence handling
    initSocket(io);

    // Wire up the dispatcher to use this Socket.IO instance
    setIO(io);

    // Kafka producer + consumer auto-connect on require()
    require("./config/kafka_producer");
    require("./config/kafka_listener");

    // Start the cron scheduler
    startScheduler();

    // Start the condensation flusher (periodic summary delivery)
    startCondensationFlusher(io);

    server.listen(port, () => {
      console.log(`🚀 SERE is listening on port ${port}.`);
    });
  } catch (error) {
    console.log("❌ SERE startup error:", error);
  }
};

start();
