const { StatusCodes } = require("http-status-codes");
const Unsorted = require("../models/unsorted");

const getUnsortedWords = async (req, res) => {
  try {
    const unsortedWords = await Unsorted.find({})
    
    return res
      .status(StatusCodes.OK)
      .json({unsortedWords});
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching unsorted words");
  }
}

module.exports = {
  getUnsortedWords,
}