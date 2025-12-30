const Card = require("../models/card");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const {
  lemmatize,
  fetchUserData,
  fetchNativeUserData,
  fetchMultipleClubsData,
  fetchMultipleCommunitiesData,
  fetchRelatedTags,
  fetchRelevantResources,
  fetchRelevantProfessors,
  fetchRelevantCommunities,
  fetchRelevantClubs,
  fetchRelevantEvents,
  fetchClubsRecommendations,
  fetchCommunitiesRecommendations,
  fetchSampleResources,
  fetchPastOrFutureEvents,
} = require("./utilControllers");

//Controller 1
const createCard = async (req, res) => {
  try {
    const { value, tags, universeMetaData } = req.body;

    if (!value || typeof value !== "string") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Card value is required." });
    }

    if (!Array.isArray(tags)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Tags should be an array." });
    }

    if (
      !universeMetaData ||
      !universeMetaData.name ||
      !universeMetaData.location ||
      !universeMetaData.logo ||
      !universeMetaData.callSign
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Incomplete universeMetaData provided." });
    }

    const lemmatizedTags = lemmatize(tags);

    const user_query = {
      id: req.user.id,
      fields: ["name", "image", "pushToken", "course"],
    };

    const userInfo = await fetchUserData(user_query);

    const card = await Card.create({
      value,
      tags: lemmatizedTags,
      creator: req.user.id,
      userMetaData: userInfo,
      uid: req.user.uid,
      universeMetaData,
    });

    await sendKafkaMessage("ADD_CARD", req.user.callSign, {
      userId: req.user.id,
      cardId: card._id.toString(),
    });

    await sendKafkaMessage("UPDATE_CARD_FEED", req.user.callSign, {
      card,
    });

    return res
      .status(StatusCodes.OK)
      .json({ message: "Card created successfully", cardId: card._id });
  } catch (error) {
    console.error("❌ Error creating card:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while creating the card." });
  }
};

//Controller 2
const deleteCard = async (req, res) => {
  try {
    const { cardId } = req.body;

    // Validate cardId
    if (!cardId || !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid or missing cardId.",
      });
    }

    // Attempt to delete the card
    const card = await Card.findByIdAndDelete(cardId);

    if (!card) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Card not found or already deleted.",
      });
    }

    // Notify via Kafka
    await sendKafkaMessage("DELETE_CARD", req.user.callSign, {
      userId: req.user.id,
      cardId,
    });

    return res.status(StatusCodes.OK).json({
      message: "Card successfully deleted",
      cardId: card._id,
    });
  } catch (error) {
    console.error("❌ Error deleting card:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while deleting the card.",
    });
  }
};

//Controller 3
const likeACard = async (req, res) => {
  try {
    const { cardId } = req.body;
    const userId = req.user.id;

    const card = await Card.findById(cardId, { vector: 0 });

    if (!card) {
      return res.status(StatusCodes.NOT_FOUND).send("Card not found.");
    }

    const alreadyLiked = card.likedBy.some((id) => id.toString() === userId);

    if (!alreadyLiked) {
      card.likedBy.push(userId);
      await card.save();

      await sendKafkaMessage("LIKE_CARD", req.user.callSign, {
        userId,
        cardId: card._id.toString(),
      });

      const user_query = {
        id: userId,
        fields: [
          "name",
          "image",
          "pushToken",
          "_id",
          "uid",
          "universeMetaData",
        ],
      };

      const userInfo = await fetchUserData(user_query);

      await sendKafkaMessage(
        "LIKE_CARD_SECONDARY_ACTION",
        card.universeMetaData.callSign,
        {
          cardId,
          creatorId: card.creator.toString(),
          userInfo,
          cardInfo: card,
        }
      );
    }

    return res.status(StatusCodes.OK).send("You have liked the card.");
  } catch (err) {
    console.error("❌ Error in likeACard:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while liking the card.");
  }
};

//Controller 4
const unlikeACard = async (req, res) => {
  try {
    const { cardId } = req.body;
    const userId = req.user.id;

    const card = await Card.findById(cardId, { likedBy: 1 });

    if (!card) {
      return res.status(StatusCodes.NOT_FOUND).send("Card not found.");
    }

    const initialLength = card.likedBy.length;
    card.likedBy = card.likedBy.filter((item) => item.toString() !== userId);

    if (card.likedBy.length === initialLength) {
      return res.status(StatusCodes.OK).send("Card was not liked before.");
    }

    await card.save();

    await sendKafkaMessage("UNLIKE_CARD", req.user.callSign, {
      userId,
      cardId,
    });

    return res.status(StatusCodes.OK).send("Successfully disliked the card.");
  } catch (err) {
    console.error("❌ Error in unlikeACard:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while disliking the card.");
  }
};

//Controller 5
const getLikedCards = async (req, res) => {
  try {
    const { batch, batchSize, key } = req.query;
    const batchNumber = Number(batch) || 1;
    const batchSizeFound = Number(batchSize) || 12;

    const user = await fetchNativeUserData({
      id: req.user.id,
      fields: ["likedCards"],
      callSign: req.user.callSign,
    });

    if (key === "detail") {
      const cardIds = user.likedCards.slice(
        (batchNumber - 1) * batchSizeFound,
        batchNumber * batchSizeFound
      );

      let cards = await Card.find({ _id: { $in: cardIds } }, { vector: 0 });

      // Optional: maintain order as per likedCards
      cards.sort((a, b) => {
        return (
          cardIds.indexOf(a._id.toString()) - cardIds.indexOf(b._id.toString())
        );
      });

      return res.status(StatusCodes.OK).json(cards);
    }

    return res.status(StatusCodes.OK).json({ likedCards: user.likedCards });
  } catch (error) {
    console.error("getLikedCards error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error occurred while fetching the liked cards.");
  }
};

//Controller 6
const getCardFromId = async (req, res) => {
  try {
    const { cardId } = req.body;

    if (!cardId) {
      return res.status(StatusCodes.BAD_REQUEST).send("cardId is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(StatusCodes.BAD_REQUEST).send("Invalid cardId format.");
    }

    const card = await Card.findById(cardId, { vector: 0 });

    if (!card) {
      return res.status(StatusCodes.NOT_FOUND).send("Card not found.");
    }

    return res.status(StatusCodes.OK).json(card);
  } catch (error) {
    console.error("Error in getCardFromId:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the card.");
  }
};

//Controller 7
const getCardsOfUser = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(StatusCodes.BAD_REQUEST).send("userId are required.");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).send("Invalid userId format.");
    }

    const userMetaData = await fetchUserData({
      id: userId,
      fields: ["universeMetaData"],
    });

    const user = await fetchNativeUserData({
      id: userId,
      fields: ["cards", "clubs", "communitiesPartOf", "role", "badges"],
      callSign: userMetaData.universeMetaData.callSign,
    });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found");
    }

    const cardIds = user.cards;
    const clubIds = user.clubs.map((club) => club.clubId.toString()) || [];
    const communityIds = user.communitiesPartOf.map((c) =>
      c.communityId.toString()
    ) || [];

    const badgeIds = user.badges;

    const [cardData, clubData, communityData] = await Promise.all([
      Card.find({ _id: { $in: cardIds } }, { vector: 0 }).lean(),
      fetchMultipleClubsData({
        ids: clubIds,
        fields: ["name", "secondaryImg"],
      }),
      fetchMultipleCommunitiesData({
        ids: communityIds,
        fields: ["title", "secondaryCover"],
      }),
    ]);

    return res.status(StatusCodes.OK).json({
      cardData,
      clubData,
      communityData,
      role: user.role,
      badges: [], // TODO: Fetch badge details once badge service is implemented
    });
  } catch (error) {
    console.error("Error in getCardsOfUser:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching user cards.");
  }
};

//Controller 8
const getCardsFromTag = async (req, res) => {
  try {
    let { tag } = req.body;

    if (!tag || (typeof tag !== "string" && !Array.isArray(tag))) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Tag must be a non-empty string or an array of strings.");
    }

    // Normalize to array of regex patterns
    const tagsArray = Array.isArray(tag)
      ? tag
          .filter((t) => typeof t === "string" && t.trim())
          .map((t) => new RegExp(t.trim(), "i"))
      : [new RegExp(tag.trim(), "i")];

    if (tagsArray.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("At least one valid tag is required.");
    }

    const cards = await Card.aggregate([
      {
        $match: {
          tags: { $in: tagsArray },
        },
      },
      {
        $project: {
          vector: 0,
        },
      },
      {
        $sort: { timeStamp: -1 },
      },
      {
        $limit: 50,
      },
    ]);

    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.error("Error in getCardsFromTag:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching cards by tag.");
  }
};

//Controller 9
const getYourInterests = async (req, res) => {
  try {
    const user = await fetchNativeUserData({
      id: req.user.id,
      fields: ["name", "image", "interests", "cards"],
      callSign: req.user.callSign,
    });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found");
    }

    const cards = user.cards || [];

    const cardData = await Card.find(
      { _id: { $in: cards } },
      { vector: 0 }
    ).lean();

    return res.status(StatusCodes.OK).json({
      profile: {
        name: user.name,
        image: user.image,
        interests: user.interests || [],
      },
      cardData,
    });
  } catch (error) {
    console.error("Error in getYourInterests:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching your interests.");
  }
};

//Controller 10
const getRandomCards = async (req, res) => {
  try {
    const size = parseInt(req.query.size) || 15;

    const cards = await Card.aggregate([
      {
        $match: {
          value: { $exists: true, $nin: [null, ""] },
        },
      },
      { $sample: { size } },
      { $project: { vector: 0 } },
    ]);

    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.error("Error in getRandomCards:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch random cards.");
  }
};

//helper function to find right sequence of event
const fetchRightSequence = async (events) => {
  try {
    const now = new Date();

    // Separate featured and old events
    const featuredEvents = events.filter((e) => e.status === "featured");
    const oldEvents = events.filter((e) => e.status !== "featured");

    // Get all club IDs from featured events
    const clubIds = featuredEvents.map((e) => e.belongsTo.id);

    // Fetch clubs with ratings
    const clubs = await  fetchMultipleClubsData({
        ids: clubIds,
        fields: ["_id", "rating"],
      })

    // Create lookup for club ratings
    const clubRatings = {};
    clubs.forEach((club) => {
      if (
        ["657b9303f18136e2f692398c", "657b97a8f18136e2f69239ab"].includes(
          club._id.toString()
        )
      ) {
        clubRatings[club._id.toString()] = 0;
      } else {
        clubRatings[club._id.toString()] = club.rating || 0;
      }
    });

    // Sort featured events:
    // 1. Active promoted events first (promotionExpiry > now, isPromoted = true)
    // 2. Sort promoted by promotionLevel DESC, then clubRating DESC
    // 3. Then non-promoted events by clubRating DESC
    const sortedFeaturedEvents = featuredEvents.sort((a, b) => {
      const ratingA = clubRatings[a.belongsTo.id] || 0;
      const ratingB = clubRatings[b.belongsTo.id] || 0;

      const aIsActivePromotion =
        a.isPromoted && a.promotionExpiry && new Date(a.promotionExpiry) > now;
      const bIsActivePromotion =
        b.isPromoted && b.promotionExpiry && new Date(b.promotionExpiry) > now;

      if (aIsActivePromotion && !bIsActivePromotion) return -1; // a first
      if (!aIsActivePromotion && bIsActivePromotion) return 1; // b first

      if (aIsActivePromotion && bIsActivePromotion) {
        // Compare promotionLevel first
        if (b.promotionLevel !== a.promotionLevel) {
          return b.promotionLevel - a.promotionLevel;
        }
        // If promotionLevel equal → fallback to rating
        return ratingB - ratingA;
      }

      // If neither promoted → fallback to rating
      return ratingB - ratingA;
    });

    // Final sequence: featured (sorted) first, then old events (untouched)

    return [...sortedFeaturedEvents, ...oldEvents];
  } catch (error) {
    console.log(error);
    return [];
  }
};

//Controller 11
const indexedReturn = async (req, res) => {
  try {
    const { query, mode, updatedVersion } = req.body;

    const lemmatizedTags = lemmatize(query);

    // Fetch related tags for each lemmatized tag
    const relatedTagsArrays = await Promise.all(
      lemmatizedTags.map((tag) => fetchRelatedTags(tag))
    );

    // Flatten all arrays and remove duplicates
    const allTagsSet = new Set([
      ...lemmatizedTags,
      ...relatedTagsArrays.flat().filter(Boolean),
    ]);

    const allTags = Array.from(allTagsSet);

    const regexString = allTags.join(",");

    const user = await fetchNativeUserData({
      id: req.user.id,
      fields: ["clubs", "communitiesPartOf"],
      callSign: req.user.callSign,
    });
    const clubIdsPartOf = user.clubs.map((club) => club.clubId);
    const commIdspartOf = user.communitiesPartOf.map(
      (comm) => comm.communityId
    );

    // Parallel execution of asynchronous operations
    const [
      relatedCards,
      randomCards,
      resources,
      randomResources,
      professors,
      randomProfessors,
      events,
      clubs,
      communities,
    ] = await Promise.all([
      // Fetch related cards
      Card.aggregate([
        {
          $match: {
            tags: { $in: allTags },
            $and: [
              { value: { $exists: true } },
              { value: { $ne: null } },
              { value: { $ne: "" } },
            ],
          },
        },
        { $project: { vector: 0 } },
        { $limit: 30 },
      ]),

      Card.aggregate([
        {
          $match: {
            $and: [
              { value: { $exists: true } },
              { value: { $ne: null } },
              { value: { $ne: "" } },
            ],
          },
        },
        { $sample: { size: 12 } },
        { $project: { vector: 0 } },
      ]),

      // Fetch resources
      fetchRelevantResources(regexString),

      fetchSampleResources(),

      // Fetch professors
      fetchRelevantProfessors(regexString),

      fetchRelevantProfessors(),

      // Fetch events
      fetchPastOrFutureEvents({ mode: "future", size: 15 }),

      // Fetch clubs
      fetchClubsRecommendations({
        nIds: clubIdsPartOf,
      }),

      // Fetch communities
      fetchCommunitiesRecommendations({
        nIds: commIdspartOf,
      }),
    ]);

    const transformedCards = relatedCards.map((card) => ({
      ...card,
      creatorName: card.userMetaData?.name || "Anonymous",
      creatorPic: card.userMetaData?.image || "",
      userPushToken: card.userMetaData?.pushToken || "",
    }));
    let cards = [...transformedCards];

    const uniqueCardIds = new Set(cards.map((c) => c._id.toString()));
    // If not in search mode and fewer than 12 cards, add random cards
    if (mode !== "search" && cards.length < 12) {
      for (let i = 0; i < 12 - cards.length; i++) {
        const randomCard = randomCards[i];
        if (!uniqueCardIds.has(randomCard?._id.toString())) {
          cards.push(randomCard);
        }
      }
    }

    // Ensure resources have at least 6 items
    const resourcesCount = resources.length;

    const uniqueResourceIds = new Set(resources.map((r) => r._id.toString()));
    randomResources.forEach((resource) => {
      if (!uniqueResourceIds.has(resource._id.toString())) {
        resources.push(resource);
        uniqueResourceIds.add(resource._id.toString());
      }
    });
    if (resourcesCount < 6) {
      resources.slice(0, 6);
    } else {
      resources.slice(0, 9);
    }

    // Ensure professors have at least 6 items
    const professorsCount = professors.length;
    const uniqueProfessorIds = new Set(professors.map((p) => p._id.toString()));
    randomProfessors.forEach((professor) => {
      if (!uniqueProfessorIds.has(professor._id.toString())) {
        professors.push(professor);
        uniqueProfessorIds.add(professor._id.toString());
      }
    });
    if (professorsCount < 6) {
      professors.slice(0, 6);
    } else {
      professors.slice(0, 9);
    }

    // Ensure events have atleast 6 items
    let finalEvents = events;
    if (finalEvents.length < 15) {
      const remaining = 10 - finalEvents.length;
      const pastEvents = await fetchPastOrFutureEvents({
        mode: "past",
        size: remaining,
      });
      finalEvents = finalEvents = [...new Map([...events, ...pastEvents].map(e => [e._id.toString(), e])).values()];
    }

    // Respond with all data
    if (updatedVersion) {
      const sequencedEvents = await fetchRightSequence(finalEvents);
      return res.status(StatusCodes.OK).json({
        cards,
        resources,
        professors,
        events: sequencedEvents,
        clubs,
        communities,
      });
    } else {
      return res.status(StatusCodes.OK).json(cards);
    }
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong." });
  }
};

// Controller 12
const queryReturn = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== "string") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Query is required." });
    }

    const lemmatizedTags = lemmatize([query]); // assume this returns a string array
    const allTags = (await fetchRelatedTags(lemmatizedTags)) || [query];
    const regexString = allTags.join(","); // create comma-separated string of tags

    const [relatedCards, resources, professors, events, clubs, communities] =
      await Promise.all([
        // Related Cards
        Card.aggregate([
          {
            $match: {
              tags: { $in: allTags },
              $and: [
                { value: { $exists: true } },
                { value: { $ne: null } },
                { value: { $ne: "" } },
              ],
            },
          },
          { $project: { vector: 0 } },
          { $limit: 30 },
        ]),

        // Other modules with regexString passed
        fetchRelevantResources(regexString),
        fetchRelevantProfessors(regexString),
        fetchRelevantEvents(regexString),
        fetchRelevantClubs(regexString),
        fetchRelevantCommunities(regexString),
      ]);

    return res.status(StatusCodes.OK).json({
      cards: relatedCards,
      resources,
      professors,
      events,
      clubs,
      communities,
    });
  } catch (error) {
    console.error("Error in queryReturn:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong." });
  }
};

//Controller 13
const getCardsByIds = async (req, res) => {
  try {
    const { ids, select } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "An array of card IDs is required." });
    }

    let query = Card.find({ _id: { $in: ids } });

    // Always exclude vector, but allow other selects
    if (select && typeof select === "string" && select.trim().length > 0) {
      query = query.select(`${select.trim()}`);
    } else {
      query = query.select("-vector");
    }

    const data = await query.lean();
    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.error("Error fetching cards:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Server error while fetching cards." });
  }
};

const getRandomCardsForFeed = async (req, res) => {
  try {
    const { size = 6 } = req.query;

    const sampleSize = Math.max(parseInt(size), 1); // Ensure valid sample size

    const cards = await Card.aggregate([
      {
        $match: {
          $expr: {
            $gt: [
              { $size: { $split: [{ $ifNull: ["$value", ""] }, " "] } },
              24,
            ],
          },
        },
      },
      { $sample: { size: sampleSize } },
      { $project: { vector: 0 } }, // exclude vector from result
    ]);

    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.error("Error fetching random cards for feed:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

const getSearchedCards = async(req,res) => {
  try{
    const {query} = req.query;
    const cards = await Card.aggregate([
        {
          $search: {
            index: "default",
            compound: {
              should: [
                {
                  autocomplete: {
                    query,
                    path: "value",
                    fuzzy: { maxEdits: 1 },
                  },
                },
                { text: { query, path: "tags", fuzzy: { maxEdits: 1 } } },
              ],
            },
          },
        },
        {
          $project: {
            value: 1,
            tags: 1,
            creator: 1,
            userMetaData: 1,
            vector: 1,
            type: { $literal: "card" },
            score: { $meta: "searchScore" },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 12 },
      ]);

      return res.status(StatusCodes.OK).json({success:true,data:cards});

  }catch(err){
    console.log("Error fetching searched cards:",err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({success:false,msg:"Something went wrong!"})
  }
}

module.exports = {
  createCard,
  deleteCard,
  likeACard,
  unlikeACard,
  getLikedCards,
  getCardFromId,
  getCardsOfUser,
  getCardsFromTag,
  getYourInterests,
  getRandomCards,
  queryReturn,
  getCardsByIds,
  getRandomCardsForFeed,
  indexedReturn,
  getSearchedCards
};
