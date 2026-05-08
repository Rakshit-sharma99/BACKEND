require("dotenv").config();
require("./config/kafka_producer");
require("./config/kafka_listener");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);

const adminRouter = require("./routes/adminRouter");
const creatorRouter = require("./routes/creatorRouter");
const webhookRouter = require("./routes/webhookRouter");

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");

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

app.get("/mou/api/v1/hello", (req, res) => {
  res.send("Macbease MOU service responding!");
});

app.use("/mou/api/v1/webhook", webhookRouter); // No auth for webhook
app.use("/mou/api/v1/admin", authenticate, adminRouter); // Consider adding requireAdmin middleware
app.use("/mou/api/v1", authenticate, creatorRouter);

const port = process.env.PORT || 5065; // Use 5065 as suggested

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    server.listen(port, () => {
      console.log(`✅ MOU Server is listening to port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
