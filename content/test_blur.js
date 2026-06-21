const mongoose = require('mongoose');
require('dotenv').config({path: '../env/.env'});

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to MongoDB.");
    const Content = require('./models/content');
    const posts = await Content.find({ blur: true }).limit(5);
    console.log("Blurred posts count:", posts.length);
    if(posts.length > 0) {
      console.log("First blurred post:", posts[0]._id, posts[0].blur, posts[0].discretion);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
