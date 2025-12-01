const { StatusCodes } = require('http-status-codes');

//controller to receive a token and find the role
//send an object in req.body {token:"fn240fi34o3ef"}

const verifyToken = async (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(StatusCodes.OK).send(true);
  } else return res.status(StatusCodes.OK).send(false);
};

module.exports = { verifyToken };
