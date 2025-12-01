import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Bag from '../models/bag.model';
import Unsorted from '../models/unsorted.model';

/**
 *
 * @desc Create a new bag with keywords and manage unsorted words
 * @route POST /bags
 * @access Admin
 */
const createBag = async (req: Request, res: Response): Promise<Response> => {
  if (req.user.role !== 'admin') {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to create a bag.' });
  }

  try {
    const { keyWords, title, unsorted } = req.body;
    const bag = await Bag.create({ keyWords, title });

    // Delete matching unsorted word and create a new one if provided
    await Promise.all([
      Unsorted.findOneAndDelete({ word: new RegExp(keyWords[0], 'i') }),
      unsorted ? Unsorted.create({ word: unsorted }) : null,
    ]);
    return res.status(StatusCodes.CREATED).json(bag);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error creating bag.', error });
  }
};

/**
 * @desc Search for bags by a tag
 * @route GET /search
 * @access Admin, User
 */
const searchBags = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!['admin', 'user'].includes(req.user.role)) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to search bags.' });
    }

    const { tag } = req.body;
    const regex = new RegExp(tag, 'i');

    // Optimized DB query using aggregation
    const bagTitles = await Bag.aggregate([
      { $match: { keyWords: { $regex: regex } } },
      { $project: { title: 1, _id: 0 } },
    ]).then((results) => results.map((b) => b.title));

    return res.status(StatusCodes.OK).json(bagTitles);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error searching bags.', error });
  }
};

/**
 * @desc Get all bag titles
 * @route GET /all-keywords
 * @access Admin
 */
const getAllKeywords = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to read bag titles.' });
    }

    const bags = await Bag.find({}, { keyWords: 0 });
    return res.status(StatusCodes.OK).json(bags);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error retrieving bags.', error });
  }
};

/**
 * @desc Add an unsorted keyword if it doesn't exist in bags
 * @route POST /unsorted-tag
 * @access Admin, User
 */
const unsortedTag = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!['admin', 'user'].includes(req.user.role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to add unsorted tags.' });
    }

    const { keyWord } = req.body;

    // Use regex to search in the database directly
    const regex = new RegExp(keyWord, 'i');
    const matchedBag = await Bag.findOne({ keyWords: { $regex: regex } });

    if (matchedBag) {
      return res.status(StatusCodes.CONFLICT).json({ message: 'Keyword already exists in a bag.' });
    }

    // Add the keyword to the Unsorted collection
    await Unsorted.create({ word: keyWord });
    // console.log(
    //   `The word "${keyWord}" has been successfully added to the unsorted list.`
    // );
    return res.status(StatusCodes.CREATED).json({ message: 'Keyword added to unsorted list.' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while processing the unsorted tag.', error });
  }
};

/**
 * @desc Get all unsorted keywords
 * @route GET /unsorted-tags
 * @access Admin
 */
const getUnsortedTags = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to access unsorted keywords.' });
    }

    const unsortedWords = await Unsorted.find({});
    return res.status(StatusCodes.OK).json(unsortedWords);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error retrieving unsorted tags.', error });
  }
};

/**
 * @desc Sort an unsorted tag into a bag
 * @route PATCH /sort
 * @access Admin
 */
const sortATag = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to sort tags.' });
    }

    const { unsorted, bagTitle } = req.body;

    const bag = await Bag.findOneAndUpdate(
      { title: bagTitle },
      { $addToSet: { keyWords: unsorted } },
      { new: true },
    );

    if (!bag) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Bag not found.' });
    }

    await Unsorted.findOneAndDelete({ word: new RegExp(unsorted, 'i') });

    return res.status(StatusCodes.OK).json({ message: 'Keyword sorted successfully.' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error sorting keyword.', error });
  }
};

/**
 * @desc Get all keywords from a specific bag
 * @route GET /:bagTitle/keywords
 * @access Admin, User
 */
const getKeysFromBag = async (req: Request, res: Response) => {
  try {
    const { bagTitle } = req.params;

    const bag = await Bag.findOne({ title: bagTitle }, { keyWords: 1 }).lean();

    if (!bag) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: `Bag with title '${bagTitle}' not found.`,
      });
    }

    return res.status(StatusCodes.OK).json(bag.keyWords);
  } catch (error) {
    console.error('Error fetching bag keywords:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while retrieving the bag keywords.',
    });
  }
};

/**
 * @desc Delete a keyword from a bag
 * @route DELETE /bag/:bagTitle/keyword/:word
 * @access Admin
 */
const deleteKeyFromBag = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: 'You are not authorized to delete a keyword.',
      });
    }

    const { bagTitle, word } = req.params;
    const updatedBag = await Bag.findOneAndUpdate(
      { title: bagTitle },
      { $pull: { keyWords: word } },
      { new: true },
    ).lean();

    if (!updatedBag) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: `Bag with title '${bagTitle}' not found or keyword does not exist.`,
      });
    }

    return res.status(StatusCodes.OK).json({
      message: `Keyword '${word}' has been successfully deleted.`,
    });
  } catch (error) {
    console.error('Error deleting keyword from bag:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while deleting the keyword.',
    });
  }
};

/**
 * @desc Delete a bag by ID
 * @route DELETE /:id
 * @access Admin
 */
const deleteBag = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized to delete a bag.' });
    }

    const { bagId } = req.params;
    const deleted = await Bag.findByIdAndDelete(bagId);

    if (!deleted) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Bag not found.' });
    }

    return res.status(StatusCodes.OK).json({ message: 'Bag deleted successfully.' });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error deleting bag.', error });
  }
};

/**
 * @desc Delete an unsorted word from the database
 * @route DELETE /unsorted/:word
 * @access Admin
 */
const deleteUnsortedWord = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: 'You are not authorized to delete an unsorted word.',
      });
    }

    const { word } = req.params;
    const deletedWord = await Unsorted.findOneAndDelete({ word });

    if (!deletedWord) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: `Unsorted word '${word}' not found.`,
      });
    }

    return res.status(StatusCodes.OK).json({
      message: `The unsorted word '${word}' has been successfully deleted.`,
    });
  } catch (error) {
    console.error('Error deleting unsorted word:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while deleting the unsorted word.',
    });
  }
};

/**
 * @desc Master search for keyword in bags
 * @route GET /bags/master-search
 * @access Admin, User
 */
const masterSearch = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tag } = req.body;

    const pipeline = [
      {
        $search: {
          index: 'default',
          text: { query: tag, path: 'keyWords', fuzzy: {} },
        },
      },
    ];

    const bags = await Bag.aggregate(pipeline);
    const finalData = bags.flatMap((b) => b.keyWords) || [tag];

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Error in master search.', error });
  }
};

export {
  createBag,
  searchBags,
  getAllKeywords,
  unsortedTag,
  getUnsortedTags,
  sortATag,
  getKeysFromBag,
  deleteKeyFromBag,
  deleteBag,
  deleteUnsortedWord,
  masterSearch,
};
