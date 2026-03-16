require("dotenv").config();
// require("./config/kafka_producer");
const cors = require("cors");
const express = require("express");
const admin = require("firebase-admin");
const helmet = require("helmet");
const http = require("http");

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const chapterLeaderRoutes = require("./routes/chapterLeaderRoutes");

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);
app.use(cors());
app.use(helmet());
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`
  );
  next();
});

app.get("/chapterLeader/api/v1/hello", (req, res) => {
  res.send("Chapter Leader service responding!");
});

app.use("/chapterLeader/api/v1", chapterLeaderRoutes);

const port = process.env.PORT || 6100;

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
