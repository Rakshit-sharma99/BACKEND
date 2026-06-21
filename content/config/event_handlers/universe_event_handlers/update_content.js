const Content = require("../../../models/content");
const redis = require("../../../config/redis");

const update_content = async (messageValue) => {
  try {
    const payload = JSON.parse(messageValue);

    const { contentId, updatedFields } = payload;

    console.log(`🔄 [update_content] Processing Kafka event:`, { contentId, updatedFields });

    const result = await Content.findByIdAndUpdate(contentId, {
      $set: updatedFields,
    });

    console.log(`✅ [update_content] Database updated successfully for post ${contentId}:`, { 
      blur: updatedFields.blur, 
      discretion: updatedFields.discretion,
      underReview: updatedFields.underReview 
    });

    // Verify the update in DB
    const verifyPost = await Content.findById(contentId, { blur: 1, discretion: 1, underReview: 1 });
    console.log(`🔍 [update_content] Verified in DB:`, { 
      postId: contentId, 
      blur: verifyPost?.blur, 
      discretion: verifyPost?.discretion 
    });

    // If blur or discretion is being updated, invalidate all landing feed caches
    // so users immediately see the updated (blurred) post on their next feed fetch.
    if (updatedFields && (updatedFields.blur !== undefined || updatedFields.discretion !== undefined)) {
      try {
        // Scan and delete all landing_feed:* keys (per-user feed caches)
        let cursor = "0";
        const keysToDelete = [];
        do {
          const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "landing_feed:*", "COUNT", 100);
          cursor = nextCursor;
          keysToDelete.push(...keys);
        } while (cursor !== "0");

        if (keysToDelete.length > 0) {
          await redis.del(...keysToDelete);
          console.log(`✅ Invalidated ${keysToDelete.length} landing feed cache keys after content update (blur/discretion change)`);
        }

        // Also remove this post from all seen_content:* sets so it can be re-served
        // with the updated blur=true state in future feed fetches
        let seenCursor = "0";
        const seenKeys = [];
        do {
          const [nextCursor, keys] = await redis.scan(seenCursor, "MATCH", "seen_content:*", "COUNT", 100);
          seenCursor = nextCursor;
          seenKeys.push(...keys);
        } while (seenCursor !== "0");

        if (seenKeys.length > 0) {
          const pipeline = redis.pipeline();
          for (const key of seenKeys) {
            pipeline.srem(key, contentId);
          }
          await pipeline.exec();
          console.log(`✅ Removed post ${contentId} from ${seenKeys.length} seen_content sets`);
        }
      } catch (cacheErr) {
        console.error("⚠️ Failed to invalidate feed cache after blur update:", cacheErr.message);
        // Non-critical: DB is already updated, cache will expire naturally
      }
    }
  } catch (err) {
    console.error("❌ Failed to process update_content message:", err.message);
  }
};


module.exports = {update_content};
