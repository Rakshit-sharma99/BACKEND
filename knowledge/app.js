require("dotenv").config();
require("./config/kafka"); // Start Kafka consumer
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const cookieParser = require("cookie-parser");
const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const knowledgeRouter = require("./routes/knowledgeRouter");

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);
const allowedOrigins = [
  "http://localhost:5173",
  "https://macbease.com",
  "https://www.macbease.com",
  "https://admin.macbease.com",
  "https://www.admin.macbease.com",
  "https://app.macbease.com",
  "https://www.app.macbease.com"
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
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`,
  );
  next();
});

app.get("/knowledge/api/v1/hello", (req, res) => {
  res.send("✅ Knowledge Service is live!");
});

app.use("/knowledge/api/v1", authenticate, knowledgeRouter);

const port = process.env.PORT || 7080;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    server.listen(port, () => {
      console.log(`✅ Knowledge Service is listening on port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
