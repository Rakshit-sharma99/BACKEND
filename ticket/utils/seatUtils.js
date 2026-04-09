const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: 6379,
});

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
  redis,
  verifySeatLocks,
  buildSeatId,
  extractAvailableSeatsFromLayout,
};
