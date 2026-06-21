const mongoose = require('mongoose');
const Admin = require('./universe/models/admin');

mongoose.connect("mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0").then(async () => {
    const admins = await Admin.find({});
    console.log("Total admins:", admins.length);
    for (let a of admins) {
        if (a.reviewContent && a.reviewContent.length > 0) {
            console.log("Admin with reports:", a.name, a.email, a.role, "Reports count:", a.reviewContent.length);
        }
    }
    mongoose.disconnect();
});
