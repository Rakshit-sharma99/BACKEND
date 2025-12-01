const { StatusCodes } = require("http-status-codes");
const Tile = require("../models/tile");

//Controller 1
const createTile = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to create tile.");
    }

    const tile = await Tile.create({ ...req.body });

    return res.status(StatusCodes.OK).json(tile);
  } catch (error) {
    console.error("Error creating tile:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// //Controller 2
const deleteTile = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to delete tile.");
    }

    const { tileId } = req.body;

    if (!tileId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Tile ID is required." });
    }

    const tile = await Tile.findByIdAndDelete(tileId);

    if (!tile) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Tile not found." });
    }

    return res.status(StatusCodes.OK).send("Deleted successfully");
  } catch (error) {
    console.error("Error deleting tile:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Internal server error.", error: error.message });
  }
};

// //Controller 3
const getTiles = async (req, res) => {
  try {
    const tiles = await Tile.find({});
    return res.status(StatusCodes.OK).json(tiles);
  } catch (error) {
    console.error("Error fetching tiles:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

module.exports = { 
  createTile,
  deleteTile,
  getTiles
   };
