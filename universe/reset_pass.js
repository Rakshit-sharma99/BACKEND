const mongoose = require('mongoose');
const Admin = require('./models/admin');
const bcrypt = require('bcryptjs');

mongoose.connect("mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0").then(async () => {
    const admin = await Admin.findOne({ email: 'singhvishwa04@gmail.com' });
    if (!admin) {
        console.log("Admin not found!");
        process.exit(1);
    }
    const hash = await bcrypt.hash('password123', 10);
    admin.password = hash;
    await admin.save();
    console.log("Password reset successfully for singhvishwa04@gmail.com!");
    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
