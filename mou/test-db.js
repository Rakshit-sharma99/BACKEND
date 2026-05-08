const mongoose = require("mongoose");
const connectDB = require("./db/connect");
require("dotenv").config({ path: "../env/mou/.env" });

async function test() {
  await connectDB(process.env.MONGO_URI);
  console.log("Connected. DB Name:", mongoose.connection.name);
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log("Collections:", collections.map(c => c.name).slice(0, 10));
  const clubsCount = await mongoose.connection.db.collection("clubs").countDocuments();
  console.log("Clubs count:", clubsCount);
  process.exit(0);
}
test();
