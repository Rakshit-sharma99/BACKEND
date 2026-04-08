const { lockSeats, unLockSeats } = require("../utils/seatUtils");

function seatLock(io, socket) {
  socket.on("join_event", (eventId) => {
    socket.join(eventId);
    console.log(`Socket ${socket.id} joined event ${eventId}`);
  });

  socket.on("seat_lock", async (data) => {
    try {
      const { userId, seatIds, eventId } = data;

      if (!userId || !seatIds || !eventId) {
        return;
      }

      await lockSeats(seatIds, eventId, userId, socket);
    } catch (err) {
      socket.emit("seat_lock_failed", {
        message: err.message,
      });
    }
  });

  socket.on("unlock_seat", async (data) => {
    try {
      const { userId, seatIds, eventId } = data;

      if (!userId || !seatIds || !eventId) {
        return;
      }

      await unLockSeats(seatIds, eventId, userId, socket);
    } catch (err) {
      console.error("Seat unlock error:", err);
    }
  });
}

module.exports = seatLock;
