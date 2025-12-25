const RecentSearch = require("../models/RecentSearch");

const createARecentSearch = async (req, res) => {
  try {
    const { type, payload } = req.body;

    if (!type || !payload) {
      return res.status(400).json({ message: "Type & payload required" });
    }

    const allowed = ["club", "community", "event", "profile", "text"];
    if (!allowed.includes(type)) {
      return res.status(400).json({ message: "Invalid search type" });
    }

    // If _id exists in payload → delete old one to avoid duplicates
    if (payload._id) {
      await RecentSearch.findOneAndDelete({
        type,
        "payload._id": payload._id,
      });
    }

    const newSearch = await RecentSearch.create({ type, payload });

    return res.status(201).json({
      message: "Recent search added",
      data: newSearch,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getAllRecentSearches = async (req, res) => {
  try {
    const searches = await RecentSearch.find({})
      .sort({ updatedAt: -1 })
      .limit(20);

    return res.status(200).json({ data: searches });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getSearchesByType = async (req, res) => {
  try {
    const { type } = req.query;
    const recentSearches = await RecentSearch.find({ type });
    return res.status(200).json({ recentSearches });
  } catch (error) {
    console.error("Error searching recent searches:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error searching recent searches");
  }
};

const deleteRecentSearch = async (req, res) => {
  try {
    const { searchId } = req.body;
    const deleted = await RecentSearch.findOneAndDelete({ _id: searchId });

    if (!deleted) {
      return res.status(404).json({ message: "Recent search not found" });
    }

    return res
      .status(200)
      .json({ message: "Recent search deleted", data: deleted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createARecentSearch,
  getAllRecentSearches,
  getSearchesByType,
  deleteRecentSearch,
};
