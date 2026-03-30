const jwt = require("jsonwebtoken");
const { StatusCodes } = require("http-status-codes");

const auth = async (req, res, next) => {
  const cookieToken =
    req.cookies?.access_token || (req.cookies && req.cookies.access_token);
  const authHeader = req.headers.authorization;

  let token = null;

  if (cookieToken) {
    token = cookieToken;
  } else if (authHeader && authHeader.startsWith("Bearer")) {
    token = authHeader.split(" ")[1];
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
