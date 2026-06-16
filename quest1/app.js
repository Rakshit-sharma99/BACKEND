require("dotenv").config();
// require("./config/kafka_producer");
const cors = require("cors");
const express = require("express");
const admin = require("firebase-admin");
const helmet = require("helmet");
const http = require("http");

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const questRouter = require("./routes/questRoutes");

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
  })
);

app.use(helmet());
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`,
  );
  next();
});

app.get("/quest1/api/v1/hello", (req, res) => {
  res.send("Quest service responding!");
});

app.use("/quest1/api/v1", questRouter);

const port = process.env.PORT || 7120;

const start = async () => {
  try {
    console.log(process.env.MONGO_URI);
    await connectDB(process.env.MONGO_URI);
    server.listen(port, () => {
      console.log(`✅ Server is listening to port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
