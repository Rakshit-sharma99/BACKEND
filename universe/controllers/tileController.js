const { StatusCodes } = require("http-status-codes");
const Tile = require("../models/tile");

//Controller 1
const createTile = async (req, res) => {
  if (req.user.role === "admin") {
    const tile = await Tile.create({ ...req.body });
    return res.status(StatusCodes.OK).json(tile);
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to create tile.");
  }
};

//Controller 2
const deleteTile = async (req, res) => {
  if (req.user.role === "admin") {
    const { tileId } = req.body;
    const tile = await Tile.findByIdAndDelete(tileId);
    return res.status(StatusCodes.OK).send("Deleted successfully");
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to delete tile.");
  }
};

//Controller 3
const getTiles = async (req, res) => {
  const tiles = await Tile.find({});
  return res.status(StatusCodes.OK).json(tiles);
};

module.exports = { createTile, deleteTile, getTiles };
