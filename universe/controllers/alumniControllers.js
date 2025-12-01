const { StatusCodes } = require("http-status-codes");
const User = require("../models/user");
const Org = require("../models/org");
const { networks, alumniListData } = require("../demoData");

//Controller 1->fetch org networks
const getOrganizations = async (req, res) => {
  try {
    const orgs = await Org.find({})
      .populate("working", "_id course image interests name pushToken")
      .limit(6)
      .lean();
    if (req.user.id === "657b907df18136e2f692397b") {
      return res.status(StatusCodes.OK).json(networks);
    }
    return res.status(StatusCodes.OK).json(orgs);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching organisations." });
  }
};

//Controller 2->fetch alumni list
const getAlumni = async (req, res) => {
  try {
    const { mode } = req.query;
    const limit = mode === "all" ? 0 : 6;
    const alumni = await User.find({
      profession: "Alumni",
    })
      .populate({
        path: "orgId",
        select: "orgName orgLogo",
      })
      .select(
        "_id profession course image interests name pushToken company workingPosition career"
      )
      .limit(limit)
      .lean();
    if (req.user.id === "657b907df18136e2f692397b") {
      return res.status(StatusCodes.OK).json(alumniListData);
    }
    return res.status(StatusCodes.OK).json(alumni);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching organisations." });
  }
};

//Controller 3->search alumni
const searchAlumni = async (req, res) => {
  try {
    const { query } = req.query;
    const alumni = await User.find({
      profession: "Alumni",
      $or: [
        { name: { $regex: query, $options: "i" } },
        { company: { $regex: query, $options: "i" } },
      ],
    })
      .populate({
        path: "orgId",
        select: "orgName orgLogo",
      })
      .select(
        "_id profession course image interests name pushToken company workingPosition career"
      );

    return res
      .status(StatusCodes.OK)
      .json({ organizations: [], individuals: alumni });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while searching alumni." });
  }
};

module.exports = {
  getOrganizations,
  getAlumni,
  searchAlumni,
};
