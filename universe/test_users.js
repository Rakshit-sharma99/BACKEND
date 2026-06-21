const mongoose = require('mongoose');
const User = require('./models/user');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    const users = await User.find({}, { name: 1, email: 1, role: 1 }).limit(10);
    console.log("Test users:");
    console.log(JSON.stringify(users, null, 2));
    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
