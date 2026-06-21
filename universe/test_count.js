const mongoose = require('mongoose');
const Admin = require('./models/admin');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    const admins = await Admin.find({ "reviewContent": { $exists: true, $not: {$size: 0} } }, { reviewContent: 1 });
    let pendingCount = 0;
    let resolvedCount = 0;
    
    admins.forEach(a => {
      a.reviewContent.forEach(r => {
        if (r.status === 0) pendingCount++;
        else if (r.status === 1) resolvedCount++;
      });
    });
    
    console.log(`Pending (status 0): ${pendingCount}`);
    console.log(`Resolved (status 1): ${resolvedCount}`);
    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
