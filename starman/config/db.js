/**
 * MongoDB connection for the Starman service.
 * Used for task persistence and conversation memory.
 */

const mongoose = require("mongoose");

const connectDB = async () => {
  const uri =
    process.env.MONGO_URI || "mongodb://mongo:27017/starman";

  try {
    await mongoose.connect(uri);
    console.log("✅ Starman MongoDB connected");
  } catch (err) {
    console.error("❌ Starman MongoDB connection failed:", err.message);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
