const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const Community = require('../models/community');
const Club = require('../models/club');
const { default: mongoose } = require('mongoose');

//Controller 1
const addToShortCut = async (req, res) => {
  const { type, id } = req.body;
  if (!['community', 'club', 'people'].includes(type)) {
    return res.status(StatusCodes.BAD_REQUEST).send('Invalid type.');
  }
  try {
    const user = await User.findById(req.user.id, { shortCuts: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send('User not found.');
    }
    const index = user.shortCuts.findIndex((item) => item.id.toString() === id);
    if (index !== -1) {
      return res.status(StatusCodes.OK).send('Shortcut already exist!');
    }
    let shortcutItem;
    switch (type) {
      case 'community': {
        const { name, secondary, id } = req.body;
        if (!name || !secondary || !id) {
          return res
            .status(StatusCodes.BAD_REQUEST)
            .send('Incomplete data for adding community as a shortcut.');
        }
        shortcutItem = { type, name, secondary, id, metaData: { posts: 0 } };

        const community = await Community.findById(id, { pinnedBy: 1 });
        if (!community) {
          return res.status(StatusCodes.NOT_FOUND).send('Community not found.');
        }
        community.pinnedBy.push(mongoose.Types.ObjectId(req.user.id));
        await community.save();
        break;
      }

      case 'club': {
        const { name, secondaryImg, id } = req.body;
        if (!name || !secondaryImg || !id) {
          return res
            .status(StatusCodes.BAD_REQUEST)
            .send('Incomplete data for adding club as a shortcut.');
        }
        shortcutItem = {
          type,
          name,
          secondaryImg,
          id,
          metaData: { posts: 0, notifications: 0, messages: 0 },
        };
        const club = await Club.findById(id, { pinnedBy: 1 });
        if (!club) {
          return res.status(StatusCodes.NOT_FOUND).send('Club not found.');
        }
        club.pinnedBy.push(mongoose.Types.ObjectId(req.user.id));
        await club.save();
        break;
      }

      case 'people': {
        const { name, img, id, userPushToken } = req.body;
        if (!name || !img || !id || !userPushToken) {
          return res
            .status(StatusCodes.BAD_REQUEST)
            .send('Incomplete data for adding person as a shortcut.');
        }
        shortcutItem = {
          type,
          name,
          img,
          id,
          userPushToken,
          metaData: { messages: 0 },
        };
        const concernedUser = await User.findById(id, { pinnedBy: 1 });
        if (!concernedUser) {
          return res.status(StatusCodes.NOT_FOUND).send('User not found.');
        }
        concernedUser.pinnedBy.push(mongoose.Types.ObjectId(req.user.id));
        await concernedUser.save();
        break;
      }
    }
    user.shortCuts = [...user.shortCuts, shortcutItem];
    await user.save();
    return res
      .status(StatusCodes.OK)
      .send(`${type} shortcut added successfully!`);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

//Controller 2
const removeFromShortCut = async (req, res) => {
  const { id, type } = req.body;
  let mode = type;
  if (!id) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send('Provide valid shortcut valid.');
  }
  try {
    const user = await User.findById(req.user.id, { shortCuts: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send('User not found.');
    }
    let shortcuts = user.shortCuts;
    if (!mode) {
      const matched = shortcuts.filter((item) => item.id.toString() === id)[0];
      if (!matched) {
        return res
          .status(StatusCodes.OK)
          .send('ShortCut successfully removed!');
      }
      mode = matched.type;
    }
    shortcuts = shortcuts.filter((item) => item.id.toString() !== id);
    user.shortCuts = shortcuts;
    if (mode === 'community') {
      const community = await Community.findById(id, { pinnedBy: 1 });
      const filteredArray = community.pinnedBy.filter(
        (item) => item.toString() !== req.user.id
      );
      community.pinnedBy = filteredArray;
      await community.save();
    } else if (mode === 'club') {
      const club = await Club.findById(id, { pinnedBy: 1 });
      const filteredArray = club.pinnedBy.filter(
        (item) => item.toString() !== req.user.id
      );
      club.pinnedBy = filteredArray;
      await club.save();
    } else if (mode === 'people') {
      const people = await User.findById(id, { pinnedBy: 1 });
      const filteredArray = people.pinnedBy.filter(
        (item) => item.toString() !== req.user.id
      );
      people.pinnedBy = filteredArray;
      await people.save();
    }
    await user.save();
    return res.status(StatusCodes.OK).send('ShortCut successfully removed!');
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

//Controller 3
const readShortCuts = async (req, res) => {
  let shortCuts = await User.findById(req.user.id, { shortCuts: 1, _id: 0 });
  shortCuts = shortCuts.shortCuts;
  return res.status(StatusCodes.OK).json(shortCuts);
};

//Controller 4
const simpleSocialSearch = async (req, res) => {
  const { query } = req.query;
  const communities = await Community.find(
    { title: new RegExp(query, 'i', 'g') },
    {
      secondaryCover: 1,
      title: 1,
      tag: 1,
      activeMembers: 1,
      label: 1,
      _id: 1,
    }
  );
  const clubs = await Club.find(
    { name: new RegExp(query, 'i', 'g') },
    {
      secondaryImg: 1,
      name: 1,
      tags: 1,
      motto: 1,
      _id: 1,
    }
  );
  return res.status(StatusCodes.OK).json({ clubs, communities });
};

//Controller 5
const getRefreshedShortCuts = async (req, res) => {
  try {
    const shortCuts = await User.findById(req.user.id, {
      shortCuts: 1,
      _id: 0,
    });
    const dataPoints = shortCuts.shortCuts;
    const len = dataPoints.length;
    let socialArr = [];
    let peopleArr = [];
    for (let i = 0; i < len; i++) {
      const point = dataPoints[i];
      if (point.type === 'community') {
        const comm = await Community.findById(point.id, {
          title: 1,
          secondaryCover: 1,
        });
        const obj = {
          type: point.type,
          name: comm.title,
          secondary: comm.secondaryCover,
          id: point.id,
        };
        socialArr.push(obj);
      } else if (point.type === 'club') {
        const club = await Club.findById(point.id, {
          name: 1,
          secondaryImg: 1,
        });
        const obj = {
          type: point.type,
          name: club.name,
          secondaryImg: club.secondaryImg,
          id: point.id,
        };
        socialArr.push(obj);
      } else if (point.type === 'people') {
        const people = await User.findById(point.id, {
          name: 1,
          image: 1,
          pushToken: 1,
        });
        const obj = {
          type: point.type,
          name: people.name,
          img: people.image,
          id: point.id,
          userPushToken: people.pushToken,
        };
        peopleArr.push(obj);
      }
    }
    return res.status(StatusCodes.OK).json({ socialArr, peopleArr });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

module.exports = {
  addToShortCut,
  removeFromShortCut,
  readShortCuts,
  simpleSocialSearch,
  getRefreshedShortCuts,
};
