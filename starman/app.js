require("dotenv").config();
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");

const app = express();
const server = http.createServer(app);

const starmanRouter = require("./routes/starmanRouter");
const authenticate = require("./middlewares/authentication");
const cookieParser = require("cookie-parser");

app.set("trust proxy", 1);
app.use(cors());
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
    server.listen(port, () => {
      console.log(`🚀 The Starman is listening on port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
