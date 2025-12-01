const { MongoClient } = require("mongodb");

const migrateCollectionJob = async ({
  jobId,
  sourceDbName,
  targetDbName,
  collectionName,
}) => {
  const client = new MongoClient(process.env.CLUSTER_URI);
  try {
    await client.connect();

    const sourceCollection = client.db(sourceDbName).collection(collectionName);
    const targetCollection = client.db(targetDbName).collection(collectionName);

    const cursor = sourceCollection.find();
    const batchSize = 1000;
    let docs = [];
    let count = 0;

    while (await cursor.hasNext()) {
      docs.push(await cursor.next());
      if (docs.length === batchSize) {
        await targetCollection.insertMany(docs, { writeConcern: { w: 1 } });
        count += docs.length;
        docs = [];
      }
    }

    if (docs.length > 0) {
      await targetCollection.insertMany(docs, { writeConcern: { w: 1 } });
      count += docs.length;
    }

    console.log(`✅ Migration ${jobId} complete. Documents migrated: ${count}`);
  } catch (error) {
    console.error(`❌ Migration ${jobId} failed:`, error);
  } finally {
    await client.close();
  }
};

module.exports = {
  add: async (jobData) => {
    // basic simulation; you can use Bull, Agenda, or just trigger it manually
    setImmediate(() => migrateCollectionJob(jobData));
  },
};
