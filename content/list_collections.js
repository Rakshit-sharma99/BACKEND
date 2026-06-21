const mongoose = require('mongoose');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    console.log("Connected to MongoDB");
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections in DB:");
    console.log(collections.map(c => c.name));
    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
