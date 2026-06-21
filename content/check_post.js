const mongoose = require('mongoose');
const Content = require('./models/content');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    console.log("Connected to MongoDB");

    // Let's print out how many content documents exist in total
    const count = await Content.countDocuments({});
    console.log("Total content documents:", count);

    // Let's search for the reported post id
    const post = await Content.findById("6a3537106118f5c1ffa4435c");
    console.log("Reported post found:", post);

    if (!post) {
        console.log("Post 6a3537106118f5c1ffa4435c was not found by findById.");
        // Let's search for ANY post to see structure
        const sample = await Content.findOne({});
        console.log("Sample post structure in DB:", sample);
    }

    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
