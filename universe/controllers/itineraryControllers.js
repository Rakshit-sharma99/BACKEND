const { StatusCodes } = require("http-status-codes");
const Itinerary = require("../models/itinerary");
const Event = require("../models/event");
const Club = require("../models/club");
const Ticket = require("../models/ticket");

const createItinerary = async (req, res) => {
  console.log("hit");
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

    console.log(req.body);

    // Validate required fields
    if (
      !eventId ||
      !title ||
      !description ||
      !venue ||
      !cover ||
      !start ||
      !end
    ) {
      console.log(1);
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate event existence
    const eventExists = await Event.findById(eventId, {
      ticketTypes: 1,
      itineraries: 1,
    });
    if (!eventExists) {
      console.log(2);
      return res.status(404).json({ error: "Event not found" });
    }

    // Get all ticket types
    const allTicketTypes = (eventExists.ticketTypes || []).map((e) => e.type);

    // Create new itinerary
    const newItinerary = new Itinerary({
      eventId,
      title,
      description,
      venue,
      cover,
      start,
      end,
      allowed:
        Array.isArray(allowed) && allowed.length > 0 ? allowed : allTicketTypes, // Default to all ticket types
      rsvpEnabled,
      maxRsvps: rsvpEnabled ? maxRsvps : null, // Set maxRsvps to null if RSVP is disabled
    });

    // Save itinerary to database
    const savedItinerary = await newItinerary.save();

    // Link the itinerary to the event
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

    return res.status(201).json({
      message: "Itinerary created successfully",
      itinerary: savedItinerary,
    });
  } catch (error) {
    console.error("Error creating itinerary:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const updateItineraryStatus = async (req, res) => {
  try {
    const { itineraryId, eventId } = req.query;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["Upcoming", "Ongoing", "Completed", "Canceled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status provided." });
    }

    // Find the event and check authorization
    const event = await Event.findById(eventId, { authorizedPerson: 1 });
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (event.authorizedPerson._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized action." });
    }

    // Update itinerary status
    const itinerary = await Itinerary.findByIdAndUpdate(
      itineraryId,
      { status },
      { new: true }
    );

    if (!itinerary) {
      return res.status(404).json({ message: "Itinerary not found." });
    }

    return res
      .status(200)
      .json({ message: "Itinerary status updated.", itinerary });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error." });
  }
};

const getOrderedItineraries = async (req, res) => {
  try {
    const { eventId } = req.query;

    // Find the event and get its itineraries array
    const event = await Event.findById(eventId).select("itineraries").lean();
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (!event.itineraries || event.itineraries.length === 0) {
      return res
        .status(404)
        .json({ message: "No itineraries found for this event." });
    }

    // Fetch itineraries in the exact order stored in the event document
    const itineraries = await Itinerary.find({
      _id: { $in: event.itineraries },
    }).lean();

    return res.status(200).json(itineraries);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "An error occurred while fetching itineraries." });
  }
};

const rsvpItinerary = async (req, res) => {
  try {
    const { itineraryId, ticketId } = req.body;
    const userId = req.user.id;

    // Find the itinerary and update RSVP list
    const itinerary = await Itinerary.findById(itineraryId);
    if (!itinerary) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Itinerary not found" });
    }

    // Find the ticket and update RSVP field
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Ticket not found" });
    }

    if (ticket.boughtBy.toString() !== req.user.id) {
      console.log(ticket.boughtBy);
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ message: "You have no access to this ticket." });
    }

    if (!itinerary.allowed.includes(ticket.type)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "This ticket has no access to the concerned itinerary.",
      });
    }

    if (!itinerary.rsvpList.includes(userId)) {
      itinerary.rsvpList.push(userId);
      await itinerary.save();
    }

    if (!ticket.rsvp.includes(itineraryId)) {
      ticket.rsvp.push(itineraryId);
      await ticket.save();
    }

    return res.status(StatusCodes.OK).json({ message: "RSVP successful" });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "An error occurred" });
  }
};

const addToNotifyList = async (req, res) => {
  try {
    const { itineraryId } = req.body;
    const userId = req.user.id;

    // Find the itinerary
    const itinerary = await Itinerary.findById(itineraryId);
    if (!itinerary) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Itinerary not found" });
    }

    // Check if the user is already in the notifyList
    if (!itinerary.notifyList.includes(userId)) {
      itinerary.notifyList.push(userId);
      await itinerary.save();
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: "User added to notify list successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "An error occurred" });
  }
};

const getItinerariesByIds = async (req, res) => {
  try {
    const { itineraryIds } = req.body;

    if (!Array.isArray(itineraryIds)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid itineraryIds. It should be an array.",
      });
    }

    const itineraries = await Itinerary.find({ _id: { $in: itineraryIds } });

    return res.status(StatusCodes.OK).json({ itineraries });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while fetching itineraries.",
    });
  }
};

const fetchRSVPList = async (req, res) => {
  try {
    const { itineraryId, batch, batchSize } = req.query;
    const itinerary = await Itinerary.findById(itineraryId).populate(
      "rsvpList",
      "name image pushToken course reg"
    );
    if (!itinerary) {
      return res.status(404).json({ message: "Itinerary not found" });
    }
    const totalUsers = itinerary.rsvpList.length;
    const startIndex = (batch - 1) * batchSize;
    const endIndex = Math.min(startIndex + batchSize, totalUsers);
    if (startIndex >= totalUsers) {
      return res
        .status(200)
        .json({ users: [], message: "No more users available" });
    }
    const users = itinerary.rsvpList.slice(startIndex, endIndex);

    return res.status(200).json({ users });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

const editItinerary = async (req, res) => {
  const { itineraryId } = req.query;
  const updateData = req.body;
  const userId = req.user.id;

  try {
    // Find the itinerary
    const itinerary = await Itinerary.findById(itineraryId);
    if (!itinerary) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Itinerary not found" });
    }

    // Extract eventId from itinerary
    const eventId = itinerary.eventId;
    const event = await Event.findById(eventId, { authorizedPerson: 1 });
    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Associated event not found" });
    }

    // Check if the user is authorized to edit
    if (
      !event.authorizedPerson ||
      event.authorizedPerson._id.toString() !== userId
    ) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "You are not authorized to edit this itinerary" });
    }

    // Update only the fields that are provided in req.body
    Object.keys(updateData).forEach((key) => {
      itinerary[key] = updateData[key];
    });

    // Save the updated itinerary
    await itinerary.save();

    return res.status(StatusCodes.OK).json(itinerary);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

module.exports = {
  createItinerary,
  updateItineraryStatus,
  getOrderedItineraries,
  rsvpItinerary,
  addToNotifyList,
  getItinerariesByIds,
  fetchRSVPList,
  editItinerary,
};
