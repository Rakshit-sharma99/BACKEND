const mongoose = require('mongoose');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    const item = await mongoose.connection.db.collection('macbeasecontents').findOne({});
    console.log("Macbease content sample:");
    console.log(JSON.stringify(item, null, 2));
    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
