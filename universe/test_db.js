const mongoose = require('mongoose');
const Admin = require('./models/admin');

mongoose.connect("mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0").then(async () => {
    const admins = await Admin.find({});
    console.log("Total admins:", admins.length);
    let foundReports = false;
    for (let a of admins) {
        if (a.reviewContent && a.reviewContent.length > 0) {
            console.log("Admin with reports:", a.name, a.email, "Role:", a.role, "Reports count:", a.reviewContent.length);
            foundReports = true;
        }
    }
    if (!foundReports) {
        console.log("NO REPORTS FOUND IN ANY ADMIN'S ACCOUNT!");
    }
    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
