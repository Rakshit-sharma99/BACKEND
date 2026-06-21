const mongoose = require('mongoose');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    console.log("Connected to MongoDB");

    // Let's query using the raw MongoDB driver since there might not be a schema/model in the backend
    const db = mongoose.connection.db;
    const collection = db.collection('macbeasecontents');

    const count = await collection.countDocuments({});
    console.log("Total macbeasecontents count:", count);

    const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId("6a3537106118f5c1ffa4435c") });
    console.log("Reported macbeasecontent found:", doc);

    if (!doc) {
        // Try searching as string id
        const docStr = await collection.findOne({ _id: "6a3537106118f5c1ffa4435c" });
        console.log("Reported macbeasecontent found with string ID:", docStr);

        const sample = await collection.findOne({});
        console.log("Sample macbeasecontent document:", sample);
    }

    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
