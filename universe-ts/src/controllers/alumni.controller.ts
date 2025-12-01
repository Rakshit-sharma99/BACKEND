import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import User from '../models/user.model';
import Org from '../models/org.model';

/**
 * @desc    Fetch a list of organizations with limited details
 * @route   GET /organizations
 * @access  Public
 */
const getOrganizations = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizations = await Org.find()
      .populate('working', '_id course image interests name pushToken')
      .limit(6)
      .lean();

    res.status(StatusCodes.OK).json({ success: true, data: organizations });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to fetch organizations. Please try again later.',
    });
  }
};

/**
 * @desc    Fetch a list of alumni with organization details
 * @route   GET /alumni
 * @access  Public
 */
const getAlumni = async (req: Request, res: Response): Promise<void> => {
  try {
    const alumni = await User.find({ profession: 'Alumni', orgId: { $ne: null } })
      .populate({ path: 'orgId', select: 'orgName orgLogo' })
      .select('_id course image interests name pushToken company workingPosition career')
      .limit(6)
      .lean();

    res.status(StatusCodes.OK).json({ success: true, data: alumni });
  } catch (error) {
    console.error('Error fetching alumni:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to fetch alumni. Please try again later.',
    });
  }
};

/**
 * @desc    Search alumni by name or other relevant fields
 * @route   GET /alumni/search
 * @access  Public
 */
const searchAlumni = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: string = req.query.query as string;
    if (!query || query.trim() === '') {
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Search query cannot be empty.',
      });
      return;
    }

    const alumniResults = await User.find({
      profession: 'Alumni',
      orgId: { $ne: null },
      $or: [
        { name: new RegExp(query, 'i') },
        { course: new RegExp(query, 'i') },
        { company: new RegExp(query, 'i') },
      ],
    })
      .populate({ path: 'orgId', select: 'orgName orgLogo' })
      .select('_id course image interests name pushToken company workingPosition career')
      .limit(10)
      .lean();

    res.status(StatusCodes.OK).json({ success: true, data: alumniResults });
  } catch (error) {
    console.error('Error searching alumni:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to search alumni. Please try again later.',
    });
  }
};

export { getOrganizations, getAlumni, searchAlumni };
