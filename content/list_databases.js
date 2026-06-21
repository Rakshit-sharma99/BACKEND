const mongoose = require('mongoose');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    console.log("Connected to MongoDB");
    const admin = new mongoose.mongo.Admin(mongoose.connection.db);
    const dbs = await admin.listDatabases();
    console.log("Available databases:");
    console.log(dbs.databases.map(db => db.name));
    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
