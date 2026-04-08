const { redis } = require("../app");

async function lockSeats(seatIds, eventId, userId, socket) {
  try {
    if (!seatIds || seatIds.length === 0) {
      return [];
    }

    const lockedSeats = [];

    for (const seatId of seatIds) {
      const seatKey = `seat:${eventId}:${seatId}`;
      const existingLock = await redis.get(seatKey);

      if (existingLock && existingLock !== userId) {
        continue;
      }

      const result = await redis.set(seatKey, userId, "NX", "EX", 300);

      if (result) {
        lockedSeats.push(seatId);
      }
    }

    if (socket && lockedSeats.length > 0) {
      socket.to(eventId).emit("seat_locked", {
        seatIds: lockedSeats,
      });
    }

    return lockedSeats;
  } catch (error) {
    console.error("Error locking seats:", error);
    throw error;
  }
}

async function unLockSeats(seatIds, eventId, userId, socket) {
  try {
    if (!seatIds || seatIds.length === 0) {
      return [];
    }

    const unlockedSeats = [];

    for (const seatId of seatIds) {
      const seatKey = `seat:${eventId}:${seatId}`;
      const existingLock = await redis.get(seatKey);

      if (existingLock === userId) {
        await redis.del(seatKey);
        unlockedSeats.push(seatId);
      }
    }

    if (socket && unlockedSeats.length > 0) {
      socket.to(eventId).emit("seat_unlocked", {
        seatIds: unlockedSeats,
      });
    }

    return unlockedSeats;
  } catch (error) {
    console.error("Error unlocking seats:", error);
    throw error;
  }
}

async function verifySeatLocks(seatIds, eventId, userId) {
  if (!seatIds || !eventId || !userId) {
    return false;
  }

  for (const seatId of seatIds) {
    const seatKey = `seat:${eventId}:${seatId}`;
    const lockOwner = await redis.get(seatKey);

    if (!lockOwner || lockOwner !== userId) {
      return false;
    }
  }

  return true;
}

function buildSeatId({
  levelCode,
  blockCode,
  rowCode,
  seatNumber,
  hasLevels,
  hasBlocks,
}) {
  if (hasLevels) {
    return `${levelCode}-${rowCode}-${seatNumber}`;
  }

  if (hasBlocks) {
    return `${blockCode}-${rowCode}-${seatNumber}`;
  }

  return null;
}

function extractAvailableSeatsFromLayout(
  layout,
  bookedSeats = [],
  lockedSeats = new Set(),
  targetType = null,
) {
  const result = [];
  const notAvailableToBook = new Set([...bookedSeats, ...lockedSeats]);

  const hasLevels = Array.isArray(layout?.levels) && layout.levels.length > 0;
  const hasBlocks = Array.isArray(layout?.blocks) && layout.blocks.length > 0;

  if (hasLevels) {
    for (const level of layout.levels) {
      for (const row of level.rows || []) {
        if (targetType && row.ticketType !== targetType) {
          continue;
        }

        for (let i = 1; i <= row.seats; i++) {
          const seatId = buildSeatId({
            levelCode: level.code,
            rowCode: row.code,
            seatNumber: i,
            hasLevels: true,
            hasBlocks: false,
          });

          if (!notAvailableToBook.has(seatId)) {
            result.push({
              seatId,
              type: row.ticketType || null,
            });
          }
        }
      }
    }
  }

  if (hasBlocks) {
    for (const block of layout.blocks) {
      for (const row of block.rows || []) {
        if (targetType && row.ticketType !== targetType) {
          continue;
        }

        for (let i = 1; i <= row.seats; i++) {
          const seatId = buildSeatId({
            blockCode: block.code,
            rowCode: row.code,
            seatNumber: i,
            hasLevels: false,
            hasBlocks: true,
          });

          if (!notAvailableToBook.has(seatId)) {
            result.push({
              seatId,
              type: row.ticketType || null,
            });
          }
        }
      }
    }
  }

  return result;
}

module.exports = {
  lockSeats,
  unLockSeats,
  verifySeatLocks,
  buildSeatId,
  extractAvailableSeatsFromLayout,
};
