require("dotenv").config();
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const Channel = require("../models/channel");
const Event = require("../models/event");
const {
  fetchNativeClubData,
  fetchTicketFieldsByQuery,
  updateUserChannels,
  bulkUpdateUserChannels,
  getUserChannels,
  checkUserChannelRole,
} = require("./utilControllers");

// ─── Helper: Check if user is admin of event's club ────────────────────
const isEventAdmin = async (userId, eventId) => {
  try {
    const event = await Event.findById(eventId, { belongsTo: 1, universeMetaData: 1 });
    if (!event) return false;

    const club = await fetchNativeClubData({
      id: event.belongsTo?.id,
      fields: ["adminId"],
      callSign: event.universeMetaData?.callSign || "universe",
    });

    const adminIds = (club?.adminId || []).map(
      (id) => (typeof id === "string" ? id : id?.id || id?._id?.toString())
    );

    return adminIds.includes(userId);
  } catch {
    return false;
  }
};

// ─── Utility: Create a channel for an event ────────────────────────────
const createChannelForEvent = async (eventId) => {
  try {
    if (!eventId) throw new Error("eventId required");

    const existing = await Channel.findOne({ eventId });
    if (existing) return existing;

    const event = await Event.findById(eventId, {
      belongsTo: 1,
      ticketTypes: 1,
      universeMetaData: 1,
    });

    if (!event) throw new Error("No event found");

    const callSign = "universe";

    const club = await fetchNativeClubData({
      id: event.belongsTo?.id,
      fields: ["adminId", "team"],
      callSign,
    });

    if (!club) throw new Error("Club not found");

    const extractIds = (arr = []) =>
      arr.map((item) => (typeof item === "string" ? item : item.id || item._id?.toString()));

    const adminIds = extractIds(club.adminId);
    const teamIds = extractIds(club.team);

    const adminSet = new Set(adminIds.map((id) => id?.toString()));

    const filteredTeamIds = teamIds.filter(
      (id) => !adminSet.has(id?.toString())
    );

    const totalMembers = adminSet.size + filteredTeamIds.length;

    const rooms = [
      {
        groupId: `${eventId}-all`,
        ticketType: null,
        membersCount: totalMembers,
      },
    ];

    (event.ticketTypes || []).forEach((t) => {
      const type = t.type?.toLowerCase().trim();
      if (!type) return;

      rooms.push({
        groupId: `${eventId}-${type}`,
        ticketType: type,
        membersCount: totalMembers,
      });
    });

    const channel = await Channel.create({
      eventId,
      rooms,
    });

    const allRoomIds = rooms.map((r) => r.groupId);

    // Add channel to admin users via universe service
    if (adminIds.length) {
      await bulkUpdateUserChannels({
        userIds: adminIds,
        channelId: channel._id.toString(),
        role: "admin",
        rooms: allRoomIds,
        callSign,
      });
    }

    // Add channel to team users via universe service
    if (filteredTeamIds.length) {
      await bulkUpdateUserChannels({
        userIds: filteredTeamIds,
        channelId: channel._id.toString(),
        role: "team",
        rooms: allRoomIds,
        callSign,
      });
    }

    return channel;
  } catch (err) {
    console.error("createChannelForEvent error:", err);
    return null;
  }
};

// ─── Utility: Add a member to a channel ────────────────────────────────
const addMemberToChannel = async ({ userId, ticketId }) => {
  try {
    // Fetch ticket data from ticket service
    const ticket = await fetchTicketFieldsByQuery({
      searchBy: { _id: ticketId, boughtBy: userId },
      fields: ["eventId", "type"],
      single: true,
    });

    if (!ticket) {
      return { success: false, message: "User has not purchased ticket" };
    }

    const channel = await Channel.findOne({ eventId: ticket.eventId });

    if (!channel) {
      return { success: false, message: "Channel not found" };
    }

    // Check if user already in channel via universe service
    const callSign = "universe";

    const alreadyJoined = await checkUserChannelRole({
      userId,
      channelId: channel._id.toString(),
      callSign,
    });

    if (alreadyJoined) {
      return { success: true, message: "Already joined" };
    }

    const ticketType = ticket.type?.toLowerCase().trim();

    const roomsToJoin = [`${ticket.eventId}-all`];

    if (ticketType) {
      roomsToJoin.push(`${ticket.eventId}-${ticketType}`);
    }

    // Update user's channels via universe service
    await updateUserChannels({
      userId,
      channelId: channel._id.toString(),
      role: "member",
      rooms: roomsToJoin,
      callSign,
    });

    // Update room member counts in channel document
    const incObj = {
      "rooms.$[allRoom].membersCount": 1,
    };

    const arrayFilters = [
      { "allRoom.groupId": `${ticket.eventId}-all` },
    ];

    if (ticketType) {
      incObj["rooms.$[ticketRoom].membersCount"] = 1;
      arrayFilters.push({
        "ticketRoom.groupId": `${ticket.eventId}-${ticketType}`,
      });
    }

    await Channel.updateOne(
      { _id: channel._id },
      { $inc: incObj },
      { arrayFilters }
    );

    return { success: true, message: "User added to channel" };
  } catch (err) {
    console.error("addMemberToChannel error:", err);
    return { success: false, message: "Something went wrong" };
  }
};

// ─── Controller: Create Channel ────────────────────────────────────────
const createChannel = async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid or missing eventId",
      });
    }

    // Authorization: only event club admins can create channels
    const authorized = await isEventAdmin(req.user.id, eventId);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "Only club admins can create channels",
      });
    }

    const channel = await createChannelForEvent(eventId);
    if (!channel) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Unable to create channel",
      });
    }
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Channel created successfully",
      channel,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ─── Controller: Add Member ────────────────────────────────────────────
const addMember = async (req, res) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId || !mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid or missing ticketId",
      });
    }
    const userId = req.user.id;

    const result = await addMemberToChannel({ userId, ticketId });

    if (!result.success) {
      return res.status(StatusCodes.BAD_REQUEST).json(result);
    }

    return res.status(StatusCodes.OK).json(result);
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ─── Controller: Add All Ticket Buyers ─────────────────────────────────
const addAllTicketBuyers = async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid or missing eventId",
      });
    }

    // Authorization: only event club admins can bulk-add members
    const authorized = await isEventAdmin(req.user.id, eventId);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "Only club admins can add all ticket buyers",
      });
    }

    // Fetch all tickets for the event from ticket service
    const tickets = await fetchTicketFieldsByQuery({
      searchBy: { eventId },
      fields: ["boughtBy", "type"],
    });

    if (!tickets || tickets.length === 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "No tickets found",
        updatedUsers: 0,
      });
    }

    // Fetch the channel for the event
    const channel = await Channel.findOne({ eventId });

    if (!channel) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Channel not found",
      });
    }

    const event = await Event.findById(eventId, { universeMetaData: 1 });
    const callSign = "universe";

    // Build a map of userId -> Set of rooms to join
    const userRoomsMap = new Map();

    for (const t of tickets) {
      if (!t.boughtBy) continue;

      const userId = t.boughtBy.toString();
      const ticketType = t.type?.toLowerCase().trim();

      if (!userRoomsMap.has(userId)) {
        userRoomsMap.set(userId, new Set([`${eventId}-all`]));
      }

      if (ticketType) {
        userRoomsMap.get(userId).add(`${eventId}-${ticketType}`);
      }
    }

    const userIds = Array.from(userRoomsMap.keys());

    // Get existing user channel data from universe service
    const usersChannelData = await getUserChannels({
      userIds,
      channelId: channel._id.toString(),
      callSign,
    });

    const bulkOps = [];
    const roomCounts = {};

    for (const userId of userIds) {
      const newRoomsSet = userRoomsMap.get(userId) || new Set();

      const channelData = usersChannelData?.[userId] || null;

      let roomsToAdd = [];

      if (channelData) {
        // Already in channel: add only missing rooms
        const existingRooms = new Set(channelData.rooms || []);

        for (const r of newRoomsSet) {
          if (!existingRooms.has(r)) {
            roomsToAdd.push(r);
          }
        }

        if (roomsToAdd.length) {
          bulkOps.push({
            userId,
            action: "addRooms",
            channelId: channel._id.toString(),
            rooms: roomsToAdd,
          });
        }
      } else {
        // Not in channel: create entry
        roomsToAdd = Array.from(newRoomsSet);

        bulkOps.push({
          userId,
          action: "addChannel",
          channelId: channel._id.toString(),
          role: "member",
          rooms: roomsToAdd,
        });
      }

      // Count new rooms for membersCount
      for (const r of roomsToAdd) {
        roomCounts[r] = (roomCounts[r] || 0) + 1;
      }
    }

    // Execute bulk update via universe service
    if (bulkOps.length) {
      await bulkUpdateUserChannels({
        operations: bulkOps,
        callSign,
      });
    }

    // Update room member counts in the channel document
    for (const room of channel.rooms || []) {
      if (roomCounts[room.groupId]) {
        room.membersCount += roomCounts[room.groupId];
      }
    }

    await channel.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Users added to rooms successfully",
      updatedUsers: bulkOps.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ─── Controller: Get Channels ──────────────────────────────────────────
const getChannels = async (req, res) => {
  try {
    const userId = req.user.id;
    const callSign = "universe";

    // Get the user's channels from universe service
    const userChannelsData = await getUserChannels({
      userIds: [userId],
      callSign,
    });

    const userChannels = userChannelsData?.[userId] || [];

    if (!userChannels || !Array.isArray(userChannels) || userChannels.length === 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        channels: [],
      });
    }

    // Fetch actual channel docs locally
    const channelIds = userChannels
      .map((c) => c.channelId)
      .filter(Boolean);

    const channelDocs = await Channel.find({
      _id: { $in: channelIds },
    }).populate({
      path: "eventId",
      select: "name url eventDate",
    });

    const channelMap = {};
    for (const doc of channelDocs) {
      channelMap[doc._id.toString()] = doc;
    }

    const channels = userChannels
      .map((c) => {
        const channelDoc = channelMap[c.channelId?.toString()];
        if (!channelDoc) return null;

        const allowedRooms = (channelDoc.rooms || []).filter((room) =>
          c.rooms.includes(room.groupId)
        );

        return {
          _id: channelDoc._id,
          event: channelDoc.eventId,
          rooms: allowedRooms,
          role: c.role,
        };
      })
      .filter(Boolean);

    return res.status(StatusCodes.OK).json({
      success: true,
      channels,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Server error",
    });
  }
};

// ─── Controller: Save Permissions ──────────────────────────────────────
const savePermissions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId, groupId, whoCanSendMessages } = req.body;
    const callSign = "universe";

    if (!channelId || !mongoose.Types.ObjectId.isValid(channelId) || !groupId || !whoCanSendMessages) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Missing or invalid required fields" });
    }

    // Check if user is admin of this channel via universe service
    const roleData = await checkUserChannelRole({
      userId,
      channelId,
      callSign,
    });

    if (!roleData || roleData.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can change permissions" });
    }

    const updateFields = {};

    if (whoCanSendMessages.admins !== undefined) {
      updateFields["rooms.$.whoCanSendMessages.admins"] =
        whoCanSendMessages.admins;
    }

    if (whoCanSendMessages.team !== undefined) {
      updateFields["rooms.$.whoCanSendMessages.team"] =
        whoCanSendMessages.team;
    }

    if (whoCanSendMessages.members !== undefined) {
      updateFields["rooms.$.whoCanSendMessages.members"] =
        whoCanSendMessages.members;
    }

    const updatedChannel = await Channel.findOneAndUpdate(
      { _id: channelId, "rooms.groupId": groupId },
      { $set: updateFields },
      { new: true }
    );

    if (!updatedChannel) {
      return res
        .status(404)
        .json({ message: "Channel or room not found" });
    }

    return res.status(StatusCodes.OK).json({
      message: "Permissions updated successfully",
      channel: updatedChannel,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

module.exports = {
  createChannel,
  addMember,
  getChannels,
  addAllTicketBuyers,
  savePermissions,
  createChannelForEvent,
  addMemberToChannel,
};
