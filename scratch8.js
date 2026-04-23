const mongoose = require('mongoose');
const Ticket = require('./ticket/models/Ticket');
const Event = require('./event/models/Event');
require('dotenv').config({ path: './env/ticket/.env' });

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const ticket = await Ticket.findById('69ac062d1a293851ff42d6b8').lean();
  console.log("Ticket:", ticket);
  const event = await Event.findById(ticket.eventId).lean();
  console.log("Event URL:", event.url);
  process.exit(0);
}).catch(console.error);
