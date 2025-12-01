const { StatusCodes } = require("http-status-codes");
const Itinerary = require("../models/itinerary");
const {
  fetchEventData,
  checkEventAuthorization,
  getUserMetaMap,
  fetchTicketFieldsById,
} = require("./utilControllers");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");

//Controller 1
const createItinerary = async (req, res) => {
  try {
    const {
      eventId,
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

    // Step 1: Validate required fields
    if (
      !eventId ||
      !title ||
      !description ||
      !venue ||
      !cover ||
      !start ||
      !end
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Step 2: Validate date range
    if (new Date(start) >= new Date(end)) {
      return res
        .status(400)
        .json({ error: "Start time must be before end time" });
    }

    // Step 3: Validate event existence
    const event_query = {
      id: eventId,
      fields: ["ticketTypes"],
    };
    const eventExists = await fetchEventData(event_query);
    if (!eventExists) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Step 4: Determine allowed ticket types
    const allTicketTypes = (eventExists.ticketTypes || []).map((e) => e.type);
    const allowedTypes =
      Array.isArray(allowed) && allowed.length > 0 ? allowed : allTicketTypes;

    // Step 5: Create itinerary document
    const newItinerary = new Itinerary({
      eventId,
      title,
      description,
      venue,
      cover,
      start,
      end,
      allowed: allowedTypes,
      rsvpEnabled,
      maxRsvps: rsvpEnabled ? maxRsvps : null,
    });

    const savedItinerary = await newItinerary.save();

    // Step 6: Link itinerary to event via Kafka
    await sendKafkaMessage("ADD_ITINERARY", "event", {
      eventId,
      itineraryId: savedItinerary._id.toString(),
    });

    return res.status(201).json({
      message: "Itinerary created successfully",
      itinerary: savedItinerary,
    });
  } catch (error) {
    console.error("❌ Error creating itinerary:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//Controller 2
const updateItineraryStatus = async (req, res) => {
  try {
    const { itineraryId, eventId } = req.query;
    const { status } = req.body;

    // Step 1: Validate input
    if (!itineraryId || !eventId || !status) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const validStatuses = ["Upcoming", "Ongoing", "Completed", "Canceled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status provided." });
    }

    // Step 2: Authorization check
    const isAuthorized = await checkEventAuthorization({
      userId: req.user.id,
      eventId,
    });

    if (!isAuthorized) {
      return res.status(403).json({
        message:
          "You are not authorized to change the status of the itinerary.",
      });
    }

    // Step 3: Update itinerary status
    const updatedItinerary = await Itinerary.findByIdAndUpdate(
      itineraryId,
      { status },
      { new: true }
    );

    if (!updatedItinerary) {
      return res.status(404).json({ message: "Itinerary not found." });
    }

    return res.status(200).json({
      message: "Itinerary status updated successfully.",
      itinerary: updatedItinerary,
    });
  } catch (error) {
    console.error("❌ Error updating itinerary status:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

//Controller 3
const getOrderedItineraries = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ message: "Missing eventId in query." });
    }

    // Step 1: Get itinerary IDs from the event
    const event_query = {
      id: eventId,
      fields: ["itineraries"],
    };
    const event = await fetchEventData(event_query);

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    const itineraryIds = event.itineraries || [];

    if (itineraryIds.length === 0) {
      return res
        .status(404)
        .json({ message: "No itineraries found for this event." });
    }

    // Step 2: Fetch all itineraries by ID
    const itineraries = await Itinerary.find({
      _id: { $in: itineraryIds },
    }).lean();

    // Step 3: Restore the original order
    const itineraryMap = new Map(
      itineraries.map((it) => [it._id.toString(), it])
    );
    const orderedItineraries = itineraryIds
      .map((id) => itineraryMap.get(id.toString()))
      .filter(Boolean); // Remove any missing/null entries

    return res.status(200).json(orderedItineraries);
  } catch (error) {
    console.error("❌ Error fetching ordered itineraries:", error);
    return res.status(500).json({
      message: "An error occurred while fetching itineraries.",
    });
  }
};

//Controller 4
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
    const ticket_query = {
      ticketId,
      fields: ["boughtBy", "type", "rsvp"],
    };
    const ticket = await fetchTicketFieldsById(ticket_query);
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
      await sendKafkaMessage("RSVP_ITINERARY", "ticket", {
        itineraryId,
        ticketId,
      });
    }

    return res.status(StatusCodes.OK).json({ message: "RSVP successful" });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "An error occurred" });
  }
};

//Controller 5
const addToNotifyList = async (req, res) => {
  try {
    const { itineraryId } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!itineraryId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Itinerary ID is required" });
    }

    // Find the itinerary
    const itinerary = await Itinerary.findById(itineraryId);
    if (!itinerary) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Itinerary not found" });
    }

    // Add user to notify list if not already present
    if (!itinerary.notifyList.includes(userId)) {
      await Itinerary.findByIdAndUpdate(itineraryId, {
        $addToSet: { notifyList: userId },
      });
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: "User added to notify list successfully" });
  } catch (error) {
    console.error("Error adding user to notify list:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "An error occurred" });
  }
};

//Controller 6
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

//Controller 7
const fetchRSVPList = async (req, res) => {
  try {
    const { itineraryId, batch = 1, batchSize = 20 } = req.query;

    // Validate required param
    if (!itineraryId) {
      return res.status(400).json({ message: "Itinerary ID is required" });
    }

    // Fetch itinerary
    const itinerary = await Itinerary.findById(itineraryId);
    if (!itinerary) {
      return res.status(404).json({ message: "Itinerary not found" });
    }

    const rsvpList = itinerary.rsvpList || [];

    // Build user map
    const userMap = await getUserMetaMap(rsvpList, [
      "name",
      "reg",
      "image",
      "course",
      "pushToken",
    ]);

    // Convert to enriched user data
    const rsvpData = rsvpList.map((userId) => userMap[userId.toString()]);

    // Pagination logic
    const totalUsers = rsvpData.length;
    const startIndex = (Number(batch) - 1) * Number(batchSize);
    const endIndex = Math.min(startIndex + Number(batchSize), totalUsers);

    if (startIndex >= totalUsers) {
      return res
        .status(200)
        .json({ users: [], message: "No more users available" });
    }

    const users = rsvpData.slice(startIndex, endIndex);
    return res.status(200).json({ users });
  } catch (error) {
    console.error("Error in fetchRSVPList:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

const editItinerary = async (req, res) => {
  const { itineraryId } = req.query;
  const updateData = req.body;

  try {
    if (!itineraryId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Itinerary ID is required",
      });
    }

    // Find the itinerary
    const itinerary = await Itinerary.findById(itineraryId);
    if (!itinerary) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Itinerary not found" });
    }

    // Check authorization based on eventId from the itinerary
    const isAuthorized = await checkEventAuthorization({
      userId: req.user.id,
      eventId: itinerary.eventId,
    });

    if (!isAuthorized) {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to edit this itinerary.",
      });
    }

    // Apply only valid updates
    Object.keys(updateData).forEach((key) => {
      if (key in itinerary) {
        itinerary[key] = updateData[key];
      }
    });

    // Save the updated itinerary
    await itinerary.save();

    return res.status(StatusCodes.OK).json({
      message: "Itinerary updated successfully",
      itinerary,
    });
  } catch (error) {
    console.error("Error editing itinerary:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong while editing the itinerary.",
    });
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
