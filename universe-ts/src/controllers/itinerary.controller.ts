import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Itinerary from '../models/itinerary.model';
import Event from '../models/event.model';
import Club from '../models/club.model';
import Ticket from '../models/ticket.model';

/**
 * @desc     Create a new itinerary for an event
 * @route    POST /itinerary
 * @access   User, Admin
 */
const createItinerary = async (req: Request, res: Response): Promise<Response> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      eventId,
      clubId,
      title,
      description,
      venue,
      cover,
      start,
      end,
      allowed,
      rsvpEnabled = false,
      maxRsvps,
    } = req.body;

    // Validate required fields
    if (!eventId || !title || !description || !venue || !cover || !start || !end) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing required fields' });
    }

    // Validate ObjectId
    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid event ID' });
    }

    // Check if event exists & fetch ticket types in a single query
    const event = await Event.findById(eventId).select('ticketTypes itineraries').session(session);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found' });
    }

    const allTicketTypes = (event.ticketTypes || []).map((e) => e.type);

    // Create itinerary
    const newItinerary = new Itinerary({
      eventId,
      title,
      description,
      venue,
      cover,
      start,
      end,
      allowed: Array.isArray(allowed) && allowed.length > 0 ? allowed : allTicketTypes, // Default to all ticket types if not provided
      rsvpEnabled: rsvpEnabled ?? false,
      maxRsvps: rsvpEnabled ? maxRsvps : null, // Set maxRsvps to null if RSVP is disabled
    });

    // Save itinerary & update event in a transaction
    const savedItinerary = await newItinerary.save({ session });
    await Event.findByIdAndUpdate(eventId, {
      $push: { itineraries: savedItinerary._id },
    });

    // Update club's upcomingEvent (if clubId is provided)
    if (clubId) {
      const club = await Club.findById(clubId, { upcomingEvent: 1 });
      if (club && Array.isArray(club.upcomingEvent)) {
        club.upcomingEvent = club.upcomingEvent.map((obj) => {
          if (obj?.eventId && obj.eventId.toString() === eventId) {
            return {
              ...obj,
              itineraries: [...obj.itineraries, savedItinerary._id],
            };
          }
          return obj;
        });

        await club.save();
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.CREATED).json({
      message: 'Itinerary created successfully',
      newItinerary,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error creating itinerary:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error });
  }
};

/**
 * @desc Get ordered itineraries for an event
 * @route GET /itinerary
 * @access Public
 */
const getOrderedItineraries = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { eventId } = req.query;
    if (!mongoose.Types.ObjectId.isValid(eventId as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid event ID.' });
    }

    // Find the event and get its itineraries array
    const event = await Event.findById(eventId, 'itineraries').lean();
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    if (!event.itineraries || event.itineraries.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'No itineraries found for this event.' });
    }

    // Fetch itineraries in the exact order stored in the event document
    const itineraries = await Itinerary.find({ _id: { $in: event.itineraries } }).lean();
    return res.status(StatusCodes.OK).json(itineraries);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching itineraries.', error });
  }
};

/**
 * @desc Update itinerary status
 * @route PATCH /itinerary/status
 * @access User (Authorized Person Only)
 */
const updateItineraryStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { itineraryId, eventId } = req.query;
    const { status } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(itineraryId as string) ||
      !mongoose.Types.ObjectId.isValid(eventId as string)
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid ID provided.' });
    }

    const validStatuses = ['Upcoming', 'Ongoing', 'Completed', 'Canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid status provided.' });
    }

    const event = await Event.findById(eventId, 'authorizedPerson').lean();
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    if (event?.authorizedPerson?._id.toString() !== req.user.id) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized action.' });
    }

    const itinerary = await Itinerary.findByIdAndUpdate(
      itineraryId,
      { status },
      { new: true },
    ).lean();
    if (!itinerary) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Itinerary not found.' });
    }

    return res.status(StatusCodes.OK).json({ message: 'Itinerary status updated.', itinerary });
  } catch (error) {
    console.error('Error updating itinerary status:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Server error.', error });
  }
};

/**
 * @desc RSVP for an itinerary
 * @route POST /itinerary/rsvp
 * @access User
 */
const rsvpItinerary = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { itineraryId, ticketId } = req.body;
    const userId = req.user.id;

    const [itinerary, ticket] = await Promise.all([
      Itinerary.findById(itineraryId).lean(),
      Ticket.findById(ticketId).lean(),
    ]);

    if (!itinerary)
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Itinerary not found' });
    if (!ticket) return res.status(StatusCodes.NOT_FOUND).json({ message: 'Ticket not found' });

    if (ticket.boughtBy.toString() !== req.user.id) {
      console.log(ticket.boughtBy);
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized access to this ticket.' });
    }

    if (!itinerary.allowed.includes(ticket.type)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'This ticket has no access to the itinerary.' });
    }

    await Itinerary.updateOne({ _id: itineraryId }, { $addToSet: { rsvpList: userId } });
    await Ticket.updateOne({ _id: ticketId }, { $addToSet: { rsvp: itineraryId } });

    return res.status(StatusCodes.OK).json({ message: 'RSVP successful' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'An error occurred' });
  }
};

/**
 * @desc Add user to itinerary notify list
 * @route POST /itinerary/notify
 * @access User
 */
const addToNotifyList = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { itineraryId } = req.body;
    const userId = req.user.id;

    // Find the itinerary
    const itinerary = await Itinerary.findById(itineraryId).lean();
    if (!itinerary) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Itinerary not found' });
    }

    await Itinerary.updateOne({ _id: itineraryId }, { $addToSet: { notifyList: userId } });
    return res.status(StatusCodes.OK).json({ message: 'User added to notify list successfully' });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'An error occurred' });
  }
};

/**
 * @desc Get itineraries by an array of IDs
 * @route POST /itinerary/bulk-fetch-by-ids
 * @access User, Admin
 */
const getItinerariesByIds = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { itineraryIds } = req.body;

    if (!Array.isArray(itineraryIds) || itineraryIds.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid itineraryIds. It should be an array.',
      });
    }

    const itineraries = await Itinerary.find({ _id: { $in: itineraryIds } }).lean();

    return res.status(StatusCodes.OK).json({ itineraries });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while fetching itineraries.',
    });
  }
};

/**
 * @desc Fetch RSVP list with pagination
 * @route GET /itinerary/:itineraryId/rsvp
 * @access User, Admin
 */
const fetchRSVPList = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { itineraryId } = req.params;
    const batch = parseInt(req.query.batch as string) || 1;
    const batchSize = parseInt(req.query.batchSize as string) || 10;

    if (!mongoose.Types.ObjectId.isValid(itineraryId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid itinerary ID' });
    }

    const itinerary = await Itinerary.findById(itineraryId)
      .populate({
        path: 'rsvpList',
        select: 'name image pushToken course reg',
        options: {
          skip: (batch - 1) * batchSize,
          limit: batchSize,
        },
      })
      .lean();

    if (!itinerary) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Itinerary not found' });
    }

    return res.status(StatusCodes.OK).json({ users: itinerary.rsvpList });
  } catch (error) {
    console.error('Error fetching RSVP list:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error });
  }
};

/**
 * @desc Edit an itinerary (only authorized users)
 * @route PATCH /itinerary/:itineraryId
 * @access Admin, Event Organizer
 */
const editItinerary = async (req: Request, res: Response): Promise<Response> => {
  const { itineraryId } = req.params;
  const updateData = req.body;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(itineraryId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid itinerary ID' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the itinerary
    const itinerary = await Itinerary.findById(itineraryId).session(session);
    if (!itinerary) {
      await session.abortTransaction();
      session.endSession();
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Itinerary not found' });
    }

    // Extract eventId from itinerary
    const event = await Event.findById(itinerary.eventId, { authorizedPerson: 1 }).session(session);
    if (!event) {
      await session.abortTransaction();
      session.endSession();
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Associated event not found' });
    }

    // Check if the user is authorized to edit
    if (!event.authorizedPerson || event.authorizedPerson._id.toString() !== userId) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Associated event not found' });
    }

    // Check authorization
    if (!event.authorizedPerson || event.authorizedPerson.toString() !== userId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to edit this itinerary' });
    }

    // Update itinerary fields
    Object.assign(itinerary, updateData);
    await itinerary.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res
      .status(StatusCodes.OK)
      .json({ message: 'Itinerary updated successfully', itinerary });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error updating itinerary:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error });
  }
};

export {
  createItinerary,
  updateItineraryStatus,
  getOrderedItineraries,
  rsvpItinerary,
  addToNotifyList,
  getItinerariesByIds,
  fetchRSVPList,
  editItinerary,
};
