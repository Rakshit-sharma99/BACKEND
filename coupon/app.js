require("dotenv").config();
require("./config/kafka_listener");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const connectDB = require("./db/connect");
const couponRouter = require("./routes/couponRouter");
const authenticate = require("./middlewares/authentication");
const cookieParser = require("cookie-parser");

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
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`
  );
  next();
});

app.get("/coupon/api/v1/hello", (req, res) => {
  res.send("coupon service responding!");
});

app.use("/coupon/api/v1", authenticate, couponRouter);

const port = process.env.PORT || 7020;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    server.listen(port, () => {
      console.log(`✅ Server is listening to port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
