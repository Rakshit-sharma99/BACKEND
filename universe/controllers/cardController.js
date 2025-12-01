const { StatusCodes } = require("http-status-codes");
const User = require("../models/user");
const Card = require("../models/card");
const Resource = require("../models/resource");
const Club = require("../models/club");
const Community = require("../models/community");
const Badge = require("../models/badge");
const Event = require("../models/event");
const schedule = require("node-schedule");
const { OpenAI } = require("openai");
const {
  lemmatize,
  getRelatedTags,
} = require("../controllers/commonControllers");
const user = require("../models/user");
const macbeaseContent = require("../models/macbeaseContent");
const content = require("../models/content");
const { updateUserIP } = require("./utils");
const event = require("../models/event");

//Controller 1
const createCard = async (req, res) => {
  if (req.user.role === "user") {
    const { value, tags } = req.body;
    let lemmatizedTags = lemmatize(tags);
    const userInfo = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
      course: 1,
      _id: 0,
    });
    const card = await Card.create({
      value,
      tags: lemmatizedTags,
      creator: req.user.id,
      time: new Date(),
      userMetaData: userInfo,
    });

    //scheduling job for updating card feed
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(`feedCard_${req.user.id}`, threeSec, async () => {
      try {
        const relatedUsers = await getRelatedUsersForFeed(lemmatizedTags);
        let users = await User.find(
          { _id: { $in: relatedUsers } },
          { cardFeed: 1 }
        );
        let bulkOperations = users.map((user) => {
          let previousCards = user.cardFeed;
          if (previousCards.length > 6) {
            previousCards = previousCards.slice(-6);
          }
          return {
            updateOne: {
              filter: { _id: user._id },
              update: {
                $set: {
                  cardFeed: [
                    {
                      ...card._doc,
                      creatorName: card.userMetaData.name,
                      creatorPic: card.userMetaData.image,
                      userPushToken: card.userMetaData.pushToken,
                    },
                    ...previousCards,
                  ],
                },
              },
            },
          };
        });
        if (bulkOperations.length > 0) {
          await User.bulkWrite(bulkOperations);
        }
      } catch (error) {
        console.log(error);
      }
    });

    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      user.cards.push(card._id);
      user.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send("The card has been successfully created.");
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to create cards.");
  }
};

//Controller 2
const deleteCard = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { cardId } = req.body;
    await Card.findByIdAndDelete({ _id: cardId });
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      let cards = user.cards;
      cards = cards.filter((item) => item.toString() !== cardId);
      user.cards = [];
      user.cards = cards;
      user.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send("The card hs been successfully deleted.");
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to delete the cards.");
  }
};

//Controller 3
const likeACard = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to like a card.");
    }

    const { cardId, creatorId } = req.body;
    const userId = req.user.id;

    // Fetch user, creator, and card in parallel
    const [user, creator, card] = await Promise.all([
      User.findById(userId, { likedCards: 1, unreadNotice: 1 }),
      User.findById(creatorId, { unreadNotice: 1 }),
      Card.findById(cardId, { likedBy: 1 }),
    ]);

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.");
    }
    if (!creator) {
      return res.status(StatusCodes.NOT_FOUND).send("Creator not found.");
    }
    if (!card) {
      return res.status(StatusCodes.NOT_FOUND).send("Card not found.");
    }

    // Avoid duplicate likes
    if (!user.likedCards.includes(cardId)) {
      user.likedCards.push(cardId);
    }

    user.unreadNotice.push({
      key: "likedACard",
      value: "You have liked a card.",
      data: { cardId, creatorId },
    });

    creator.unreadNotice.push({
      key: "likedACard",
      value: "Someone has liked your card.",
      data: { cardId, userId },
    });

    // Avoid duplicate entries in likedBy
    if (!card.likedBy.includes(userId)) {
      card.likedBy.push(userId);
    }

    // Save all updates in parallel
    await Promise.all([user.save(), creator.save(), card.save()]);

    return res.status(StatusCodes.OK).send("You have liked the card.");
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while liking the card.");
  }
};

//Controller 4
const getLikedCards = async (req, res) => {
  try {
    if (req.user.role === "user") {
      const { key, batch, batchSize } = req.query;
      let batchNumber = batch || 1;
      const batchSizeFound = batchSize || 12;
      const user = await User.findById(req.user.id, { likedCards: 1, _id: 0 });
      let cards = [];
      if (key === "detail") {
        const cardIds = user.likedCards.slice(
          (batchNumber - 1) * batchSizeFound,
          batchNumber * batchSizeFound
        );
        cards = await Card.find({ _id: { $in: cardIds } }, { vector: 0 });
        return res.status(StatusCodes.OK).json(cards);
      }
      return res.status(StatusCodes.OK).json({ likedCards: user.likedCards });
    } else {
      return res
        .status(StatusCodes.OK)
        .send("You are not authorized to read the liked cards.");
    }
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error occured while fetching the liked cards.");
  }
};

//Controller 5
const getCardFromId = async (req, res) => {
  const { cardId } = req.body;
  let card = await Card.findById(cardId);
  return res.status(StatusCodes.OK).json(card);
};

//Controller 6
const getCardsOfUser = async (req, res) => {
  try {
    const { userId } = req.query;
    const user = await User.findById(userId, {
      cards: 1,
      clubs: 1,
      communitiesPartOf: 1,
      role: 1,
      badges: 1,
      _id: 0,
    }).lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found");
    }
    const cardIds = user.cards;
    const clubIds = user.clubs.map((club) => club.clubId.toString());
    const communityIds = user.communitiesPartOf.map((community) =>
      community.communityId.toString()
    );
    const badgeIds = user.badges;
    const [cardData, clubData, communityData, badges] = await Promise.all([
      Card.find({ _id: { $in: cardIds } }, { vector: 0 }).lean(),
      Club.find({ _id: { $in: clubIds } }, { name: 1, secondaryImg: 1 }).lean(),
      Community.find(
        { _id: { $in: communityIds } },
        { title: 1, secondaryCover: 1 }
      ).lean(),
      Badge.find({ _id: { $in: badgeIds } }).lean(),
    ]);
    return res.status(StatusCodes.OK).json({
      cardData,
      clubData,
      communityData,
      role: user.role,
      badges,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching user cards.");
  }
};

//Controller 7
const getCardsFromTag = async (req, res) => {
  const { tag } = req.body;
  const cards = await Card.find({ tags: new RegExp(tag, "i", "g") }).sort({
    time: "-1",
  });
  let finalData = [];
  let len = cards.length;
  for (let i = 0; i < len; i++) {
    let card = cards[i]._doc;
    let id = card.creator;
    let userInfo = await User.findById(id, { name: 1, image: 1, _id: 0 });
    let data = {
      ...card,
      creatorName: userInfo.name,
      creatorPic: userInfo.image,
    };
    finalData.push(data);
  }
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 8
const saveInterest = async (req, res) => {
  if (req.user.role === "user") {
    const { interests } = req.body;
    let lemmantized = lemmatize(interests);
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      user.interests = [];
      user.interests = lemmantized;
      user.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send("Successfully updated interests.");
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to save interests.");
  }
};

//Controller 9
const getYourInterests = async (req, res) => {
  if (req.user.role === "user") {
    let user = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      interests: 1,
      cards: 1,
      _id: 0,
    });
    let cards = user.cards;
    let len = cards.length;
    let cardData = [];
    for (let i = 0; i < len; i++) {
      let card = cards[i];
      let cardDataPoint = await Card.findById(card);
      if (cardDataPoint) {
        cardData.push(cardDataPoint);
      }
    }
    return res.status(StatusCodes.OK).json({
      profile: {
        name: user.name,
        image: user.image,
        interests: user.interests,
      },
      cardData,
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to read interests.");
  }
};

//Controller 10
const getAllCards = async (req, res) => {
  const { key } = req.query;
  const cards = await Card.find({}).limit(key);
  let finalData = [];
  let len = cards.length;
  for (let i = 0; i < len; i++) {
    let card = cards[i]._doc;
    let id = card.creator;
    let userInfo = await User.findById(id, { name: 1, image: 1, _id: 0 });
    let data = {
      ...card,
      creatorName: userInfo.name,
      creatorPic: userInfo.image,
    };
    finalData.push(data);
  }
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 11
const unlikeACard = async (req, res) => {
  try {
    const { cardId } = req.body;
    const userId = req.user.id;

    const [user, card] = await Promise.all([
      User.findById(userId, { likedCards: 1 }),
      Card.findById(cardId, { likedBy: 1 }),
    ]);

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found.");
    }
    if (!card) {
      return res.status(StatusCodes.NOT_FOUND).send("Card not found.");
    }

    // Remove the cardId from the user's likedCards if it exists
    user.likedCards = user.likedCards.filter(
      (item) => item.toString() !== cardId
    );

    // Remove the userId from the card's likedBy if it exists
    card.likedBy = card.likedBy.filter((item) => item.toString() !== userId);

    // Save both documents in parallel for better performance
    await Promise.all([user.save(), card.save()]);

    return res.status(StatusCodes.OK).send("Successfully disliked the card.");
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while disliking the card.");
  }
};

//Controller 12
const getUserBio = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { userId } = req.query;
    User.findById(userId, (err, user) => {
      if (err) return console.error(err);
      let data = { name: "", image: "", course: "", clubsNo: 0 };
      data.name = user.name;
      data.image = user.image;
      data.course = user.course;
      data.clubsNo = user.communitiesPartOf.length;
      return res.status(StatusCodes.OK).json(data);
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to read the bio of user.");
  }
};

//Controller 13
const getPeopleRelatedToYou = async (req, res) => {
  try {
    const { interests } = req.query;
    let dataPoints = [];
    if (interests) {
      dataPoints = JSON.parse(interests);
      console.log("dp", dataPoints);
    } else {
      const user = await User.findById(req.user.id, { interests: 1, _id: 0 });
      dataPoints = user.interests;
    }
    let allTags = await getRelatedTags(dataPoints);
    let finalData = await User.find(
      { interests: { $in: allTags } },
      { name: 1, image: 1, _id: 1, pushToken: 1, course: 1 }
    );
    let uniqueData = [];
    let seenNames = new Set();
    finalData.forEach((user) => {
      if (!seenNames.has(user.name)) {
        seenNames.add(user.name);
        uniqueData.push(user);
      }
    });
    const sample = await User.aggregate([
      { $sample: { size: 6 } },
      { $project: { name: 1, image: 1, _id: 1, pushToken: 1, course: 1 } },
    ]);
    uniqueData = [...sample, ...uniqueData];
    return res.status(StatusCodes.OK).json(uniqueData);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error finding people");
  }
};

//Controller 14
const getRandomCards = async (req, res) => {
  const cards = await Card.aggregate([
    {
      $match: {
        $and: [
          { value: { $exists: true } },
          { value: { $ne: null } },
          { value: { $ne: "" } },
        ],
      },
    },
    { $sample: { size: 15 } },
    { $project: { vector: 0 } },
  ]);
  let finalData = [];
  let len = cards.length;
  for (let i = 0; i < len; i++) {
    let card = cards[i];
    let id = card.creator;
    let userInfo = await User.findById(id, {
      name: 1,
      image: 1,
      _id: 0,
      pushToken: 1,
    });
    if (userInfo) {
      let data = {
        ...card,
        creatorName: userInfo.name,
        creatorPic: userInfo.image,
        userPushToken: userInfo.pushToken,
      };
      finalData.push(data);
    }
  }
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 15
const indexedReturn = async (req, res) => {
  try {
    const { query, mode, updatedVersion } = req.body;

    const lemmatizedTags = lemmatize(query);
    let allTags = await getRelatedTags(lemmatizedTags);

    if (allTags.length > 12) {
      allTags = allTags.sort(() => Math.random() - 0.5).slice(0, 12);
    }

    const regexPatterns = allTags.map((str) => new RegExp(str, "i"));

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
      Resource.find({
        $or: [
          { title: { $in: regexPatterns } },
          { description: { $in: regexPatterns } },
        ],
      }).lean(),

      Resource.aggregate([{ $sample: { size: 6 } }]),

      // Fetch professors
      User.find(
        {
          $and: [
            { profession: "Professor" },
            { course: { $in: regexPatterns } },
          ],
        },
        { name: 1, image: 1, pushToken: 1, course: 1 }
      ),

      User.aggregate([
        {
          $match: {
            profession: "Professor",
          },
        },
        {
          $sample: { size: 6 },
        },
        {
          $project: {
            name: 1,
            image: 1,
            pushToken: 1,
            course: 1,
          },
        },
      ]),

      // Fetch events

      Event.aggregate([
        { $match: { eventDate: { $gte: new Date() } } },
        { $sort: { eventDate: 1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "itineraries",
            localField: "_id",
            foreignField: "eventId",
            as: "itineraries",
          },
        },
        { $project: { bookedBy: 0 } },
      ]),

      // Fetch clubs
      Club.aggregate([
        { $match: { members: { $ne: req.user.id } } },
        { $project: { secondaryImg: 1, name: 1, tags: 1, motto: 1, _id: 1 } },
        { $sample: { size: 6 } },
      ]),

      // Fetch communities
      Community.aggregate([
        { $match: { members: { $ne: req.user.id } } },
        {
          $project: {
            secondaryCover: 1,
            title: 1,
            tag: 1,
            activeMembers: 1,
            label: 1,
            _id: 1,
          },
        },
        { $sample: { size: 6 } },
      ]),
    ]);

    // Process cards
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
      console.log("Entered if");
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
    if (finalEvents.length < 10) {
      const remaining = 10 - finalEvents.length;
      const pastEvents = await Event.aggregate([
        { $match: { eventDate: { $lt: new Date() } } },
        { $sort: { eventDate: -1 } },
        { $limit: remaining },
        {
          $lookup: {
            from: "itineraries",
            localField: "_id",
            foreignField: "eventId",
            as: "itineraries",
          },
        },
        { $project: { bookedBy: 0 } },
      ]);
      finalEvents = [...events, ...pastEvents];
    }

    // Respond with all data
    if (updatedVersion) {
      return res.status(StatusCodes.OK).json({
        cards,
        resources,
        professors,
        events: finalEvents,
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

//function to get interested users for the feed
async function getRelatedUsersForFeed(query) {
  let finalData = await getRelatedTags(query);
  let uniqueUsers = new Set();
  let pipeline2 = [
    {
      $match: {
        interests: {
          $in: finalData.map((interest) => new RegExp(interest, "i")),
        },
      },
    },
    {
      $project: {
        _id: 1,
      },
    },
  ];
  let users = await User.aggregate(pipeline2);
  users.forEach((user) => uniqueUsers.add(user._id.toString()));
  return Array.from(uniqueUsers);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const vectorEmbedding = async (req, res) => {
  // const url = 'https://api.openai.com/v1/embeddings';
  try {
    let cards = await Card.find({});
    for (let i = 0; i < cards.length; i++) {
      let card = cards[i];
      let text = card.value;
      // const embedding = await axios.post(
      //   url,
      //   {
      //     input: text,
      //     model: 'text-embedding-3-small',
      //   },
      //   {
      //     headers: {
      //       Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      //       'Content-Type': 'application/json',
      //     },
      //   }
      // );

      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float",
      });

      console.log("embedding", embedding.data[0].embedding);
      card.vector = embedding.data[0].embedding;
      card.save();
    }
    return res.status(StatusCodes.OK).send("Successful");
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const vectorQuery = async (req, res) => {
  // const url = 'https://api.openai.com/v1/embeddings';
  const { query } = req.query;
  try {
    // const embedding = await axios.post(
    //   url,
    //   {
    //     input: query,
    //     model: 'text-embedding-3-small',
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    //       'Content-Type': 'application/json',
    //     },
    //   }
    // );

    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      encoding_format: "float",
    });

    const cards = await Card.aggregate([
      {
        $vectorSearch: {
          queryVector: embedding.data[0].embedding,
          path: "vector",
          numCandidates: 100,
          limit: 5,
          index: "vector",
        },
      },
      {
        $project: {
          value: 1,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const redundant = async (req, res) => {
  try {
    await updateUserIP({
      userId: req.user.id,
      ipChange: +2,
      c_source: "user",
      d_source: "user",
      c_ref: req.user.id,
      d_ref: req.user.id,
      description: "Test",
    });
    return res.status(StatusCodes.OK).send("done");
  } catch (error) {
    console.error("Error updating user professions:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong.",
      error: error.message,
    });
  }
};

const queryReturn = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== "string") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Query is required." });
    }
    const lemmatizedTags = lemmatize([query]);
    let allTags = (await getRelatedTags(lemmatizedTags)) || [query];

    const regexPatterns = allTags.map((str) => new RegExp(str, "i"));
    const [relatedCards, resources, professors, events, clubs, communities] =
      await Promise.all([
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
        // Fetch resources
        Resource.find({
          $or: [
            { title: { $in: regexPatterns } },
            { description: { $in: regexPatterns } },
          ],
        }).lean(),
        // Fetch professors
        User.find(
          {
            profession: "Professor",
            $or: [
              { course: { $in: regexPatterns } },
              { field: { $in: regexPatterns } },
            ],
          },
          { name: 1, image: 1, pushToken: 1, course: 1 }
        ),
        // Fetch events
        Event.find(
          {
            $or: [
              { name: { $in: regexPatterns } },
              { description: { $in: regexPatterns } },
            ],
          },
          { faq: 0, bookedBy: 0 }
        ),
        // Fetch clubs
        Club.find(
          {
            $or: [
              { name: { $in: regexPatterns } },
              { motto: { $in: regexPatterns } },
              { tags: { $in: regexPatterns } },
            ],
          },
          { secondaryImg: 1, name: 1, tags: 1, motto: 1, _id: 1 }
        ),
        // Fetch communities
        Community.find(
          {
            $or: [
              { title: { $in: regexPatterns } },
              { label: { $in: regexPatterns } },
              { tag: { $in: regexPatterns } },
            ],
          },
          {
            secondaryCover: 1,
            title: 1,
            tag: 1,
            activeMembers: 1,
            label: 1,
            _id: 1,
          }
        ),
      ]);
    const transformedCards = relatedCards.map((card) => ({
      ...card,
      creatorName: card.userMetaData?.name || "Unknown",
      creatorPic: card.userMetaData?.image || "",
      userPushToken: card.userMetaData?.pushToken || "",
    }));
    return res.status(StatusCodes.OK).json({
      cards: transformedCards,
      resources,
      professors,
      events,
      clubs,
      communities,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong." });
  }
};

const modifyCard = async (req, res) => {
  try {
    const cards = await Card.find({});

    for (let i = 0; i < cards.length; i++) {
      let card = cards[i];

      let text = card.value;
      let name = card.userMetaData?.name || "";

      if (text) {
        text = text
          .replace(/\ba null\b/gi, name)
          .replace(/\bnull\b/gi, name)
          .replace(/\ba null user\b/gi, name)
          .replace(/\ba null enthusiast\b/gi, name)
          .replace(/\[user\]/gi, name)
          .replace(/\[name\]/gi, name);

        card.value = text;
      }
      await card.save();
    }

    return res.status(StatusCodes.OK).send("Cards updated successfully");
  } catch (error) {
    console.error("Error modifying cards:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while updating cards");
  }
};

const getCardsByIds = async (req, res) => {
  try {
    const { ids, select } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Array of IDs is required." });
    }

    let query = Card.find({ _id: { $in: ids } });

    // Apply select only if valid fields are passed
    if (select && typeof select === "string" && select.trim().length > 0) {
      query = query.select(select);
    }

    const data = await query.lean();
    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.error("Error fetching cards", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

const getRandomCardsForFeed = async (req, res) => {
  try {
    const { size = 6 } = req.query;

    const sampleSize = Math.max(parseInt(size), 1); // Ensuring size is at least 1

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
      { $project: { vector: 0 } },
    ]);

    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.error("Error fetching cards:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

module.exports = {
  redundant,
  vectorQuery,
  vectorEmbedding,
  createCard,
  deleteCard,
  likeACard,
  getLikedCards,
  getCardFromId,
  getCardsOfUser,
  getCardsFromTag,
  saveInterest,
  getYourInterests,
  getAllCards,
  unlikeACard,
  getUserBio,
  getPeopleRelatedToYou,
  getRandomCards,
  indexedReturn,
  queryReturn,
  modifyCard,
  getCardsByIds,
  getRandomCardsForFeed,
};
