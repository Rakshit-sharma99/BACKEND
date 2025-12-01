const User = require("../../../models/user");
const kafka = require("../../kafka_producer");
const { io } = require("../../../app");

const update_user_ip = async (messageValue) => {
  try {

    const {userId,ipChange,c_source,d_source,c_ref,d_ref,description} = JSON.parse(messageValue);

    if (!userId || !ipChange || !c_source || !d_source) {
      throw new Error("Missing required fields");
    }

    const user = await User.findById(userId, { ip: 1 });
    if (!user) {
      throw new Error("User not found");
    }

    user.ip += ipChange;
    await user.save();

    // if (!noEmissions) {
    //   io.emit(`ipUpdated_${userId}`, {
    //     ipChange,
    //     description,
    //     totalIp: user.ip,
    //   });
    // }

    const logEvent = {
      c_source,
      d_source,
      c_ref,
      d_ref,
      description,
      ip: ipChange,
      status: 1,
      timestamp: new Date(),
    };

    if (kafka.producer) {
      await kafka.producer.send({
        topic: "ip-transaction-log",
        messages: [{ value: JSON.stringify(logEvent) }],
      });
    } else {
      console.error("Kafka producer is not connected.");
    }
  } catch (error) {
    console.error("❌ Failed to process update user ip topic:", error);
  }
};

module.exports = { update_user_ip };
