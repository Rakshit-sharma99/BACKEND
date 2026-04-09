const mongoose = require("mongoose");

const connectDB = async (url) => {
  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  };

  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(url)
      const conn = await mongoose.connect(url, options);
      console.log(`✅ MongoDB Connected successfully`);
      return conn;
    } catch (err) {
      console.error(`❌ MongoDB connection failed (Attempt ${i + 1}/${maxRetries}):`, err.message);
      if (i === maxRetries - 1) throw err;
      // Wait before retrying (exponential backoff: 2s, 4s, 6s...)
      await new Promise(res => setTimeout(res, 2000 * (i + 1)));
    }
  }
};

module.exports = connectDB;
