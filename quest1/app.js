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
app.use(cors());
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
