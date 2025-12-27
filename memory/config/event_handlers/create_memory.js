const Memory = require("../../models/memory");
const {handleTags} = require("../../controllers/memoryControllers");

const create_memory = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const memory = await Memory.create(data.memoryData);
    await handleTags({ tags:data.memoryData.tags, memoryId: memory._id, userId:data.memoryData.createdBy,callSign:data.memoryData.callSign });
    console.log("📩 Successfully processed create memory topic");
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process create memory topic");
  }
};

module.exports = { create_memory };
