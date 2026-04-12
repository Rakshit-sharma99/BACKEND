const { StatusCodes } = require("http-status-codes");
const Layout = require("../models/layout");
const { redis } = require("../app");
const {
  fetchEventData,
  updateEventLayout,
} = require("./interServiceCalls");

const createLayout = async (req, res) => {
  try {
    const {
      name,
      type,
      levels,
      blocks,
      location,
      uid,
      ticketTypeColors,
      eventId,
    } = req.body;

    if (!name || !type || !uid || !eventId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "name, type, uid and eventId are required",
      });
    }

    if ((!levels || levels.length === 0) && (!blocks || blocks.length === 0)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Layout must contain levels or blocks",
      });
    }

    const event = await fetchEventData({
      id: eventId,
      fields: ["_id", "layoutId"],
    });

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.layoutId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "This event already has a layout",
      });
    }

    if (levels?.length) {
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];

        if (!level.name) {
          throw new Error(`Level name missing at index ${i}`);
        }

        level.code = level.code || `L${i + 1}`;

        if (!level.rows || level.rows.length === 0) {
          throw new Error(`Rows missing in level ${level.name}`);
        }

        for (let j = 0; j < level.rows.length; j++) {
          const row = level.rows[j];

          if (!row.name) {
            throw new Error(`Row name missing in level ${level.name}`);
          }

          row.code = row.code || String.fromCharCode(65 + j);

          if (!row.seats || row.seats <= 0) {
            throw new Error(`Invalid seats in row ${row.name}`);
          }
        }
      }
    }

    if (blocks?.length) {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        block.code = block.code || `B${i + 1}`;

        if (!block.name) {
          throw new Error("Block name missing");
        }

        if (!block.rows || block.rows.length === 0) {
          throw new Error(`Rows missing in block ${block.name}`);
        }

        for (let j = 0; j < block.rows.length; j++) {
          const row = block.rows[j];

          row.code = row.code || String.fromCharCode(65 + j);

          if (!row.name) {
            throw new Error(`Row name missing in block ${block.name}`);
          }

          if (!row.seats || row.seats <= 0) {
            throw new Error(`Invalid seats in row ${row.name}`);
          }
        }
      }
    }

    const layout = await Layout.create({
      name,
      type,
      levels,
      blocks,
      location,
      uid,
      ticketTypeColors,
    });

    const updatedEvent = await updateEventLayout({
      eventId,
      layoutId: layout._id.toString(),
    });

    if (!updatedEvent) {
      await Layout.findByIdAndDelete(layout._id);
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.status(StatusCodes.CREATED).json({
      success: true,
      data: layout,
    });
  } catch (err) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: err.message,
    });
  }
};

const getSeatsStatus = async (req, res) => {
  try {
    const { eventId } = req.query;
    const userId = req.user.id;

    const event = await fetchEventData({
      id: eventId,
      fields: ["layoutId", "seatsBooked"],
    });

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Event not found",
      });
    }

    const layout = await Layout.findById(event.layoutId);

    if (!layout) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Layout not found",
      });
    }

    const bookedSeats = new Set(event.seatsBooked || []);
    const lockedKeys = await redis.keys(`seat:${eventId}:*`);
    const lockedSeats = new Set(
      lockedKeys.map((key) => key.split(":")[2]),
    );

    const seatStatus = {};

    const processRows = async (parentCode, rows) => {
      for (const row of rows) {
        for (let i = 1; i <= row.seats; i++) {
          const seatId = `${parentCode}-${row.code}-${i}`;
          const lockOwner = await redis.get(`seat:${eventId}:${seatId}`);

          if (
            bookedSeats.has(seatId) ||
            (lockedSeats.has(seatId) && lockOwner !== userId.toString())
          ) {
            seatStatus[seatId] = false;
          } else {
            seatStatus[seatId] = true;
          }
        }
      }
    };

    if (layout.levels?.length) {
      for (const level of layout.levels) {
        await processRows(level.code, level.rows);
      }
    }

    if (layout.blocks?.length) {
      for (const block of layout.blocks) {
        await processRows(block.code, block.rows);
      }
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      layout,
      seats: seatStatus,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getLayouts = async (req, res) => {
  try {
    const layouts = await Layout.find();
    return res.status(StatusCodes.OK).json({
      success: true,
      data: layouts,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getLayoutById = async (req, res) => {
  try {
    const layoutId = req.query.layoutId || req.body?.layoutId;

    if (!layoutId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "layoutId is required",
      });
    }

    const layout = await Layout.findById(layoutId).lean();

    if (!layout) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Layout not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: layout,
    });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

module.exports = {
  createLayout,
  getSeatsStatus,
  getLayouts,
  getLayoutById,
};
