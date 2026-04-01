require("dotenv").config();
const crypto = require("crypto");
if (!global.crypto) {
  global.crypto = crypto.webcrypto;
}
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const cookieParser = require("cookie-parser");
const app = express();
const server = http.createServer(app);

const socialClawRouter = require("./routes/socialClawRouter");
const authenticate = require("./middlewares/authentication");
const { restoreAllTenants } = require("./platforms/whatsapp/tenantRegistry");
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
app.get("/socialClaw/api/v1/hello", (req, res) => {
  res.send("🦀 Social Claw is alive and grabbing data!");
});

// Protected routes
app.use("/socialClaw/api/v1", authenticate, socialClawRouter);

const port = process.env.PORT || 7120;

const start = async () => {
  try {
    server.listen(port, async () => {
      console.log(`🦀 Social Claw is listening on port ${port}.`);
      // Restore previously-connected tenant sessions
      try {
        await restoreAllTenants();
      } catch (err) {
        console.error("🦀 Failed to restore tenants:", err.message);
      }
    });
  } catch (error) {
    console.log(error);
  }
};

start();
