const mongoose = require('mongoose');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";
const targetCid = "661f9b5bd66b1acta5e1578e";

mongoose.connect(uri).then(async () => {
    console.log("Connected to MongoDB from Docker.");
    const cidObj = mongoose.Types.ObjectId.isValid(targetCid) ? new mongoose.Types.ObjectId(targetCid) : targetCid;
    
    // Update in macbeasecontents
    const res = await mongoose.connection.db.collection('macbeasecontents').updateOne(
        { _id: cidObj },
        { $set: { underReview: false, blur: true, discretion: "Moderated by community team" } }
    );
    console.log("Update result:", res);
    
    mongoose.disconnect();
}).catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
