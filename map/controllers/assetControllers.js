const Asset = require("../models/asset");
const { StatusCodes } = require("http-status-codes");
const axios = require("axios");
const https = require("https");

const httpsAgent = new https.Agent({
  family: 4, // force IPv4
  keepAlive: true,
});

// Set default family to avoid IPv6 socket disconnection issues in Node/Docker
axios.defaults.family = 4;

/**
 * Controller to create a new Asset
 * Only accessible by admin users
 */
const createAsset = async (req, res) => {
  try {
    // ---- Admin Authorization ----
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    // ---- Parse Request Body ----
    const {
      name,
      description,
      type,
      tag,
      subTag,
      availability,
      url,
      rawData, // In case frontend still passes Lottie JSON configs instead of downloading an S3 url
      price,
      contributorId,
      payloadConfig,
    } = req.body;

    // Validate required fields explicitly
    if (!name || !type || !availability) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Please provide required fields: name, type, and availability",
      });
    }

    // Fallback: Use the admin's _id if contributorId is not explicitly sent in req.body
    const assetContributorId = contributorId || req.user._id;

    // ---- Create Asset ----
    const newAsset = new Asset({
      name,
      description,
      type,
      tag,
      subTag,
      availability,
      url,
      rawData,
      price: price || 0,
      contributorId: assetContributorId,
      payloadConfig,
    });

    await newAsset.save();

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Asset created successfully",
      asset: newAsset,
    });
  } catch (error) {
    console.error("Error creating asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while creating the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to edit an existing Asset
 * Only accessible by admin users
 */
const editAsset = async (req, res) => {
  try {
    const { assetId } = req.query; // Updated to match user's route structure

    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    const updatedAsset = await Asset.findByIdAndUpdate(
      assetId,
      { $set: req.body },
      { new: true, runValidators: true },
    );

    if (!updatedAsset) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Asset updated successfully",
      asset: updatedAsset,
    });
  } catch (error) {
    console.error("Error updating asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while updating the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to delete an existing Asset
 * Only accessible by admin users
 */
const deleteAsset = async (req, res) => {
  try {
    const { assetId } = req.query;

    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    const deletedAsset = await Asset.findByIdAndDelete(assetId);

    if (!deletedAsset) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Asset deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while deleting the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to get an Asset by its ID
 */
const getAssetById = async (req, res) => {
  try {
    const { assetId } = req.query;

    if (!assetId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Please provide an assetId in the query parameters.",
      });
    }

    const asset = await Asset.findById(assetId);

    if (!asset) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      asset,
    });
  } catch (error) {
    console.error("Error fetching asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to get all assets segregated by their type.
 * Groups assets by the 'type' field, and within those types, further groups by 'tag'.
 */
const getAllAssetsByType = async (req, res) => {
  try {
    // We group by type and the new 'tag' field.
    // If an asset lacks a tag, the tag will be null/undefined in the grouping.
    const segregatedAssets = await Asset.aggregate([
      {
        $group: {
          _id: { type: "$type", tag: "$tag" },
          assets: { $push: "$$ROOT" },
        },
      },
    ]);

    // Format output dynamically:
    // {
    //   "svg": {
    //      "untagged": [{...}, {...}],
    //      "national flags": [{...}]
    //   },
    //   "lottie": { ... }
    // }
    const formattedResult = {};

    segregatedAssets.forEach((group) => {
      const type = group._id.type;
      const tag = group._id.tag;

      // Ensure the type exists in our output object
      if (!formattedResult[type]) {
        formattedResult[type] = { untagged: [] };
      }

      if (tag) {
        // If there's a tag, place the assets in an array named after the tag
        formattedResult[type][tag] = group.assets;
      } else {
        // If no tag, push into the 'untagged' array
        formattedResult[type].untagged.push(...group.assets);
      }
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      data: formattedResult,
    });
  } catch (error) {
    console.error("Error fetching segregated assets:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching assets.",
      error: error.message,
    });
  }
};

/**
 * Controller to search songs via iTunes API
 */
const searchSongs = async (req, res) => {
  try {
    const { term } = req.query;

    if (!term) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Search term is required",
      });
    }

    const response = await axios.get(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        term,
      )}&entity=song&limit=10`,
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      data: response.data.results,
    });
  } catch (error) {
    console.error("Error searching songs:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while searching for songs.",
      error: error.message,
    });
  }
};

/**
 * Controller to get recommended songs via iTunes API
 */
const getSongRecommendations = async (req, res) => {
  try {
    // We can use a popular default term to fetch general recommendations.
    // This could also be tailored based on user profile or other dynamic data.
    const defaultSearchTerm = "top hits";

    const response = await axios.get(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        defaultSearchTerm,
      )}&entity=song&limit=10`,
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      data: response.data.results,
    });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching song recommendations.",
      error: error.message,
    });
  }
};

/**
 * Fallback list of books in case all APIs fail
 */
const fallbackBooks = [
  {
    volumeInfo: {
      title: "The Great Gatsby",
      authors: ["F. Scott Fitzgerald"],
      description: "A story of ambition, love, and the American Dream.",
    },
  },
  {
    volumeInfo: {
      title: "1984",
      authors: ["George Orwell"],
      description: "A chilling prophecy about the future.",
    },
  },
  {
    volumeInfo: {
      title: "The Hobbit",
      authors: ["J.R.R. Tolkien"],
      description: "A grand adventure in Middle-earth.",
    },
  },
  {
    volumeInfo: {
      title: "To Kill a Mockingbird",
      authors: ["Harper Lee"],
      description: "A classic of modern American literature.",
    },
  },
  {
    volumeInfo: {
      title: "Brave New World",
      authors: ["Aldous Huxley"],
      description: "A dark vision of a futuristic society.",
    },
  },
];

/**
 * Helper to map Open Library Search/Subject results to Google Books volumeInfo format
 */
const mapOpenLibraryToGoogleBooks = (doc) => {
  return {
    volumeInfo: {
      title: doc.title,
      authors:
        doc.author_name ||
        (doc.authors ? doc.authors.map((a) => a.name) : ["Unknown Author"]),
      description: doc.first_publish_year
        ? `First published in ${doc.first_publish_year}`
        : "No description available.",
      // Adding a simple cover link if possible
      imageLinks: doc.cover_i
        ? {
            thumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
          }
        : doc.cover_edition_key
          ? {
              thumbnail: `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`,
            }
          : null,
    },
  };
};

const fetchFromOpenLibrarySearch = async (term) => {
  try {
    const response = await axios.get(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&limit=10`,
    );
    return (response.data.docs || []).map(mapOpenLibraryToGoogleBooks);
  } catch (error) {
    console.error("Open Library Search Error:", error.message);
    return null;
  }
};

const fetchFromOpenLibrarySubject = async (subject) => {
  try {
    const response = await axios.get(
      `https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?limit=10`,
    );
    return (response.data.works || []).map(mapOpenLibraryToGoogleBooks);
  } catch (error) {
    console.error("Open Library Subject Error:", error.message);
    return null;
  }
};

/**
 * Controller to search books via Google Books API with multi-layered fallback
 */
const searchBooks = async (req, res) => {
  const { term } = req.query;

  if (!term) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: "Search term is required",
    });
  }

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const baseUrl = "https://www.googleapis.com/books/v1/volumes";
  const params = `q=${encodeURIComponent(term)}&maxResults=10`;

  // 1. Try Google Books with API Key (or without if no key)
  try {
    const response = await axios.get(
      `${baseUrl}?${params}${apiKey ? `&key=${apiKey}` : ""}`,
    );
    return res.status(StatusCodes.OK).json({
      success: true,
      data: response.data.items || [],
    });
  } catch (error) {
    // 2. Try Google Books without Key if first was forbidden/unauthorized
    if (
      apiKey &&
      error.response &&
      (error.response.status === 403 || error.response.status === 401)
    ) {
      console.warn(
        "API Key restricted or invalid. Retrying Google Books without key...",
      );
      try {
        const fallbackResponse = await axios.get(`${baseUrl}?${params}`);
        return res.status(StatusCodes.OK).json({
          success: true,
          data: fallbackResponse.data.items || [],
          message: "Results fetched without API key due to key restriction.",
        });
      } catch (retryError) {
        console.error(
          "Error searching Google Books without key:",
          retryError.message,
        );
      }
    }

    // 3. Try Open Library if Google Books is rate limited or fails
    console.warn(
      "Google Books failed. Attempting Open Library search fallback...",
    );
    const openLibraryData = await fetchFromOpenLibrarySearch(term);
    if (openLibraryData && openLibraryData.length > 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: openLibraryData,
        message: "Results fetched from Open Library fallback.",
      });
    }

    // 4. Hardcoded Fallback
    console.error("All book APIs failed. Returning hardcoded list.");
    return res.status(StatusCodes.OK).json({
      success: true,
      data: fallbackBooks.slice(0, 5),
      message: "Showing results from hardcoded fallback due to API errors.",
    });
  }
};

/**
 * Controller to get recommended books via Google Books API with multi-layered fallback
 */
const getBookRecommendations = async (req, res) => {
  const defaultSearchTerm = "subject:fiction";
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const baseUrl = "https://www.googleapis.com/books/v1/volumes";
  const params = `q=${encodeURIComponent(
    defaultSearchTerm,
  )}&orderBy=relevance&maxResults=10`;

  // 1. Try Google Books
  try {
    const response = await axios.get(
      `${baseUrl}?${params}${apiKey ? `&key=${apiKey}` : ""}`,
    );
    return res.status(StatusCodes.OK).json({
      success: true,
      data: response.data.items || [],
    });
  } catch (error) {
    // 2. Try Google Books without Key if first was forbidden/unauthorized
    if (
      apiKey &&
      error.response &&
      (error.response.status === 403 || error.response.status === 401)
    ) {
      console.warn(
        "API Key restricted or invalid. Retrying Google Books without key...",
      );
      try {
        const fallbackResponse = await axios.get(`${baseUrl}?${params}`);
        return res.status(StatusCodes.OK).json({
          success: true,
          data: fallbackResponse.data.items || [],
          message:
            "Recommendations fetched without API key due to key restriction.",
        });
      } catch (retryError) {
        console.error(
          "Error fetching Google Books without key:",
          retryError.message,
        );
      }
    }

    // 3. Try Open Library (Subject)
    console.warn(
      "Google Books recommendations failed. Attempting Open Library subject fallback...",
    );
    const openLibraryData = await fetchFromOpenLibrarySubject("fiction");
    if (openLibraryData && openLibraryData.length > 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: openLibraryData,
        message: "Recommendations fetched from Open Library fallback.",
      });
    }

    // 4. Hardcoded Fallback
    console.error("All book APIs failed. Returning hardcoded recommendations.");
    return res.status(StatusCodes.OK).json({
      success: true,
      data: fallbackBooks,
      message:
        "Showing recommendations from hardcoded fallback due to API errors.",
    });
  }
};

/**
 * Controller to search movies via TMDB API
 */
const searchMovies = async (req, res) => {
  try {
    const { term } = req.query;

    if (!term) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Search term is required",
      });
    }

    const token = process.env.TMDB_MOVIE_ACCESS_TOKEN;
    if (!token) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "TMDB Access Token is not configured",
      });
    }

    const response = await axios.get(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(term)}&language=en-US`,
      {
        httpsAgent,
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    console.log(response.data.results);

    return res.status(StatusCodes.OK).json({
      success: true,
      data: response.data.results || [],
    });
  } catch (error) {
    console.error("Error searching movies:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while searching for movies.",
      error: error.message,
    });
  }
};

/**
 * Controller to get recommended movies via TMDB API
 */

const getMovieRecommendations = async (req, res) => {
  try {
    const token = process.env.TMDB_MOVIE_ACCESS_TOKEN;
    if (!token) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "TMDB Access Token is not configured",
      });
    }

    const response = await axios.get(
      `https://api.themoviedb.org/3/movie/popular`,
      {
        httpsAgent,
        params: {
          language: "en-US",
          page: 1,
        },
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      data: response.data.results || [],
    });
  } catch (error) {
    console.error("Error fetching movie recommendations:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching movie recommendations.",
      error: error.message,
    });
  }
};

/**
 * Controller to get more details of a movie via TMDB API (including cast, videos, running time)
 */
const getMovieDetails = async (req, res) => {
  try {
    const { movieId } = req.query;

    if (!movieId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Movie ID is required",
      });
    }

    const token = process.env.TMDB_MOVIE_ACCESS_TOKEN;
    if (!token) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "TMDB Access Token is not configured",
      });
    }

    // append_to_response=credits,videos adds the cast and video (trailer) data inline
    const response = await axios.get(
      `https://api.themoviedb.org/3/movie/${movieId}?append_to_response=credits,videos&language=en-US`,
      {
        httpsAgent,
        family: 4, // explicit Axios 1.x support for IPv4
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Error fetching movie details:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching movie details.",
      error: error.message,
    });
  }
};

/**
 * Controller to bulk update tags and optional subTags for assets
 * Accessible by admin users
 */
const bulkUpdateTags = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    const { oldTag, newTag, subTag } = req.body;

    if (!oldTag || !newTag) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Please provide both 'oldTag' and 'newTag'.",
      });
    }

    // Build the update object dynamically
    const updatePayload = { $set: { tag: newTag } };

    if (subTag !== undefined) {
      updatePayload.$set.subTag = subTag;
    }

    // Update all matching assets
    const result = await Asset.updateMany({ tag: oldTag }, updatePayload);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Successfully updated tags for ${result.modifiedCount} assets.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating tags:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while updating the tags.",
      error: error.message,
    });
  }
};

module.exports = {
  createAsset,
  editAsset,
  deleteAsset,
  getAssetById,
  getAllAssetsByType,
  searchSongs,
  getSongRecommendations,
  searchBooks,
  getBookRecommendations,
  searchMovies,
  getMovieRecommendations,
  getMovieDetails,
  bulkUpdateTags,
};
