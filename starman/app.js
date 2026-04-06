require("dotenv").config();
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const cookieParser = require("cookie-parser");
const app = express();
const server = http.createServer(app);

const starmanRouter = require("./routes/starmanRouter");
const authenticate = require("./middlewares/authentication");
const connectDB = require("./config/db");
const { startRelayConsumer } = require("./handlers/relayConsumer");
const allowedOrigins = [
  "http://localhost:5173",
  "https://app.macbease.com",
  "https://macbease.com",
];


app.set("trust proxy", 1);
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS."));
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
app.get("/starman/api/v1/hello", (req, res) => {
  res.send("🚀 The Starman is alive and dancing!");
});

// Protected routes
app.use("/starman/api/v1", authenticate, starmanRouter);

const port = process.env.PORT || 7060;

const start = async () => {
  try {
    await connectDB();
    server.listen(port, () => {
      console.log(`🚀 The Starman is listening on port ${port}.`);
    });

    // Start the Signal Relay consumer (autonomous WhatsApp → Community posting)
    startRelayConsumer().catch((err) => {
      console.error(`❌ [SignalRelay] Failed to start relay consumer:`, err.message);
    });
  } catch (error) {
    console.log(error);
  }
};

start();

