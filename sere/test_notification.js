// Run this script from the `sere` directory:
// node test_notification.js <YOUR_USER_ID>

const { Kafka, logLevel } = require("kafkajs");

const targetUserId = process.argv[2];

if (!targetUserId) {
  console.error("❌ Please provide your userId. Example: node test_notification.js 64b8...123");
  process.exit(1);
}

const kafka = new Kafka({
  clientId: "test-notification-script",
  brokers: ["kafka:9092"], // Internal Docker network address
  logLevel: logLevel.INFO,
});

const producer = kafka.producer();

async function run() {
  try {
    console.log("⏳ Connecting to Kafka...");
    await producer.connect();
    console.log("✅ Connected.");

    const payload = {
      targetUserId: targetUserId,
      notification: {
        type: "dm",
        title: "Test User",
        body: "This is a test echoed message!",
        action: {
          navigateTo: "chatScreen",
          params: {
            id: "test-sender-123",
            name: "Test User",
            img: "https://via.placeholder.com/150",
          },
        },
        ttl: 8000,
        priority: "high",
        groupKey: `dm:test-sender-123`,
        metadata: {
          senderId: "test-sender-123",
          entityName: "Test User",
          entityLogo: "https://via.placeholder.com/150",
          entityId: "test-sender-123",
          entityType: "user",
        },
      },
    };

    console.log("📤 Sending payload...");
    await producer.send({
      topic: "live.notification",
      messages: [
        { value: JSON.stringify(payload) }
      ],
    });

    console.log("✅ Message successfully sent to live.notification topic!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error sending message:", err);
    process.exit(1);
  }
}

run();
