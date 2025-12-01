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

app.use(cors());
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
