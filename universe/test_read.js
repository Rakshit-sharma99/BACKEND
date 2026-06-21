const mongoose = require('mongoose');
const Admin = require('./models/admin');
const User = require('./models/user');
const { fetchContentFromIds } = require('./controllers/utils');

mongoose.connect("mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0").then(async () => {
    console.log("Connected to DB, querying reviewContent...");

    // Fetch reviewContent from all admins and flatten it
    const admins = await Admin.find({ "reviewContent": { $exists: true, $not: {$size: 0} } }, { name: 1, reviewContent: 1 });
    console.log(`Found ${admins.length} admins with reports.`);
    
    let reviewContent = [];
    admins.forEach(a => {
      console.log(`Admin ${a.name} has ${a.reviewContent?.length} reports.`);
      reviewContent = reviewContent.concat(a.reviewContent);
    });
    
    console.log(`Total flattened reports: ${reviewContent.length}`);
    
    if (reviewContent.length === 0) {
        console.log("No reports found in reviewContent!");
        mongoose.disconnect();
        return;
    }

    // Separate IDs based on type
    const normalIds = [];
    const idToTypeMap = {}; 

    for (const dataPoint of reviewContent) {
      idToTypeMap[dataPoint.cid] = dataPoint;
      if (dataPoint.type === 'normal' || dataPoint.type === 'macbease') {
        normalIds.push(dataPoint.cid);
      }
    }

    console.log("Normal content IDs count:", normalIds.length);
    console.log("IDs:", normalIds);

    // Fetch content in batch
    const [normalContentList] = await Promise.all([
      fetchContentFromIds({ contentIds: normalIds })
    ]);

    console.log("Content fetched list size:", normalContentList ? normalContentList.length : "null");

    // Convert to map for faster access
    const normalContentMap = {};
    for (const item of normalContentList || []) {
      normalContentMap[item._id.toString()] = item;
    }

    // Fetch reporter users in batch
    const userIds = [...new Set(reviewContent.map(dp => dp.userId).filter(Boolean))];
    console.log("Unique reporter User IDs:", userIds);
    const users = await User.find({ _id: { $in: userIds } }, { name: 1, image: 1 });
    console.log(`Found ${users.length} matching reporter users in DB.`);
    
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u;
    });

    // Build final result
    const finalData = reviewContent.map(dataPoint => {
      const cid = dataPoint.cid ? dataPoint.cid.toString() : "";
      let content = null;

      if (dataPoint.type === 'normal' || dataPoint.type === 'macbease') {
        content = normalContentMap[cid];
      }

      const rawData = dataPoint.toObject ? dataPoint.toObject() : dataPoint;
      const reporter = userMap[rawData.userId?.toString()];

      return {
        ...rawData,
        reporterName: reporter ? reporter.name : 'Unknown User',
        reporterImage: reporter ? reporter.image : '',
        content,
      };
    });

    console.log("Sample final data output (first 2 entries):");
    console.log(JSON.stringify(finalData.slice(0, 2), null, 2));

    mongoose.disconnect();
}).catch(err => {
    console.log("Error:", err);
    process.exit(1);
});
