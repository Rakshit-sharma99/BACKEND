import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import User from '../models/user.model';
import Community from '../models/community.model';
import Club from '../models/club.model';

// Controller 1
/**
 * @desc    Add a shortcut to the user's profile (Community, Club, People)
 * @route   POST /shortcuts/add
 * @access  User
 */
const addToShortCut = async (req: Request, res: Response) => {
  try {
    const { type, id, name, secondary, secondaryImg, img, userPushToken } = req.body;
    const userId = req.user.id;
    if (!['community', 'club', 'people'].includes(type) || !id || !name) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid input data.' });
    }
    const user = await User.findById(userId, { shortCuts: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });
    }

    if (user.shortCuts?.some((item) => item.id.toString() === id)) {
      return res.status(StatusCodes.OK).json({ message: 'Shortcut already exists!' });
    }

    let shortcutItem;
    let entityModel;

    switch (type) {
      case 'community':
        entityModel = await Community.findById(id, { pinnedBy: 1 });
        if (!entityModel)
          return res.status(StatusCodes.NOT_FOUND).json({ message: 'Community not found.' });
        entityModel.pinnedBy.push(new mongoose.Types.ObjectId(userId));
        shortcutItem = { type, name, secondary, id, metaData: { posts: 0 } };
        break;
      case 'club':
        entityModel = await Club.findById(id, { pinnedBy: 1 });
        if (!entityModel)
          return res.status(StatusCodes.NOT_FOUND).json({ message: 'Club not found.' });
        entityModel?.pinnedBy?.push(new mongoose.Types.ObjectId(userId));
        shortcutItem = {
          type,
          name,
          secondaryImg,
          id,
          metaData: { posts: 0, notifications: 0, messages: 0 },
        };
        break;
      case 'people':
        entityModel = await User.findById(id, { pinnedBy: 1 });
        if (!entityModel)
          return res.status(StatusCodes.NOT_FOUND).json({ message: 'User not found.' });
        entityModel?.pinnedBy?.push(userId);
        shortcutItem = { type, name, img, id, userPushToken, metaData: { messages: 0 } };
        break;
    }

    user?.shortCuts?.push(shortcutItem);
    await Promise.all([user.save(), entityModel?.save()]);

    return res.status(StatusCodes.CREATED).json({ message: 'Shortcut added successfully!' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 2
/**
 * @desc    Remove a shortcut from the user's profile
 * @route   DELETE /shortcuts/:id
 * @access  User
 */
const removeFromShortCut = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid shortcut ID.' });
    }

    const user = await User.findById(userId, { shortCuts: 1 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });
    }

    const shortcut = user?.shortCuts?.find((item) => item.id.toString() === id);
    if (!shortcut) {
      return res.status(StatusCodes.OK).json({ message: 'Shortcut already removed!' });
    }

    user.shortCuts = user?.shortCuts?.filter((item) => item.id.toString() !== id);
    let entityModel;

    switch (shortcut.type) {
      case 'community':
        entityModel = await Community.findById(id, { pinnedBy: 1 });
        break;
      case 'club':
        entityModel = await Club.findById(id, { pinnedBy: 1 });
        break;
      case 'people':
        entityModel = await User.findById(id, { pinnedBy: 1 });
        break;
    }

    if (entityModel) {
      entityModel.pinnedBy = entityModel?.pinnedBy?.filter((item) => item.toString() !== userId);
      await entityModel.save();
    }

    await user.save();

    return res.status(StatusCodes.OK).json({ message: 'Shortcut successfully removed!' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error', error });
  }
};

// Controller 3
/**
 * @desc Fetch user's shortcuts
 * @route GET /shortcuts/read
 * @access User
 */
const readShortCuts = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, { shortCuts: 1, _id: 0 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });
    }
    return res.status(StatusCodes.OK).json(user.shortCuts || []);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error.', error });
  }
};

// Controller 4
/**
 * @desc Search for communities and clubs
 * @route GET /shortcuts/social-search?query=keyword
 * @access User
 */
const simpleSocialSearch = async (req: Request, res: Response) => {
  const { query } = req.query;
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid query parameter.' });
  }
  try {
    const [communities, clubs] = await Promise.all([
      Community.find(
        { title: new RegExp(query, 'ig') },
        { secondaryCover: 1, title: 1, tag: 1, activeMembers: 1, label: 1, _id: 1 },
      ),
      Club.find(
        { name: new RegExp(query, 'ig') },
        { secondaryImg: 1, name: 1, tags: 1, motto: 1, _id: 1 },
      ),
    ]);
    return res.status(StatusCodes.OK).json({ clubs, communities });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error.', error });
  }
};

// Controller 5
/**
 * @desc Refresh user's shortcuts with updated data
 * @route GET /shortcuts/refresh
 * @access User
 */
const getRefreshedShortCuts = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.id, { shortCuts: 1, _id: 0 });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });
    }

    const shortcuts = user.shortCuts || [];
    const shortcutIds = shortcuts.map((item) => item.id);

    const [communities, clubs, people] = await Promise.all([
      Community.find({ _id: { $in: shortcutIds } }, { title: 1, secondaryCover: 1 }),
      Club.find({ _id: { $in: shortcutIds } }, { name: 1, secondaryImg: 1 }),
      User.find({ _id: { $in: shortcutIds } }, { name: 1, image: 1, pushToken: 1 }),
    ]);

    const socialArr = shortcuts
      .map((shortcut) => {
        if (shortcut.type === 'community') {
          const community = communities.find((c) => c.id.toString() === shortcut.id);
          return community
            ? { ...shortcut, name: community.title, secondary: community.secondaryCover }
            : null;
        }
        if (shortcut.type === 'club') {
          const club = clubs.find((c) => c.id.toString() === shortcut.id);
          return club ? { ...shortcut, name: club.name, secondaryImg: club.secondaryImg } : null;
        }
        return null;
      })
      .filter(Boolean);

    const peopleArr = shortcuts
      .map((shortcut) => {
        if (shortcut.type === 'people') {
          const person = people.find((p) => p.id.toString() === shortcut.id);
          return person
            ? { ...shortcut, name: person.name, img: person.image, userPushToken: person.pushToken }
            : null;
        }
        return null;
      })
      .filter(Boolean);

    return res.status(StatusCodes.OK).json({ socialArr, peopleArr });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

export {
  addToShortCut,
  removeFromShortCut,
  readShortCuts,
  simpleSocialSearch,
  getRefreshedShortCuts,
};
