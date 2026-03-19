require("dotenv").config();
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const connectDB = require("./db/connect");
const authenticate = require("./middlewares/authentication");
const semanticRouter = require("./routes/semanticRouter");
const territoryRouter = require("./routes/territoryRouter");
const assetRouter = require("./routes/assetRouter");

const app = express();
const server = http.createServer(app);

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
    `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}`,
  );
  next();
});

app.get("/map/api/v1/hello", (req, res) => {
  res.send("Map service responding!");
});

app.use("/map/api/v1/nodes", authenticate, semanticRouter);
app.use("/map/api/v1/territory", authenticate, territoryRouter);
app.use("/map/api/v1/asset", authenticate, assetRouter);

const port = process.env.PORT || 7050;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    server.listen(port, () => {
      console.log(`✅ Server is listening to port ${port}!`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
