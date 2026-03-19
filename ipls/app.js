require("dotenv").config();
const cors = require("cors");
const express = require("express");
const http = require("http");
const connectDB = require("./db/connect");

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 5010;

require("./config/kafka");

//routes
const logRouter = require("./routes/logRouter");

const allowedOrigins = [
  "http://localhost:5173",
  "https://app.macbease.com",
  "https://macbease.com"
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
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`
  );
  next();
});

app.use("/ipls/api/v1/log", logRouter);

const start = async () => {
  console.log("start called");
  try {
    await connectDB(process.env.MONGO_URI);
    server.listen(port, () => {
      console.log(`✅ IPLS is listening to port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
