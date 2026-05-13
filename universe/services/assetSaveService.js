const User = require("../models/user");
const { fetchAssetByPayloadType } = require("../controllers/interServiceCalls");

// ── Constants ────────────────────────────────────────────────────────────────

const PAYLOAD_LIST_KEYS = {
  book: "books",
  movie: "movies",
  audio: "audios",
};

const DEFAULT_LABELS = {
  book: "Books I Love",
  movie: "Movies Worth Watching",
  audio: "Music On Repeat",
};

// ── Identity helpers (duplicate detection) ───────────────────────────────────

function getBookIdentity(book) {
  return (
    book?.googleBooksId ||
    book?.isbn ||
    book?.id ||
    `${(book?.name || "").toLowerCase()}-${(book?.author || "").toLowerCase()}`
  );
}

function getMovieIdentity(movie) {
  return (
    movie?.tmdbId ||
    movie?.id ||
    `${(movie?.title || "").toLowerCase()}-${movie?.release_date || ""}`
  );
}

function getAudioIdentity(audio) {
  return (
    audio?.trackId ||
    audio?.collectionId ||
    `${(audio?.trackName || "").toLowerCase()}-${(audio?.artistName || "").toLowerCase()}`
  );
}

const IDENTITY_FNS = {
  book: getBookIdentity,
  movie: getMovieIdentity,
  audio: getAudioIdentity,
};

// ── Core service function ────────────────────────────────────────────────────

/**
 * Save a single payload item (book/movie/audio) into the current user's
 * collection. Finds an existing matching asset or auto-creates one.
 *
 * @param {string}  userId        – The authenticated user's _id
 * @param {string}  payloadType   – "book" | "movie" | "audio"
 * @param {Object}  payloadItem   – The item object to save
 * @param {Object}  sourceInfo    – { sourceAssetId, sourceUserId } for analytics
 * @returns {{ success, createdNewAsset, alreadySaved, asset? }}
 */
async function savePayloadToAsset(userId, payloadType, payloadItem, sourceInfo = {}) {
  const listKey = PAYLOAD_LIST_KEYS[payloadType];
  const identityFn = IDENTITY_FNS[payloadType];

  if (!listKey || !identityFn) {
    throw new Error(`Unsupported payload type: ${payloadType}`);
  }

  // ── Step 1: Fetch user's vicinityAsset ──
  const user = await User.findById(userId, { vicinityAsset: 1 }).lean();
  if (!user) {
    throw new Error("User not found.");
  }

  const vicinityAssets = user.vicinityAsset || [];

  // ── Step 2: Find an existing asset with matching payload type ──
  const existingEntry = vicinityAssets.find(
    (va) => va.payload?.type === payloadType,
  );

  if (existingEntry) {
    const existingList = existingEntry.payload?.[listKey] || [];

    // ── Step 3: Duplicate check ──
    const newIdentity = identityFn(payloadItem);
    const isDuplicate = existingList.some(
      (item) => identityFn(item) === newIdentity,
    );

    if (isDuplicate) {
      return {
        success: true,
        alreadySaved: true,
        createdNewAsset: false,
      };
    }

    // ── Step 4: Prepend item (atomic $set) ──
    const updatedList = [payloadItem, ...existingList];

    await User.findOneAndUpdate(
      { _id: userId, "vicinityAsset._id": existingEntry._id },
      {
        $set: {
          [`vicinityAsset.$.payload.${listKey}`]: updatedList,
        },
      },
    );

    return {
      success: true,
      createdNewAsset: false,
      alreadySaved: false,
    };
  }

  // ── Step 5: No existing asset → create one ──
  const templateAsset = await fetchAssetByPayloadType(payloadType);

  if (!templateAsset) {
    throw new Error(
      `No asset template found for payload type: ${payloadType}. Cannot auto-create.`,
    );
  }

  const newEntry = {
    assetId: String(templateAsset._id),
    x: 0,
    z: 0,
    dx: 0,
    dy: 0,
    payload: {
      type: payloadType,
      [listKey]: [payloadItem],
      customLabel: DEFAULT_LABELS[payloadType],
    },
  };

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $push: { vicinityAsset: newEntry } },
    { new: true },
  );

  // Find the newly created entry in the updated array
  const createdAsset = updatedUser.vicinityAsset[
    updatedUser.vicinityAsset.length - 1
  ];

  return {
    success: true,
    createdNewAsset: true,
    alreadySaved: false,
    asset: createdAsset,
  };
}

module.exports = {
  savePayloadToAsset,
};
