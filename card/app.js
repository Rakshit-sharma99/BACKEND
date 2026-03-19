require("dotenv").config();
require("./config/kafka_producer");
const cors = require("cors");
const express = require("express");
const admin = require("firebase-admin");
const helmet = require("helmet");
const http = require("http");

const app = express();
const server = http.createServer(app);

const cardRouter = require("./routes/cardRouter");

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");

app.set("trust proxy", 1);
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
app.use(helmet());
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`
  );
  next();
});

app.get("/card/api/v1/hello", (req, res) => {
  res.send("Macbease card service responding!");
});

app.use("/card/api/v1", authenticate, cardRouter);

const port = process.env.PORT || 5030;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    admin.initializeApp({
      credential: admin.credential.cert({
        project_id: process.env.PROJECT_ID,
        private_key_id: process.env.PRIVATE_KEY_ID,
        private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
        client_email: process.env.CLIENT_EMAIL,
        client_id: process.env.CLIENT_ID,
        auth_uri: process.env.AUTH_URI,
        token_uri: process.env.TOKEN_URI,
        auth_provider_x509_cert_url: process.env.AUTH_PROVIDER,
        client_x509_cert_url: process.env.CLIENT,
        universe_domain: process.env.UNIVERSE_DOMAIN,
      }),
    });
    server.listen(port, () => {
      console.log(`✅ Server is listening to port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
