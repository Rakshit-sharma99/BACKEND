const mongoose = require('mongoose');
const Admin = require('./models/admin');
const User = require('./models/user');

const uri = "mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0";

mongoose.connect(uri).then(async () => {
    console.log("Connected to DB successfully.");

    // Fetch reviewContent from all admins and flatten it
    const admins = await Admin.find({ "reviewContent": { $exists: true, $not: {$size: 0} } }, { name: 1, reviewContent: 1 });
    console.log(`Found ${admins.length} admins with reports.`);
    
    let reviewContent = [];
    admins.forEach(a => {
      reviewContent = reviewContent.concat(a.reviewContent);
    });
    
    console.log(`Total flattened reports: ${reviewContent.length}`);
    
    if (reviewContent.length === 0) {
        console.log("No reports found!");
        mongoose.disconnect();
        return;
    }

    // Separate IDs based on type
    const normalIds = [];
    const macbeaseIds = [];

    for (const dataPoint of reviewContent) {
      const typeLower = dataPoint.type ? dataPoint.type.toLowerCase() : '';
      if (typeLower === 'normal') {
        normalIds.push(dataPoint.cid);
      } else if (typeLower === 'macbease') {
        macbeaseIds.push(dataPoint.cid);
      }
    }

    console.log(`Normal IDs: ${normalIds.length}, Macbease IDs: ${macbeaseIds.length}`);

    // Query databases directly
    const [normalContentList, macbeaseContentList] = await Promise.all([
      mongoose.connection.db.collection('contents')
        .find({ _id: { $in: normalIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) } })
        .toArray(),
      mongoose.connection.db.collection('macbeasecontents')
        .find({ _id: { $in: macbeaseIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) } })
        .toArray()
    ]);

    console.log(`Fetched normal: ${normalContentList.length}, fetched macbease: ${macbeaseContentList.length}`);

    const contentMap = {};
    for (const item of normalContentList || []) {
      contentMap[item._id.toString()] = item;
    }
    for (const item of macbeaseContentList || []) {
      contentMap[item._id.toString()] = item;
    }

    // Fetch reporter users in batch
    const userIds = [...new Set(reviewContent.map(dp => dp.userId).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } }, { name: 1, image: 1 });
    
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u;
    });

    // Build final result
    const finalData = reviewContent.map(dataPoint => {
      const cid = dataPoint.cid.toString();
      let content = contentMap[cid] || null;

      const rawData = dataPoint.toObject ? dataPoint.toObject() : dataPoint;
      const reporter = userMap[rawData.userId?.toString()];

      return {
        ...rawData,
        reporterName: reporter ? reporter.name : 'Unknown User',
        reporterImage: reporter ? reporter.image : '',
        content,
      };
    });

    console.log("Sample of hydrated report output:");
    console.log(JSON.stringify(finalData.slice(0, 2), null, 2));

    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
