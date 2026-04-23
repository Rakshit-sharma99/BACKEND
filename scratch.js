const mongoose = require('mongoose');
const Event = require('./event/models/Event');
require('dotenv').config({ path: './env/event/.env' });

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const event = await Event.findOne({}).lean();
  console.log("Event URL is:", event.url);
  process.exit(0);
});
