require("dotenv").config();
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const cookieParser = require("cookie-parser");
const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const sereRouter = require("./routes/sereRouter");
const { startScheduler } = require("./engine/scheduler");

const app = express();
const server = http.createServer(app);

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

    // Kafka producer + consumer auto-connect on require()
    require("./config/kafka_producer");
    require("./config/kafka_listener");

    // Start the cron scheduler
    startScheduler();

    server.listen(port, () => {
      console.log(`🚀 SERE is listening on port ${port}.`);
    });
  } catch (error) {
    console.log("❌ SERE startup error:", error);
  }
};

start();
