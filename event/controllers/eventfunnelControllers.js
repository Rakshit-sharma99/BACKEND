const Event = require("../models/event");
const EventFunnel = require("../models/eventFunnel")
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose")


const getEventTrends = async (req, res) => {
  const { eventId } = req.query;
  try {

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: "Event not found" });
    }

    // Safe permissions check
    const canSeeStats = Array.isArray(event.permissions?.whoCanSeeStats)
      ? event.permissions.whoCanSeeStats.includes(req.user.id)
      : false;

    if (!canSeeStats && req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        msg: "You do not have access",
      });
    }
    const data = await EventFunnel.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId)
        }
      },
      {
        $project: {
          date: 1,
          buckets: { $objectToArray: "$buckets" }
        }
      },
      { $unwind: "$buckets" },
      {
        $project: {
          date: 1,
          ticketType: "$buckets.k",
          bucket: { $objectToArray: "$buckets.v" }
        }
      },

      { $unwind: "$bucket" },
      {
        $match: {
          "bucket.k": "hours"
        }
      },

      {
        $project: {
          date: 1,
          ticketType: 1,
          hours: { $objectToArray: "$bucket.v" }
        }
      },
      { $unwind: "$hours" },
      {
        $project: {
          date: 1,
          hour: { $toInt: "$hours.k" },
          impressions: "$hours.v.impressions",
          ticketSelections: "$hours.v.ticketSelections",
          checkoutInitiated: "$hours.v.checkoutInitiated",
          ordersCompleted: "$hours.v.ordersCompleted"
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            hour: "$hour"
          },
          impressions: { $sum: "$impressions" },
          ticketSelections: { $sum: "$ticketSelections" },
          checkoutInitiated: { $sum: "$checkoutInitiated" },
          ordersCompleted: { $sum: "$ordersCompleted" }
        }
      },
      {
        $group: {
          _id: "$_id.date",

          hours: {
            $push: {
              hour: "$_id.hour",
              impressions: "$impressions",
              ticketSelections: "$ticketSelections",
              checkoutInitiated: "$checkoutInitiated",
              ordersCompleted: "$ordersCompleted"
            }
          },

          impressions: { $sum: "$impressions" },
          ticketSelections: { $sum: "$ticketSelections" },
          checkoutInitiated: { $sum: "$checkoutInitiated" },
          ordersCompleted: { $sum: "$ordersCompleted" }
        }
      },
      {
        $addFields: {
          hours: {
            $sortArray: {
              input: "$hours",
              sortBy: { hour: 1 }
            }
          }
        }
      },
      { $sort: { _id: -1 } },
      {
        $group: {
          _id: null,

          days: {
            $push: {
              date: "$_id",
              hours: "$hours",
              dayTotals: {
                impressions: "$impressions",
                ticketSelections: "$ticketSelections",
                checkoutInitiated: "$checkoutInitiated",
                ordersCompleted: "$ordersCompleted"
              }
            }
          },

          impressions: { $sum: "$impressions" },
          ticketSelections: { $sum: "$ticketSelections" },
          checkoutInitiated: { $sum: "$checkoutInitiated" },
          ordersCompleted: { $sum: "$ordersCompleted" }
        }
      },
      {
        $project: {
          _id: 0,

          eventTotals: {
            impressions: "$impressions",
            ticketSelections: "$ticketSelections",
            checkoutInitiated: "$checkoutInitiated",
            ordersCompleted: "$ordersCompleted"
          },

          days: 1
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Fetched Trends Successfully",
      trends: data[0] || {
        days: [],
        eventTotals: []
      }
    });
  } catch (e) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong"
    })
  }
}

const ticketsPerformance = async (req, res) => {
  const { eventId } = req.query;

  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: "Event not found" });
    }

    // Safe permissions check
    const canSeeStats = Array.isArray(event.permissions?.whoCanSeeStats)
      ? event.permissions.whoCanSeeStats.includes(req.user.id)
      : false;

    if (!canSeeStats && req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        msg: "You do not have access",
      });
    }
    const data = await EventFunnel.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId)
        }
      },
      {
        $project: {
          buckets: { $objectToArray: "$buckets" }
        }
      },
      { $unwind: "$buckets" },
      {
        $project: {
          ticketType: "$buckets.k",
          bucket: { $objectToArray: "$buckets.v" }
        }
      },
      {
        $match: {
          ticketType: { $ne: "event" }
        }
      },
      { $unwind: "$bucket" },
      {
        $match: {
          "bucket.k": "hours"
        }
      },
      {
        $project: {
          ticketType: 1,
          hours: { $objectToArray: "$bucket.v" }
        }
      },
      { $unwind: "$hours" },
      {
        $project: {
          ticketType: 1,
          ticketSelections: "$hours.v.ticketSelections",
          checkoutInitiated: "$hours.v.checkoutInitiated",
          ordersCompleted: "$hours.v.ordersCompleted"
        }
      },
      {
        $group: {
          _id: "$ticketType",
          ticketSelections: { $sum: "$ticketSelections" },
          checkoutInitiated: { $sum: "$checkoutInitiated" },
          ordersCompleted: { $sum: "$ordersCompleted" }
        }
      }
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Fetched performance successfully",
      data
    });
  } catch (e) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong"
    });
  }
};




module.exports = {
  getEventTrends,
  ticketsPerformance
}