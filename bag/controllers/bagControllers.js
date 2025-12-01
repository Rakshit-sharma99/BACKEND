const { StatusCodes } = require("http-status-codes");
const Bag = require("../models/bag");
const {sendKafkaMessage} = require("../config/utils/sendKafkaMessage");
const { getUnsortedWords } = require("./utilControllers");

//Controller 1
const createBag = async (req, res) => {
  if (req.user.role === "admin") {
    const { keyWords, title, unsorted } = req.body;
    const bag = await Bag.create({ keyWords, title });
    await sendKafkaMessage("UPDATE_UNSORTED","unsorted",{
        keyWords,
        unsorted
    })
    return res.status(StatusCodes.OK).json(bag);
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to create a bag.");
  }
};

//Controller 2

const search = async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (userRole !== "admin" && userRole !== "user") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to search bags");
    }

    const { tag } = req.body;
    if (typeof tag !== "string" || !tag.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).send("Tag is required");
    }

    const regex = new RegExp(tag, "i", "g");
    
    const matchedBags = await Bag.find({
      keyWords: { $regex: regex },
    }).select("title");

    const bagTitles = matchedBags.map(bag => bag.title);

    return res.status(StatusCodes.OK).json(bagTitles);
  } catch (error) {
      return res
        .status(StatusCodes.OK)
        .send("You are not authorized to insert in bag");
  }
};

// //Controller 3
const getAllKeywords = async (req, res) => {
  try{
    const userRole = req.user?.role;
    
    if (userRole !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to read the keywords.");  
    }
    const bags = await Bag.find({}, { keyWords: 0 });

    return res.status(StatusCodes.OK).json(bags);

  }catch(error){
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to read the keywords.");
  }
};

// //Controller 4
const unsortedTag = async (req, res) => {
  try {
    // Authorization check
    if (!["admin", "user"].includes(req.user.role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to decide the unsorted tags.");
    }

    const { keyWord } = req.body;

    // Use regex to search in the database directly
    const regex = new RegExp(keyWord, "i");
    const matchedBag = await Bag.findOne({ keyWords: { $regex: regex } });

    if (matchedBag) {
      console.log("The word already exists in the bag.");
      return res
        .status(StatusCodes.OK)
        .send("The word already exists in the bag.");
    }

    await sendKafkaMessage("CREATE_UNSORTED","unsorted",{keyWord});
    
    return res
      .status(StatusCodes.OK)
      .send("The word has been successfully added to the unsorted list.");
  } catch (error) {
    console.error("Error in unsortedTag:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "An error occurred while processing the unsorted tag." });
  }
};

// //Controller 5
const getUnsortedTags = async (req, res) => {
  try{
    const userRole = req.user?.role;

    if (userRole !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).send("You are not authorized to access the unsorted keywords.");
    }
    
    const unsortedWords = await getUnsortedWords();

    return res.status(StatusCodes.OK).json(unsortedWords);
  }catch(error){
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to access the unsorted keywords.");
  }
};

//Controller 6
const sortATag = async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const { unsorted, bagTitle } = req.body;

      // Use $addToSet to ensure uniqueness
      const bag = await Bag.findOneAndUpdate(
        { title: bagTitle },
        { $addToSet: { keyWords: unsorted } }, // Only adds if not already present
        { new: true }
      );

      if (!bag) {
        return res.status(StatusCodes.NOT_FOUND).send("Bag not found.");
      }

      await sendKafkaMessage("DELETE_UNSORTED","unsorted",{unsorted})

      return res
        .status(StatusCodes.OK)
        .send("The word has been successfully sorted.");
    } else {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to sort the tags.");
    }
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while sorting the word.");
  }
};

//Controller 7
const getKeysFromBag = async (req, res) => {
  try{
    const userRole = req.user?.role;
    const { bagTitle } = req.body;

    if (userRole !== "admin" && userRole !== "user") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to read keys from the bag.");
    }

    const keys = await Bag.findOne({ title: bagTitle }, { keyWords: 1, _id: 0 });

    if (keys) return res.status(StatusCodes.OK).json(keys.keyWords);
    else return res.status(StatusCodes.OK).json([bagTitle]);
  }catch(error){
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to read keys from the bag.");
  }
};

//Controller 8
const deleteKeyFromBag = async (req, res) => {
  if (req.user.role !== "admin") {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send("You are not authorized to delete a keyword.");
  }

  const { word, bagTitle } = req.body;

  try {
    const bag = await Bag.findOne({ title: bagTitle });

    if (!bag) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Bag not found.");
    }

    bag.keyWords = bag.keyWords.filter((i) => i !== word);

    await bag.save();

    return res
      .status(StatusCodes.OK)
      .send("Keyword has been successfully deleted.");
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while deleting the keyword.");
  }
};


//Controller 9
const deleteABag = async (req, res) => {
  try{
    const userRole = req.user?.role;
    const { bagId } = req.body;
    
    if (userRole !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to delete a bag.");
    }

    const deletedBag = await Bag.findByIdAndDelete(bagId);

    return res
      .status(StatusCodes.OK)
      .send("The bag has been successfully deleted.");
  }catch(error){
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to delete a bag.");
  }
};

//Controller 10
const deleteUnsortedWord = async (req, res) => {
  try{
    const userRole = req.user?.role;
    if (userRole !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to delete an unsorted word."); 
    }
    const { word } = req.body;

    await sendKafkaMessage("DELETE_UNSORTED","unsorted",{unsorted: word})
    
    return res
      .status(StatusCodes.OK)
      .send("The unsorted word has been successfully deleted.");
  }catch(error){
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to delete an unsorted word.");
  }
};

//Controller 11
const masterSearch = async (req, res) => {
  try {
    const { tag } = req.query;
  
    if (!tag || typeof tag !== "string") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Query word is required and must be a string.");
    }

    const regex = new RegExp(tag, "i"); // case-insensitive match

    const bag = await Bag.findOne({
      keyWords: { $elemMatch: { $regex: regex } },
    });

    if (!bag) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("No bag found with the given keyword.");
    }

    return res.status(StatusCodes.OK).json(bag.keyWords);
  } catch (error) {
    console.error("Error finding bag by keyword:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allBags = await Bag.find({});

    const bulkOps = allBags.map((bag) => ({
      updateOne: {
        filter: { _id: bag._id },
        update: {
          $set: {
            uid: "682f0418482d651a6df66c23",
            universeMetaData: {
              location: "Phagwara,Punjab,India",
              logo: "public/universes/lpu_logo.jpg",
              name: "Lovely Professional University",
              callSign: "universe",
            },
          },
        },
      },
    }));

    const result = await Bag.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} bags`);

    res.status(200).json({
      message: "bags updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getRelatedTags = async (req, res) => {
  try {
    const { query } = req.body; // expecting array of keywords

    if (!query || !Array.isArray(query) || query.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }

    const validQuery = query.filter(
      (keyWord) => keyWord && keyWord.trim() !== ""
    );

    if (validQuery.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }

    // Create aggregation pipelines for all keywords
    const pipelines = validQuery.map((keyWord) => ({
      $search: {
        index: "default",
        text: {
          query: keyWord,
          path: ["keyWords"],
        },
      },
    }));

    // Execute all searches in parallel
    const results = await Promise.all(
      pipelines.map((pipeline) => Bag.aggregate([pipeline]))
    );

    // Collect unique keywords across results
    const uniqueBags = new Set();
    const finalData = new Set();

    results.forEach((newBags) => {
      newBags.forEach((bag) => {
        const id = bag._id.toString();
        if (!uniqueBags.has(id)) {
          uniqueBags.add(id);
          (bag.keyWords || []).forEach((keyword) => finalData.add(keyword));
        }
      });
    });

    // Ensure all original query keywords are in the final data
    validQuery.forEach((keyword) => finalData.add(keyword));

    return res.status(StatusCodes.OK).json(Array.from(finalData));
  } catch (error) {
    console.error("Error in getRelatedTags (Bag Service):", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching related tags.");
  }
};

const fetchBags = async (req, res) => {
  try {
    const { query } = req.body;

    // Validate input
    if (!query || (Array.isArray(query) && query.length === 0)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Search query is required.");
    }

    // Build search stage
    const searchStage = {
      $search: {
        index: "default", // your Atlas Search index name
        text: {
          query: Array.isArray(query) ? query.join(" ") : query,
          path: "keyWords",
        },
      },
    };

    // Run aggregation
    const bags = await Bag.aggregate([searchStage]);

    if (!bags || bags.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }

    return res.status(StatusCodes.OK).json(bags);
  } catch (error) {
    console.error("Error in fetchBags controller:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while searching for bags.");
  }
};

module.exports = {
  createBag,
  search,
  getAllKeywords,
  unsortedTag,
  getUnsortedTags,
  sortATag,
  getKeysFromBag,
  deleteKeyFromBag,
  deleteABag,
  deleteUnsortedWord,
  masterSearch,
  insertNewFields,
  getRelatedTags,
  fetchBags
};
