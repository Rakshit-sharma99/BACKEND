import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Tile from '../models/tile.model';

/**
 * @desc Create a new tile
 * @route POST /
 * @access Admin
 */
const createTile = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: 'You are not authorized to create a tile.',
      });
    }

    const tile = new Tile(req.body);
    await tile.save();

    return res.status(StatusCodes.CREATED).json({
      message: 'Tile created successfully.',
      data: tile,
    });
  } catch (error) {
    console.error('Error creating tile:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while creating the tile.',
    });
  }
};

/**
 * @desc Delete a tile by ID
 * @route DELETE /:tileId
 * @access Admin
 */
const deleteTile = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: 'You are not authorized to delete a tile.',
      });
    }

    const { tileId } = req.params;
    const deletedTile = await Tile.findByIdAndDelete(tileId);

    if (!deletedTile) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: 'Tile not found.',
      });
    }

    return res.status(StatusCodes.OK).json({
      message: 'Tile deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting tile:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while deleting the tile.',
    });
  }
};

/**
 * @desc Get all tiles
 * @route GET /
 * @access Public
 */
const getTiles = async (req: Request, res: Response): Promise<Response> => {
  try {
    const tiles = await Tile.find({}).lean();

    return res.status(StatusCodes.OK).json({
      message: 'Tiles retrieved successfully.',
      data: tiles,
    });
  } catch (error) {
    console.error('Error fetching tiles:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while retrieving tiles.',
    });
  }
};

export { createTile, deleteTile, getTiles };
