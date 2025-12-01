require("dotenv").config();
require("./config/kafka_listener");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");

const app = express();
const server = http.createServer(app);

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");

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

app.get("/refund/api/v1/hello", (req, res) => {
  res.send("Macbease refund service responding!");
});

const port = process.env.PORT || 7000;

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
