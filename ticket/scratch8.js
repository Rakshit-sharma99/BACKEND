const mongoose = require('mongoose');
const Ticket = require('./models/Ticket');
require('dotenv').config({ path: '../env/ticket/.env' });

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const ticket = await Ticket.findById('69ac062d1a293851ff42d6b8').lean();
  console.log("Ticket:", ticket);
  const Event = mongoose.connection.collection('events');
  const event = await Event.findOne({ _id: new mongoose.Types.ObjectId(ticket.eventId) });
  console.log("Event URL:", event.url);
  process.exit(0);
}).catch(console.error);
