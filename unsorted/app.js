require("dotenv").config();
require("./config/kafka_listener");;
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const unsortedRouter = require("./routes/unsortedRouter");

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

app.get("/unsorted/api/v1/hello", (req, res) => {
  res.send("Unsorted service responding!");
});

app.use("/unsorted/api/v1",authenticate,unsortedRouter);

const port = process.env.PORT || 6090;

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
