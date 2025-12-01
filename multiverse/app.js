require("dotenv").config();
require("./config/kafka_producer");
require("./config/kafka_listener");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const admin = require("firebase-admin");

const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const multiverse_adminAuthRouter = require("./routes/adminAuthRouter");
const universeRouter = require("./routes/universeRouter");
const userRouter = require("./routes/userRouter");
const clubRouter = require("./routes/clubRouter");
const communityRouter = require("./routes/communityRouter");

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

app.get("/multiverse/api/v1/hello", (req, res) => {
  res.send("Multiverse responding!");
});

app.use("/multiverse/api/v1/auth/multiverse_admin", multiverse_adminAuthRouter);
app.use("/multiverse/api/v1/universe", universeRouter);
app.use("/multiverse/api/v1/user", authenticate, userRouter);
app.use("/multiverse/api/v1/club", clubRouter);
app.use("/multiverse/api/v1/community", communityRouter);

const port = process.env.PORT || 5020;

const start = async () => {
  try {
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
    await connectDB(process.env.MONGO_URI);
    server.listen(port, () => {
      console.log(`✅ Server is listening to port ${port}.`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
