const jwt = require("jsonwebtoken");
const { StatusCodes } = require("http-status-codes");
const { redis } = require("../app");

const auth = async (req, res, next) => {
  const cookieToken = req.cookies?.access_token || (req.cookies && req.cookies.access_token);
  const authHeader = req.headers.authorization;

  let token = null;

  if (authHeader && authHeader.startsWith("Bearer")) {
    token = authHeader.split(" ")[1];
  }

  else if (cookieToken) {
    token = cookieToken;
  }
  if (!token) {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("Enter valid authorization token.");
  }

  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (payload.role === "internal") {
      req.internalService = payload.service;
      return next();
    }

    if (redis) {
      const logoutTime = await redis.get(`logout:${payload.id}`);
      if (logoutTime && payload.iat < parseInt(logoutTime)) {
        return res
          .status(StatusCodes.UNAUTHORIZED)
          .send("Session expired due to password reset.");
      }
    }

    req.user = {
      role: payload.role,
      id: payload.id,
      uid: payload.uid,
      callSign: payload.callSign,
    };
    return next();
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("You are not authorized to access this route.");
  }
};

module.exports = auth;
